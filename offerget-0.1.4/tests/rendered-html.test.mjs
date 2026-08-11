import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

function environment() {
  return {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  };
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

test("renders the local job tracker shell", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    environment(),
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /offerget/);
  assert.match(html, /岗位链接/);
  assert.match(html, /岗位库/);
  assert.match(html, /识别岗位/);
  assert.doesNotMatch(html, /Your site is taking shape|Codex is working/);
});

test("rejects an analyze request without a URL", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/analyze-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    environment(),
    executionContext,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "缺少链接" });
});

test("exposes a local health signature for the desktop shell", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/health"),
    environment(),
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    product: "job-tracker",
    status: "ok",
    version: 1,
  });
});

test("extracts a public JSON-LD job into a complete recognition result", async () => {
  const fixture = createServer((_, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html>
      <html lang="zh-CN">
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "title": "AI 产品经理",
              "datePosted": "2026-08-01",
              "validThrough": "2026-09-15",
              "hiringOrganization": { "@type": "Organization", "name": "示例科技" },
              "jobLocation": {
                "@type": "Place",
                "address": {
                  "@type": "PostalAddress",
                  "addressRegion": "广东",
                  "addressLocality": "深圳"
                }
              },
              "description": "岗位职责：负责 AI 产品规划和需求分析。任职要求：具备三年以上产品经验。"
            }
          </script>
        </head>
      </html>`);
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));

  try {
    const address = fixture.address();
    assert.ok(address && typeof address === "object");
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `http://127.0.0.1:${address.port}/job` }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.recognition.status, "complete");
    assert.equal(result.recognition.source, "json-ld");
    assert.equal(result.company, "示例科技");
    assert.equal(result.title, "AI 产品经理");
    assert.equal(result.publishedAt, "2026-08-01");
    assert.equal(result.deadline, "2026-09-15");
    assert.match(result.location, /深圳/);
    assert.match(result.jd, /AI 产品规划/);
    assert.match(result.requirements, /三年以上产品经验/);
  } finally {
    await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  }
});

test("uses the Lever public postings API before HTML fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.match(url, /^https:\/\/api\.lever\.co\/v0\/postings\/acme\/posting-123/);
    return Response.json({
      id: "posting-123",
      text: "Product Manager",
      categories: { location: "Shanghai" },
      descriptionPlain: "Responsibilities\nOwn product strategy and customer research.",
      lists: [
        { text: "Qualifications", content: "<li>3+ years of product experience</li>" },
      ],
    });
  };

  try {
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://jobs.lever.co/acme/posting-123" }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.recognition.source, "lever");
    assert.equal(result.recognition.status, "complete");
    assert.equal(result.company, "acme");
    assert.equal(result.title, "Product Manager");
    assert.equal(result.location, "Shanghai");
    assert.match(result.requirements, /3\+ years/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the Greenhouse public job board API before HTML fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/boards/acme")) {
      return Response.json({ name: "Acme Technology" });
    }
    assert.match(url, /\/boards\/acme\/jobs\/12345\?content=true$/);
    return Response.json({
      id: 12345,
      title: "AI Product Manager",
      location: { name: "Shenzhen" },
      content: "<h2>Responsibilities</h2><p>Lead AI product planning.</p><h2>Qualifications</h2><p>Experience shipping AI products.</p>",
    });
  };

  try {
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://job-boards.greenhouse.io/acme/jobs/12345" }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.recognition.source, "greenhouse");
    assert.equal(result.recognition.status, "complete");
    assert.equal(result.company, "Acme Technology");
    assert.equal(result.title, "AI Product Manager");
    assert.equal(result.location, "Shenzhen");
    assert.match(result.requirements, /Experience shipping AI products/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps a partially recognized HTML job editable without reporting total failure", async () => {
  const fixture = createServer((_, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html>
      <html lang="zh-CN">
        <head>
          <title>产品经理 | 示例公司</title>
          <meta name="description" content="负责产品规划、用户研究和需求分析。">
        </head>
        <body><p>工作地点：杭州</p></body>
      </html>`);
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));

  try {
    const address = fixture.address();
    assert.ok(address && typeof address === "object");
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `http://127.0.0.1:${address.port}/partial-job` }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "partial");
    assert.equal(result.recognition.source, "html");
    assert.equal(result.company, "示例公司");
    assert.equal(result.title, "产品经理");
    assert.match(result.jd, /产品规划/);
    assert.ok(result.recognition.missingFields.includes("任职要求"));
  } finally {
    await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  }
});

test("reports a total recognition failure for an empty public page", async () => {
  const fixture = createServer((_, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<!doctype html><html><head></head><body></body></html>");
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));

  try {
    const address = fixture.address();
    assert.ok(address && typeof address === "object");
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `http://127.0.0.1:${address.port}/empty` }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "failed");
    assert.equal(result.title, "等待核对的岗位");
    assert.equal(result.company, "");
  } finally {
    await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  }
});

