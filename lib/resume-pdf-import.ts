import type { ResumeDraft } from "./resume-backup";

export type PdfResumeImportPreview = {
  draft: ResumeDraft;
  extractedText: string;
  detectedFields: string[];
  warnings: string[];
};

type Section = "header" | "summary" | "education" | "experience" | "project" | "skills" | "other";

const headings: Array<{ section: Section; pattern: RegExp }> = [
  { section: "summary", pattern: /^(?:个人简介|个人总结|自我评价|求职概况|summary|profile|objective)$/i },
  { section: "education", pattern: /^(?:教育经历|教育背景|学历背景|education)$/i },
  { section: "experience", pattern: /^(?:实习经历|工作经历|工作经验|实习与工作经历|experience|work experience|professional experience)$/i },
  { section: "project", pattern: /^(?:项目经历|项目经验|个人项目|projects?|project experience)$/i },
  { section: "skills", pattern: /^(?:专业技能|技能清单|技术栈|技能|skills?|technical skills)$/i },
  { section: "other", pattern: /^(?:荣誉奖项|获奖经历|证书|资格证书|语言能力|兴趣爱好|联系方式|honors?|awards?|certifications?|languages?|interests?)$/i },
];

const emptyDraft = (): ResumeDraft => ({
  avatar: "", name: "", title: "", email: "", phone: "", city: "", summary: "", skills: "", jobDescription: "",
  educations: [], experiences: [], projects: [],
});

function cleanLine(line: string): string {
  return line.normalize("NFKC").replace(/[\u200b-\u200d\uFEFF]/g, "").replace(/[\t ]+/g, " ").trim();
}

function heading(line: string): { section: Section; rest: string } | null {
  // Some PDF generators insert spaces between every Chinese glyph in headings.
  const withoutNumber = line.replace(/^(?:0?[1-9]|10)[.、\s-]+/, "")
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/gu, "$1");
  for (const entry of headings) {
    if (entry.pattern.test(withoutNumber)) return { section: entry.section, rest: "" };
    const match = /^([^:：|｜]{2,32})[:：|｜]\s*(.+)$/.exec(withoutNumber);
    if (match && entry.pattern.test(match[1].trim())) return { section: entry.section, rest: match[2].trim() };
  }
  return null;
}

function labelledValue(lines: string[], labels: string): string {
  const pattern = new RegExp(`(?:^|[|｜;；\\s])\\s*(?:${labels})\\s*[:：]\\s*([^|｜;；]+)`, "i");
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match) return match[1].split(/\s+(?=(?:姓名|求职方向|目标岗位|应聘岗位|所在地|邮箱|电子邮箱|手机|电话|公司|单位|岗位|职位|角色|项目名称|Name|Email|Phone|Mobile|Location|Company|Role)\s*[:：])/i)[0].trim().slice(0, 160);
  }
  return "";
}

function findName(lines: string[]): string {
  const labelled = labelledValue(lines.slice(0, 12), "姓名|Name");
  if (labelled) return labelled.split(/\s{2,}/)[0].slice(0, 50);
  const deny = /^(?:个人简历|求职简历|教育经历|教育背景|工作经历|实习经历|项目经历|专业技能|简历|resume|curriculum vitae)$/i;
  for (const line of lines.slice(0, 8)) {
    const part = line.split(/[|｜]/)[0].trim().replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/gu, "$1");
    if (deny.test(part)) continue;
    if (/^[\u3400-\u9fff·]{2,6}$/u.test(part) || /^[A-Z]{2,}(?: [A-Z]{2,}){1,3}$/.test(part)) return part;
  }
  return "";
}

