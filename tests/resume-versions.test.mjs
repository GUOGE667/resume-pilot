import assert from "node:assert/strict";
import test from "node:test";
import { DRAFT_FIELDS } from "../lib/resume-backup.ts";
import {
  activeVersion,
  createVersionStore,
  createVersionsBackup,
  deleteInactiveVersion,
  duplicateActiveVersion,
  loadVersionStore,
  parseVersionsBackup,
  renameActiveVersion,
  selectVersion,
  updateActiveDraft,
} from "../lib/resume-versions.ts";

const draft = {
  ...Object.fromEntries(DRAFT_FIELDS.map((field) => [field, ""])),
  name: "测试求职者",
  jobDescription: "前端实习岗位",
  educations: [{ school: "测试大学", degree: "本科", date: "2022-2026" }],
  experiences: [{ company: "示例公司", role: "实习生", date: "2025", description: "完成页面" }],
  projects: [{ name: "原始项目", role: "开发", description: "实现功能" }],
};

test("旧单份草稿迁移为主简历，内容原样保留", () => {
  const legacy = { ...draft, school: "旧学校", degree: "本科", educationDate: "2022-2026", company: "旧公司", role: "实习生", experienceDate: "2025", experience: "旧内容", project: "旧项目", projectRole: "开发", projectDetail: "旧描述" };
  delete legacy.educations;
  delete legacy.experiences;
  delete legacy.projects;
  const { store, recovered } = loadVersionStore(null, JSON.stringify(legacy), draft);
  assert.equal(recovered, false);
  assert.equal(activeVersion(store).name, "主简历");
  assert.equal(activeVersion(store).draft.projects[0].description, "旧描述");
});

test("复制后只修改岗位版本，原版仍可切换回来", () => {
  const base = createVersionStore(draft, "2026-10-10T00:00:00.000Z");
  const copy = duplicateActiveVersion(base, "role-a", "2026-10-10T01:00:00.000Z");
  const renamed = renameActiveVersion(copy, "甲公司前端实习", "2026-10-10T02:00:00.000Z");
  const tailored = updateActiveDraft(renamed, { ...activeVersion(renamed).draft, jobDescription: "甲公司 React 岗位", projects: [{ ...draft.projects[0], description: "岗位定制描述" }] });
  assert.equal(activeVersion(tailored).draft.projects[0].description, "岗位定制描述");
  const original = activeVersion(selectVersion(tailored, "base"));
  assert.equal(original.draft.projects[0].description, "实现功能");
  assert.equal(original.draft.jobDescription, "前端实习岗位");
  assert.equal(activeVersion(tailored).name, "甲公司前端实习");
});

test("全部版本备份能恢复，删除需要先切换到其他版本", () => {
  const store = duplicateActiveVersion(createVersionStore(draft), "role-a");
  const backup = createVersionsBackup(store, "2026-10-10T03:00:00.000Z");
  assert.deepEqual(parseVersionsBackup(backup), { store, exportedAt: "2026-10-10T03:00:00.000Z" });
  assert.throws(() => deleteInactiveVersion(store, "role-a"), /切换/);
  const remaining = deleteInactiveVersion(store, "base");
  assert.equal(remaining.versions.length, 1);
  assert.equal(activeVersion(remaining).id, "role-a");
});

test("损坏的版本记录可从旧草稿恢复，非法备份被拒绝", () => {
  const recovered = loadVersionStore("not-json", JSON.stringify(draft), draft);
  assert.equal(recovered.recovered, true);
  assert.equal(activeVersion(recovered.store).draft.name, "测试求职者");
  const backup = JSON.parse(createVersionsBackup(createVersionStore(draft)));
  backup.versions[0].draft.projects[0].description = 42;
  assert.throws(() => parseVersionsBackup(JSON.stringify(backup)), /description/);
});
