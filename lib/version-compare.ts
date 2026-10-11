import { analyzeJobRequirements, type JobRequirement } from "./job-match.ts";
import type { ResumeDraft } from "./resume-backup.ts";

export type ComparisonRow = {
  key: string;
  label: string;
  before: string;
  after: string;
  status: "same" | "changed" | "added" | "removed";
};

export type ComparisonSection = { title: string; rows: ComparisonRow[] };

function row(key: string, label: string, before: string, after: string): ComparisonRow {
  const status = before === after ? "same" : !before.trim() ? "added" : !after.trim() ? "removed" : "changed";
  return { key, label, before, after, status };
}

function entryRows<T extends object>(
  kind: string,
  before: T[],
  after: T[],
  identity: keyof T,
  fields: Array<{ key: keyof T; label: string }>,
): ComparisonRow[] {
  const meaningful = (entry: T) => Object.values(entry).some((value) => typeof value === "string" && value.trim());
  const left = before.filter(meaningful);
  const right = after.filter(meaningful);
  const matched = new Set<number>();
  const pairs: Array<{ left?: T; right?: T; leftIndex?: number; rightIndex?: number }> = [];

  // Exact matches first keep repeated company/school names aligned when one entry changes.
  for (const [index, entry] of left.entries()) {
    const match = right.findIndex((candidate, position) => !matched.has(position) && JSON.stringify(candidate) === JSON.stringify(entry));
    if (match >= 0) {
      matched.add(match);
      pairs.push({ left: entry, right: right[match], leftIndex: index, rightIndex: match });
    } else pairs.push({ left: entry, leftIndex: index });
  }

  for (const pair of pairs) {
    if (pair.right) continue;
    const name = String(pair.left?.[identity] ?? "").trim().toLocaleLowerCase();
    const match = right.findIndex((candidate, position) => !matched.has(position) &&
      (name ? String(candidate[identity]).trim().toLocaleLowerCase() === name : position === pair.leftIndex));
    if (match >= 0) {
      matched.add(match);
      pair.right = right[match];
      pair.rightIndex = match;
    }
  }
  for (const [index, entry] of right.entries()) {
    if (!matched.has(index)) pairs.push({ right: entry, rightIndex: index });
  }

  return pairs.flatMap((pair, pairIndex) => {
    const identifier = String(pair.left?.[identity] ?? "").trim() || String(pair.right?.[identity] ?? "").trim() || "未命名条目";
    return fields.map(({ key, label }) => row(
      `${kind}-${pairIndex}-${String(key)}`,
      `${identifier} · ${label}`,
      String(pair.left?.[key] ?? ""),
      String(pair.right?.[key] ?? ""),
    )).filter((item) => item.status !== "same" || Boolean(pair.left && pair.right));
  });
}

/** Read-only field comparison. Array entries are aligned by exact content, then by their identifying name. */
export function compareResumeDrafts(before: ResumeDraft, after: ResumeDraft): ComparisonSection[] {
  return [
    { title: "基本信息", rows: [
      row("name", "姓名", before.name, after.name),
      row("title", "求职方向", before.title, after.title),
      row("email", "邮箱", before.email, after.email),
      row("phone", "手机", before.phone, after.phone),
      row("city", "所在地", before.city, after.city),
      row("summary", "个人简介", before.summary, after.summary),
    ] },
    { title: "教育经历", rows: entryRows("education", before.educations, after.educations, "school", [
      { key: "school", label: "学校" }, { key: "degree", label: "专业与学历" }, { key: "date", label: "在读时间" },
    ]) },
    { title: "实习经历", rows: entryRows("experience", before.experiences, after.experiences, "company", [
      { key: "company", label: "公司" }, { key: "role", label: "职位" }, { key: "date", label: "时间" }, { key: "description", label: "工作内容" },
    ]) },
    { title: "项目经历", rows: entryRows("project", before.projects, after.projects, "name", [
      { key: "name", label: "项目名称" }, { key: "role", label: "你的角色" }, { key: "description", label: "项目描述" },
    ]) },
    { title: "专业技能", rows: [row("skills", "技能", before.skills, after.skills)] },
    { title: "目标岗位", rows: [row("jobDescription", "职位 JD", before.jobDescription, after.jobDescription)] },
  ];
}

export function analyzeDraftJobRequirements(draft: ResumeDraft): JobRequirement[] {
  return analyzeJobRequirements(draft.jobDescription, [
    { section: "求职方向", excerpt: draft.title },
    { section: "个人简介", excerpt: draft.summary },
    ...draft.educations.map((entry, index) => ({ section: `教育经历 ${index + 1}`, excerpt: `${entry.school} ${entry.degree}` })),
    ...draft.experiences.map((entry, index) => ({ section: `实习经历 ${index + 1}`, excerpt: `${entry.company} ${entry.role} ${entry.description}` })),
    ...draft.projects.map((entry, index) => ({ section: `项目经历 ${index + 1}`, excerpt: `${entry.name} ${entry.role} ${entry.description}` })),
    { section: "专业技能", excerpt: draft.skills },
  ]);
}
