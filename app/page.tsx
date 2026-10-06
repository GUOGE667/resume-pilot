"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  Camera,
  FileDown,
  FileText,
  GraduationCap,
  LayoutTemplate,
  LoaderCircle,
  Save,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzeJobRequirements } from "@/lib/job-match";
import { collectPageBreakpoints, planPageSlices } from "@/lib/pdf-pagination";
import { createResumeBackup, DRAFT_FIELDS, MAX_BACKUP_BYTES, parseResumeBackup, type ResumeDraft } from "@/lib/resume-backup";

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
  school: "示例大学",
  degree: "计算机科学 · 本科",
  educationDate: "2023 — 2027",
  company: "示例科技有限公司",
  role: "前端开发实习生",
  experienceDate: "2025.06 — 2025.09",
  experience: "参与核心业务页面开发；与产品和设计协作完成需求交付；优化移动端交互体验。",
  project: "EchoHire AI 模拟面试平台",
  projectRole: "独立开发者",
  projectDetail: "使用 Next.js 和 TypeScript 搭建岗位问答、逐题追问与规则复盘流程，支持访客免登录练习和本地记录。",
  skills: "TypeScript, React, Next.js, Tailwind CSS, Git",
  jobDescription: "招聘前端开发实习生，熟悉 React、TypeScript，具备良好的产品意识和团队协作能力。",
};

const sampleFields: Array<{ key: keyof ResumeDraft; label: string }> = [
  { key: "name", label: "姓名" },
  { key: "email", label: "邮箱" },
  { key: "phone", label: "手机" },
  { key: "school", label: "学校" },
  { key: "company", label: "公司" },
  { key: "experience", label: "实习内容" },
  { key: "projectDetail", label: "项目描述" },
];

const emptyDraft = Object.fromEntries(DRAFT_FIELDS.map((key) => [key, ""])) as ResumeDraft;

function persistDraft(value: ResumeDraft): boolean {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const splitLines = (value: string) => value.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean);

