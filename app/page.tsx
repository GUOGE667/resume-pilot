"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  Camera,
  ChevronDown,
  FileDown,
  FileText,
  GraduationCap,
  LayoutTemplate,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzeJobRequirements } from "@/lib/job-match";
import { collectPageBreakpoints, planPageSlices } from "@/lib/pdf-pagination";
import { createResumeBackup, DRAFT_FIELDS, MAX_BACKUP_BYTES, MAX_ENTRIES, parseResumeBackup, type DraftTextField, type ResumeDraft } from "@/lib/resume-backup";
import { activeVersion, createVersionStore, createVersionsBackup, deleteInactiveVersion, duplicateActiveVersion, loadVersionStore, MAX_VERSION_BACKUP_BYTES, MAX_VERSIONS, parseVersionsBackup, renameActiveVersion, selectVersion, updateActiveDraft, VERSION_STORAGE_KEY, type ResumeVersionStore } from "@/lib/resume-versions";

type Optimization = {
  headline: string;
  optimizedText: string;
  strengths: string[];
  improvements: string[];
  keywords: string[];
  source: "ai" | "fallback";
};

type CareerFeedback = {
  source: "echohire";
  role: string;
  score: number | null;
  headline: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  actionPlan: string[];
};

const ECHOHIRE_URL = "https://echohire-ai-interview.guolinghao6.chatgpt.site/";
const DRAFT_STORAGE_KEY = "resumepilot-draft";

const initialDraft: ResumeDraft = {
  avatar: "",
  name: "林知远",
  title: "前端开发实习生",
  email: "hello@example.com",
  phone: "138 0000 0000",
  city: "中国 · 深圳",
  summary: "关注用户体验与工程质量的前端开发者，能够独立完成从需求拆解、界面实现到部署上线的完整流程。",
  educations: [{ school: "示例大学", degree: "计算机科学 · 本科", date: "2023 — 2027" }],
  experiences: [{ company: "示例科技有限公司", role: "前端开发实习生", date: "2025.06 — 2025.09", description: "参与核心业务页面开发；与产品和设计协作完成需求交付；优化移动端交互体验。" }],
  projects: [{ name: "EchoHire AI 模拟面试平台", role: "独立开发者", description: "使用 Next.js 和 TypeScript 搭建岗位问答、逐题追问与规则复盘流程，支持访客免登录练习和本地记录。" }],
  skills: "TypeScript, React, Next.js, Tailwind CSS, Git",
  jobDescription: "招聘前端开发实习生，熟悉 React、TypeScript，具备良好的产品意识和团队协作能力。",
};

const sampleFields: Array<{ label: string; matches: (draft: ResumeDraft) => boolean }> = [
  { label: "姓名", matches: (draft) => draft.name === initialDraft.name },
  { label: "邮箱", matches: (draft) => draft.email === initialDraft.email },
  { label: "手机", matches: (draft) => draft.phone === initialDraft.phone },
  { label: "学校", matches: (draft) => draft.educations.some((entry) => entry.school === initialDraft.educations[0].school) },
  { label: "公司", matches: (draft) => draft.experiences.some((entry) => entry.company === initialDraft.experiences[0].company) },
  { label: "实习内容", matches: (draft) => draft.experiences.some((entry) => entry.description === initialDraft.experiences[0].description) },
  { label: "项目描述", matches: (draft) => draft.projects.some((entry) => entry.description === initialDraft.projects[0].description) },
];

const emptyDraft: ResumeDraft = {
  ...Object.fromEntries(DRAFT_FIELDS.map((key) => [key, ""])) as Pick<ResumeDraft, DraftTextField>,
  educations: [{ school: "", degree: "", date: "" }],
  experiences: [{ company: "", role: "", date: "", description: "" }],
  projects: [{ name: "", role: "", description: "" }],
};

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function readStoredWorkspace(): { store: ResumeVersionStore; error: boolean } {
  if (typeof window === "undefined") return { store: createVersionStore(initialDraft), error: false };
  try {
    const { store, recovered } = loadVersionStore(localStorage.getItem(VERSION_STORAGE_KEY), localStorage.getItem(DRAFT_STORAGE_KEY), initialDraft);
    return { store, error: recovered };
  } catch {
    return { store: createVersionStore(initialDraft), error: true };
  }
}

function readCareerFeedback(): { feedback: CareerFeedback | null; notice: string; hasHash: boolean } {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#career-feedback=")) {
    return { feedback: null, notice: "", hasHash: false };
  }
  try {
    const raw: unknown = JSON.parse(decodeURIComponent(window.location.hash.slice("#career-feedback=".length)));
    if (!raw || typeof raw !== "object") throw new Error("invalid feedback");
    const feedback = raw as Record<string, unknown>;
    const isTextArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
    if (feedback.source !== "echohire" || typeof feedback.role !== "string" ||
      typeof feedback.headline !== "string" || typeof feedback.summary !== "string" ||
      !(feedback.score === null || typeof feedback.score === "number" && Number.isFinite(feedback.score)) ||
      !isTextArray(feedback.strengths) || !isTextArray(feedback.improvements) || !isTextArray(feedback.actionPlan)) {
      throw new Error("invalid feedback");
    }
    return { feedback: feedback as CareerFeedback, notice: "EchoHire 面试反馈已导入，可据此修改简历", hasHash: true };
  } catch {
    return { feedback: null, notice: "EchoHire 反馈无法读取，请返回面试报告重新操作", hasHash: true };
  }
}

function persistWorkspace(value: ResumeVersionStore): boolean {
  try {
    localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(value));
    // Keep the current draft readable by an older deployed version of the site.
    try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(activeVersion(value).draft)); } catch { /* Version storage is authoritative. */ }
    return true;
  } catch {
    return false;
  }
}

