"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  FileDown,
  FileText,
  GraduationCap,
  LayoutTemplate,
  LoaderCircle,
  Save,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ResumeDraft = {
  name: string;
  title: string;
  email: string;
  phone: string;
  city: string;
  summary: string;
  school: string;
  degree: string;
  educationDate: string;
  company: string;
  role: string;
  experienceDate: string;
  experience: string;
  project: string;
  projectRole: string;
  projectDetail: string;
  skills: string;
  jobDescription: string;
};

type Optimization = {
  headline: string;
  optimizedText: string;
  strengths: string[];
  improvements: string[];
  keywords: string[];
  source: "ai" | "fallback";
};

const initialDraft: ResumeDraft = {
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
  projectDetail: "使用 Next.js、TypeScript 与 OpenAI API 构建个性化模拟面试流程，完成简历上传、问题生成、回答分析与 Vercel 部署。",
  skills: "TypeScript, React, Next.js, Tailwind CSS, Git, OpenAI API",
  jobDescription: "招聘前端开发实习生，熟悉 React、TypeScript，具备良好的产品意识和团队协作能力。",
};

const splitLines = (value: string) => value.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean);

export default function Home() {
  const [draft, setDraft] = useState(initialDraft);
  const [saved, setSaved] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const [template, setTemplate] = useState("modern");
  const [optimizing, setOptimizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [optimization, setOptimization] = useState<Optimization | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("resumepilot-draft");
    if (!stored) return;
    try { setDraft({ ...initialDraft, ...(JSON.parse(stored) as Partial<ResumeDraft>) }); } catch { localStorage.removeItem("resumepilot-draft"); }
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
        setDraft((current) => ({ ...current, ...values }));
        setSaved(false);
        setActiveTab("profile");
        return { updated: Object.keys(values), section: "profile" };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const update = (field: keyof ResumeDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaved(false);
  };

  const saveDraft = () => {
    localStorage.setItem("resumepilot-draft", JSON.stringify(draft));
    setSaved(true);
    setNotice("草稿已保存在当前浏览器");
    window.setTimeout(() => setNotice(""), 2400);
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
      let offset = 0;
      let pageIndex = 0;

      while (offset < canvas.height) {
        const currentHeight = Math.min(sliceHeight, canvas.height - offset);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = currentHeight;
        const context = pageCanvas.getContext("2d");
        if (!context) throw new Error("无法创建 PDF 画布");
        context.fillStyle = "#fffefa";
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(canvas, 0, offset, canvas.width, currentHeight, 0, 0, canvas.width, currentHeight);
        if (pageIndex > 0) pdf.addPage();
        const renderedHeight = currentHeight * pageWidth / canvas.width;
        pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.96), "JPEG", margin, margin, pageWidth, renderedHeight, undefined, "FAST");
        offset += currentHeight;
        pageIndex += 1;
      }

      const safeName = (draft.name.trim() || "ResumePilot").replace(/[\\/:*?"<>|]/g, "-");
      pdf.save(`${safeName}-简历.pdf`);
      setNotice("PDF 已生成并开始下载");
    } catch (error) {
      setNotice(error instanceof Error ? `PDF 导出失败：${error.message}` : "PDF 导出失败，请重试");
    } finally {
      setExporting(false);
    }
  };

  const score = useMemo(() => {
    const filled = Object.values(draft).filter((value) => value.trim().length > 8).length;
    const hasMetrics = /\d+%|提升|降低|增长|用户/.test(draft.experience + draft.projectDetail);
    return Math.min(94, 58 + filled * 2 + (hasMetrics ? 8 : 0));
  }, [draft]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ResumePilot 首页">
          <span className="brand-mark"><FileText size={19} /></span>
          <span>ResumePilot</span>
        </a>
        <div className="document-status">
          <span className={saved ? "status-dot saved" : "status-dot"} />
          {saved ? "所有修改已保存" : "有未保存的修改"}
        </div>
        <div className="top-actions">
          <Button variant="ghost" onClick={saveDraft}><Save />保存</Button>
          <Button variant="outline" onClick={exportPdf} disabled={exporting}>{exporting ? <LoaderCircle className="spin" /> : <FileDown />}{exporting ? "正在生成" : "导出 PDF"}</Button>
        </div>
      </header>

      <section className="workspace" id="top">
        <aside className="section-rail">
          <div className="rail-heading">
            <span>简历完成度</span>
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
          <div className="privacy-note">
            <strong>本地私有保存</strong>
            <p>简历草稿保存在当前浏览器，不会公开展示。</p>
          </div>
        </aside>

        <section className="editor-panel">
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
                  <div><span>当前匹配度</span><strong>{score}%</strong></div>
                  <Progress value={score} />
                  <p>已识别 React、TypeScript、产品意识和团队协作。建议再补充一条带量化结果的项目成果。</p>
                </div>
              </FormSection>
            </TabsContent>
          </Tabs>
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
            <header><h2>{draft.name || "你的姓名"}</h2><p>{draft.title || "目标职位"}</p><div><span>{draft.email}</span><span>{draft.phone}</span><span>{draft.city}</span></div></header>
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

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="resume-section"><h3>{title}</h3>{children}</section>;
}

function ResumeEntry({ title, meta, subtitle, children }: { title: string; meta?: string; subtitle?: string; children?: React.ReactNode }) {
  return <div className="resume-entry"><div className="entry-title"><strong>{title}</strong><span>{meta}</span></div>{subtitle && <em>{subtitle}</em>}{children && <ul>{children}</ul>}</div>;
}
