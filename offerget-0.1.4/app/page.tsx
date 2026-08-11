"use client";

import { ChangeEvent, FormEvent, Fragment, useEffect, useMemo, useState } from "react";

type DisplayMode = "list" | "board";
type WorkspaceView = "jobs" | "history" | "trash" | "settings";
type ThemeMode = "light" | "dark";
type JobReaction = "love" | "smile" | "dislike" | "neutral";
type Job = {
  id: string;
  company: string;
  title: string;
  publishedAt: string;
  deadline: string;
  location: string;
  jd: string;
  requirements: string;
  url: string;
  progress: string;
  categories: string[];
  keywords: string[];
  createdAt: string;
  deletedAt?: string;
  reaction?: JobReaction;
};
type Comparison = { id: string; createdAt: string; jobs: Job[] };
type PersistedState = {
  jobs: Job[];
  statuses: string[];
  comparisons: Comparison[];
  theme: ThemeMode;
  mcpEnabled?: boolean;
  companyGrouping?: boolean;
  companyNotes?: Record<string, string>;
};
type DesktopStateRecord = {
  version: number;
  data: PersistedState;
  updatedAt: string;
} | null;

declare global {
  interface Window {
    jobTrackerDesktop?: {
      loadState: () => Promise<DesktopStateRecord>;
      saveState: (data: PersistedState) => Promise<{ ok: boolean; updatedAt: string }>;
      getPlatformInfo: () => Promise<{ desktop: true; dataFile: string; port: number }>;
      onStateImported: (callback: (data: PersistedState) => void) => () => void;
    };
  }
}
type RecognitionResult = Partial<Job> & {
  recognition?: {
    status: "complete" | "partial" | "failed";
    missingFields?: string[];
    reason?: string;
  };
};

async function loadSharedState(): Promise<PersistedState | null> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.data || null;
}

async function saveSharedState(data: PersistedState) {
  await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

const DEFAULT_STATUSES = ["未投递", "已投递", "待测评", "待面试"];
const SEED_JOBS: Job[] = [
  ["7664880597853047076", "影石管培生（CEO培养）"],
  ["7664585052421196041", "AI应用产品管培生"],
  ["7665929800230553897", "软件产品经理（固件方向）"],
  ["7663444194439268651", "软件产品经理（AG）"],
  ["7657119331897231658", "影像产品经理"],
].map(([id, title], index) => ({
  id,
  title,
  company: "影石创新科技股份有限公司",
  url: `https://arashivision.jobs.feishu.cn/campus/position/${id}/detail`,
  publishedAt: "待确认",
  deadline: "待确认",
  location: "深圳",
  jd: "岗位官网已关联，点击编辑可补充岗位职责原文。",
  requirements: "待补充任职要求原文。",
  progress: "未投递",
  categories: ["产品", title.includes("AI") ? "AI" : "消费电子"],
  keywords: [],
  createdAt: new Date(Date.now() - index * 60000).toISOString(),
}));

const EMPTY_JOB: Job = {
  id: "",
  company: "",
  title: "",
  publishedAt: "",
  deadline: "",
  location: "",
  jd: "",
  requirements: "",
  url: "",
  progress: "未投递",
  categories: [],
  keywords: [],
  createdAt: "",
};

function classify(job: Pick<Job, "title">) {
  const title = job.title.toLowerCase().replace(/\s+/g, "");
  const rules: Array<[string, string[]]> = [
    ["管培生", ["管培生", "产培生", "管理培训生"]],
    ["设计", ["设计", "产品设计", "交互设计", "视觉设计", "体验设计", "ui设计", "ux设计", "设计师"]],
    ["产品", ["产品经理", "产品管培", "产品策划", "产品运营", "产品岗"]],
    ["运营", ["运营", "用户增长", "内容生态", "社区管理"]],
    ["销售", ["销售", "客户经理", "商务拓展", "渠道拓展", "大客户"]],
    ["市场", ["市场", "品牌", "营销", "公关", "传播"]],
    ["研发", ["开发工程师", "算法", "前端", "后端", "客户端", "测试工程师", "技术研发"]],
    ["数据", ["数据分析", "数据科学", "商业分析", "数据产品"]],
    ["职能", ["人力资源", "财务", "法务", "行政", "采购", "供应链"]],
  ];
  const direct = rules.find(([, words]) => words.some((word) => title.includes(word)));
  return [direct?.[0] || "其他"];
}

function migrateJobs(value: unknown): Job[] {
  if (!Array.isArray(value)) return SEED_JOBS;
  return value.map((item, index) => {
    const old = item as Partial<Job> & { resumeReady?: boolean };
    const next = {
      ...EMPTY_JOB,
      ...old,
      id: old.id || crypto.randomUUID(),
      deadline: old.deadline || "待确认",
      location: old.location || "待确认",
      requirements: old.requirements || "待补充任职要求原文。",
      progress: old.progress === "改简历" ? "未投递" : old.progress || "未投递",
      categories: old.categories?.length ? old.categories : [],
      keywords: Array.isArray(old.keywords) ? old.keywords : [],
      createdAt: old.createdAt || new Date(Date.now() - index * 60000).toISOString(),
    };
    return { ...next, categories: classify(next) };
  });
}

function isPresetValue(value: string) {
  return !value || ["待确认", "待分类", "等待核对的岗位", "待补充任职要求原文。"].includes(value)
    || value.startsWith("页面内容未能完整识别")
    || value.startsWith("链接已接收")
    || value.startsWith("请核对并补充");
}

function libraryValue(value: string) {
  return isPresetValue(value) ? "" : value;
}

function toDateInputValue(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/(\d{4})[年/.:-](\d{1,2})[月/.:-](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "";
}

const REACTION_OPTIONS: Array<{ value?: JobReaction; label: string }> = [
  { value: "love", label: "喜欢" },
  { value: "smile", label: "还行" },
  { value: "dislike", label: "不喜欢" },
  { value: "neutral", label: "中性" },
];

function ReactionIcon({ value }: { value?: JobReaction }) {
  if (value === "love") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4 4.2 13A5.1 5.1 0 0 1 11.4 5.8l.6.7.6-.7A5.1 5.1 0 0 1 19.8 13Z" /></svg>;
  }
  if (value === "smile") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M8.5 10h.01M15.5 10h.01M8.5 14.2c1.8 2 5.2 2 7 0" /></svg>;
  }
  if (value === "dislike") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="m7.8 8.5 2 2m0-2-2 2m6.4-2 2 2m0-2-2 2M8.5 16c1.8-2 5.2-2 7 0" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M9 10h.01M15 10h.01M9 15h6" /></svg>;
}