const splitLines = (value: string) => value.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean);

export default function Home() {
  const [storedWorkspace] = useState(readStoredWorkspace);
  const [incomingFeedback] = useState(readCareerFeedback);
  const loaded = useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot);
  const [versionStore, setVersionStore] = useState(storedWorkspace.store);
  const versionStoreRef = useRef(storedWorkspace.store);
  const [draft, setDraft] = useState(activeVersion(storedWorkspace.store).draft);
  const draftRef = useRef(activeVersion(storedWorkspace.store).draft);
  const [versionName, setVersionName] = useState(activeVersion(storedWorkspace.store).name);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(true);
  const [saveError, setSaveError] = useState(storedWorkspace.error);
  const [backupError, setBackupError] = useState("");
  const [pendingImport, setPendingImport] = useState<({ kind: "draft"; draft: ResumeDraft; exportedAt: string; fileName: string } | { kind: "versions"; store: ResumeVersionStore; exportedAt: string; fileName: string }) | null>(null);
  const [activeTab, setActiveTab] = useState(incomingFeedback.feedback ? "project" : "profile");
  const [template, setTemplate] = useState("modern");
  const [optimizing, setOptimizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [optimization, setOptimization] = useState<Optimization | null>(null);
  const [optimizationTarget, setOptimizationTarget] = useState<{ section: string; index: number; original: string } | null>(null);
  const [selectedExperience, setSelectedExperience] = useState(0);
  const [selectedProject, setSelectedProject] = useState(0);
  const [careerFeedback, setCareerFeedback] = useState<CareerFeedback | null>(incomingFeedback.feedback);
  const [notice, setNotice] = useState(incomingFeedback.notice);

  const applyWorkspace = useCallback((next: ResumeVersionStore, keepUnsaved = false) => {
    const success = persistWorkspace(next);
    if (success || keepUnsaved) {
      versionStoreRef.current = next;
      setVersionStore(next);
      const nextDraft = activeVersion(next).draft;
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setOptimization(null);
      setOptimizationTarget(null);
    }
    setSaved(success);
    setSaveError(!success);
    return success;
  }, []);

  const applyDraft = useCallback((next: ResumeDraft) => applyWorkspace(updateActiveDraft(versionStoreRef.current, next), true), [applyWorkspace]);

  useEffect(() => {
    if (incomingFeedback.feedback && incomingFeedback.hasHash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [incomingFeedback]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "update_resume_profile",
      title: "更新简历资料",
      description: "更新 ResumePilot 当前简历中的姓名、求职方向或个人简介，并同步刷新可见预览。",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" }, title: { type: "string" }, summary: { type: "string" } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        if (!input || typeof input !== "object") throw new TypeError("输入必须是对象。");
        const raw = input as Record<string, unknown>;
        const allowed = ["name", "title", "summary"];
        if (Object.keys(raw).some((key) => !allowed.includes(key))) throw new TypeError("包含不支持的字段。");
        if (allowed.some((key) => raw[key] !== undefined && typeof raw[key] !== "string")) throw new TypeError("所有字段都必须是文本。");
        const values = raw as Partial<Pick<ResumeDraft, "name" | "title" | "summary">>;
        applyDraft({ ...draftRef.current, ...values });
        setActiveTab("profile");
        return { updated: Object.keys(values), section: "profile" };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [applyDraft]);

  const update = (field: DraftTextField, value: string) => {
    applyDraft({ ...draftRef.current, [field]: value });
  };

  const updateEntry = <K extends "educations" | "experiences" | "projects">(kind: K, index: number, field: keyof ResumeDraft[K][number], value: string) => {
    const entries = draftRef.current[kind].map((entry, position) => position === index ? { ...entry, [field]: value } : entry);
    applyDraft({ ...draftRef.current, [kind]: entries });
  };

  const addEntry = (kind: "educations" | "experiences" | "projects") => {
    if (draftRef.current[kind].length >= MAX_ENTRIES) {
      setNotice(`每类最多添加 ${MAX_ENTRIES} 条`);
      return;
    }
    const blank = kind === "educations" ? { school: "", degree: "", date: "" }
      : kind === "experiences" ? { company: "", role: "", date: "", description: "" }
      : { name: "", role: "", description: "" };
    const index = draftRef.current[kind].length;
    applyDraft({ ...draftRef.current, [kind]: [...draftRef.current[kind], blank] });
    if (kind === "experiences") setSelectedExperience(index);
    if (kind === "projects") setSelectedProject(index);
  };

  const removeEntry = (kind: "educations" | "experiences" | "projects", index: number) => {
    applyDraft({ ...draftRef.current, [kind]: draftRef.current[kind].filter((_, position) => position !== index) });
    if (kind === "experiences") setSelectedExperience((current) => Math.max(0, current > index ? current - 1 : Math.min(current, draftRef.current.experiences.length - 1)));
    if (kind === "projects") setSelectedProject((current) => Math.max(0, current > index ? current - 1 : Math.min(current, draftRef.current.projects.length - 1)));
  };

  const copyVersion = () => {
    try {
      const next = duplicateActiveVersion(versionStoreRef.current, crypto.randomUUID());
      if (!applyWorkspace(next)) { setNotice("复制失败：浏览器存储空间不足，请先下载备份"); return; }
      setVersionName(activeVersion(next).name);
      setConfirmDeleteId(null);
      setPendingImport(null);
      setSelectedExperience(0);
      setSelectedProject(0);
      setActiveTab("target");
      setNotice("已复制当前简历。可修改版本名称和目标岗位，不会覆盖原版");
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法复制版本"); }
  };

  const switchVersion = (id: string) => {
    try {
      const next = selectVersion(versionStoreRef.current, id);
      if (!applyWorkspace(next)) { setNotice("切换失败：请检查浏览器存储空间"); return; }
      setVersionName(activeVersion(next).name);
      setConfirmDeleteId(null);
      setPendingImport(null);
      setSelectedExperience(0);
      setSelectedProject(0);
      setNotice(`已切换到“${activeVersion(next).name}”`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法切换版本"); }
  };

  const renameVersion = () => {
    try {
      const next = renameActiveVersion(versionStoreRef.current, versionName);
      if (!applyWorkspace(next)) { setNotice("重命名失败：请检查浏览器存储空间"); return; }
      setVersionName(activeVersion(next).name);
      setNotice("版本名称已保存");
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法重命名版本"); }
  };

  const removeVersion = (id: string) => {
    try {
      const next = deleteInactiveVersion(versionStoreRef.current, id);
      if (!applyWorkspace(next)) { setNotice("删除失败：请检查浏览器存储空间"); return; }
      setConfirmDeleteId(null);
      setNotice("版本已删除");
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法删除版本"); }
  };

  const saveDraft = () => {
    const success = persistWorkspace(versionStoreRef.current);
    setSaved(success);
    setSaveError(!success);
    setNotice(success ? "草稿已保存在当前浏览器" : "保存失败：请检查浏览器存储空间或隐私设置");
    window.setTimeout(() => setNotice(""), 2400);
  };

  const clearExample = () => {
    applyDraft({ ...emptyDraft });
    setSelectedExperience(0);
    setSelectedProject(0);
    setActiveTab("profile");
    setOptimization(null);
    setNotice("示例已清空，请填写自己的真实经历");
  };

  const downloadBackup = () => {
    setBackupError("");
    try {
      const blob = new Blob([createResumeBackup(draftRef.current)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ResumePilot-当前版本-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("当前版本备份已下载，请妥善保管文件");
    } catch {
      setBackupError("备份下载失败，请重试");
    }
  };

  const downloadAllVersions = () => {
    setBackupError("");
    try {
      const blob = new Blob([createVersionsBackup(versionStoreRef.current)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ResumePilot-全部版本-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("全部版本备份已下载，请妥善保管文件");
    } catch {
      setBackupError("备份下载失败，请重试");
    }
  };

  const selectBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBackupError("");
    setPendingImport(null);
    if (file.size > MAX_VERSION_BACKUP_BYTES) {
      setBackupError("备份文件不能超过 40 MB");
      return;
    }
    try {
      const content = await file.text();
      const raw: unknown = JSON.parse(content);
      const format = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).format : null;
      if (format === "resumepilot-versions") {
        const parsed = parseVersionsBackup(content);
        setPendingImport({ kind: "versions", ...parsed, fileName: file.name });
      } else {
        if (file.size > MAX_BACKUP_BYTES) throw new Error("单份简历备份不能超过 12 MB");
        const parsed = parseResumeBackup(content);
        setPendingImport({ kind: "draft", ...parsed, fileName: file.name });
      }
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "无法读取此备份文件");
    }
  };

  const restoreBackup = () => {
    if (!pendingImport) return;
    const success = pendingImport.kind === "versions" ? applyWorkspace(pendingImport.store) : applyDraft(pendingImport.draft);
    if (!success && pendingImport.kind === "versions") {
      setBackupError("全部版本恢复失败：请检查浏览器存储空间，备份文件仍可重试");
      return;
    }
    setVersionName(activeVersion(versionStoreRef.current).name);
    setPendingImport(null);
    setActiveTab("profile");
    setSelectedExperience(0);
    setSelectedProject(0);
    setOptimization(null);
    setNotice(success ? pendingImport.kind === "versions" ? "全部版本已恢复并保存在当前浏览器" : "当前版本已恢复并保存在当前浏览器" : "草稿已载入，但浏览器保存失败；请先保留备份文件");
  };

  const startInterview = () => {
    if (draft.jobDescription.trim().length < 20) {
      setNotice("请先填写至少 20 字的职位 JD");
      return;
    }
    const payload = {
      resume: {
        name: draft.name,
        title: draft.title,
        summary: draft.summary,
        school: draft.educations.map((entry) => entry.school).filter(Boolean).join("；"),
        degree: draft.educations.map((entry) => entry.degree).filter(Boolean).join("；"),
        company: draft.experiences.map((entry) => entry.company).filter(Boolean).join("；"),
        role: draft.experiences.map((entry) => entry.role).filter(Boolean).join("；"),
        experience: draft.experiences.map((entry) => entry.description).filter(Boolean).join("；"),
        project: draft.projects.map((entry) => entry.name).filter(Boolean).join("；"),
        projectRole: draft.projects.map((entry) => entry.role).filter(Boolean).join("；"),
        projectDetail: draft.projects.map((entry) => entry.description).filter(Boolean).join("；"),
        skills: draft.skills,
      },
      jobDescription: draft.jobDescription,
    };
    // EchoHire is a separate site, so this must be a full cross-origin navigation.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${ECHOHIRE_URL}#setup?handoff=${encodeURIComponent(JSON.stringify(payload))}`;
  };

  const currentContent = activeTab === "experience" ? draft.experiences[selectedExperience]?.description ?? ""
    : activeTab === "project" ? draft.projects[selectedProject]?.description ?? ""
    : activeTab === "target" ? draft.jobDescription : draft.summary;

  const optimizeCurrent = async () => {
    const target = { section: activeTab, index: activeTab === "experience" ? selectedExperience : selectedProject, original: currentContent };
    setOptimizing(true);
    setNotice("");
    setOptimization(null);
    setOptimizationTarget(null);
    try {
      const response = await fetch("/api/optimize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: activeTab, content: currentContent, jobDescription: draft.jobDescription, title: draft.title }) });
      const result = await response.json() as Optimization & { error?: string };
      if (!response.ok) throw new Error(result.error || "优化失败，请重试。");
      setOptimization(result);
      setOptimizationTarget(target);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "优化失败，请重试。");
    } finally { setOptimizing(false); }
  };

  const applyOptimization = () => {
    if (!optimization || !optimizationTarget || activeTab === "target" || optimizationTarget.section !== activeTab || optimizationTarget.original !== currentContent ||
      (activeTab === "experience" && (optimizationTarget.index !== selectedExperience || !draft.experiences[selectedExperience])) ||
      (activeTab === "project" && (optimizationTarget.index !== selectedProject || !draft.projects[selectedProject]))) {
      setNotice("当前内容已变化，请重新检查后再应用");
      return;
    }
    if (activeTab === "experience") updateEntry("experiences", optimizationTarget.index, "description", optimization.optimizedText);
    else if (activeTab === "project") updateEntry("projects", optimizationTarget.index, "description", optimization.optimizedText);
    else update("summary", optimization.optimizedText);
    setNotice("优化内容已应用，可继续编辑");
  };

  const exportTextPdf = () => {
    if (!document.querySelector(".resume-paper")) {
      setNotice("没有找到可导出的简历预览");
      return;
    }
    setNotice("请在打印窗口选择“保存为 PDF”；文字版支持复制和搜索");
    window.print();
  };

  const exportImagePdf = async () => {
    const paper = document.querySelector<HTMLElement>(".resume-paper");
    if (!paper) {
      setNotice("没有找到可导出的简历预览");
      return;
    }

    setExporting(true);
    setNotice("");
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(paper, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#fffefa",
        logging: false,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const margin = 8;
      const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
      const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
      const sliceHeight = Math.floor(canvas.width * pageHeight / pageWidth);
      const slices = planPageSlices(canvas.height, sliceHeight, collectPageBreakpoints(paper, canvas.height));

      for (const [pageIndex, slice] of slices.entries()) {
        const currentHeight = slice.end - slice.start;
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = currentHeight;
        const context = pageCanvas.getContext("2d");
        if (!context) throw new Error("无法创建 PDF 画布");
        context.fillStyle = "#fffefa";
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(canvas, 0, slice.start, canvas.width, currentHeight, 0, 0, canvas.width, currentHeight);
        if (pageIndex > 0) pdf.addPage();
        const renderedHeight = currentHeight * pageWidth / canvas.width;
        pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.96), "JPEG", margin, margin, pageWidth, renderedHeight, undefined, "FAST");
      }

      const safeName = (draft.name.trim() || "ResumePilot").replace(/[\\/:*?"<>|]/g, "-");
      pdf.save(`${safeName}-简历.pdf`);
      setNotice(`PDF 已生成（${slices.length} 页）并开始下载`);
    } catch (error) {
      setNotice(error instanceof Error ? `PDF 导出失败：${error.message}` : "PDF 导出失败，请重试");
    } finally {
      setExporting(false);
    }
  };

  const score = useMemo(() => {
    const fields = [draft.name, draft.title, draft.email, draft.phone, draft.city, draft.summary,
      draft.educations.some((entry) => entry.school.trim()) ? "yes" : "",
      draft.educations.some((entry) => entry.degree.trim()) ? "yes" : "",
      draft.projects.some((entry) => entry.name.trim()) ? "yes" : "",
      draft.projects.some((entry) => entry.description.trim()) ? "yes" : "", draft.skills];
    return Math.round(fields.filter((value) => value.trim()).length / fields.length * 100);
  }, [draft]);

  const jobRequirements = useMemo(() => analyzeJobRequirements(draft.jobDescription, [
    { section: "求职方向", excerpt: draft.title },
    { section: "个人简介", excerpt: draft.summary },
    ...draft.educations.map((entry, index) => ({ section: `教育经历 ${index + 1}`, excerpt: `${entry.school} ${entry.degree}` })),
    ...draft.experiences.map((entry, index) => ({ section: `实习经历 ${index + 1}`, excerpt: `${entry.company} ${entry.role} ${entry.description}` })),
    ...draft.projects.map((entry, index) => ({ section: `项目经历 ${index + 1}`, excerpt: `${entry.name} ${entry.role} ${entry.description}` })),
    { section: "专业技能", excerpt: draft.skills },
  ]), [draft]);
  const mentionedCount = jobRequirements.filter((item) => item.evidence).length;
  const remainingSamples = sampleFields.filter(({ matches }) => matches(draft)).map(({ label }) => label);
  const pristineExample = DRAFT_FIELDS.every((field) => draft[field] === initialDraft[field]) &&
    JSON.stringify(draft.educations) === JSON.stringify(initialDraft.educations) &&
    JSON.stringify(draft.experiences) === JSON.stringify(initialDraft.experiences) &&
    JSON.stringify(draft.projects) === JSON.stringify(initialDraft.projects);
  const currentVersion = activeVersion(versionStore);

  if (!loaded) return <main className="draft-loading" role="status">正在读取当前浏览器中的草稿…</main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ResumePilot 首页">
          <span className="brand-mark"><FileText size={19} /></span>
          <span>ResumePilot</span>
        </a>
        <div className="document-status">
          <span className={saveError ? "status-dot error" : saved ? "status-dot saved" : "status-dot"} />
          {saveError ? "本地保存失败" : `${currentVersion.name} · ${pristineExample ? "虚构演示样本" : saved ? "已保存在当前浏览器" : "有未保存的修改"}`}
        </div>
        <div className="top-actions">
          <Button variant="ghost" onClick={saveDraft}><Save />保存</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exporting}>{exporting ? <LoaderCircle className="spin" /> : <FileDown />}{exporting ? "正在生成" : "导出 PDF"}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="pdf-export-menu">
              <DropdownMenuItem onSelect={exportTextPdf}>
                <FileText />
                <span><strong>文字版 PDF · 推荐</strong><small>打印窗口选择“保存为 PDF”，文字可复制和搜索</small></span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportImagePdf()}>
                <FileDown />
                <span><strong>图片版 PDF</strong><small>直接下载，适合保留当前预览外观</small></span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <section className="workspace" id="top">
        <aside className="section-rail">
          <div className="rail-heading">
            <span>简历填写进度</span>
            <strong>{score}%</strong>
          </div>
          <Progress value={score} className="completion-progress" />
          <nav aria-label="简历章节">
            <button className={`rail-item ${activeTab === "profile" ? "active" : ""}`} onClick={() => setActiveTab("profile")}><span><UserRound /></span><div><strong>基本信息</strong><small>姓名与个人简介</small></div><Check /></button>
            <button className={`rail-item ${activeTab === "profile" ? "active" : ""}`} onClick={() => setActiveTab("profile")}><span><GraduationCap /></span><div><strong>教育经历</strong><small>学校与专业</small></div><Check /></button>
            <button className={`rail-item ${activeTab === "experience" ? "active" : ""}`} onClick={() => setActiveTab("experience")}><span><BriefcaseBusiness /></span><div><strong>实习经历</strong><small>职责与成果</small></div><Check /></button>
            <button className={`rail-item ${activeTab === "project" ? "active" : ""}`} onClick={() => setActiveTab("project")}><span><LayoutTemplate /></span><div><strong>项目经历</strong><small>作品与技术亮点</small></div><Check /></button>
            <button className={`rail-item ${activeTab === "target" ? "active" : ""}`} onClick={() => setActiveTab("target")}><span><Target /></span><div><strong>目标岗位</strong><small>匹配 JD 关键词</small></div><ArrowUpRight /></button>
          </nav>
          <a className="career-route-link" href={`${ECHOHIRE_URL}#career`}>查看职业路线 <ArrowUpRight size={16} /></a>
          <div className="privacy-note">
            <strong>本地私有保存</strong>
            <p>修改后自动保存在当前浏览器；清除浏览器数据会丢失草稿。“检查当前内容”使用免费规则，不调用付费模型。</p>
          </div>
        </aside>

        <section className="editor-panel">
          {saveError && <div className="save-error-banner" role="alert">本地版本记录无法读取或保存。若页面已恢复原有草稿，请先下载备份，再点击顶部“保存”重试。</div>}
          {remainingSamples.length > 0 && <div className="sample-banner" role="status">
            <div><strong>{pristineExample ? "这是一份虚构的演示简历" : "简历中仍有示例内容"}</strong><p>请核对并替换：{remainingSamples.join("、")}。导出 PDF 前确认这些内容属于你本人。</p></div>
            {pristineExample && <Button variant="outline" onClick={clearExample}>清空示例，开始填写</Button>}
          </div>}
          <details className="version-panel">
            <summary><span>简历版本</span><strong>{currentVersion.name}</strong><small>{versionStore.versions.length}/{MAX_VERSIONS} 份</small><ChevronDown className="version-chevron" aria-hidden="true" /></summary>
            <div className="version-panel-body">
              <p>按岗位复制和修改简历，各版本单独保存在当前浏览器。切换版本会同步更新预览、岗位对照和导出内容。</p>
              <div className="version-rename">
                <label className="field"><span>当前版本名称</span><input value={versionName} maxLength={40} onChange={(event) => setVersionName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") renameVersion(); }} /></label>
                <Button variant="outline" onClick={renameVersion} disabled={!versionName.trim() || versionName.trim() === currentVersion.name}>保存名称</Button>
              </div>
              <div className="version-list" aria-label="已保存的简历版本">
                {versionStore.versions.map((item) => <div className={`version-item ${item.id === versionStore.activeId ? "active" : ""}`} key={item.id}>
                  <div><strong>{item.name}</strong><small>修改于 {new Date(item.updatedAt).toLocaleString("zh-CN")}</small></div>
                  <div className="version-item-actions">
                    {item.id === versionStore.activeId ? <span className="version-current">当前版本</span> : <>
                      <Button variant="outline" onClick={() => switchVersion(item.id)}>切换</Button>
                      {confirmDeleteId === item.id ? <><Button variant="destructive" onClick={() => removeVersion(item.id)}>确认删除</Button><Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>取消</Button></>
                        : <Button variant="ghost" onClick={() => setConfirmDeleteId(item.id)}>删除</Button>}
                    </>}
                  </div>
                </div>)}
              </div>
              <Button onClick={copyVersion} disabled={versionStore.versions.length >= MAX_VERSIONS}><Plus />复制当前版本</Button>
              <p className="version-limit">最多保存 {MAX_VERSIONS} 份；清理浏览器数据会删除本地版本。请定期下载“全部版本备份”。</p>
            </div>
          </details>
          <details className="backup-panel">
            <summary>草稿备份与恢复</summary>
            <div className="backup-panel-body">
              <p>可下载当前版本或全部版本的 JSON 备份，在其他设备恢复。文件包含简历资料，请妥善保管；导入前会确认覆盖范围。</p>
              <div className="backup-actions">
                <Button variant="outline" onClick={downloadBackup}>下载当前版本</Button>
                <Button variant="outline" onClick={downloadAllVersions}>下载全部版本</Button>
                <Button variant="outline" onClick={() => backupInputRef.current?.click()}>导入备份</Button>
                <input ref={backupInputRef} className="backup-file-input" type="file" accept=".json,application/json" onChange={selectBackup} aria-label="选择 ResumePilot 草稿备份文件" />
              </div>
              {backupError && <p className="backup-error" role="alert">{backupError}</p>}
              {pendingImport && <div className="backup-preview">
                <strong>确认恢复此备份？</strong>
                <p>文件：{pendingImport.fileName} · 备份时间：{new Date(pendingImport.exportedAt).toLocaleString("zh-CN")}</p>
                {pendingImport.kind === "draft" ? <p>单份简历 · 姓名：{pendingImport.draft.name || "未填写"} · 项目：{pendingImport.draft.projects.find((entry) => entry.name.trim())?.name || "未填写"}</p>
                  : <p>全部版本 · 共 {pendingImport.store.versions.length} 份 · 当前版本：{activeVersion(pendingImport.store).name}</p>}
                <p>{pendingImport.kind === "draft" ? "导入后会替换当前版本。" : "导入后会替换当前浏览器的全部版本。"}建议先下载“全部版本”备份。</p>
                <div className="backup-actions"><Button onClick={restoreBackup}>覆盖并恢复</Button><Button variant="ghost" onClick={() => setPendingImport(null)}>取消</Button></div>
              </div>}
            </div>
          </details>
          <div className="editor-heading">
            <div><span className="eyebrow">Resume editor · 01</span><h1>把经历写成证据</h1><p className="editor-deck">清楚、具体、可信。让每一段内容都经得起招聘者追问。</p></div>
            <Button variant="outline" className="ai-button" onClick={optimizeCurrent} disabled={optimizing || (activeTab === "experience" && !draft.experiences.length) || (activeTab === "project" && !draft.projects.length)}>{optimizing ? <LoaderCircle className="spin" /> : <Sparkles />}{optimizing ? "正在检查" : "检查当前内容"}</Button>
          </div>

          <Tabs value={activeTab} onValueChange={(value: string) => { setActiveTab(value); setOptimization(null); }} className="editor-tabs">
            <TabsList variant="line" className="tab-list">
              <TabsTrigger value="profile">个人资料</TabsTrigger>
              <TabsTrigger value="experience">经历</TabsTrigger>
              <TabsTrigger value="project">项目</TabsTrigger>
              <TabsTrigger value="target">岗位匹配</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="form-stack">
              <FormSection id="profile" index="01" title="基本信息" description="保持简洁，让招聘者在十秒内了解你。">
                <AvatarUpload
                  value={draft.avatar}
                  onChange={(value) => update("avatar", value)}
                  onNotice={setNotice}
                />
                <div className="field-grid two">
                  <Field label="姓名" value={draft.name} onChange={(value) => update("name", value)} />
                  <Field label="求职方向" value={draft.title} onChange={(value) => update("title", value)} />
                  <Field label="邮箱" value={draft.email} onChange={(value) => update("email", value)} />
                  <Field label="手机" value={draft.phone} onChange={(value) => update("phone", value)} />
                </div>
                <Field label="所在地" value={draft.city} onChange={(value) => update("city", value)} />
                <Field label="个人简介" value={draft.summary} multiline onChange={(value) => update("summary", value)} />
              </FormSection>
              <FormSection id="education" index="02" title="教育经历" description="填写与你当前求职方向最相关的教育背景。">
                {draft.educations.map((entry, index) => <div className="entry-editor" key={index}>
                  <div className="entry-editor-heading"><strong>教育 {index + 1}</strong><button type="button" onClick={() => removeEntry("educations", index)} aria-label={`删除教育 ${index + 1}`}><Trash2 size={14} /> 删除</button></div>
                  <div className="field-grid two">
                    <Field label="学校" value={entry.school} onChange={(value) => updateEntry("educations", index, "school", value)} />
                    <Field label="专业与学历" value={entry.degree} onChange={(value) => updateEntry("educations", index, "degree", value)} />
                  </div>
                  <Field label="在读时间" value={entry.date} onChange={(value) => updateEntry("educations", index, "date", value)} />
                </div>)}
                <button type="button" className="add-row" onClick={() => addEntry("educations")} disabled={draft.educations.length >= MAX_ENTRIES}><Plus />添加教育经历</button>
              </FormSection>
            </TabsContent>

            <TabsContent value="experience" className="form-stack">
              <FormSection id="experience" index="03" title="实习经历" description="用动作、方法和结果说明你的贡献。">
                {draft.experiences.map((entry, index) => <div className={`entry-editor ${selectedExperience === index ? "selected" : ""}`} key={index}>
                  <div className="entry-editor-heading"><strong>实习 {index + 1}</strong><div><button type="button" className="entry-select" aria-pressed={selectedExperience === index} onClick={() => { setSelectedExperience(index); setOptimization(null); }}>{selectedExperience === index ? "当前检查对象" : "选为检查对象"}</button><button type="button" onClick={() => removeEntry("experiences", index)} aria-label={`删除实习 ${index + 1}`}><Trash2 size={14} /> 删除</button></div></div>
                  <div className="field-grid two">
                    <Field label="公司" value={entry.company} onChange={(value) => updateEntry("experiences", index, "company", value)} />
                    <Field label="职位" value={entry.role} onChange={(value) => updateEntry("experiences", index, "role", value)} />
                  </div>
                  <Field label="时间" value={entry.date} onChange={(value) => updateEntry("experiences", index, "date", value)} />
                  <Field label="工作内容" value={entry.description} multiline onChange={(value) => updateEntry("experiences", index, "description", value)} />
                </div>)}
                <button type="button" className="add-row" onClick={() => addEntry("experiences")} disabled={draft.experiences.length >= MAX_ENTRIES}><Plus />添加实习经历</button>
              </FormSection>
            </TabsContent>

            <TabsContent value="project" className="form-stack">
              <FormSection id="project" index="04" title="项目经历" description="突出问题、技术决策和可验证的结果。">
                {draft.projects.map((entry, index) => <div className={`entry-editor ${selectedProject === index ? "selected" : ""}`} key={index}>
                  <div className="entry-editor-heading"><strong>项目 {index + 1}</strong><div><button type="button" className="entry-select" aria-pressed={selectedProject === index} onClick={() => { setSelectedProject(index); setOptimization(null); }}>{selectedProject === index ? "当前检查对象" : "选为检查对象"}</button><button type="button" onClick={() => removeEntry("projects", index)} aria-label={`删除项目 ${index + 1}`}><Trash2 size={14} /> 删除</button></div></div>
                  <div className="field-grid two">
                    <Field label="项目名称" value={entry.name} onChange={(value) => updateEntry("projects", index, "name", value)} />
                    <Field label="你的角色" value={entry.role} onChange={(value) => updateEntry("projects", index, "role", value)} />
                  </div>
                  <Field label="项目描述" value={entry.description} multiline onChange={(value) => updateEntry("projects", index, "description", value)} />
                </div>)}
                <button type="button" className="add-row" onClick={() => addEntry("projects")} disabled={draft.projects.length >= MAX_ENTRIES}><Plus />添加项目经历</button>
                <Field label="技能" value={draft.skills} onChange={(value) => update("skills", value)} />
              </FormSection>
            </TabsContent>

            <TabsContent value="target" className="form-stack">
              <FormSection id="target" index="05" title="目标岗位" description="粘贴职位描述，检查简历与岗位的匹配情况。">
                <Field label="职位 JD" value={draft.jobDescription} multiline onChange={(value) => update("jobDescription", value)} />
                <div className="match-card">
                  <div className="match-heading"><span>岗位关键词对照</span><strong>{jobRequirements.length ? `${mentionedCount}/${jobRequirements.length} 项有提及` : "等待 JD"}</strong></div>
                  {!draft.jobDescription.trim() ? <p>粘贴职位 JD 后，这里会列出可识别的要求及简历原文。</p>
                    : jobRequirements.length === 0 ? <p>暂未识别出可对照的岗位关键词。请直接阅读 JD，并检查简历是否提供了相应经历。</p>
                    : <ul className="requirement-list">
                        {jobRequirements.map((item) => <li key={item.label} className={item.evidence ? "mentioned" : "unmentioned"}>
                          <div className="requirement-title"><strong>{item.label}</strong><span>{item.evidence ? "简历有提及" : "简历未找到"}</span></div>
                          <p className="requirement-jd">JD：{item.jdExcerpt}</p>
                          <p>{item.evidence ? `${item.evidence.section}：${item.evidence.excerpt}` : "可以补充真实经历或技能；没有相关经历时无需硬写。"}</p>
                        </li>)}
                      </ul>}
                  <p className="match-disclaimer">仅对照文字提及情况，不能验证能力，也不代表录用概率。最多展示 12 项可识别关键词。</p>
                </div>
                <div className="interview-handoff">
                  <div><strong>带着目标岗位开始面试练习</strong><p>将求职方向、职位 JD 和简历正文导入 EchoHire。当前免费题目只根据岗位和 JD 生成，简历正文暂不参与出题。头像和联系方式不会传递。</p></div>
                  <Button onClick={startInterview}>前往 EchoHire 练习<ArrowUpRight /></Button>
                </div>
              </FormSection>
            </TabsContent>
          </Tabs>
          {careerFeedback && <section className="career-feedback-card" aria-live="polite">
            <div className="career-feedback-heading"><div><span className="eyebrow">EchoHire 面试复盘</span><h2>{careerFeedback.headline}</h2><p>{careerFeedback.summary}</p></div><strong>{careerFeedback.score ?? "—"}<small>面试得分</small></strong></div>
            <div className="career-feedback-grid"><div><b>简历中值得保留</b>{careerFeedback.strengths.map((item) => <p key={item}><Check />{item}</p>)}</div><div><b>优先补强</b>{careerFeedback.improvements.map((item) => <p key={item}><Target />{item}</p>)}</div></div>
            <div className="career-action-plan"><b>修改顺序</b>{careerFeedback.actionPlan.map((item, index) => <span key={item}><i>{index + 1}</i>{item}</span>)}</div>
            <div className="career-feedback-actions"><Button onClick={() => { setActiveTab("project"); setNotice("请按面试反馈补充项目证据，再点击“检查当前内容”"); }}>开始修改项目经历</Button><a href={`${ECHOHIRE_URL}#career`}>返回职业路线</a><button type="button" onClick={() => setCareerFeedback(null)}>暂时收起</button></div>
          </section>}
          {optimization && <section className="coach-card" aria-live="polite">
            <div className="coach-heading"><span><Sparkles /></span><div><small>{optimization.source === "ai" ? "编辑建议" : "基础检查"}</small><h2>{optimization.headline}</h2></div></div>
            <div className="coach-columns"><div><strong>做得不错</strong>{optimization.strengths.map((item) => <p key={item}><Check />{item}</p>)}</div><div><strong>建议改进</strong>{optimization.improvements.map((item) => <p key={item}><ArrowUpRight />{item}</p>)}</div></div>
            <div className="keyword-row">{optimization.keywords.map((item) => <span key={item}>{item}</span>)}</div>
            {activeTab !== "target" && <Button onClick={applyOptimization}>应用优化版本</Button>}
          </section>}
          {notice && <output className="notice" aria-live="polite">{notice}</output>}
        </section>

        <aside className="preview-panel">
          <div className="preview-toolbar"><div><span className="eyebrow">实时预览</span><strong>{template === "modern" ? "现代单栏" : "经典商务"}</strong></div><Select value={template} onValueChange={setTemplate}><SelectTrigger aria-label="选择简历模板"><LayoutTemplate /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="modern">现代单栏</SelectItem><SelectItem value="classic">经典商务</SelectItem></SelectContent></Select></div>
          <article className={`resume-paper ${template}`}>
            {remainingSamples.length > 0 && <div className="sample-document-note">演示资料 · 仍有示例内容，请核对后使用</div>}
            <header className="resume-header">
              <div className="resume-identity"><h2>{draft.name || "你的姓名"}</h2><p>{draft.title || "目标职位"}</p><div><span>{draft.email}</span><span>{draft.phone}</span><span>{draft.city}</span></div></div>
              {/* A local data URL must remain available to html2canvas during PDF export. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {draft.avatar && <img className="resume-avatar" src={draft.avatar} alt={`${draft.name || "求职者"}的头像`} />}
            </header>
            <ResumeSection title="个人简介"><p>{draft.summary}</p></ResumeSection>
            {draft.educations.some((entry) => Object.values(entry).some((value) => value.trim())) && <ResumeSection title="教育经历">{draft.educations.filter((entry) => Object.values(entry).some((value) => value.trim())).map((entry, index) => <ResumeEntry key={index} title={entry.school} meta={entry.date} subtitle={entry.degree} />)}</ResumeSection>}
            {draft.experiences.some((entry) => Object.values(entry).some((value) => value.trim())) && <ResumeSection title="实习经历">{draft.experiences.filter((entry) => Object.values(entry).some((value) => value.trim())).map((entry, index) => <ResumeEntry key={index} title={entry.company} meta={entry.date} subtitle={entry.role}>{splitLines(entry.description).map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ResumeEntry>)}</ResumeSection>}
            {draft.projects.some((entry) => Object.values(entry).some((value) => value.trim())) && <ResumeSection title="项目经历">{draft.projects.filter((entry) => Object.values(entry).some((value) => value.trim())).map((entry, index) => <ResumeEntry key={index} title={entry.name} meta={entry.role}>{splitLines(entry.description).map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ResumeEntry>)}</ResumeSection>}
            <ResumeSection title="专业技能"><div className="skill-pills">{draft.skills.split(",").map((skill) => <span key={skill}>{skill.trim()}</span>)}</div></ResumeSection>
          </article>
        </aside>
      </section>
    </main>
  );
}

function FormSection({ id, index, title, description, children }: { id: string; index: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="form-section" id={id}><div className="section-heading"><span>{index}</span><div><h2>{title}</h2><p>{description}</p></div></div><div className="section-fields">{children}</div></section>;
}

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <label className="field"><span>{label}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} /> : <input value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function AvatarUpload({ value, onChange, onNotice }: { value: string; onChange: (value: string) => void; onNotice: (message: string) => void }) {
  const processAvatar = (file: File) => {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      onNotice("请选择 JPG、PNG 或 WebP 图片");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      onNotice("图片请控制在 8MB 以内");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => onNotice("头像读取失败，请换一张图片重试");
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => onNotice("图片格式无法识别，请换一张图片重试");
      image.onload = () => {
        const size = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 640;
        const context = canvas.getContext("2d");
        if (!context) {
          onNotice("头像处理失败，请重试");
          return;
        }
        context.fillStyle = "#f4f1e9";
        context.fillRect(0, 0, 640, 640);
        context.drawImage(
          image,
          (image.naturalWidth - size) / 2,
          (image.naturalHeight - size) / 2,
          size,
          size,
          0,
          0,
          640,
          640,
        );
        onChange(canvas.toDataURL("image/jpeg", 0.88));
        onNotice("头像已自动裁切并加入简历");
        window.setTimeout(() => onNotice(""), 2400);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="avatar-field">
      <div className={`avatar-preview ${value ? "has-image" : ""}`}>
        {/* The cropped avatar is held as a browser-local data URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt="头像预览" /> : <Camera aria-hidden="true" />}
      </div>
      <div className="avatar-copy">
        <strong>个人头像</strong>
        <p>建议使用正面半身照，背景简洁。上传后会自动居中裁切，不会上传到服务器。</p>
        <div className="avatar-actions">
          <label className="avatar-upload-button">
            <Upload aria-hidden="true" />
            {value ? "更换头像" : "上传头像"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) processAvatar(file);
                event.target.value = "";
              }}
            />
          </label>
          {value && <button type="button" className="avatar-remove-button" onClick={() => { onChange(""); onNotice("头像已移除"); }}><Trash2 aria-hidden="true" />移除</button>}
        </div>
      </div>
    </div>
  );
}

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="resume-section"><h3>{title}</h3>{children}</section>;
}

function ResumeEntry({ title, meta, subtitle, children }: { title: string; meta?: string; subtitle?: string; children?: React.ReactNode }) {
  return <div className="resume-entry"><div className="entry-title"><strong>{title}</strong><span>{meta}</span></div>{subtitle && <em>{subtitle}</em>}{children && <ul>{children}</ul>}</div>;
}