function findPhone(lines: string[], text: string): string {
  const labelled = labelledValue(lines, "手机(?:号码)?|电话|联系电话|Mobile|Phone");
  if (labelled) {
    const candidate = /\+?\d[\d\s()\-]{6,22}\d/.exec(labelled);
    if (candidate) return candidate[0].trim();
  }
  const mainland = /(?<!\d)(?:\+?86[\s-]?)?1[3-9]\d(?:[\s-]?\d){8}(?!\d)/.exec(text);
  return mainland?.[0].trim() ?? "";
}

function looksLikeRole(line: string): boolean {
  return line.length <= 50 && !/[\d@，。；;:：]/.test(line) &&
    /(?:实习生|工程师|开发者|设计师|分析师|研究员|经理|负责人|顾问|intern|engineer|developer|designer|analyst|manager|lead)$/i.test(line);
}

function inferTitle(lines: string[], name: string): string {
  if (!name) return "";
  const index = lines.findIndex((line) => line.replace(/\s/g, "") === name.replace(/\s/g, ""));
  const candidate = lines[index + 1] ?? "";
  return index >= 0 && looksLikeRole(candidate) ? candidate : "";
}

function findDate(text: string): string {
  const match = /(?:19|20)\d{2}(?:[./-]\d{1,2})?\s*(?:[-—–~至到]|\s+to\s+)\s*(?:(?:19|20)\d{2}(?:[./-]\d{1,2})?|至今|现在|present|current)/i.exec(text);
  return match?.[0].trim() ?? "";
}

function findSchool(line: string): string {
  const segments = line.split(/[|｜,，;；]/).map((item) => item.trim()).filter(Boolean);
  const segment = segments.find((item) => /大学|学院|university|college|institute/i.test(item));
  if (!segment) return "";
  const withoutLabel = segment.replace(/^(?:毕业于|就读于|学校[:：]|School[:：])\s*/i, "");
  const chineseSchool = /[\u3400-\u9fff]{2,30}(?:大学|学院)/u.exec(withoutLabel);
  if (chineseSchool) return chineseSchool[0];
  return withoutLabel.replace(/(?:19|20)\d{2}.*$/, "").trim().slice(0, 120);
}

function findDegree(line: string): string {
  const segments = line.split(/[|｜,，;；]/).map((item) => item.trim()).filter(Boolean);
  const segment = segments.find((item) => /本科|硕士|博士|学士|大专|研究生|bachelor|master|ph\.?d/i.test(item));
  return segment?.replace(/[\u3400-\u9fff]{2,30}(?:大学|学院)\s*/u, "")
    .replace(/(?:19|20)\d{2}.*$/, "").trim().slice(0, 120) ?? "";
}

function splitLabeledEntries(lines: string[], label: RegExp): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (label.test(line) && current.some((item) => label.test(item))) {
      groups.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) groups.push(current);
  return groups;
}

