import { analyzeJobRequirements } from "./job-match.ts";

export type ResumeFeedbackInput = {
  section: "profile" | "experience" | "project" | "target";
  content: string;
  jobDescription?: string;
  title?: string;
};

export type ResumeFeedbackFinding = {
  quote: string;
  issue: string;
  suggestion: string;
};

export type ResumeFeedback = {
  source: "local";
  headline: string;
  strengths: string[];
  findings: ResumeFeedbackFinding[];
  keywords: string[];
};

const ACTION = /开发|实现|设计|搭建|构建|重构|优化|修复|部署|测试|分析|调研|维护|集成|编写|上线|交付|推动|解决|拆解/;
const METHOD = /(?:使用|采用|基于|通过|借助|利用|结合)[^，,。；;\n]{2,40}|\b(?:React|TypeScript|JavaScript|Vue|Next\.js|Node\.js|Python|Java|SQL|Docker|FastAPI|Spring\s*Boot|PostgreSQL)\b/i;
const RESULT = /上线|发布|交付|验收|落地|获得|缩短|减少|降低|提高|提升|节省|完成[^，,。；;\n]{0,14}(?:目标|交付|验收)|\d+(?:\.\d+)?\s*(?:%|倍|毫秒|ms|秒|小时|分钟|天|周|人|用户|条|次|页|份|项)/i;
const VAGUE = /(?:^|[，,])(?:参与|负责|协助)(?:了)?[^，,。；;\n]{0,20}(?:工作|项目|业务|开发|任务|需求|页面|功能)|具备良好|能力较强|效果显著|熟悉相关技术/;

function statements(content: string): string[] {
  return content.split(/[。！？；;\n]+/).map((part) => part.trim()).filter(Boolean);
}

function quote(part: string): string {
  return part.slice(0, 100);
}

/** Deterministic writing hints. Every quoted excerpt is copied from the user's input. */
export function checkResumeContent(input: ResumeFeedbackInput): ResumeFeedback {
  const content = input.content.trim();
  if (content.length < 10) throw new Error("请至少填写 10 个字后再检查。");

  const parts = statements(content);
  const first = parts[0] ?? content;
  const jobDescription = input.section === "target" ? content : input.jobDescription?.trim() ?? "";
  const requirements = analyzeJobRequirements(jobDescription, input.section === "target" ? [] : [{ section: "当前内容", excerpt: content }]);
  const keywords = requirements.filter((item) => input.section === "target" || item.evidence).slice(0, 5).map((item) => item.label);

  if (input.section === "target") {
    const findings: ResumeFeedbackFinding[] = requirements.length ? [] : [{
      quote: quote(first),
      issue: "规则未识别出明确的岗位关键词",
      suggestion: "请人工标出职责、必备条件与加分项；这里只识别部分常见词语，不能判断岗位是否适合你。",
    }];
    return {
      source: "local",
      headline: requirements.length ? `已识别 ${requirements.length} 项可对照要求` : "请人工核对这份 JD",
      strengths: requirements.length ? [`JD 中明确提到了：${keywords.join("、")}。这只表示文字出现，不代表能力要求已满足。`] : [],
      findings,
      keywords,
    };
  }

  const actionPart = parts.find((part) => ACTION.test(part));
  const methodPart = parts.find((part) => METHOD.test(part));
  const resultPart = parts.find((part) => RESULT.test(part));
  const vaguePart = parts.find((part) => VAGUE.test(part) && !ACTION.test(part));
  const strengths: string[] = [];
  const findings: ResumeFeedbackFinding[] = [];

  if (actionPart) strengths.push(`原文写出了行动：“${quote(actionPart)}”。`);
  if (methodPart) strengths.push(`原文提到了方法或技术：“${quote(methodPart)}”。`);
  if (resultPart) strengths.push(`原文有结果线索：“${quote(resultPart)}”；请确认它能被事实支持。`);
  if (keywords.length) strengths.push(`这段文字提到了 JD 中的 ${keywords.join("、")}；这里只核对文字提及。`);

  if (!actionPart) {
    findings.push({
      quote: quote(vaguePart ?? first),
      issue: input.section === "profile" ? "个人简介缺少实际行动" : "没有写清你亲自完成的动作",
      suggestion: "补充你实际做过的一项工作，并说明交付了什么；避免只写“参与”“负责”。",
    });
  } else if (vaguePart) {
    findings.push({
      quote: quote(vaguePart),
      issue: "这句职责描述比较宽泛",
      suggestion: "把这句改成你亲自完成的动作和对应产物，保留已有的具体事实。",
    });
  }

  if (!methodPart) {
    findings.push({
      quote: quote(parts.find((part) => ACTION.test(part)) ?? first),
      issue: "方法或技术选择尚不明确",
      suggestion: "如果确实使用了具体工具、技术或分析方法，写出它如何帮助你完成这项工作。",
    });
  }

  if (!resultPart && input.section !== "profile") {
    findings.push({
      quote: quote(parts.at(-1) ?? first),
      issue: "结果缺少可核验线索",
      suggestion: "补充真实的交付物、上线情况或可验证效果；没有可靠数字时不要编造指标。",
    });
  }

  return {
    source: "local",
    headline: findings.length ? `找到 ${Math.min(findings.length, 3)} 处可补充的证据` : "这段描述已有较具体的证据线索",
    strengths: strengths.slice(0, 3),
    findings: findings.slice(0, 3),
    keywords,
  };
}
