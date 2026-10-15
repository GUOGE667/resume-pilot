import type { ResumeDraft } from "./resume-backup";

export type PdfReadabilityReport = {
  status: "readable" | "review" | "unreadable";
  pageCount: number;
  characterCount: number;
  blankPages: number[];
  checkedFields: number;
  missingFields: string[];
  hasChineseText: boolean;
  expectedChineseText: boolean;
  preview: string;
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\u200b-\u200d\uFEFF]/g, "")
    .replace(/[，,。．·•:：;；\-—–_()（）\[\]【】]/g, "");
}

function expectedFields(draft: ResumeDraft): Array<{ label: string; value: string }> {
  const fields = [
    { label: "姓名", value: draft.name },
    { label: "求职方向", value: draft.title },
    ...draft.educations.map((entry, index) => ({ label: `教育 ${index + 1}：学校`, value: entry.school })),
    ...draft.experiences.map((entry, index) => ({ label: `实习 ${index + 1}：公司`, value: entry.company })),
    ...draft.projects.map((entry, index) => ({ label: `项目 ${index + 1}：名称`, value: entry.name })),
  ];
  return fields.filter((field) => normalize(field.value).length >= 2);
}

/** Checks extracted text, not visual layout or an employer's ATS result. */
export function evaluatePdfReadability(pages: string[], draft: ResumeDraft): PdfReadabilityReport {
  const text = pages.join("\n");
  const normalized = normalize(text);
  const fields = expectedFields(draft);
  const missingFields = fields.filter((field) => !normalized.includes(normalize(field.value))).map((field) => field.label);
  const blankPages = pages.flatMap((page, index) => normalize(page).length < 10 ? [index + 1] : []);
  const expectedChineseText = /[\u3400-\u9fff]/u.test([
    draft.name, draft.title, draft.summary, draft.skills,
    ...draft.educations.flatMap((entry) => Object.values(entry)),
    ...draft.experiences.flatMap((entry) => Object.values(entry)),
    ...draft.projects.flatMap((entry) => Object.values(entry)),
  ].join(""));
  const hasChineseText = /[\u3400-\u9fff]/u.test(text);
  const characterCount = normalized.length;
  const unreadable = characterCount < 20;
  const chineseMissing = expectedChineseText && !hasChineseText;
  return {
    status: unreadable ? "unreadable" : missingFields.length || blankPages.length || chineseMissing ? "review" : "readable",
    pageCount: pages.length,
    characterCount,
    blankPages,
    checkedFields: fields.length,
    missingFields,
    hasChineseText,
    expectedChineseText,
    preview: text.replace(/\s+/g, " ").trim().slice(0, 280),
  };
}