test("reports captcha and login gates as total recognition failures", async () => {
  const fixture = createServer((_, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head><title>Just a moment...</title></head>
      <body><h1>Verify you are human</h1><p>Enable JavaScript and cookies to continue.</p></body></html>`);
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));

  try {
    const address = fixture.address();
    assert.ok(address && typeof address === "object");
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `http://127.0.0.1:${address.port}/captcha` }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "failed");
    assert.equal(result.recognition.source, "none");
    assert.match(result.recognition.reason, /登录|安全验证/);
  } finally {
    await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  }
});

test("ignores job-like text hidden inside executable scripts", async () => {
  const fixture = createServer((_, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head>
      <script>window.state = { "岗位职责": "这段代码不应被当成页面正文", "company": "伪造公司" };</script>
      <style>.岗位要求::after { content: "隐藏要求"; }</style>
      </head><body></body></html>`);
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));

  try {
    const address = fixture.address();
    assert.ok(address && typeof address === "object");
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `http://127.0.0.1:${address.port}/hidden-code` }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "failed");
    assert.doesNotMatch(result.jd, /这段代码/);
    assert.doesNotMatch(result.requirements, /隐藏要求/);
  } finally {
    await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  }
});

test("uses the visible H1 and site name when structured job data is absent", async () => {
  const fixture = createServer((_, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head>
      <title>校园招聘详情</title>
      <meta property="og:site_name" content="样例招聘">
      <meta name="description" content="负责移动端产品规划。">
      </head><body><h1>移动产品经理</h1><p>工作地点：上海</p></body></html>`);
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));

  try {
    const address = fixture.address();
    assert.ok(address && typeof address === "object");
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `http://127.0.0.1:${address.port}/h1-job` }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "partial");
    assert.equal(result.company, "样例招聘");
    assert.equal(result.title, "移动产品经理");
    assert.match(result.location, /上海/);
  } finally {
    await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  }
});

test("uses common social metadata when a public job page has no JSON-LD", async () => {
  const fixture = createServer((_, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head>
      <meta name="application-name" content="星河科技招聘">
      <meta name="twitter:title" content="交互设计师 &#x7C; 星河科技">
      <meta name="twitter:description" content="负责产品交互设计与用户研究。">
      <meta property="article:published_time" content="2026-08-03">
      </head><body><p>工作地点：深圳</p></body></html>`);
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));

  try {
    const address = fixture.address();
    assert.ok(address && typeof address === "object");
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `http://127.0.0.1:${address.port}/social-metadata-job` }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "partial");
    assert.equal(result.company, "星河科技招聘");
    assert.equal(result.title, "交互设计师");
    assert.equal(result.publishedAt, "2026-08-03");
    assert.match(result.jd, /产品交互设计/);
  } finally {
    await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  }
});

test("fuzzily recognizes a Baidu campus job page without structured job metadata", async () => {
  const fixture = createServer((_, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head><title>百度校园招聘</title></head><body>
      <header><h1>百度校园招聘</h1></header>
      <nav>首页 职位 招聘动态 了解百度 登录</nav>
      <main>
        <div>上海-用户产品经理(J101084)</div>
        <div>上海市 | 校招 | 产品 | 5人 | 2026-07-21</div>
        <h2>工作职责：</h2>
        <p>-负责用户增长、用户激励体系、个人中心等用户产品的规划与设计</p>
        <p>-通过数据分析定位用户体验问题，驱动产品持续优化</p>
        <h2>职责要求：</h2>
        <p>-本科及以上学历，计算机、信息管理等相关专业优先</p>
        <p>-具备良好的逻辑分析能力，熟悉用户增长方法论</p>
      </main>
    </body></html>`);
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));

  try {
    const address = fixture.address();
    assert.ok(address && typeof address === "object");
    const worker = await loadWorker();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "talent.baidu.com") {
        return originalFetch(`http://127.0.0.1:${address.port}${url.pathname}`, init);
      }
      return originalFetch(input, init);
    };

    try {
      const response = await worker.fetch(
        new Request("http://localhost/api/analyze-job", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: "https://talent.baidu.com/jobs/detail/GRADUATE/example",
          }),
        }),
        environment(),
        executionContext,
      );
      const result = await response.json();

      assert.equal(result.recognition.status, "complete");
      assert.equal(result.company, "百度");
      assert.equal(result.title, "上海-用户产品经理(J101084)");
      assert.equal(result.publishedAt, "2026-07-21");
      assert.equal(result.location, "上海");
      assert.match(result.jd, /用户增长/);
      assert.doesNotMatch(result.jd, /职责要求/);
      assert.match(result.requirements, /本科及以上学历/);
      assert.doesNotMatch(result.requirements, /申请职位/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  }
});

test("keeps ByteDance as company and moves its product line into the job title", async () => {
  const fixture = createServer((_, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head>
      <title>AI产品经理 - 剪映CapCut - 加入字节跳动</title>
      <meta name="description" content="字节跳动校园招聘">
    </head><body><main id="root"></main></body></html>`);
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));

  try {
    const address = fixture.address();
    assert.ok(address && typeof address === "object");
    const worker = await loadWorker();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "jobs.bytedance.com") {
        return originalFetch(`http://127.0.0.1:${address.port}${url.pathname}`, init);
      }
      return originalFetch(input, init);
    };

    try {
      const response = await worker.fetch(
        new Request("http://localhost/api/analyze-job", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: "https://jobs.bytedance.com/campus/position/example/detail",
          }),
        }),
        environment(),
        executionContext,
      );
      const result = await response.json();

      assert.equal(result.company, "字节跳动");
      assert.equal(result.title, "AI产品经理-剪映CapCut");
      assert.equal(result.recognition.status, "partial");
      assert.equal(result.jd, "页面内容未能完整识别，请从原网页复制岗位职责原文。");
      assert.doesNotMatch(result.jd, /字节跳动校园招聘/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    await new Promise((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()));
  }
});

