export type ResumeDraft = {
  avatar: string;
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

export const DRAFT_FIELDS: Array<keyof ResumeDraft> = [
  "avatar", "name", "title", "email", "phone", "city", "summary", "school", "degree",
  "educationDate", "company", "role", "experienceDate", "experience", "project",
  "projectRole", "projectDetail", "skills", "jobDescription",
];

const FORMAT = "resumepilot-draft";
const VERSION = 1;
export const MAX_BACKUP_BYTES = 12 * 1024 * 1024;

export function createResumeBackup(draft: ResumeDraft, exportedAt = new Date().toISOString()): string {
  const fields = Object.fromEntries(DRAFT_FIELDS.map((field) => [field, draft[field]]));
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt, draft: fields }, null, 2);
}

export function parseResumeBackup(content: string): { draft: ResumeDraft; exportedAt: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("文件不是有效的 JSON 草稿");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("备份文件格式不正确");

  const backup = parsed as Record<string, unknown>;
  if (backup.format !== FORMAT || backup.version !== VERSION) throw new Error("不支持此备份文件的格式或版本");
  if (typeof backup.exportedAt !== "string" || !Number.isFinite(Date.parse(backup.exportedAt))) throw new Error("备份时间无效");
  if (!backup.draft || typeof backup.draft !== "object" || Array.isArray(backup.draft)) throw new Error("备份中没有有效的简历草稿");

  const rawDraft = backup.draft as Record<string, unknown>;
  const draft = {} as ResumeDraft;
  for (const field of DRAFT_FIELDS) {
    const value = rawDraft[field];
    if (typeof value !== "string" || value.length > (field === "avatar" ? 10_000_000 : 100_000)) {
      throw new Error(`备份中的 ${field} 字段无效`);
    }
    draft[field] = value;
  }
  if (draft.avatar && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(draft.avatar)) {
    throw new Error("备份中的头像格式无效");
  }
  return { draft, exportedAt: backup.exportedAt };
}
