import { NextRequest, NextResponse } from "next/server";

type RecognitionStatus = "complete" | "partial" | "failed";
type ExtractedJob = {
  company: string;
  title: string;
  publishedAt: string;
  deadline: string;
  location: string;
  jd: string;
  requirements: string;
};

const PRESETS: ExtractedJob = {
  company: "",
  title: "等待核对的岗位",
  publishedAt: "待确认",
  deadline: "待确认",
  location: "待确认",
  jd: "页面内容未能完整识别，请从原网页复制岗位职责原文。",
  requirements: "页面内容未能完整识别，请从原网页复制任职要求原文。",
};

function decodeEntities(value = "") {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function clean(value = "") {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function visibleText(html: string) {
  return clean(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " "),
  );
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  return clean(patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean));
}

function parseJsonScripts(html: string) {
  const values: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      values.push(JSON.parse(decodeEntities(match[1]).trim()));
    } catch {
      // Invalid JSON-LD is common; the remaining extraction layers still run.
    }
  }
  return values;
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return object;
  for (const nested of Object.values(object)) {
    const found = findJobPosting(nested);
    if (found) return found;
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? clean(value) : "";
}

function organizationName(value: unknown) {
  if (typeof value === "string") return clean(value);
  if (value && typeof value === "object") return stringValue((value as Record<string, unknown>).name);
  return "";
}

function locationValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(locationValue).filter(Boolean).join("、");
  if (!value || typeof value !== "object") return stringValue(value);
  const object = value as Record<string, unknown>;
  const address = object.address;
  if (typeof address === "string") return clean(address);
  if (address && typeof address === "object") {
    const addressObject = address as Record<string, unknown>;
    return [
      stringValue(addressObject.addressRegion),
      stringValue(addressObject.addressLocality),
      stringValue(addressObject.streetAddress),
    ].filter(Boolean).join(" ");
  }
  return stringValue(object.name);
}

function section(text: string, labels: string[], stopLabels: string[]) {
  for (const label of labels) {
    const start = text.search(new RegExp(`(?:^|\\n|[：:。])\\s*${label}\\s*[：:]?`, "i"));
    if (start < 0) continue;
    const body = text.slice(start).replace(new RegExp(`^[\\s\\S]{0,20}?${label}\\s*[：:]?`, "i"), "").trim();
    const stop = stopLabels
      .map((item) => body.search(new RegExp(`(?:\\n|。)\\s*${item}\\s*[：:]?`, "i")))
      .filter((index) => index > 0)
      .sort((a, b) => a - b)[0];
    return body.slice(0, stop || Math.min(body.length, 5000)).trim();
  }
  return "";
}

function dateFromText(text: string, labels: string[]) {
  const label = labels.join("|");
  return text.match(new RegExp(`(?:${label})(?:日期|时间)?[：:\\s]*([0-9]{4}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2}日?)`, "i"))?.[1] || "";
}

function companyFromHostname(hostname: string) {
  const knownBrands: Array<[RegExp, string]> = [
    [/(?:^|\.)baidu\.com$/i, "百度"],
    [/(?:^|\.)bytedance\.com$/i, "字节跳动"],
  ];
  return knownBrands.find(([pattern]) => pattern.test(hostname))?.[1] || "";
}

function genericRecruitingTitle(value: string) {
  return /(?:校园|社会|全球)?招聘(?:官网|首页|详情)?$|^(?:职位|岗位)(?:招聘|详情|列表)$|^careers?$|^jobs?$/i.test(
    value.replace(/\s+/g, ""),
  );
}

