import { parseResumeDraft, type ResumeDraft } from "./resume-backup.ts";

export const VERSION_STORAGE_KEY = "resumepilot-versions";
export const MAX_VERSIONS = 5;
export const MAX_VERSION_BACKUP_BYTES = 40 * 1024 * 1024;
const FORMAT = "resumepilot-versions";
const VERSION = 1;

export type ResumeVersion = { id: string; name: string; updatedAt: string; draft: ResumeDraft };
export type ResumeVersionStore = {
  format: typeof FORMAT;
  version: typeof VERSION;
  activeId: string;
  versions: ResumeVersion[];
};

function cloneDraft(draft: ResumeDraft): ResumeDraft {
  return {
    ...draft,
    educations: draft.educations.map((entry) => ({ ...entry })),
    experiences: draft.experiences.map((entry) => ({ ...entry })),
    projects: draft.projects.map((entry) => ({ ...entry })),
  };
}

export function createVersionStore(draft: ResumeDraft, now = new Date().toISOString()): ResumeVersionStore {
  return {
    format: FORMAT,
    version: VERSION,
    activeId: "base",
    versions: [{ id: "base", name: "主简历", updatedAt: now, draft: cloneDraft(draft) }],
  };
}

export function activeVersion(store: ResumeVersionStore): ResumeVersion {
  const current = store.versions.find((item) => item.id === store.activeId);
  if (!current) throw new Error("当前简历版本不存在");
  return current;
}

export function parseVersionStore(raw: unknown): ResumeVersionStore {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("版本文件格式不正确");
  const source = raw as Record<string, unknown>;
  if (source.format !== FORMAT || source.version !== VERSION) throw new Error("不支持此版本文件");
  if (!Array.isArray(source.versions) || source.versions.length < 1 || source.versions.length > MAX_VERSIONS) {
    throw new Error("简历版本数量无效");
  }
  const seen = new Set<string>();
  const versions = source.versions.map((item, index): ResumeVersion => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`第 ${index + 1} 个版本无效`);
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id || record.id.length > 100 || seen.has(record.id)) throw new Error("版本 ID 无效或重复");
    seen.add(record.id);
    if (typeof record.name !== "string" || !record.name.trim() || record.name.length > 40) throw new Error("版本名称无效");
    if (typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error("版本时间无效");
    return { id: record.id, name: record.name, updatedAt: record.updatedAt, draft: parseResumeDraft(record.draft, true) };
  });
  if (typeof source.activeId !== "string" || !seen.has(source.activeId)) throw new Error("当前简历版本无效");
  return { format: FORMAT, version: VERSION, activeId: source.activeId, versions };
}

export function loadVersionStore(versionJson: string | null, legacyJson: string | null, fallback: ResumeDraft): { store: ResumeVersionStore; recovered: boolean } {
  if (versionJson) {
    try {
      return { store: parseVersionStore(JSON.parse(versionJson)), recovered: false };
    } catch {
      // A valid older single-draft copy is retained as a recovery path.
    }
  }
  if (legacyJson) {
    try {
      return { store: createVersionStore(parseResumeDraft(JSON.parse(legacyJson))), recovered: Boolean(versionJson) };
    } catch {
      return { store: createVersionStore(fallback), recovered: true };
    }
  }
  return { store: createVersionStore(fallback), recovered: Boolean(versionJson) };
}

export function updateActiveDraft(store: ResumeVersionStore, draft: ResumeDraft, now = new Date().toISOString()): ResumeVersionStore {
  return { ...store, versions: store.versions.map((item) => item.id === store.activeId ? { ...item, updatedAt: now, draft: cloneDraft(draft) } : item) };
}

export function duplicateActiveVersion(store: ResumeVersionStore, id: string, now = new Date().toISOString()): ResumeVersionStore {
  if (store.versions.length >= MAX_VERSIONS) throw new Error(`最多保存 ${MAX_VERSIONS} 个版本`);
  if (!id || store.versions.some((item) => item.id === id)) throw new Error("新版本 ID 无效");
  const current = activeVersion(store);
  const baseName = `${current.name} 副本`;
  let name = baseName;
  for (let number = 2; store.versions.some((item) => item.name === name); number += 1) name = `${baseName} ${number}`;
  if (name.length > 40) name = `岗位版本 ${store.versions.length + 1}`;
  return { ...store, activeId: id, versions: [...store.versions, { id, name, updatedAt: now, draft: cloneDraft(current.draft) }] };
}

export function renameActiveVersion(store: ResumeVersionStore, name: string, now = new Date().toISOString()): ResumeVersionStore {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 40) throw new Error("版本名称需为 1–40 个字");
  if (store.versions.some((item) => item.id !== store.activeId && item.name === trimmed)) throw new Error("已有同名版本，请换一个名称");
  return { ...store, versions: store.versions.map((item) => item.id === store.activeId ? { ...item, name: trimmed, updatedAt: now } : item) };
}

export function selectVersion(store: ResumeVersionStore, id: string): ResumeVersionStore {
  if (!store.versions.some((item) => item.id === id)) throw new Error("要切换的版本不存在");
  return { ...store, activeId: id };
}

export function deleteInactiveVersion(store: ResumeVersionStore, id: string): ResumeVersionStore {
  if (id === store.activeId || !store.versions.some((item) => item.id === id)) throw new Error("请先切换到其他版本再删除");
  return { ...store, versions: store.versions.filter((item) => item.id !== id) };
}

export function createVersionsBackup(store: ResumeVersionStore, exportedAt = new Date().toISOString()): string {
  return JSON.stringify({ ...parseVersionStore(store), exportedAt }, null, 2);
}

export function parseVersionsBackup(content: string): { store: ResumeVersionStore; exportedAt: string } {
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { throw new Error("文件不是有效的 JSON 备份"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("版本备份格式不正确");
  const exportedAt = (raw as Record<string, unknown>).exportedAt;
  if (typeof exportedAt !== "string" || !Number.isFinite(Date.parse(exportedAt))) throw new Error("备份时间无效");
  return { store: parseVersionStore(raw), exportedAt };
}