export default function Home() {
  const [draft, setDraft] = useState(initialDraft);
  const draftRef = useRef(initialDraft);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [pendingImport, setPendingImport] = useState<{ draft: ResumeDraft; exportedAt: string; fileName: string } | null>(null);
  const [activeTab, setActiveTab] = useState("profile");
  const [template, setTemplate] = useState("modern");
  const [optimizing, setOptimizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [optimization, setOptimization] = useState<Optimization | null>(null);
  const [careerFeedback, setCareerFeedback] = useState<CareerFeedback | null>(null);
  const [notice, setNotice] = useState("");

  const applyDraft = (next: ResumeDraft) => {
    draftRef.current = next;
    setDraft(next);
    const success = persistDraft(next);
    setSaved(success);
    setSaveError(!success);
    return success;
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (stored) {
        const restored = { ...initialDraft, ...(JSON.parse(stored) as Partial<ResumeDraft>) };
        draftRef.current = restored;
        setDraft(restored);
      }
    } catch {
      setSaveError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const prefix = "#career-feedback=";
    if (!window.location.hash.startsWith(prefix)) return;
    try {
      const feedback = JSON.parse(decodeURIComponent(window.location.hash.slice(prefix.length))) as CareerFeedback;
      if (feedback.source !== "echohire" || !Array.isArray(feedback.improvements)) throw new Error("invalid feedback");
      setCareerFeedback(feedback);
      setActiveTab("project");
      setNotice("EchoHire 面试反馈已导入，可据此修改简历");
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      setNotice("EchoHire 反馈无法读取，请返回面试报告重新操作");
    }
  }, []);

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
  }, []);

  const update = (field: keyof ResumeDraft, value: string) => {
    applyDraft({ ...draftRef.current, [field]: value });
  };

  const saveDraft = () => {
    const success = persistDraft(draftRef.current);
    setSaved(success);
    setSaveError(!success);
    setNotice(success ? "草稿已保存在当前浏览器" : "保存失败：请检查浏览器存储空间或隐私设置");
    window.setTimeout(() => setNotice(""), 2400);
  };

  const clearExample = () => {
    applyDraft({ ...emptyDraft });
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
      link.download = `ResumePilot-草稿-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("草稿备份已下载，请妥善保管文件");
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
    if (file.size > MAX_BACKUP_BYTES) {
      setBackupError("备份文件不能超过 12 MB");
      return;
    }
    try {
      const parsed = parseResumeBackup(await file.text());
      setPendingImport({ ...parsed, fileName: file.name });
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "无法读取此备份文件");
    }
  };

  const restoreBackup = () => {
    if (!pendingImport) return;
    const success = applyDraft(pendingImport.draft);
    setPendingImport(null);
    setActiveTab("profile");
    setOptimization(null);
    setNotice(success ? "草稿已恢复并保存在当前浏览器" : "草稿已载入，但浏览器保存失败；请先保留备份文件");
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
        school: draft.school,
        degree: draft.degree,
        company: draft.company,
        role: draft.role,
        experience: draft.experience,
        project: draft.project,
        projectRole: draft.projectRole,
        projectDetail: draft.projectDetail,
        skills: draft.skills,
      },
      jobDescription: draft.jobDescription,
    };
    window.location.href = `${ECHOHIRE_URL}#setup?handoff=${encodeURIComponent(JSON.stringify(payload))}`;
  };

  const currentContent = activeTab === "experience" ? draft.experience : activeTab === "project" ? draft.projectDetail : activeTab === "target" ? draft.jobDescription : draft.summary;

  const optimizeCurrent = async () => {
    setOptimizing(true);
    setNotice("");
    try {
      const response = await fetch("/api/optimize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: activeTab, content: currentContent, jobDescription: draft.jobDescription, title: draft.title }) });
      const result = await response.json() as Optimization & { error?: string };
      if (!response.ok) throw new Error(result.error || "优化失败，请重试。");
      setOptimization(result);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "优化失败，请重试。");
    } finally { setOptimizing(false); }
  };

  const applyOptimization = () => {
    if (!optimization || activeTab === "target") return;
    const field = activeTab === "experience" ? "experience" : activeTab === "project" ? "projectDetail" : "summary";
    update(field, optimization.optimizedText);
    setOptimization(null);
    setNotice("优化内容已应用，可继续编辑");
  };

  const exportPdf = async () => {
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
    const fields: Array<keyof ResumeDraft> = ["name", "title", "email", "phone", "city", "summary", "school", "degree", "project", "projectDetail", "skills"];
    return Math.round(fields.filter((field) => draft[field].trim()).length / fields.length * 100);
  }, [draft]);

  const jobRequirements = useMemo(() => analyzeJobRequirements(draft.jobDescription, [
    { section: "求职方向", excerpt: draft.title },
    { section: "个人简介", excerpt: draft.summary },
    { section: "教育经历", excerpt: `${draft.school} ${draft.degree}` },
    { section: "实习经历", excerpt: `${draft.company} ${draft.role} ${draft.experience}` },
    { section: "项目经历", excerpt: `${draft.project} ${draft.projectRole} ${draft.projectDetail}` },
    { section: "专业技能", excerpt: draft.skills },
  ]), [draft]);
  const mentionedCount = jobRequirements.filter((item) => item.evidence).length;
  const remainingSamples = sampleFields.filter(({ key }) => draft[key] === initialDraft[key]).map(({ label }) => label);
  const pristineExample = (Object.keys(initialDraft) as Array<keyof ResumeDraft>).every((key) => draft[key] === initialDraft[key]);

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
          {saveError ? "本地保存失败" : pristineExample ? "虚构演示样本" : saved ? "已保存在当前浏览器" : "有未保存的修改"}
        </div>
        <div className="top-actions">
          <Button variant="ghost" onClick={saveDraft}><Save />保存</Button>
          <Button variant="outline" onClick={exportPdf} disabled={exporting}>{exporting ? <LoaderCircle className="spin" /> : <FileDown />}{exporting ? "正在生成" : "导出 PDF"}</Button>
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
          {saveError && <div className="save-error-banner" role="alert">草稿未能保存到当前浏览器。请检查存储权限或空间，再点击顶部“保存”重试。</div>}
          {remainingSamples.length > 0 && <div className="sample-banner" role="status">
            <div><strong>{pristineExample ? "这是一份虚构的演示简历" : "简历中仍有示例内容"}</strong><p>请核对并替换：{remainingSamples.join("、")}。导出 PDF 前确认这些内容属于你本人。</p></div>
            {pristineExample && <Button variant="outline" onClick={clearExample}>清空示例，开始填写</Button>}
          </div>}
          <details className="backup-panel">
            <summary>草稿备份与恢复</summary>
            <div className="backup-panel-body">
              <p>下载 JSON 备份可在其他设备恢复。文件包含你填写的简历资料，请自行妥善保管；导入会覆盖当前浏览器中的草稿。</p>
              <div className="backup-actions">
                <Button variant="outline" onClick={downloadBackup}>下载备份</Button>
                <Button variant="outline" onClick={() => backupInputRef.current?.click()}>导入备份</Button>
                <input ref={backupInputRef} className="backup-file-input" type="file" accept=".json,application/json" onChange={selectBackup} aria-label="选择 ResumePilot 草稿备份文件" />
              </div>
              {backupError && <p className="backup-error" role="alert">{backupError}</p>}
              {pendingImport && <div className="backup-preview">
                <strong>确认恢复此备份？</strong>
                <p>文件：{pendingImport.fileName} · 备份时间：{new Date(pendingImport.exportedAt).toLocaleString("zh-CN")}</p>
                <p>姓名：{pendingImport.draft.name || "未填写"} · 项目：{pendingImport.draft.project || "未填写"}</p>
                <p>导入后会替换当前草稿。建议先下载当前草稿的备份。</p>
                <div className="backup-actions"><Button onClick={restoreBackup}>覆盖并恢复</Button><Button variant="ghost" onClick={() => setPendingImport(null)}>取消</Button></div>
              </div>}
            </div>
          </details>
          <div className="editor-heading">
            <div><span className="eyebrow">Resume editor · 01</span><h1>把经历写成证据</h1><p className="editor-deck">清楚、具体、可信。让每一段内容都经得起招聘者追问。</p></div>
            <Button variant="outline" className="ai-button" onClick={optimizeCurrent} disabled={optimizing}>{optimizing ? <LoaderCircle className="spin" /> : <Sparkles />}{optimizing ? "正在检查" : "检查当前内容"}</Button>
          </div>

          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setOptimization(null); }} className="editor-tabs">
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
                <div className="field-grid two">
                  <Field label="学校" value={draft.school} onChange={(value) => update("school", value)} />
                  <Field label="专业与学历" value={draft.degree} onChange={(value) => update("degree", value)} />
                </div>
                <Field label="在读时间" value={draft.educationDate} onChange={(value) => update("educationDate", value)} />
              </FormSection>
            </TabsContent>

            <TabsContent value="experience" className="form-stack">
              <FormSection id="experience" index="03" title="实习经历" description="用动作、方法和结果说明你的贡献。">
                <div className="field-grid two">
                  <Field label="公司" value={draft.company} onChange={(value) => update("company", value)} />
                  <Field label="职位" value={draft.role} onChange={(value) => update("role", value)} />
                </div>
                <Field label="时间" value={draft.experienceDate} onChange={(value) => update("experienceDate", value)} />
                <Field label="工作内容" value={draft.experience} multiline onChange={(value) => update("experience", value)} />
              </FormSection>
            </TabsContent>

            <TabsContent value="project" className="form-stack">
              <FormSection id="project" index="04" title="项目经历" description="突出问题、技术决策和可验证的结果。">
                <div className="field-grid two">
                  <Field label="项目名称" value={draft.project} onChange={(value) => update("project", value)} />
                  <Field label="你的角色" value={draft.projectRole} onChange={(value) => update("projectRole", value)} />
                </div>
                <Field label="项目描述" value={draft.projectDetail} multiline onChange={(value) => update("projectDetail", value)} />
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
              {draft.avatar && <img className="resume-avatar" src={draft.avatar} alt={`${draft.name || "求职者"}的头像`} />}
            </header>
            <ResumeSection title="个人简介"><p>{draft.summary}</p></ResumeSection>
            <ResumeSection title="教育经历"><ResumeEntry title={draft.school} meta={draft.educationDate} subtitle={draft.degree} /></ResumeSection>
            <ResumeSection title="实习经历"><ResumeEntry title={draft.company} meta={draft.experienceDate} subtitle={draft.role}>{splitLines(draft.experience).map((item) => <li key={item}>{item}</li>)}</ResumeEntry></ResumeSection>
            <ResumeSection title="项目经历"><ResumeEntry title={draft.project} meta={draft.projectRole}>{splitLines(draft.projectDetail).map((item) => <li key={item}>{item}</li>)}</ResumeEntry></ResumeSection>
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
