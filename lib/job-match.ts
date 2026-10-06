export type ResumeEvidence = {
  section: string;
  excerpt: string;
};

export type JobRequirement = {
  label: string;
  jdExcerpt: string;
  evidence: ResumeEvidence | null;
};

type RequirementDefinition = {
  label: string;
  aliases: string[];
};

const REQUIREMENTS: RequirementDefinition[] = [
  { label: "React", aliases: ["React"] },
  { label: "TypeScript", aliases: ["TypeScript", "TS"] },
  { label: "JavaScript", aliases: ["JavaScript", "JS"] },
  { label: "Next.js", aliases: ["Next.js", "NextJS"] },
  { label: "Vue", aliases: ["Vue.js", "Vue"] },
  { label: "Node.js", aliases: ["Node.js", "NodeJS"] },
  { label: "Python", aliases: ["Python"] },
  { label: "Java", aliases: ["Java"] },
  { label: "SQL", aliases: ["SQL"] },
  { label: "Git", aliases: ["Git"] },
  { label: "Docker", aliases: ["Docker"] },
  { label: "Linux", aliases: ["Linux"] },
  { label: "AWS", aliases: ["AWS"] },
  { label: "FastAPI", aliases: ["FastAPI"] },
  { label: "Kubernetes", aliases: ["Kubernetes", "K8s"] },
  { label: "OpenAI API", aliases: ["OpenAI API"] },
  { label: "RAG", aliases: ["RAG", "检索增强生成"] },
  { label: "Agent", aliases: ["Agent", "智能体"] },
  { label: "机器学习", aliases: ["机器学习"] },
  { label: "数据分析", aliases: ["数据分析"] },
  { label: "产品意识", aliases: ["产品意识"] },
  { label: "团队协作", aliases: ["团队协作", "团队合作", "协作"] },
  { label: "沟通能力", aliases: ["沟通能力", "沟通"] },
  { label: "用户研究", aliases: ["用户研究", "用户调研"] },
  { label: "性能优化", aliases: ["性能优化"] },
  { label: "自动化测试", aliases: ["自动化测试", "单元测试", "端到端测试"] },
  { label: "英语", aliases: ["英语", "English"] },
];

const IGNORED_CONTEXT = /(?:无需|不要求|不需要|非必需|不必|没有必要)\s*$/;

function findMention(text: string, alias: string): number {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startsLatin = /^[A-Za-z]/.test(alias);
  const endsLatin = /[A-Za-z0-9]$/.test(alias);
  const pattern = new RegExp(`${startsLatin ? "(?<![A-Za-z0-9])" : ""}${escaped}${endsLatin ? "(?![A-Za-z0-9])" : ""}`, "i");
  const match = pattern.exec(text);
  return match?.index ?? -1;
}

function firstMention(text: string, aliases: string[]): { index: number; length: number } | null {
  let earliest: { index: number; length: number } | null = null;
  for (const alias of aliases) {
    const index = findMention(text, alias);
    if (index >= 0 && (!earliest || index < earliest.index)) earliest = { index, length: alias.length };
  }
  return earliest;
}

function excerpt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 22);
  const end = Math.min(text.length, index + length + 28);
  return `${start ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

export function analyzeJobRequirements(
  jobDescription: string,
  resumeSections: ResumeEvidence[],
): JobRequirement[] {
  if (!jobDescription.trim()) return [];

  const identified = REQUIREMENTS.flatMap(({ label, aliases }) => {
    const mention = firstMention(jobDescription, aliases);
    if (!mention || IGNORED_CONTEXT.test(jobDescription.slice(Math.max(0, mention.index - 12), mention.index))) return [];

    const source = resumeSections
      .map(({ section, excerpt: content }) => {
        const found = firstMention(content, aliases);
        return found ? { section, excerpt: excerpt(content, found.index, found.length) } : null;
      })
      .find((item) => item !== null) ?? null;

    return [{ index: mention.index, label, jdExcerpt: excerpt(jobDescription, mention.index, mention.length), evidence: source }];
  });

  return identified
    .sort((a, b) => a.index - b.index)
    .slice(0, 12)
    .map(({ label, jdExcerpt, evidence }) => ({ label, jdExcerpt, evidence }));
}