function fuzzyJobTitle(text: string) {
  const candidates = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter((line) =>
      line.length >= 3
      && line.length <= 100
      && !genericRecruitingTitle(line)
      && !/^(?:首页|职位|招聘动态|了解|登录|申请职位)/.test(line)
    );

  return candidates
    .map((line, index) => {
      let score = Math.max(0, 12 - index);
      if (/[（(]?[A-Z]\d{4,}[）)]?/i.test(line)) score += 18;
      if (/产品|设计|运营|开发|工程师|经理|研究|算法|销售|市场|职能|实习/.test(line)) score += 10;
      if (/工作职责|职位描述|任职要求|职责要求/.test(line)) score -= 30;
      if (line.length > 60) score -= 10;
      return { line, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.line || "";
}

function firstStandaloneDate(text: string) {
  return text.match(/\b(20\d{2}[-/.年][01]?\d[-/.月][0-3]?\d日?)\b/)?.[1] || "";
}

function recognitionResult(
  data: ExtractedJob,
  target: URL,
  source: "alibaba" | "bytedance" | "zhiye" | "moka" | "lever" | "greenhouse",
) {
  const fieldNames: Record<keyof ExtractedJob, string> = {
    company: "公司",
    title: "岗位名称",
    publishedAt: "发布日期",
    deadline: "截止日期",
    location: "工作地",
    jd: "岗位 JD",
    requirements: "任职要求",
  };
  const coreFields = [data.company, data.title, data.jd, data.requirements];
  const recognizedCore = coreFields.filter(Boolean).length;
  const status: RecognitionStatus = recognizedCore === 0
    ? "failed"
    : coreFields.every(Boolean)
      ? "complete"
      : "partial";
  const missingFields = (Object.keys(data) as Array<keyof ExtractedJob>)
    .filter((key) => !data[key])
    .map((key) => fieldNames[key]);

  return {
    ...PRESETS,
    ...Object.fromEntries(
      (Object.keys(data) as Array<keyof ExtractedJob>)
        .map((key) => [key, data[key] || PRESETS[key]]),
    ),
    recognition: {
      status,
      missingFields,
      source,
      hostname: target.hostname,
    },
  };
}

async function tryAlibaba(target: URL) {
  if (!/(?:^|\.)campus-talent\.alibaba\.com$/i.test(target.hostname)) return null;
  const postingId = target.pathname.match(/\/position\/(\d+)(?:\/|$)/)?.[1];
  if (!postingId) return null;

  try {
    const pageResponse = await fetch(target, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-CN,zh;q=0.9",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!pageResponse.ok) return null;
    const pageHtml = await pageResponse.text();
    const setCookie = pageResponse.headers.get("set-cookie") || "";
    const xsrf = setCookie.match(/XSRF-TOKEN=([^;,\s]+)/i)?.[1] || "";
    const session = setCookie.match(/SESSION=([^;,\s]+)/i)?.[1] || "";
    if (!xsrf || !session) return null;
    const channel = pageHtml.match(/"portalCampusChannel"\s*:\s*"([^"]+)"/)?.[1]
      || "new_campus_group_official_site";

    const response = await fetch(`${target.origin}/position/detail`, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9",
        "content-type": "application/json",
        cookie: `XSRF-TOKEN=${xsrf}; SESSION=${session}`,
        origin: target.origin,
        referer: target.toString(),
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        "x-xsrf-token": decodeURIComponent(xsrf),
      },
      body: JSON.stringify({
        id: postingId,
        code: null,
        channel,
        language: "zh",
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    const detail = payload.content && typeof payload.content === "object"
      ? payload.content as Record<string, unknown>
      : {};
    if (!stringValue(detail.name)) return null;
    const locations = Array.isArray(detail.workLocations)
      ? detail.workLocations.map(stringValue).filter(Boolean)
      : [];
    const publishTime = typeof detail.publishTime === "number"
      ? detail.publishTime
      : Number(detail.publishTime);
    const data: ExtractedJob = {
      company: "阿里集团",
      title: stringValue(detail.name),
      publishedAt: Number.isFinite(publishTime) && publishTime > 0
        ? new Date(publishTime).toISOString().slice(0, 10)
        : "",
      deadline: "",
      location: locations.join("、"),
      jd: stringValue(detail.description),
      requirements: stringValue(detail.requirement),
    };
    return recognitionResult(data, target, "alibaba");
  } catch {
    return null;
  }
}

async function tryByteDance(target: URL) {
  if (!/(?:^|\.)bytedance\.com$/i.test(target.hostname)) return null;
  const postingId = target.pathname.match(/\/position\/(\d+)(?:\/|$)/)?.[1];
  if (!postingId) return null;

  try {
    const response = await fetch(`https://jobs.bytedance.com/api/v1/job/posts/${postingId}`, {
      headers: {
        accept: "application/json",
        "accept-language": "zh-CN,zh;q=0.9",
        referer: target.toString(),
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    const payloadData = payload.data && typeof payload.data === "object"
      ? payload.data as Record<string, unknown>
      : {};
    const detail = payloadData.job_post_detail && typeof payloadData.job_post_detail === "object"
      ? payloadData.job_post_detail as Record<string, unknown>
      : {};
    if (!stringValue(detail.title)) return null;
    const city = detail.city_info && typeof detail.city_info === "object"
      ? detail.city_info as Record<string, unknown>
      : detail.city_info_list_for_delivery && typeof detail.city_info_list_for_delivery === "object"
        ? detail.city_info_list_for_delivery as Record<string, unknown>
        : {};
    const publishTime = typeof detail.publish_time === "number"
      ? detail.publish_time
      : Number(detail.publish_time);
    const data: ExtractedJob = {
      company: "字节跳动",
      title: stringValue(detail.title),
      publishedAt: Number.isFinite(publishTime)
        ? new Date(publishTime).toISOString().slice(0, 10)
        : "",
      deadline: "",
      location: stringValue(city.name) || stringValue(city.i18n_name),
      jd: stringValue(detail.description),
      requirements: stringValue(detail.requirement),
    };
    return recognitionResult(data, target, "bytedance");
  } catch {
    return null;
  }
}

async function tryLever(target: URL) {
  if (!/^jobs(?:\.eu)?\.lever\.co$/i.test(target.hostname)) return null;
  const [site, postingId] = target.pathname.split("/").filter(Boolean);
  if (!site || !postingId) return null;
  const apiHost = target.hostname.includes(".eu.") ? "api.eu.lever.co" : "api.lever.co";
  try {
    const response = await fetch(
      `https://${apiHost}/v0/postings/${encodeURIComponent(site)}/${encodeURIComponent(postingId)}?mode=json`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return null;
    const posting = await response.json() as Record<string, unknown>;
    const categories = posting.categories && typeof posting.categories === "object"
      ? posting.categories as Record<string, unknown>
      : {};
    const lists = Array.isArray(posting.lists)
      ? posting.lists as Array<Record<string, unknown>>
      : [];
    const requirementsList = lists.find((item) =>
      /requirements|qualifications|任职|岗位要求|申请条件/i.test(stringValue(item.text))
    );
    const description = stringValue(posting.descriptionPlain)
      || clean(stringValue(posting.description));
    const requirements = clean(stringValue(requirementsList?.content))
      || section(
        description,
        ["任职要求", "岗位要求", "申请条件", "requirements", "qualifications"],
        ["福利待遇", "benefits", "apply"],
      );
    const data: ExtractedJob = {
      company: site.replace(/[-_]+/g, " "),
      title: stringValue(posting.text),
      publishedAt: "",
      deadline: "",
      location: stringValue(categories.location),
      jd: description,
      requirements,
    };
    return recognitionResult(data, target, "lever");
  } catch {
    return null;
  }
}

async function tryGreenhouse(target: URL) {
  if (!/(?:^|\.)greenhouse\.io$/i.test(target.hostname)) return null;
  const parts = target.pathname.split("/").filter(Boolean);
  const jobsIndex = parts.findIndex((part) => part === "jobs" || part === "job");
  const boardToken = jobsIndex > 0 ? parts[jobsIndex - 1] : "";
  const jobId = jobsIndex >= 0 ? parts[jobsIndex + 1]?.match(/^\d+/)?.[0] : "";
  if (!boardToken || !jobId) return null;
  try {
    const [jobResponse, boardResponse] = await Promise.all([
      fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${jobId}?content=true`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        },
      ),
      fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        },
      ),
    ]);
    if (!jobResponse.ok) return null;
    const job = await jobResponse.json() as Record<string, unknown>;
    const board = boardResponse.ok
      ? await boardResponse.json() as Record<string, unknown>
      : {};
    const content = clean(stringValue(job.content));
    const requirements = section(
      content,
      ["任职要求", "岗位要求", "申请条件", "requirements", "qualifications", "what we're looking for"],
      ["福利待遇", "benefits", "apply"],
    );
    const location = job.location && typeof job.location === "object"
      ? stringValue((job.location as Record<string, unknown>).name)
      : stringValue(job.location);
    const data: ExtractedJob = {
      company: stringValue(board.name) || boardToken.replace(/[-_]+/g, " "),
      title: stringValue(job.title),
      publishedAt: "",
      deadline: "",
      location,
      jd: content,
      requirements,
    };
    return recognitionResult(data, target, "greenhouse");
  } catch {
    return null;
  }
}

async function tryZhiye(target: URL) {
  const postingId = target.searchParams.get("jobAdId");
  if (!postingId || !/^\/(?:campus|social|intern)\/detail\/?$/i.test(target.pathname)) return null;
  const category = /^\/social(?:\/|$)/i.test(target.pathname)
    ? "1"
    : /^\/intern(?:\/|$)/i.test(target.pathname)
      ? "3"
      : "2";

  try {
    const pageResponse = await fetch(target, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-CN,zh;q=0.9",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!pageResponse.ok) return null;
    const pageHtml = await pageResponse.text();
    const company = clean(
      pageHtml.match(/"Abbreviation"\s*:\s*"([^"]+)"/i)?.[1]
      || pageHtml.match(/"Alias"\s*:\s*"([^"]+)"/i)?.[1]
      || pageHtml.match(/"SiteName"\s*:\s*"([^"]+?)(?:招聘门户)?"/i)?.[1],
    );
    const displayFields = JSON.stringify([
      "jobAdName",
      "Duty",
      "Require",
      "Category",
      "Kind",
      "LocId",
      "DetailAddress",
      "PostDate",
      "EndTime",
    ]);
    const apiUrl = new URL("/api/JobAd/GetJobAdInfo", target.origin);
    apiUrl.searchParams.set("jobAdId", postingId);
    apiUrl.searchParams.set("category", category);
    apiUrl.searchParams.set("displayFields", displayFields);
    const response = await fetch(apiUrl, {
      headers: {
        accept: "application/json",
        "accept-language": "zh-CN,zh;q=0.9",
        langType: "zh_CN",
        referer: target.toString(),
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        "x-requested-with": "xmlhttprequest",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    const detail = payload.Data && typeof payload.Data === "object"
      ? payload.Data as Record<string, unknown>
      : {};
    if (!stringValue(detail.JobAdName)) return null;
    const locations = Array.isArray(detail.LocNames)
      ? detail.LocNames.map(stringValue).filter(Boolean)
      : [];
    const postDate = stringValue(detail.PostDate);
    const endTime = stringValue(detail.EndTime);
    const deadlineYear = Number(endTime.slice(0, 4));
    const data: ExtractedJob = {
      company,
      title: stringValue(detail.JobAdName),
      publishedAt: postDate ? postDate.slice(0, 10) : "",
      deadline: endTime && deadlineYear >= 1900 && deadlineYear < 2100 ? endTime.slice(0, 10) : "",
      location: locations.join("、") || stringValue(detail.DetailAddress),
      jd: stringValue(detail.Duty),
      requirements: stringValue(detail.Require),
    };
    return recognitionResult(data, target, "zhiye");
  } catch {
    return null;
  }
}

async function decryptMokaPayload(payload: Record<string, unknown>, iv: string) {
  if (payload.data && typeof payload.data === "object") return payload.data as Record<string, unknown>;
  const encrypted = stringValue(payload.data);
  const keyText = stringValue(payload.necromancer);
  if (!encrypted || !keyText || !iv) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyText),
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  const encryptedBytes = Uint8Array.from(atob(encrypted), (character) => character.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: new TextEncoder().encode(iv) },
    key,
    encryptedBytes,
  );
  const decoded = JSON.parse(new TextDecoder().decode(decrypted)) as Record<string, unknown>;
  return decoded.data && typeof decoded.data === "object"
    ? decoded.data as Record<string, unknown>
    : decoded;
}

async function tryMoka(target: URL) {
  if (!/(?:^|\.)mokahr\.com$/i.test(target.hostname)) return null;
  const pathMatch = target.pathname.match(/^\/(?:campus-recruitment|social-recruitment)\/([^/]+)\/(\d+)\/?$/i);
  const jobId = target.hash.match(/(?:^#|\/)job\/([^/?#]+)/i)?.[1];
  if (!pathMatch || !jobId) return null;
  const [, orgId, siteId] = pathMatch;

  try {
    const pageUrl = new URL(target.pathname, target.origin);
    const pageHeaders = {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "zh-CN,zh;q=0.9",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    };
    let pageResponse = await fetch(pageUrl, {
      headers: pageHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    let sessionCookie = "";
    if (pageResponse.status >= 300 && pageResponse.status < 400) {
      const headersWithCookies = pageResponse.headers as Headers & { getSetCookie?: () => string[] };
      const setCookies = headersWithCookies.getSetCookie?.() || [pageResponse.headers.get("set-cookie") || ""];
      sessionCookie = setCookies
        .flatMap((value) => value.split(/,(?=\s*[^;,=]+=[^;,]+)/))
        .map((value) => value.trim().split(";")[0])
        .filter(Boolean)
        .join("; ");
      pageResponse = await fetch(pageUrl, {
        headers: { ...pageHeaders, cookie: sessionCookie },
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
    }
    if (!pageResponse.ok) return null;
    const pageHtml = await pageResponse.text();
    const aesIv = pageHtml.match(/aesIv(?:&quot;|")\s*:\s*(?:&quot;|")([^&"]+)/i)?.[1] || "";
    const company = clean(
      decodeEntities(pageHtml.match(/companyName(?:&quot;|")\s*:\s*(?:&quot;|")([^&"]+)/i)?.[1] || ""),
    ).replace(/^©\s*/, "");
    const response = await fetch(new URL("/api/outer/ats-apply/website/job", target.origin), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "accept-language": "zh-CN,zh;q=0.9",
        ...(sessionCookie ? { cookie: sessionCookie } : {}),
        referer: target.toString(),
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
      body: JSON.stringify({ orgId, jobId, siteId: Number(siteId), locale: "zh_CN" }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    const detail = await decryptMokaPayload(payload, aesIv);
    if (!detail || !stringValue(detail.title)) return null;
    const description = stringValue(detail.jobDescription);
    const jd = section(
      description,
      ["岗位职责", "职位职责", "工作职责"],
      ["任职要求", "岗位要求", "职位要求", "加分项"],
    );
    const requirements = section(
      description,
      ["任职要求", "岗位要求", "职位要求"],
      ["福利待遇", "投递方式"],
    );
    const locations = Array.isArray(detail.locations)
      ? detail.locations as Array<Record<string, unknown>>
      : [];
    const location = locations.map((item) =>
      stringValue(item.provinceName) || stringValue(item.cityName) || stringValue(item.name)
    ).filter(Boolean).join("、");
    const projectFolder = detail.projectFolder && typeof detail.projectFolder === "object"
      ? detail.projectFolder as Record<string, unknown>
      : {};
    const settings = projectFolder.settings && typeof projectFolder.settings === "object"
      ? projectFolder.settings as Record<string, unknown>
      : {};
    const deliveryLimit = settings.deliveryLimit && typeof settings.deliveryLimit === "object"
      ? settings.deliveryLimit as Record<string, unknown>
      : {};
    const deliveryContent = deliveryLimit.content && typeof deliveryLimit.content === "object"
      ? deliveryLimit.content as Record<string, unknown>
      : {};
    const publishedAt = stringValue(detail.publishedAt) || stringValue(detail.openedAt);
    const data: ExtractedJob = {
      company: company || orgId,
      title: stringValue(detail.title),
      publishedAt: publishedAt ? publishedAt.slice(0, 10) : "",
      deadline: stringValue(deliveryContent.endDate),
      location,
      jd: jd || description,
      requirements,
    };
    return recognitionResult(data, target, "moka");
  } catch {
    return null;
  }
}

async function tryPublicAts(target: URL) {
  return await tryAlibaba(target)
    || await tryByteDance(target)
    || await tryMoka(target)
    || await tryZhiye(target)
    || await tryLever(target)
    || await tryGreenhouse(target);
}

function buildResult(html: string, target: URL) {
  const plain = visibleText(html);
  const posting = parseJsonScripts(html).map(findJobPosting).find(Boolean);
  const pageTitle = meta(html, "og:title")
    || meta(html, "twitter:title")
    || clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const headingTitle = clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  const siteName = meta(html, "og:site_name") || meta(html, "application-name");
  const description = meta(html, "og:description")
    || meta(html, "twitter:description")
    || meta(html, "description");
  const titleParts = pageTitle.split(/\s*(?:\||｜)\s*|\s+-\s+/).filter(Boolean);
  const isByteDance = /(?:^|\.)bytedance\.com$/i.test(target.hostname);
  const byteDanceTitle = isByteDance
    ? titleParts.filter((part) => !/^(?:加入)?字节跳动(?:校园招聘)?$/.test(part.replace(/\s+/g, ""))).slice(0, 2).join("-")
    : "";
  const usefulDescription = /^(?:字节跳动)?(?:校园|社会|全球)?招聘(?:官网|首页)?$/.test(description.replace(/\s+/g, ""))
    ? ""
    : description;
  const fuzzyTitle = fuzzyJobTitle(plain);
  const htmlTitle = byteDanceTitle || (
    headingTitle && !genericRecruitingTitle(headingTitle)
      ? headingTitle
      : titleParts[0] && !genericRecruitingTitle(titleParts[0])
        ? titleParts[0]
        : fuzzyTitle
  );
  const postingDescription = stringValue(posting?.description);
  const sourceText = postingDescription || plain;
  const jd = section(
    sourceText,
    ["岗位职责", "职位描述", "工作职责", "岗位描述", "职位职责", "responsibilities", "job description", "what you'll do", "the role"],
    ["任职要求", "岗位要求", "职位要求", "职责要求", "申请条件", "工作地点", "福利待遇", "requirements", "qualifications", "what we're looking for"],
  );
  const requirements = section(
    sourceText,
    ["任职要求", "岗位要求", "职位要求", "职责要求", "申请条件", "任职资格", "requirements", "qualifications", "what we're looking for", "preferred qualifications"],
    ["工作地点", "福利待遇", "薪资待遇", "投递方式", "申请职位", "使用.+前必读", "招聘帮助", "benefits", "compensation", "apply"],
  );
  const location = locationValue(posting?.jobLocation)
    || plain.match(/(?:工作地点|工作地|工作城市|城市)[：:\s]*([\u4e00-\u9fa5·\-、\s]{2,30})/)?.[1]?.trim()
    || fuzzyTitle.match(/^([\u4e00-\u9fa5]{2,8})[-—–]/)?.[1]
    || "";
  const data: ExtractedJob = {
    company: organizationName(posting?.hiringOrganization)
      || companyFromHostname(target.hostname)
      || siteName
      || titleParts[1]
      || "",
    title: stringValue(posting?.title) || htmlTitle || fuzzyTitle,
    publishedAt: stringValue(posting?.datePosted)
      || meta(html, "article:published_time")
      || dateFromText(plain, ["发布", "发布时间"])
      || firstStandaloneDate(plain),
    deadline: stringValue(posting?.validThrough) || dateFromText(plain, ["截止", "申请截止"]),
    location,
    jd: jd || postingDescription || usefulDescription,
    requirements,
  };

  const coreFields = [data.company, data.title, data.jd, data.requirements];
  const recognizedCore = coreFields.filter(Boolean).length;
  const status: RecognitionStatus = recognizedCore === 0 ? "failed" : coreFields.every(Boolean) ? "complete" : "partial";
  const fieldNames: Record<keyof ExtractedJob, string> = {
    company: "公司",
    title: "岗位名称",
    publishedAt: "发布日期",
    deadline: "截止日期",
    location: "工作地",
    jd: "岗位 JD",
    requirements: "任职要求",
  };
  const missingFields = (Object.keys(data) as Array<keyof ExtractedJob>)
    .filter((key) => !data[key])
    .map((key) => fieldNames[key]);

  return {
    ...PRESETS,
    ...Object.fromEntries((Object.keys(data) as Array<keyof ExtractedJob>).map((key) => [key, data[key] || PRESETS[key]])),
    recognition: {
      status,
      missingFields,
      source: posting ? "json-ld" : "html",
      hostname: target.hostname,
    },
  };
}

function blockedPageReason(html: string) {
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]).toLowerCase();
  const text = visibleText(html).slice(0, 15_000).toLowerCase();
  const titleBlocked = [
    /just a moment/,
    /access denied/,
    /attention required/,
    /captcha/,
    /人机验证/,
    /安全验证/,
    /访问验证/,
    /登录后查看/,
  ].some((pattern) => pattern.test(title));
  if (titleBlocked) return "页面需要登录或完成安全验证";

  const shortBlockedPage = text.length < 8_000 && [
    /verify you are human/,
    /complete the security check/,
    /enable javascript and cookies to continue/,
    /sign in to continue/,
    /please log in to continue/,
    /请完成.{0,8}(?:人机|安全|访问)验证/,
    /登录后(?:才能|可)?查看/,
    /访问过于频繁/,
  ].some((pattern) => pattern.test(text));
  return shortBlockedPage ? "页面需要登录或完成安全验证" : "";
}

function failedResult(target?: URL, reason = "页面无法访问或没有可识别的岗位信息") {
  return {
    ...PRESETS,
    recognition: {
      status: "failed" as const,
      missingFields: ["公司", "岗位名称", "发布日期", "截止日期", "工作地", "岗位 JD", "任职要求"],
      source: "none",
      hostname: target?.hostname || "",
      reason,
    },
  };
}

export async function POST(request: NextRequest) {
  let target: URL | undefined;
  try {
    const { url } = await request.json() as { url?: string };
    if (!url) return NextResponse.json({ error: "缺少链接" }, { status: 400 });
    target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol)) {
      return NextResponse.json({ error: "链接协议无效" }, { status: 400 });
    }

    const atsResult = await tryPublicAts(target);
    if (atsResult) return NextResponse.json(atsResult);

    const response = await fetch(target, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.7",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 JobDesk/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return NextResponse.json(failedResult(target, `页面请求失败（${response.status}）`));
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return NextResponse.json(failedResult(target, "链接返回的内容不是网页"));
    }
    const html = (await response.text()).slice(0, 4_000_000);
    const blockedReason = blockedPageReason(html);
    if (blockedReason) return NextResponse.json(failedResult(target, blockedReason));
    return NextResponse.json(buildResult(html, target));
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "页面读取超时" : "页面无法访问";
    return NextResponse.json(failedResult(target, reason));
  }
}
