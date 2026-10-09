import assert from "node:assert/strict";
import test from "node:test";
import { createResumeBackup, DRAFT_FIELDS, MAX_ENTRIES, parseResumeBackup, parseResumeDraft } from "../lib/resume-backup.ts";

const textFields = Object.fromEntries(DRAFT_FIELDS.map((field) => [field, ""]));
const draft = {
  ...textFields,
  name: "测试求职者",
  jobDescription: "熟悉 TypeScript",
  educations: [{ school: "甲大学", degree: "本科", date: "2022-2026" }, { school: "乙大学", degree: "硕士", date: "2026-2028" }],
  experiences: [{ company: "甲公司", role: "前端实习", date: "2025", description: "完成工作甲" }, { company: "乙公司", role: "开发实习", date: "2026", description: "完成工作乙" }],
  projects: [{ name: "项目甲", role: "开发者", description: "完成项目甲" }, { name: "项目乙", role: "负责人", description: "完成项目乙" }],
};

test("多条教育、实习和项目可完整备份恢复", () => {
  const exportedAt = "2026-10-06T00:00:00.000Z";
  const backup = createResumeBackup(draft, exportedAt);
  assert.equal(JSON.parse(backup).version, 2);
  assert.deepEqual(parseResumeBackup(backup), { draft, exportedAt });
});

test("旧版单条备份和浏览器草稿迁移后保留原文", () => {
  const legacyDraft = {
    ...textFields,
    name: "旧草稿",
    school: "旧大学", degree: "本科", educationDate: "2023-2027",
    company: "旧公司", role: "实习生", experienceDate: "2025", experience: "完成旧工作",
    project: "旧项目", projectRole: "开发者", projectDetail: "完成旧项目",
  };
  const migrated = parseResumeDraft(legacyDraft);
  assert.deepEqual(migrated.educations, [{ school: "旧大学", degree: "本科", date: "2023-2027" }]);
  assert.deepEqual(migrated.experiences, [{ company: "旧公司", role: "实习生", date: "2025", description: "完成旧工作" }]);
  assert.deepEqual(migrated.projects, [{ name: "旧项目", role: "开发者", description: "完成旧项目" }]);
  const backup = { format: "resumepilot-draft", version: 1, exportedAt: "2026-10-06T00:00:00.000Z", draft: legacyDraft };
  assert.deepEqual(parseResumeBackup(JSON.stringify(backup)).draft, migrated);
});

test("拒绝错误版本、嵌套字段和不安全头像", () => {
  const backup = JSON.parse(createResumeBackup(draft));
  assert.throws(() => parseResumeBackup(JSON.stringify({ ...backup, version: 3 })), /不支持/);
  assert.throws(() => parseResumeBackup(JSON.stringify({ ...backup, draft: { ...draft, name: 42 } })), /name/);
  assert.throws(() => parseResumeBackup(JSON.stringify({ ...backup, draft: { ...draft, projects: [{ name: 42, role: "", description: "" }] } })), /name/);
  assert.throws(() => parseResumeBackup(JSON.stringify({ ...backup, draft: { ...draft, projects: Array(MAX_ENTRIES + 1).fill(draft.projects[0]) } })), /projects/);
  assert.throws(() => parseResumeBackup(JSON.stringify({ ...backup, draft: { ...draft, avatar: "javascript:alert(1)" } })), /头像格式/);
  assert.throws(() => parseResumeBackup("not json"), /JSON/);
});

test("恢复时只保留已知简历字段", () => {
  const backup = JSON.parse(createResumeBackup(draft));
  backup.draft.unexpected = "ignored";
  backup.draft.projects[0].unexpected = "ignored";
  assert.deepEqual(parseResumeBackup(JSON.stringify(backup)).draft, draft);
});