function ReactionPicker({ value, onChange }: { value?: JobReaction; onChange: (value?: JobReaction) => void }) {
  const currentLabel = REACTION_OPTIONS.find((item) => item.value === value)?.label || "未评价";
  return (
    <div className="reaction-picker">
      <button className={`reaction-trigger ${value ? "selected" : ""}`} type="button" aria-label={`岗位偏好：${currentLabel}`}>
        <ReactionIcon value={value} />
      </button>
      <div className="reaction-menu" role="group" aria-label="选择岗位偏好">
        {REACTION_OPTIONS.map((option) => (
          <button
            className={option.value === value && value ? "selected" : ""}
            key={option.label}
            type="button"
            title={option.label}
            aria-label={option.label}
            onClick={() => onChange(option.value)}
          >
            <ReactionIcon value={option.value} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>(SEED_JOBS);
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [mode, setMode] = useState<DisplayMode>("board");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("jobs");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [activeComparison, setActiveComparison] = useState<Comparison | null>(null);
  const [draft, setDraft] = useState<Job | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [confirmClearTrash, setConfirmClearTrash] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [failedRecognitionDraft, setFailedRecognitionDraft] = useState<Job | null>(null);
  const [companyGrouping, setCompanyGrouping] = useState(false);
  const [companyNotes, setCompanyNotes] = useState<Record<string, string>>({});
  const [editingCompanyNote, setEditingCompanyNote] = useState<string | null>(null);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [reactionFilter, setReactionFilter] = useState<JobReaction | null>(null);

  useEffect(() => {
    let active = true;

    async function restoreState() {
      try {
        const desktopRecord = await window.jobTrackerDesktop?.loadState();
        if (!active) return;

        const sharedState = desktopRecord?.data ? null : await loadSharedState();

        if (desktopRecord?.data) {
          const saved = desktopRecord.data;
          setJobs(migrateJobs(saved.jobs));
          if (Array.isArray(saved.statuses) && saved.statuses.length) setStatuses(saved.statuses);
          if (Array.isArray(saved.comparisons)) setComparisons(saved.comparisons);
          if (saved.theme === "dark" || saved.theme === "light") setTheme(saved.theme);
          setMcpEnabled(saved.mcpEnabled !== false);
          setCompanyGrouping(saved.companyGrouping === true);
          setCompanyNotes(saved.companyNotes || {});
        } else if (sharedState) {
          const sharedJobs = migrateJobs(sharedState.jobs);
          const sharedStatuses = Array.isArray(sharedState.statuses) && sharedState.statuses.length ? sharedState.statuses : DEFAULT_STATUSES;
          const sharedComparisons = Array.isArray(sharedState.comparisons) ? sharedState.comparisons : [];
          const needsBrowserMigration = localStorage.getItem("offerget-shared-migrated-v1") !== "1";
          const localJobsValue = needsBrowserMigration
            ? JSON.parse(localStorage.getItem("job-desk-records-v1") || "null")
            : null;
          const localJobs = Array.isArray(localJobsValue) ? migrateJobs(localJobsValue) : [];
          const mergedJobMap = new Map<string, Job>();
          localJobs.forEach((job) => mergedJobMap.set(job.url || job.id, job));
          sharedJobs.forEach((job) => mergedJobMap.set(job.url || job.id, job));
          const mergedJobs = [...mergedJobMap.values()];
          const localStatusesValue = needsBrowserMigration
            ? JSON.parse(localStorage.getItem("job-desk-statuses-v2") || "null")
            : null;
          const mergedStatuses = Array.isArray(localStatusesValue)
            ? [...new Set([...sharedStatuses, ...localStatusesValue])]
            : sharedStatuses;
          const localComparisonsValue = needsBrowserMigration
            ? JSON.parse(localStorage.getItem("job-desk-comparisons-v1") || "null")
            : null;
          const mergedComparisonMap = new Map(sharedComparisons.map((comparison) => [comparison.id, comparison]));
          if (Array.isArray(localComparisonsValue)) {
            localComparisonsValue.forEach((comparison: Comparison) => {
              if (!mergedComparisonMap.has(comparison.id)) mergedComparisonMap.set(comparison.id, comparison);
            });
          }
          const mergedComparisons = [...mergedComparisonMap.values()];

          setJobs(mergedJobs);
          setStatuses(mergedStatuses);
          setComparisons(mergedComparisons);
          if (sharedState.theme === "dark" || sharedState.theme === "light") setTheme(sharedState.theme);
          setMcpEnabled(sharedState.mcpEnabled !== false);
          setCompanyGrouping(sharedState.companyGrouping === true);
          setCompanyNotes(sharedState.companyNotes || {});
          if (needsBrowserMigration) {
            localStorage.setItem("offerget-shared-migrated-v1", "1");
            await saveSharedState({
              ...sharedState,
              jobs: mergedJobs,
              statuses: mergedStatuses,
              comparisons: mergedComparisons,
            });
          }
        } else {
          const savedJobs = JSON.parse(localStorage.getItem("job-desk-records-v1") || "null");
          const migratedJobs = migrateJobs(savedJobs);
          const savedStatuses = JSON.parse(localStorage.getItem("job-desk-statuses-v2") || "null");
          const migratedStatuses = Array.isArray(savedStatuses) && savedStatuses.length
            ? savedStatuses
            : DEFAULT_STATUSES;
          const savedComparisons = JSON.parse(localStorage.getItem("job-desk-comparisons-v1") || "null");
          const migratedComparisons = Array.isArray(savedComparisons) ? savedComparisons : [];
          const savedTheme = localStorage.getItem("job-desk-theme");
          const migratedTheme = savedTheme === "dark" ? "dark" : "light";
          const savedGrouping = localStorage.getItem("offerget-company-grouping") === "true";
          const savedCompanyNotes = JSON.parse(localStorage.getItem("offerget-company-notes") || "{}");

          setJobs(migratedJobs);
          setStatuses(migratedStatuses);
          setComparisons(migratedComparisons);
          setTheme(migratedTheme);
          setCompanyGrouping(savedGrouping);
          setCompanyNotes(savedCompanyNotes);
          await window.jobTrackerDesktop?.saveState({
            jobs: migratedJobs,
            statuses: migratedStatuses,
            comparisons: migratedComparisons,
            theme: migratedTheme,
            mcpEnabled: true,
            companyGrouping: savedGrouping,
            companyNotes: savedCompanyNotes,
          });
          if (!window.jobTrackerDesktop) {
            await saveSharedState({
              jobs: migratedJobs,
              statuses: migratedStatuses,
              comparisons: migratedComparisons,
              theme: migratedTheme,
              mcpEnabled: true,
              companyGrouping: savedGrouping,
              companyNotes: savedCompanyNotes,
            });
          }
        }
      } catch {
        if (active) setJobs(SEED_JOBS);
      } finally {
        if (active) setReady(true);
      }
    }

    restoreState();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("job-desk-records-v1", JSON.stringify(jobs));
    localStorage.setItem("job-desk-statuses-v2", JSON.stringify(statuses));
    localStorage.setItem("job-desk-comparisons-v1", JSON.stringify(comparisons));
    localStorage.setItem("offerget-company-grouping", String(companyGrouping));
    localStorage.setItem("offerget-company-notes", JSON.stringify(companyNotes));
    const state = { jobs, statuses, comparisons, theme, mcpEnabled, companyGrouping, companyNotes };
    if (window.jobTrackerDesktop) {
      window.jobTrackerDesktop.saveState(state).catch(() => undefined);
    } else {
      saveSharedState(state).catch(() => undefined);
    }
  }, [jobs, statuses, comparisons, theme, mcpEnabled, companyGrouping, companyNotes, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("job-desk-theme", theme);
  }, [theme, ready]);


  useEffect(() => {
    if (!ready) return;
    const removeListener = window.jobTrackerDesktop?.onStateImported((saved) => {
      setJobs(migrateJobs(saved.jobs));
      setStatuses(saved.statuses);
      setComparisons(saved.comparisons);
      setTheme(saved.theme);
      setMcpEnabled(saved.mcpEnabled !== false);
      setCompanyGrouping(saved.companyGrouping === true);
      setCompanyNotes(saved.companyNotes || {});
      setMessage("旧数据已导入并保存到本地数据库。");
    });
    return removeListener;
  }, [ready]);

  useEffect(() => {
    if (!ready || new URLSearchParams(window.location.search).get("data-export") !== "1") return;
    if (sessionStorage.getItem("job-desk-exported")) return;
    sessionStorage.setItem("job-desk-exported", "1");
    const backup = {
      version: 1,
      data: { jobs, statuses, comparisons, theme, mcpEnabled, companyGrouping, companyNotes },
      exportedAt: new Date().toISOString(),
    };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    link.download = `offerget备份-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [jobs, statuses, comparisons, theme, mcpEnabled, companyGrouping, companyNotes, ready]);

  const activeJobs = useMemo(() => jobs.filter((job) => !job.deletedAt), [jobs]);
  const trashedJobs = useMemo(() => jobs.filter((job) => job.deletedAt), [jobs]);

  const categories = useMemo(
    () => {
      const values = [...new Set(activeJobs.flatMap((job) => classify(job)))];
      const priority = ["产品", "设计"];
      return values.sort((a, b) => {
        const aIndex = priority.indexOf(a);
        const bIndex = priority.indexOf(b);
        if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
        return a.localeCompare(b, "zh-CN");
      });
    },
    [activeJobs],
  );

  const visibleJobs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return activeJobs
      .filter((job) => {
        const hit = !keyword || `${job.company} ${job.title} ${job.location} ${job.jd} ${job.requirements}`.toLowerCase().includes(keyword);
        const statusHit = !statusFilter || statusFilter === "全部" || job.progress === statusFilter;
        const categoryHit = categoryFilter === "全部" || classify(job).includes(categoryFilter);
        const reactionHit = !reactionFilter || job.reaction === reactionFilter;
        return hit && statusHit && categoryHit && reactionHit;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [activeJobs, query, statusFilter, categoryFilter, reactionFilter]);

  function showReactionJobs(reaction: JobReaction) {
    setReactionFilter((current) => current === reaction ? null : reaction);
    setExpandedCompany(null);
    requestAnimationFrame(() => document.getElementById("job-library")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const companyGroups = useMemo(() => {
    const grouped = new Map<string, Job[]>();
    visibleJobs.forEach((job) => {
      const company = libraryValue(job.company) || "未知企业";
      grouped.set(company, [...(grouped.get(company) || []), job]);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN"));
  }, [visibleJobs]);

  async function recognizeLink(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    if (jobs.some((job) => !job.deletedAt && job.url === trimmed)) {
      setMessage("这个岗位已经在岗位库中。");
      return;
    }
    setRecognizing(true);
    setMessage("");
    try {
      const response = await fetch("/api/analyze-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const result = await response.json() as RecognitionResult;
      const next = {
        ...EMPTY_JOB,
        ...result,
        id: crypto.randomUUID(),
        url: trimmed,
        progress: "未投递",
        createdAt: new Date().toISOString(),
      };
      if (!response.ok || result.recognition?.status === "failed") {
        setFailedRecognitionDraft({ ...next, categories: ["待分类"] });
        return;
      }
      const nextCategories = classify(next);
      setDraft({ ...next, categories: nextCategories });
      setKeywordInput("");
    } catch {
      const host = new URL(trimmed).hostname.split(".")[0];
      const next = { ...EMPTY_JOB, id: crypto.randomUUID(), company: host, title: "等待核对的岗位", url: trimmed, progress: "未投递", createdAt: new Date().toISOString() };
      setFailedRecognitionDraft({ ...next, categories: ["待分类"] });
    } finally {
      setRecognizing(false);
    }
  }

  function confirmDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setJobs((current) => [
      { ...draft, categories: classify(draft) },
      ...current.filter((job) => !(job.deletedAt && job.url === draft.url)),
    ]);
    setDraft(null);
    setUrl("");
    setMessage("岗位已进入岗位库。");
  }

  function updateJob(id: string, patch: Partial<Job>) {
    setJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job));
  }

  function editJob(job: Job) {
    setKeywordInput(job.keywords.join(", "));
    setDraft({ ...job });
  }

  function updateDraftKeywords(value: string) {
    if (!draft) return;
    setKeywordInput(value);
    const next = [...new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))];
    setDraft({ ...draft, keywords: next });
  }

  function saveEditedJob(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const exists = jobs.some((job) => job.id === draft.id);
    const next = { ...draft, categories: classify(draft) };
    if (exists) updateJob(draft.id, next);
    else setJobs((current) => [next, ...current]);
    setDraft(null);
    setUrl("");
    setMessage(exists ? "岗位信息已更新。" : "岗位已进入岗位库。");
  }

  function addStatus(event: FormEvent) {
    event.preventDefault();
    const name = newStatus.trim();
    if (!name || statuses.includes(name)) return;
    setStatuses((current) => [...current, name]);
    setNewStatus("");
    setShowStatusForm(false);
    setStatusFilter("");
    setWorkspaceView("jobs");
  }

  function removeStatus(status: string) {
    const count = activeJobs.filter((job) => job.progress === status).length;
    if (statuses.length <= 1) {
      window.alert("至少保留一个投递状态。");
      return;
    }
    if (count > 0) {
      const confirmed = window.confirm(
        `“${status}”下还有 ${count} 个岗位。\n\n请先把岗位放到其他状态分类下，否则继续删除会将该分类和其中的岗位一起移入回收站。\n\n点击“确定”仍要删除，点击“取消”撤回删除。`,
      );
      if (!confirmed) return;
      const deletedAt = new Date().toISOString();
      setJobs((current) => current.map((job) => job.progress === status && !job.deletedAt ? { ...job, deletedAt } : job));
    }
    setStatuses((current) => current.filter((item) => item !== status));
    if (statusFilter === status) setStatusFilter("全部");
  }

  function toggleJobSelection(id: string) {
    setSelectedJobIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function moveToTrash(ids: string[]) {
    if (!ids.length) return;
    setJobs((current) => current.map((job) => ids.includes(job.id) ? { ...job, deletedAt: new Date().toISOString() } : job));
    setSelectedJobIds([]);
    setBulkMode(false);
    if (draft && ids.includes(draft.id)) setDraft(null);
  }

  function restoreJob(id: string) {
    setJobs((current) => current.map((job) => job.id === id ? { ...job, deletedAt: undefined } : job));
  }

  function clearTrash() {
    setJobs((current) => current.filter((job) => !job.deletedAt));
    setConfirmClearTrash(false);
  }

  function createComparison() {
    const picked = activeJobs.filter((job) => selectedJobIds.includes(job.id));
    if (picked.length < 2) return;
    const record = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), jobs: picked.map((job) => ({ ...job })) };
    setComparisons((current) => [record, ...current]);
    setActiveComparison(record);
    setSelectedJobIds([]);
    setBulkMode(false);
  }

  function deleteComparison(id: string) {
    setComparisons((current) => current.filter((item) => item.id !== id));
    if (activeComparison?.id === id) setActiveComparison(null);
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { data?: PersistedState } & Partial<PersistedState>;
      const saved = parsed.data || parsed;
      if (!Array.isArray(saved.jobs) || !Array.isArray(saved.statuses) || !Array.isArray(saved.comparisons)) {
        throw new Error("invalid backup");
      }
      setJobs(migrateJobs(saved.jobs));
      setStatuses(saved.statuses.length ? saved.statuses : DEFAULT_STATUSES);
      setComparisons(saved.comparisons);
      if (saved.theme === "dark" || saved.theme === "light") setTheme(saved.theme);
      setMcpEnabled(saved.mcpEnabled !== false);
      setCompanyGrouping(saved.companyGrouping === true);
      setCompanyNotes(saved.companyNotes || {});
      setMessage(`已导入 ${saved.jobs.length} 条岗位记录。`);
      setWorkspaceView("jobs");
    } catch {
      setMessage("导入失败，请选择 offerget 导出的 JSON 备份。");
    } finally {
      event.target.value = "";
    }
  }

  function renderCompanyNote(company: string, variant = "") {
    const editing = editingCompanyNote === company;
    const note = companyNotes[company] || "";
    return (
      <div className={`company-note ${variant}`.trim()}>
        <div className="company-note-head">
          <span>投递规则</span>
          <button
            type="button"
            className="company-note-edit"
            aria-label={`${editing ? "保存" : "编辑"} ${company} 的投递规则`}
            title={editing ? "保存投递规则" : "编辑投递规则"}
            onClick={() => {
              setEditingCompanyNote(editing ? null : company);
              if (editing) setMessage("投递规则已保存。");
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m4 20 4.2-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" />
              <path d="m14.8 6.5 3 3" />
            </svg>
          </button>
        </div>
        {editing ? (
          <textarea
            autoFocus
            value={note}
            onChange={(event) => setCompanyNotes((current) => ({ ...current, [company]: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              event.currentTarget.blur();
            }}
            onBlur={() => {
              setEditingCompanyNote(null);
              setMessage("投递规则已保存。");
            }}
            placeholder="记录网申限制、内推规则或注意事项"
          />
        ) : (
          <p className={`company-note-preview ${note ? "" : "empty"}`.trim()}>{note || "暂无投递规则"}</p>
        )}
      </div>
    );
  }

  function renderJobCard(job: Job) {
    return (
      <article className={`job-tile ${selectedJobIds.includes(job.id) ? "selected" : ""}`} key={job.id}>
        <div className="tile-top">
          <span>{libraryValue(job.company)}</span>
          {bulkMode
            ? <label className="select-job"><input aria-label={`选择 ${job.title}`} type="checkbox" checked={selectedJobIds.includes(job.id)} onChange={() => toggleJobSelection(job.id)} /></label>
            : <button aria-label={`编辑 ${job.title}`} onClick={() => editJob(job)}>编辑</button>}
        </div>
        <a href={job.url} target="_blank" rel="noreferrer">
          <h3 className="hover-title" title={libraryValue(job.title)}>{libraryValue(job.title)}</h3>
          {!!job.keywords.length && <div className="keyword-list">{job.keywords.map((word) => <span key={word}>{word}</span>)}</div>}
        </a>
        <div className="tile-location">
          <span>{libraryValue(job.location) && <>⌖ {libraryValue(job.location)}</>}</span>
          <ReactionPicker value={job.reaction} onChange={(reaction) => updateJob(job.id, { reaction })} />
        </div>
        <div className="tile-meta"><span>{libraryValue(job.publishedAt) && <>发布 {libraryValue(job.publishedAt)}</>}</span><span>{libraryValue(job.deadline) && <>截止 {libraryValue(job.deadline)}</>}</span></div>
        <select aria-label={`${job.title}投递进度`} value={job.progress} onChange={(event) => updateJob(job.id, { progress: event.target.value })}>
          {statuses.map((status) => <option key={status}>{status}</option>)}
        </select>
      </article>
    );
  }

  function renderJobRow(job: Job) {
    return (
      <tr key={job.id}>
        {bulkMode && <td className="select-column"><input aria-label={`选择 ${job.title}`} type="checkbox" checked={selectedJobIds.includes(job.id)} onChange={() => toggleJobSelection(job.id)} /></td>}
        <td data-label="公司 / 岗位"><strong>{libraryValue(job.title)}</strong><span>{libraryValue(job.company)}</span><span>{libraryValue(job.location) && <>⌖ {libraryValue(job.location)}</>}</span></td>
        <td data-label="日期"><span>{libraryValue(job.publishedAt) && <>发布 {libraryValue(job.publishedAt)}</>}</span><span>{libraryValue(job.deadline) && <>截止 {libraryValue(job.deadline)}</>}</span></td>
        <td data-label="JD / 任职要求">
          <p className="hover-copy" title={libraryValue(job.jd) || undefined}>{libraryValue(job.jd)}</p>
          <p className="hover-copy" title={libraryValue(job.requirements) || undefined}>{libraryValue(job.requirements)}</p>
        </td>
        <td data-label="分类"><div className="keyword-list">{classify(job).map((category) => <span key={category}>{category}</span>)}</div></td>
        <td data-label="进度"><select value={job.progress} onChange={(event) => updateJob(job.id, { progress: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td>
        <td><button className="row-edit" onClick={() => editJob(job)}>编辑</button><a href={job.url} target="_blank" rel="noreferrer">投递</a></td>
      </tr>
    );
  }

  return (
    <main className={`app-shell theme-${theme}`}>
      <a className="skip-link" href="#job-library">跳到岗位库</a>
      <aside className="side-rail">
        <div className="identity">
          <img className="identity-logo" src="/logo.svg" alt="" width="44" height="43" />
          <div><strong data-copy-id="N01">offerget</strong><small data-copy-id="N02">27 秋招助理</small></div>
        </div>

        <nav aria-label="岗位筛选">
          <p className="rail-label" data-copy-id="N03">投递进度</p>
          {["全部", ...statuses].map((status) => (
            <div className={`status-row ${workspaceView === "jobs" && statusFilter === status ? "active" : ""}`} key={status}>
              <button className="status-filter" onClick={() => { setWorkspaceView("jobs"); setStatusFilter(status); }}>
                <span>{status}</span>
                <b>{status === "全部" ? activeJobs.length : activeJobs.filter((job) => job.progress === status).length}</b>
              </button>
              {status !== "全部" && (
                <button className="status-delete" aria-label={`删除${status}状态`} title={`删除“${status}”`} onClick={(event) => { event.currentTarget.blur(); removeStatus(status); }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></svg>
                </button>
              )}
            </div>
          ))}
          {showStatusForm ? (
            <form className="status-create" onSubmit={addStatus}>
              <input autoFocus value={newStatus} onChange={(event) => setNewStatus(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setShowStatusForm(false); setNewStatus(""); } }} placeholder="输入状态名称，回车保存" aria-label="新状态名称，回车保存" />
              <button type="button" aria-label="取消新建状态" onClick={() => { setShowStatusForm(false); setNewStatus(""); }}>×</button>
            </form>
          ) : (
            <button className="add-rail-item" data-copy-id="N04" onClick={() => setShowStatusForm(true)}>新建状态</button>
          )}
          <p className="rail-label rail-secondary">决策记录</p>
          <button className={workspaceView === "history" ? "active" : ""} onClick={() => setWorkspaceView("history")}><span>对比历史</span><b>{comparisons.length}</b></button>
          <button className={workspaceView === "trash" ? "active" : ""} onClick={() => setWorkspaceView("trash")}><span>回收站</span><b>{trashedJobs.length}</b></button>
        </nav>

        <button
          className={`rail-settings ${workspaceView === "settings" ? "active" : ""}`}
          type="button"
          onClick={() => setWorkspaceView("settings")}
          aria-label="打开设置"
          title="设置"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.07A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.53-1.03H3v-4h.07A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 10 3.04V3h4v.04a1.7 1.7 0 0 0 1.03 1.53 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.93 10H21v4h-.07A1.7 1.7 0 0 0 19.4 15Z" />
          </svg>
          <span>设置</span>
        </button>

        <div className="rail-foot">
          <span className="system-dot" /> <span data-copy-id="S01">本地数据已连接</span>
          <small data-copy-id="S02">记录保存在这台电脑</small>
        </div>
      </aside>

      <section className="workbench">
        {workspaceView === "jobs" && <>
        <header className="topline">
          <div className="topline-tools">
            <button className="theme-toggle" type="button" title={`切换为${theme === "light" ? "深色" : "浅色"}模式`} aria-label={`切换为${theme === "light" ? "深色" : "浅色"}模式`} onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}>
              <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
            </button>
            <button className="theme-toggle mobile-settings" type="button" title="设置" aria-label="打开设置" onClick={() => setWorkspaceView("settings")}>
              <span aria-hidden="true">⚙</span>
            </button>
          </div>
        </header>

        <section className="inbox-panel" aria-labelledby="inbox-title">
          <div className="inbox-copy">
            <h2 id="inbox-title" data-copy-id="T02">岗位链接</h2>
            <p data-copy-id="T03">粘贴岗位链接，可一键识别公司、岗位、<br />发布日期、截止日期、JD 与任职要求。</p>
          </div>
          <form className="url-console" data-copy-id="I02" onSubmit={recognizeLink}>
            <span aria-hidden="true">↳</span>
            <input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://company.com/campus/position/…" />
            <button data-copy-id="B01" disabled={recognizing}>{recognizing ? "识别中…" : "识别岗位"}</button>
          </form>
        </section>

        <section className="metrics-strip preference-overview" aria-label="岗位喜好概览">
          {([
            ["love", "喜欢"],
            ["smile", "能做"],
            ["dislike", "一般"],
            ["neutral", "无感"],
          ] as Array<[JobReaction, string]>).map(([reaction, label]) => (
            <button
              key={reaction}
              className={reactionFilter === reaction ? "active" : ""}
              type="button"
              aria-pressed={reactionFilter === reaction}
              aria-label={`查看${label}的岗位`}
              onClick={() => showReactionJobs(reaction)}
            >
              <strong>{activeJobs.filter((job) => job.reaction === reaction).length}</strong>
              <span className="metric-reaction"><ReactionIcon value={reaction} /></span>
              <span>{label}</span>
            </button>
          ))}
        </section>

        <section className="library" id="job-library">
          <div className="library-heading">
            <div><h2 data-copy-id="T04">岗位库</h2></div>
            <label className="search-field library-search" data-copy-id="I01">
              <span>⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、岗位或 JD" />
            </label>
            <div className="library-tools">
              {bulkMode ? (
                <div className="bulk-actions">
                  <span>已选 {selectedJobIds.length} 项</span>
                  <button disabled={selectedJobIds.length < 2} onClick={createComparison}>对比岗位</button>
                  <button className="danger-button" disabled={!selectedJobIds.length} onClick={() => moveToTrash(selectedJobIds)}>移入回收站</button>
                  <button onClick={() => { setBulkMode(false); setSelectedJobIds([]); }}>退出多选</button>
                </div>
              ) : <button className="batch-button" onClick={() => setBulkMode(true)}>批量管理</button>}
              <button
                className={`grouping-button ${companyGrouping ? "active" : ""}`}
                aria-pressed={companyGrouping}
                onClick={() => {
                  setCompanyGrouping((current) => !current);
                  setExpandedCompany(null);
                }}
              >
                企业分组
              </button>
              <div className="view-tabs" aria-label="切换岗位视图">
                <button data-copy-id="B03" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>列表</button>
                <button data-copy-id="B04" className={mode === "board" ? "active" : ""} onClick={() => setMode("board")}>看板</button>
              </div>
            </div>
          </div>

          <div className="category-row">
            {["全部", ...categories].map((category) => (
              <button key={category} className={categoryFilter === category ? "active" : ""} onClick={() => setCategoryFilter(category)}>{category}</button>
            ))}
          </div>

          {mode === "board" ? (
            companyGrouping && !expandedCompany ? (
              <div className="company-folders">
                {companyGroups.map(([company, companyJobs]) => (
                  <article className="company-folder" key={company}>
                    <button className="folder-open" onClick={() => setExpandedCompany(company)}>
                      <span className="folder-shape" aria-hidden="true" />
                      <span className="folder-copy">
                        <strong>{company}</strong>
                        <small>{companyJobs.length} 个岗位</small>
                      </span>
                      <span className="folder-previews">
                        {companyJobs.slice(0, 3).map((job) => <i key={job.id}>{job.title}</i>)}
                      </span>
                    </button>
                    {renderCompanyNote(company)}
                  </article>
                ))}
              </div>
            ) : (
              <>
                {companyGrouping && expandedCompany && (
                  <div className="company-detail-head">
                    <button className="company-back-button" type="button" aria-label="返回企业分组" title="返回企业分组" onClick={() => setExpandedCompany(null)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M15 5 8 12l7 7" />
                      </svg>
                    </button>
                    <div><strong>{expandedCompany}</strong><span>{companyGroups.find(([company]) => company === expandedCompany)?.[1].length || 0} 个岗位</span></div>
                    {renderCompanyNote(expandedCompany, "compact")}
                  </div>
                )}
                <div className="job-board">
                  {(companyGrouping && expandedCompany
                    ? visibleJobs.filter((job) => (libraryValue(job.company) || "未知企业") === expandedCompany)
                    : visibleJobs).map(renderJobCard)}
                </div>
              </>
            )
          ) : (
            <div className="job-table-wrap">
              <table className="job-table">
                <thead><tr>{bulkMode && <th className="select-column">选择</th>}<th>公司 / 岗位</th><th>日期</th><th>JD / 任职要求</th><th>分类</th><th>进度</th><th /></tr></thead>
                <tbody>
                  {companyGrouping
                    ? companyGroups.map(([company, companyJobs]) => (
                      <Fragment key={company}>
                        <tr className="company-group-row">
                          <td colSpan={bulkMode ? 7 : 6}>
                            <div>
                              <strong>{company}</strong>
                              <span>{companyJobs.length} 个岗位</span>
                              {renderCompanyNote(company, "row-note")}
                            </div>
                          </td>
                        </tr>
                        {companyJobs.map(renderJobRow)}
                      </Fragment>
                    ))
                    : visibleJobs.map(renderJobRow)}
                </tbody>
              </table>
            </div>
          )}
          {!visibleJobs.length && <div className="empty-state"><span>⌁</span><strong>当前筛选下没有岗位</strong><button onClick={() => { setStatusFilter("全部"); setCategoryFilter("全部"); setReactionFilter(null); setQuery(""); }}>清除筛选</button></div>}
        </section>
        </>}
        {workspaceView === "history" && (
          <section className="secondary-view">
            <div className="secondary-head">
              <div><p className="panel-index">COMPARISON ARCHIVE</p><h1>对比历史</h1></div>
              {!!comparisons.length && <button className="danger-button" onClick={() => { setComparisons([]); setActiveComparison(null); }}>删除全部记录</button>}
            </div>
            <p className="secondary-intro">每次岗位对比都会保存当时的岗位快照，后续修改岗位信息不会改变历史结论。</p>
            <div className="history-list">
              {comparisons.map((record) => (
                <article key={record.id}>
                  <div><small>{new Date(record.createdAt).toLocaleString("zh-CN")}</small><h2>{record.jobs.map((job) => job.title).join(" / ")}</h2><p>{record.jobs.map((job) => `${job.company} · ${job.location}`).join("　")}</p></div>
                  <div><button onClick={() => setActiveComparison(record)}>查看对比</button><button className="danger-link" onClick={() => deleteComparison(record.id)}>删除</button></div>
                </article>
              ))}
              {!comparisons.length && <div className="empty-state"><span>⇄</span><strong>还没有岗位对比记录</strong><p>回到岗位库，进入批量管理并选择至少两个岗位。</p><button onClick={() => setWorkspaceView("jobs")}>返回岗位库</button></div>}
            </div>
          </section>
        )}
        {workspaceView === "trash" && (
          <section className="secondary-view">
            <div className="secondary-head"><div><p className="panel-index">RECYCLE BIN</p><h1>回收站</h1></div><button className="danger-button" disabled={!trashedJobs.length} onClick={() => setConfirmClearTrash(true)}>清空记录</button></div>
            <p className="secondary-intro">删除的岗位暂时保存在这里，恢复后会重新回到岗位库。</p>
            <div className="trash-list">
              {trashedJobs.map((job) => (
                <article key={job.id}><div><small>{job.company} · {job.location}</small><h2>{job.title}</h2><p>删除于 {new Date(job.deletedAt!).toLocaleString("zh-CN")}</p></div><button onClick={() => restoreJob(job.id)}>恢复岗位</button></article>
              ))}
              {!trashedJobs.length && <div className="empty-state"><span>⌫</span><strong>回收站是空的</strong><button onClick={() => setWorkspaceView("jobs")}>返回岗位库</button></div>}
            </div>
          </section>
        )}
        {workspaceView === "settings" && (
          <section className="secondary-view settings-view">
            <button className="mobile-settings-back" type="button" onClick={() => setWorkspaceView("jobs")}>返回岗位库</button>
            <div className="secondary-head">
              <div><p className="panel-index">LOCAL INTEGRATIONS</p><h1>设置</h1></div>
            </div>
            <p className="secondary-intro">管理 offerget 与本机工具的连接。所有岗位信息继续保存在这台电脑。</p>

            <section className="settings-group" aria-labelledby="mcp-settings-title">
              <div className="settings-group-head">
                <div className="integration-mark" aria-hidden="true">M</div>
                <div>
                  <h2 id="mcp-settings-title">Codex MCP</h2>
                  <p>连接 Codex 读取岗位库，在 Codex 对话中完成岗位聚类和简历方向分析。</p>
                </div>
                <label className="switch-control">
                  <input
                    type="checkbox"
                    checked={mcpEnabled}
                    onChange={(event) => setMcpEnabled(event.target.checked)}
                    aria-label="启用 Codex MCP"
                  />
                  <span aria-hidden="true" />
                </label>
              </div>

              <div className="integration-status">
                <span className={`connection-dot ${mcpEnabled ? "enabled" : ""}`} />
                <div>
                  <strong>{mcpEnabled ? "MCP 已开启" : "MCP 已关闭"}</strong>
                  <p>{mcpEnabled ? "Codex 启动分析时可以连接；未连接时不会持续占用后台资源。" : "Codex 无法读取岗位库，也无法写入新的分析记录。"}</p>
                </div>
              </div>

              <div className="privacy-note">
                <strong>本地数据权限</strong>
                <p>MCP 只读访问岗位与 JD。分析结果留在 Codex 对话中，offerget 不会接收或保存分析内容。</p>
              </div>
            </section>

            <section className="settings-group data-transfer" aria-labelledby="data-transfer-title">
              <div className="settings-group-head">
                <div className="integration-mark data-mark" aria-hidden="true">↥</div>
                <div>
                  <h2 id="data-transfer-title">数据迁移</h2>
                  <p>导入桌面版或其他 offerget 实例导出的 JSON，岗位、回收站、状态和对比历史会一起恢复。</p>
                </div>
                <label className="import-backup-button">
                  导入备份
                  <input type="file" accept="application/json,.json" onChange={importBackup} />
                </label>
              </div>
              <div className="privacy-note">
                <strong>无损导入</strong>
                <p>导入前不会删除原桌面数据库。网页端只在确认文件有效后更新当前浏览器的数据。</p>
              </div>
            </section>
          </section>
        )}
      </section>

      {failedRecognitionDraft && (
        <div className="review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFailedRecognitionDraft(null); }}>
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="recognition-failed-title" aria-describedby="recognition-failed-description">
            <p className="kicker">RECOGNITION FAILED</p>
            <h2 id="recognition-failed-title">岗位信息识别失败</h2>
            <p id="recognition-failed-description">该页面暂时无法读取，请进入编辑页手动填写岗位信息。</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setFailedRecognitionDraft(null)}>取消</button>
              <button className="confirm-button" type="button" onClick={() => {
                setDraft(failedRecognitionDraft);
                setKeywordInput("");
                setFailedRecognitionDraft(null);
              }}>手动填写</button>
            </div>
          </section>
        </div>
      )}

      {confirmClearTrash && (
        <div className="review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmClearTrash(false); }}>
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-trash-title" aria-describedby="clear-trash-description">
            <p className="kicker">PERMANENT DELETE</p>
            <h2 id="clear-trash-title">确认清空回收站？</h2>
            <p id="clear-trash-description">清空后，回收站内的 {trashedJobs.length} 个岗位将被永久删除，无法恢复。</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setConfirmClearTrash(false)}>取消</button>
              <button className="danger-confirm" type="button" onClick={clearTrash}>确认清空</button>
            </div>
          </section>
        </div>
      )}

      {draft && (
        <div className="review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}>
          <form className="review-sheet" onSubmit={jobs.some((job) => job.id === draft.id) ? saveEditedJob : confirmDraft}>
            <div className="review-head">
              <div><p className="kicker">REVIEW EXTRACTED DATA</p><h2 data-copy-id="T05">核对岗位信息</h2></div>
              <button type="button" aria-label="关闭核对面板" onClick={() => setDraft(null)}>×</button>
            </div>
            <p className="review-note" data-copy-id="T06">识别结果仅作为初稿。确认原文与日期后再写入岗位库。</p>
            <div className="form-pair">
              <label>公司<input className={draft.company && isPresetValue(draft.company) ? "preset-value" : ""} required value={draft.company} onFocus={() => { if (isPresetValue(draft.company)) setDraft({ ...draft, company: "" }); }} onChange={(event) => setDraft({ ...draft, company: event.target.value })} /></label>
              <label>岗位名称<input className={draft.title && isPresetValue(draft.title) ? "preset-value" : ""} required value={draft.title} onFocus={() => { if (isPresetValue(draft.title)) setDraft({ ...draft, title: "" }); }} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <DateField label="发布日期" value={draft.publishedAt} onChange={(value) => setDraft({ ...draft, publishedAt: value })} />
              <DateField label="截止日期" value={draft.deadline} onChange={(value) => setDraft({ ...draft, deadline: value })} />
              <label>工作地<input className={draft.location && isPresetValue(draft.location) ? "preset-value" : ""} value={draft.location} onFocus={() => { if (isPresetValue(draft.location)) setDraft({ ...draft, location: "" }); }} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="填写工作城市" /></label>
              <label>投递进度<select value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            </div>
            <label>岗位 JD<textarea className={draft.jd && isPresetValue(draft.jd) ? "preset-value" : ""} value={draft.jd} onFocus={() => { if (isPresetValue(draft.jd)) setDraft({ ...draft, jd: "" }); }} onChange={(event) => setDraft({ ...draft, jd: event.target.value })} /></label>
            <label>任职要求<textarea className={draft.requirements && isPresetValue(draft.requirements) ? "preset-value" : ""} value={draft.requirements} onFocus={() => { if (isPresetValue(draft.requirements)) setDraft({ ...draft, requirements: "" }); }} onChange={(event) => setDraft({ ...draft, requirements: event.target.value })} /></label>
            <label>投递链接<input type="url" required value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
            <label>关键词<input value={keywordInput} onChange={(event) => updateDraftKeywords(event.target.value)} placeholder="例如：短视频, 直播, C端" /><small className="field-helper">多个关键词请使用逗号分隔，重复关键词会自动合并。</small></label>
            <div className="review-actions">
              {jobs.some((job) => job.id === draft.id && !job.deletedAt) && <button className="delete-job-button" type="button" onClick={() => moveToTrash([draft.id])}>删除岗位</button>}
              <span />
              <button type="button" data-copy-id="B05" onClick={() => setDraft(null)}>取消</button>
              <button className="confirm-button" data-copy-id="B06">确认并保存</button>
            </div>
          </form>
        </div>
      )}
      {activeComparison && (
        <div className="review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveComparison(null); }}>
          <section className="comparison-sheet" role="dialog" aria-modal="true" aria-label="岗位对比结果">
            <div className="review-head">
              <div><p className="kicker">JOB COMPARISON</p><h2>岗位差异对比</h2></div>
              <button aria-label="关闭岗位对比" onClick={() => setActiveComparison(null)}>×</button>
            </div>
            <p className="review-note">对比记录已自动保存到左侧“对比历史”。重点查看工作地、时间窗口、岗位方向与任职要求的差异。</p>
            <div className="comparison-table-wrap">
              <table className="comparison-table">
                <thead><tr><th>对比项</th>{activeComparison.jobs.map((job) => <th key={job.id}>{job.title}<small>{job.company}</small></th>)}</tr></thead>
                <tbody>
                  <tr><th>工作地</th>{activeComparison.jobs.map((job) => <td key={job.id}>{job.location}</td>)}</tr>
                  <tr><th>投递窗口</th>{activeComparison.jobs.map((job) => <td key={job.id}>{job.publishedAt}<br />至 {job.deadline}</td>)}</tr>
                  <tr><th>当前进度</th>{activeComparison.jobs.map((job) => <td key={job.id}>{job.progress}</td>)}</tr>
                  <tr><th>方向标签</th>{activeComparison.jobs.map((job) => <td key={job.id}>{job.categories.join("、")}</td>)}</tr>
                  <tr><th>岗位关键词</th>{activeComparison.jobs.map((job) => <td key={job.id}>{(job.keywords || []).join("、")}</td>)}</tr>
                  <tr><th>岗位 JD</th>{activeComparison.jobs.map((job) => <td key={job.id} className="long-copy">{job.jd}</td>)}</tr>
                  <tr><th>任职要求</th>{activeComparison.jobs.map((job) => <td key={job.id} className="long-copy">{job.requirements}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const unknown = value === "未知";
  return (
    <label>{label}
      <span className={`date-control ${unknown ? "unknown" : ""}`}>
        <input aria-label={`${label}日期`} type="date" value={unknown ? "" : toDateInputValue(value)} onChange={(event) => onChange(event.target.value)} />
        <button type="button" className={unknown ? "active" : ""} aria-pressed={unknown} onClick={() => onChange(unknown ? "" : "未知")}>未知</button>
      </span>
    </label>
  );
}