test("uses the ByteDance public detail API for description and requirements", async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/job/posts/7669679956750420229") {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          job_post_detail: {
            id: "7669679956750420229",
            title: "AI产品经理 - TikTok直播",
            description: "1、深度参与AI在直播场景的落地；\n2、负责AI互动玩法设计及落地。",
            requirement: "1、2027届获得本科及以上学历；\n2、对AI有热情。",
            city_info: { name: "上海", i18n_name: "上海" },
            publish_time: 1785736660949,
          },
        },
      }), { headers: { "content-type": "application/json" } });
    }
    return originalFetch(input);
  };

  try {
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://jobs.bytedance.com/campus/position/7669679956750420229/detail?spread=5YNTDRM",
        }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "complete");
    assert.equal(result.recognition.source, "bytedance");
    assert.equal(result.company, "字节跳动");
    assert.equal(result.title, "AI产品经理 - TikTok直播");
    assert.equal(result.location, "上海");
    assert.equal(result.publishedAt, "2026-08-03");
    assert.match(result.jd, /AI互动玩法/);
    assert.match(result.requirements, /2027届/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the Alibaba campus detail API for complete job content", async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "campus-talent.alibaba.com" && url.pathname.startsWith("/campus/position/")) {
      return new Response(`
        <html><script>window.__sysconfig={"circle":{"portalCampusChannel":"new_campus_group_official_site"}}</script></html>
      `, {
        headers: {
          "content-type": "text/html",
          "set-cookie": "XSRF-TOKEN=test-xsrf; Path=/; HttpOnly, SESSION=test-session; Path=/; HttpOnly",
        },
      });
    }
    if (url.hostname === "campus-talent.alibaba.com" && url.pathname === "/position/detail") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.id, "199907780089");
      assert.equal(body.channel, "new_campus_group_official_site");
      assert.match(String(init.headers.cookie), /SESSION=test-session/);
      assert.equal(init.headers["x-xsrf-token"], "test-xsrf");
      return new Response(JSON.stringify({
        success: true,
        content: {
          id: 199907780089,
          name: "AI体验设计师",
          publishTime: null,
          workLocations: ["北京", "广州", "杭州", "上海"],
          description: "1.参与结合AI的体验设计创新工作。",
          requirement: "1.本科及以上学历；\n2.乐于拥抱AI。",
        },
      }), { headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };

  try {
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://campus-talent.alibaba.com/campus/position/199907780089?deptCodes=淘宝",
        }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "complete");
    assert.equal(result.recognition.source, "alibaba");
    assert.equal(result.company, "阿里集团");
    assert.equal(result.title, "AI体验设计师");
    assert.equal(result.location, "北京、广州、杭州、上海");
    assert.equal(result.publishedAt, "待确认");
    assert.match(result.jd, /体验设计创新/);
    assert.match(result.requirements, /本科及以上学历/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the Zhiye public job detail API for complete job content", async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "intsig.zhiye.com" && url.pathname === "/campus/detail") {
      return new Response(`
        <html><script>
          var BSGlobal = {"tenantInfo":{"Alias":"上海合合信息科技股份有限公司","Abbreviation":"合合信息"}};
        </script></html>
      `, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.hostname === "intsig.zhiye.com" && url.pathname === "/api/JobAd/GetJobAdInfo") {
      assert.equal(url.searchParams.get("jobAdId"), "d2ad9c13-10fe-417a-863d-e12df76f279b");
      assert.equal(url.searchParams.get("category"), "2");
      assert.match(url.searchParams.get("displayFields") || "", /Duty/);
      return new Response(JSON.stringify({
        Code: 200,
        Data: {
          JobAdName: "【27校招】产品经理(J14434)",
          PostDate: "2026-07-28T16:08:22",
          EndTime: "0001-01-01T00:00:00",
          LocNames: ["上海市"],
          Duty: "参与 C 端 AI 产品的需求分析、产品设计与迭代优化。",
          Require: "本科及以上学历，对 C 端 AI 产品有强烈兴趣。",
        },
      }), { headers: { "content-type": "application/json" } });
    }
    return originalFetch(input);
  };

  try {
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://intsig.zhiye.com/campus/detail?jobAdId=d2ad9c13-10fe-417a-863d-e12df76f279b",
        }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "complete");
    assert.equal(result.recognition.source, "zhiye");
    assert.equal(result.company, "合合信息");
    assert.equal(result.title, "【27校招】产品经理(J14434)");
    assert.equal(result.location, "上海市");
    assert.equal(result.publishedAt, "2026-07-28");
    assert.match(result.jd, /产品设计/);
    assert.match(result.requirements, /本科及以上/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the Beisen public job API on a custom vivo recruitment domain", async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "hr-campus.vivo.com" && url.pathname === "/campus/detail") {
      return new Response(`
        <html><script>
          var BSGlobal = {"tenantInfo":{"Alias":"维沃移动通信有限公司","Abbreviation":"vivo","SiteName":"vivo招聘"}};
        </script></html>
      `, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.hostname === "hr-campus.vivo.com" && url.pathname === "/api/JobAd/GetJobAdInfo") {
      assert.equal(url.searchParams.get("jobAdId"), "f79e8d80-10a8-4131-b37b-3121c68b29f4");
      assert.equal(url.searchParams.get("category"), "2");
      return new Response(JSON.stringify({
        Code: 200,
        Data: {
          JobAdName: "人因研究工程师-27届秋招",
          PostDate: "2026-08-06T19:35:24",
          EndTime: "2222-02-02T00:00:00",
          LocNames: ["上海市"],
          Duty: "负责人因研究、用户洞察与产品体验评估。",
          Require: "本科及以上学历，具备用户研究与数据分析能力。",
        },
      }), { headers: { "content-type": "application/json" } });
    }
    return originalFetch(input);
  };

  try {
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://hr-campus.vivo.com/campus/detail?jobAdId=f79e8d80-10a8-4131-b37b-3121c68b29f4",
        }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "complete");
    assert.equal(result.recognition.source, "zhiye");
    assert.equal(result.company, "vivo");
    assert.equal(result.title, "人因研究工程师-27届秋招");
    assert.equal(result.location, "上海市");
    assert.equal(result.publishedAt, "2026-08-06");
    assert.equal(result.deadline, "待确认");
    assert.match(result.jd, /人因研究/);
    assert.match(result.requirements, /数据分析/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the encrypted Moka public job API for a campus job", async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;
  const aesIv = "de7c21ed8d6f50fe";
  const aesKey = "b0ceb9fa2ed8f1c3";
  const clearPayload = {
    code: 0,
    success: true,
    data: {
      id: "772e1ffb-746a-456c-92a4-c438e8e175ab",
      title: "产品经理-效能工具方向",
      publishedAt: "2026-08-07T10:41:42",
      jobDescription: "<p><strong>岗位职责：</strong></p><p>参与研发效能工具的产品设计与持续迭代。</p><p><strong>任职要求：</strong></p><p>本科及以上学历，具备产品意识与沟通能力。</p>",
      locations: [{ provinceName: "Shanghai", cityName: "Xuhui" }],
      projectFolder: { settings: { deliveryLimit: { content: { endDate: "2026-10-31" } } } },
    },
  };
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(aesKey), { name: "AES-CBC" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: new TextEncoder().encode(aesIv) },
    key,
    new TextEncoder().encode(JSON.stringify(clearPayload)),
  );
  const encryptedPayload = Buffer.from(encrypted).toString("base64");

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "app.mokahr.com" && url.pathname === "/campus-recruitment/hypergryph/26326") {
      return new Response(`<html><script>window.TurboApply={data:{aesIv&quot;:&quot;${aesIv}&quot;}};</script><footer>companyName&quot;:&quot;© 鹰角网络&quot;</footer></html>`, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (url.hostname === "app.mokahr.com" && url.pathname === "/api/outer/ats-apply/website/job") {
      const requestBody = JSON.parse(String(init?.body));
      assert.equal(requestBody.orgId, "hypergryph");
      assert.equal(requestBody.siteId, 26326);
      assert.equal(requestBody.jobId, "772e1ffb-746a-456c-92a4-c438e8e175ab");
      return new Response(JSON.stringify({ data: encryptedPayload, necromancer: aesKey }), {
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };

  try {
    const response = await worker.fetch(
      new Request("http://localhost/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://app.mokahr.com/campus-recruitment/hypergryph/26326#/job/772e1ffb-746a-456c-92a4-c438e8e175ab",
        }),
      }),
      environment(),
      executionContext,
    );
    const result = await response.json();

    assert.equal(result.recognition.status, "complete");
    assert.equal(result.recognition.source, "moka");
    assert.equal(result.company, "鹰角网络");
    assert.equal(result.title, "产品经理-效能工具方向");
    assert.equal(result.publishedAt, "2026-08-07");
    assert.equal(result.deadline, "2026-10-31");
    assert.equal(result.location, "Shanghai");
    assert.match(result.jd, /研发效能工具/);
    assert.match(result.requirements, /本科及以上学历/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps recognition states and local launchers in the product", async () => {
  const [page, analyzer] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analyze-job/route.ts", import.meta.url), "utf8"),
    access(new URL("../启动求职台.cmd", import.meta.url)),
    access(new URL("../停止求职台.cmd", import.meta.url)),
    access(new URL("../scripts/start-job-tracker.ps1", import.meta.url)),
    access(new URL("../scripts/stop-job-tracker.ps1", import.meta.url)),
  ]);

  assert.match(page, /"complete"\s*\|\s*"partial"\s*\|\s*"failed"/);
  assert.match(page, /岗位信息识别失败/);
  assert.match(page, /!job\.deletedAt\s*&&\s*job\.url\s*===\s*trimmed/);
  assert.match(page, /job\.deletedAt\s*&&\s*job\.url\s*===\s*draft\.url/);
  assert.match(analyzer, /JobPosting/);
  assert.match(analyzer, /status:\s*"failed"/);
  assert.match(analyzer, /status:\s*RecognitionStatus/);
});