/** A conservative parser for selectable PDF text. Every proposed value must occur in the extracted text. */
export function parseResumePdfText(pages: string[]): PdfResumeImportPreview {
  const raw = pages.join("\n\n");
  if (raw.replace(/\s/g, "").length < 20) {
    throw new Error("这份 PDF 几乎没有可读取文字。请使用文字版 PDF；扫描件暂不支持导入。");
  }

  const warnings: string[] = [];
  const extractedText = raw.slice(0, 100_000).trim();
  if (raw.length > extractedText.length) warnings.push("PDF 文字过长，预览仅保留前 10 万字；请核对是否有内容遗漏。");
  const lines = extractedText.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const sections: Record<Section, string[]> = {
    header: [], summary: [], education: [], experience: [], project: [], skills: [], other: [],
  };
  let current: Section = "header";
  for (const line of lines) {
    const marker = heading(line);
    if (marker) {
      current = marker.section;
      if (marker.rest) sections[current].push(marker.rest);
    } else sections[current].push(line);
  }

  const draft = emptyDraft();
  const detectedFields: string[] = [];
  const addField = (label: string, value: string) => { if (value) detectedFields.push(label); };
  draft.name = findName(sections.header);
  draft.title = labelledValue(lines.slice(0, 16), "求职方向|目标岗位|应聘岗位|意向职位|Job Title|Position") || inferTitle(sections.header, draft.name);
  draft.email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(extractedText)?.[0] ?? "";
  draft.phone = findPhone(lines, extractedText);
  draft.city = labelledValue(lines.slice(0, 16), "所在地|现居地|城市|Location");
  draft.summary = sections.summary.join("\n").slice(0, 5000);
  draft.skills = sections.skills.join(", ").slice(0, 5000);
  for (const [label, value] of [["姓名", draft.name], ["求职方向", draft.title], ["邮箱", draft.email], ["手机", draft.phone], ["所在地", draft.city], ["个人简介", draft.summary], ["技能", draft.skills]]) addField(label, value);

  const educationLines = sections.education;
  for (let index = 0; index < educationLines.length && draft.educations.length < 20; index += 1) {
    const school = findSchool(educationLines[index]);
    if (!school) continue;
    const nearby = educationLines.slice(index, index + 3).join(" | ");
    draft.educations.push({ school, degree: findDegree(nearby), date: findDate(nearby) });
  }
  if (draft.educations.length) detectedFields.push("教育经历");
  else if (educationLines.length) warnings.push("教育内容未能可靠拆分，请参照提取原文手动填写。");

  const experienceGroups = splitLabeledEntries(sections.experience, /^(?:公司|单位|Employer|Company)\s*[:：]/i);
  for (const group of experienceGroups.slice(0, 20)) {
    const text = group.join("\n").slice(0, 20_000);
    const firstLineWithoutDate = (group[0] ?? "").replace(findDate(group[0] ?? ""), "").trim();
    const inferredCompany = /(?:有限公司|集团|研究院|Inc\.?|Ltd\.?)$/i.test(firstLineWithoutDate) ? firstLineWithoutDate.slice(0, 120) : "";
    draft.experiences.push({
      company: labelledValue(group, "公司|单位|Employer|Company") || inferredCompany,
      role: labelledValue(group, "岗位|职位|Role|Position") || group.slice(1, 4).find(looksLikeRole) || "",
      date: findDate(text),
      description: text,
    });
  }
  if (draft.experiences.length) {
    detectedFields.push("实习/工作经历");
    warnings.push("实习/工作经历按可识别的公司或条目线索分组；请核对每条经历的公司、职位、时间与内容。");
  }

  const projectGroups = splitLabeledEntries(sections.project, /^(?:项目名称|项目|Project Name)\s*[:：]/i);
  for (const group of projectGroups.slice(0, 20)) {
    const text = group.join("\n").slice(0, 20_000);
    const inferredProject = /^(.{2,80}?)\s+(独立开发者|项目负责人|开发者|作者|前端开发者|后端开发者)$/i.exec(group[0] ?? "");
    const separateRole = looksLikeRole(group[1] ?? "") ? group[1] : "";
    const separateName = separateRole && group[0] && group[0].length <= 80 && !/[。；;]$/.test(group[0]) ? group[0] : "";
    draft.projects.push({
      name: labelledValue(group, "项目名称|项目|Project Name") || inferredProject?.[1] || separateName || "",
      role: labelledValue(group, "角色|职责|Role") || inferredProject?.[2] || separateRole || "",
      description: text,
    });
  }
  if (draft.projects.length) {
    detectedFields.push("项目经历");
    warnings.push("项目经历按可识别的名称或条目线索分组；请核对每个项目的名称、职责与内容。");
  }

  if (!draft.name) warnings.push("未能可靠识别姓名，请手动填写。");
  if (!draft.educations.length && !draft.experiences.length && !draft.projects.length) warnings.push("未能识别教育、实习或项目章节，请参照提取原文补充。");
  warnings.push("PDF 解析可能打乱多栏内容顺序。请逐项核对预览后再确认导入。");
  return { draft, extractedText, detectedFields, warnings };
}
