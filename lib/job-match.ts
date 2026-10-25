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
  { label: "Spring Boot", aliases: ["Spring Boot", "SpringBoot"] },
  { label: "PostgreSQL", aliases: ["PostgreSQL", "Postgres"] },
  { label: "MySQL", aliases: ["MySQL"] },
  { label: "Redis", aliases: ["Redis"] },
  { label: "Kubernetes", aliases: ["Kubernetes", "K8s"] },
  { label: "PyTorch", aliases: ["PyTorch"] },
  { label: "LangChain", aliases: ["LangChain"] },
  { label: "MCP", aliases: ["MCP", "Model Context Protocol"] },
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

const NEGATION = "(?:无需|无须|不要求|不需要|非必需|非必须|不必|没有必要|不用|不强制要求|没有硬性要求)";
const PREFIX_NEGATION = new RegExp(`${NEGATION}.{0,36}$`, "u");
const SUFFIX_NEGATION = new RegExp(`^\\s*(?:[（(]\\s*)?(?:经验|技能|背景)?\\s*(?:均|都)?\\s*${NEGATION}`, "u");
const GROUPED_SUFFIX_NEGATION = new RegExp(`^(?:\\s*(?:[、/]|和|与|及|或)\\s*[\\p{L}\\p{N}.+#-]+){1,4}\\s*(?:均|都)?\\s*${NEGATION}`, "u");
const CLAUSE_BREAK = /[。！？!?；;，,\n\r]|(?:但是|但|不过|然而|却|\bbut\b)/giu;

function mentionPattern(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startsLatin = /^[A-Za-z]/.test(alias);
  const endsLatin = /[A-Za-z0-9]$/.test(alias);
  // Short abbreviations such as JS/TS must not match a filename or Next.js.
  const preceding = startsLatin ? alias.length <= 3 ? "(?<![A-Za-z0-9.])" : "(?<![A-Za-z0-9])" : "";
  return new RegExp(`${preceding}${escaped}${endsLatin ? "(?![A-Za-z0-9])" : ""}`, "gi");
}

function allMentions(text: string, aliases: string[]): Array<{ index: number; length: number }> {
  const found: Array<{ index: number; length: number }> = [];
  for (const alias of aliases) {
    for (const match of text.matchAll(mentionPattern(alias))) {
      found.push({ index: match.index, length: match[0].length });
    }
  }
  // Longer aliases win when, for example, both "Vue" and "Vue.js" start at one position.
  return found.sort((a, b) => a.index - b.index || b.length - a.length)
    .filter((item, index, items) => index === 0 || item.index !== items[index - 1].index);
}

function firstMention(text: string, aliases: string[]): { index: number; length: number } | null {
  return allMentions(text, aliases)[0] ?? null;
}

function isNegated(text: string, mention: { index: number; length: number }): boolean {
  let start = 0;
  let end = text.length;
  for (const boundary of text.matchAll(CLAUSE_BREAK)) {
    if (boundary.index + boundary[0].length <= mention.index) start = boundary.index + boundary[0].length;
    else if (boundary.index >= mention.index + mention.length) {
      end = boundary.index;
      break;
    }
  }
  const before = text.slice(start, mention.index);
  const after = text.slice(mention.index + mention.length, end);
  return PREFIX_NEGATION.test(before) || SUFFIX_NEGATION.test(after) || GROUPED_SUFFIX_NEGATION.test(after);
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
    const mention = allMentions(jobDescription, aliases).find((item) => !isNegated(jobDescription, item));
    if (!mention) return [];

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
