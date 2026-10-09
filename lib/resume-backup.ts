export type EducationEntry = { school: string; degree: string; date: string };
export type ExperienceEntry = { company: string; role: string; date: string; description: string };
export type ProjectEntry = { name: string; role: string; description: string };

export type ResumeDraft = {
  avatar: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  city: string;
  summary: string;
  skills: string;
  jobDescription: string;
  educations: EducationEntry[];
  experiences: ExperienceEntry[];
  projects: ProjectEntry[];
};

export const DRAFT_FIELDS = ["avatar", "name", "title", "email", "phone", "city", "summary", "skills", "jobDescription"] as const;
export type DraftTextField = typeof DRAFT_FIELDS[number];
export const MAX_ENTRIES = 20;
const FORMAT = "resumepilot-draft";
const VERSION = 2;
export const MAX_BACKUP_BYTES = 12 * 1024 * 1024;

const entryFields = {
  educations: ["school", "degree", "date"],
  experiences: ["company", "role", "date", "description"],
  projects: ["name", "role", "description"],
} as const;

const legacyFields = ["school", "degree", "educationDate", "company", "role", "experienceDate", "experience", "project", "projectRole", "projectDetail"] as const;

function readText(raw: Record<string, unknown>, field: string, required: boolean): string {
  const value = raw[field];
  if (!required && value === undefined) return "";
  if (typeof value !== "string" || value.length > (field === "avatar" ? 10_000_000 : 100_000)) {
    throw new Error(`草稿中的 ${field} 字段无效`);
  }
  return value;
}

function readEntries<K extends keyof typeof entryFields>(raw: Record<string, unknown>, key: K): ResumeDraft[K] {
  const entries = raw[key];
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) throw new Error(`草稿中的 ${key} 列表无效`);
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`草稿中的 ${key}[${index}] 无效`);
    const source = entry as Record<string, unknown>;
    return Object.fromEntries(entryFields[key].map((field) => [field, readText(source, field, true)]));
  }) as ResumeDraft[K];
}

/** Accepts both current drafts and the original single-entry browser/backup format. */
export function parseResumeDraft(raw: unknown, strict = false): ResumeDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("草稿格式不正确");
  const source = raw as Record<string, unknown>;
  const draft = {} as ResumeDraft;
  for (const field of DRAFT_FIELDS) draft[field] = readText(source, field, strict);

  if (draft.avatar && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(draft.avatar)) {
    throw new Error("备份中的头像格式无效");
  }

  const hasEntryArrays = ["educations", "experiences", "projects"].some((key) => source[key] !== undefined);
  if (hasEntryArrays) {
    draft.educations = readEntries(source, "educations");
    draft.experiences = readEntries(source, "experiences");
    draft.projects = readEntries(source, "projects");
  } else {
    const legacy = Object.fromEntries(legacyFields.map((field) => [field, readText(source, field, strict)])) as Record<typeof legacyFields[number], string>;
    draft.educations = [{ school: legacy.school, degree: legacy.degree, date: legacy.educationDate }];
    draft.experiences = [{ company: legacy.company, role: legacy.role, date: legacy.experienceDate, description: legacy.experience }];
    draft.projects = [{ name: legacy.project, role: legacy.projectRole, description: legacy.projectDetail }];
  }
  return draft;
}

export function createResumeBackup(draft: ResumeDraft, exportedAt = new Date().toISOString()): string {
  const cleanDraft = parseResumeDraft(draft, true);
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt, draft: cleanDraft }, null, 2);
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
  if (backup.format !== FORMAT || (backup.version !== 1 && backup.version !== VERSION)) throw new Error("不支持此备份文件的格式或版本");
  if (typeof backup.exportedAt !== "string" || !Number.isFinite(Date.parse(backup.exportedAt))) throw new Error("备份时间无效");
  const rawDraft = backup.draft;
  if (!rawDraft || typeof rawDraft !== "object" || Array.isArray(rawDraft)) throw new Error("备份中没有有效的简历草稿");
  if (backup.version === 1 && ["educations", "experiences", "projects"].some((key) => key in rawDraft)) {
    throw new Error("旧版备份格式不正确");
  }
  if (backup.version === VERSION && !["educations", "experiences", "projects"].every((key) => key in rawDraft)) {
    throw new Error("新版备份缺少经历列表");
  }
  return { draft: parseResumeDraft(rawDraft, true), exportedAt: backup.exportedAt };
}