test("uses comma-separated manual keywords and keeps hover previews", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /label>关键词<input value=\{keywordInput\}/);
  assert.match(page, /value\.split\(\/\[,，\]\//);
  assert.match(page, /job\.keywords\.map/);
  assert.doesNotMatch(page, /keywordSummaryFromResponsibilities|keywordSummary\(job\)/);
  assert.match(page, /className="hover-title" title=\{libraryValue\(job\.title\)\}/);
  assert.match(page, /className="hover-copy" title=\{libraryValue\(job\.jd\)/);
  assert.doesNotMatch(styles, /cursor:\s*help/);
});

test("uses local JSON persistence and keeps legacy data migration tools", async () => {
  const [page, stateRoute, exportScript, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../skills/offerget/scripts/export-desktop-state.cjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(stateRoute, /\.offerget/);
  assert.match(stateRoute, /fs\.rename/);
  assert.match(exportScript, /DatabaseSync/);
  assert.match(page, /data-export/);
  assert.match(page, /jobTrackerDesktop/);
  assert.doesNotMatch(packageJson, /electron|electron-builder|desktop:build/);
});

test("keeps search inside the job library and explains Codex analysis in settings", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="search-field library-search"/);
  assert.match(styles, /\.library-heading \.library-search/);
  assert.match(page, /分析结果留在 Codex 对话中/);
  assert.doesNotMatch(page, /workspaceView === "resume"/);
});

