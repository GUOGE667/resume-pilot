import assert from "node:assert/strict";
import test from "node:test";
import { createResumeBackup, DRAFT_FIELDS, parseResumeBackup } from "../lib/resume-backup.ts";

const draft = Object.fromEntries(DRAFT_FIELDS.map((field) => [field, ""]));
draft.name = "测试求职者";
draft.project = "本地项目";
draft.jobDescription = "熟悉 TypeScript";

test("导出的中文草稿可以完整恢复", () => {
  const exportedAt = "2026-10-06T00:00:00.000Z";
  const backup = createResumeBackup(draft, exportedAt);
  assert.deepEqual(parseResumeBackup(backup), { draft, exportedAt });
});

test("拒绝错误版本、字段类型和不安全头像", () => {
  const backup = JSON.parse(createResumeBackup(draft));
  assert.throws(() => parseResumeBackup(JSON.stringify({ ...backup, version: 2 })), /不支持/);
  assert.throws(() => parseResumeBackup(JSON.stringify({ ...backup, draft: { ...draft, name: 42 } })), /name/);
  assert.throws(() => parseResumeBackup(JSON.stringify({ ...backup, draft: { ...draft, avatar: "javascript:alert(1)" } })), /头像格式/);
  assert.throws(() => parseResumeBackup("not json"), /JSON/);
});

test("恢复时只保留已知简历字段", () => {
  const backup = JSON.parse(createResumeBackup(draft));
  backup.draft.unexpected = "ignored";
  assert.deepEqual(parseResumeBackup(JSON.stringify(backup)).draft, draft);
});