test("supports lossless web migration and broad company-grouped views", async () => {
  const [page, skill, adapterWorkflow, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../skills/offerget/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../skills/offerget/references/adapter-workflow.md", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /companyGrouping/);
  assert.match(page, /companyNotes/);
  assert.match(page, /company-folders/);
  assert.match(page, /company-group-row/);
  assert.match(page, /reactionFilter/);
  assert.match(page, /showReactionJobs/);
  assert.match(page, /aria-label={`查看\${label}的岗位`}/);
  assert.match(page, /aria-label="返回企业分组"/);
  assert.doesNotMatch(page, />← 返回企业分组</);
  assert.doesNotMatch(page, />按标题重算分类</);
  assert.match(page, /数据迁移/);
  assert.match(page, /导入备份/);
  assert.match(page, /localStorage\.setItem\("offerget-company-notes"/);
  assert.match(page, /fetch\("\/api\/state"/);
  assert.match(page, /offerget-shared-migrated-v1/);
  assert.match(page, /\["设计", \["设计", "产品设计"/);
  assert.match(page, /\$\{editing \? "保存" : "编辑"\} \$\{company\} 的投递规则/);
  assert.match(page, /onBlur=\{\(\) => \{/);
  assert.match(page, /event\.key !== "Enter"/);
  assert.match(styles, /\.company-note-edit/);
  assert.match(page, /className="hover-title" title=\{libraryValue\(job\.title\)\}/);
  assert.match(page, /className="hover-copy" title=\{libraryValue\(job\.jd\) \|\| undefined\}/);
  assert.doesNotMatch(page, />一键整理</);
  assert.match(page, /rel="noreferrer">投递<\/a>/);
  assert.doesNotMatch(page, /rel="noreferrer">投递 ↗<\/a>/);
  assert.match(skill, /name:\s*offerget/);
  assert.match(skill, /check-recognition\.mjs/);
  assert.match(adapterWorkflow, /partial|failed/);
});
