import assert from "node:assert/strict";
import test from "node:test";
import { DRAFT_FIELDS } from "../lib/resume-backup.ts";
import { analyzeDraftJobRequirements, compareResumeDrafts } from "../lib/version-compare.ts";

const base = {
  ...Object.fromEntries(DRAFT_FIELDS.map((field) => [field, ""])),
  title: "前端实习",
  skills: "React",
  jobDescription: "需要 React",
  educations: [{ school: "甲大学", degree: "本科", date: "2022–2026" }],
  experiences: [
    { company: "甲公司", role: "开发", date: "2025", description: "维护 React 页面" },
    { company: "乙公司", role: "测试", date: "2024", description: "编写测试用例" },
  ],
  projects: [{ name: "项目甲", role: "开发", description: "实现前端页面" }],
};

const changed = (left, right) => compareResumeDrafts(left, right).flatMap((section) => section.rows).filter((row) => row.status !== "same");

test("调换经历顺序不会被当作文字修改，对比不改变原版本", () => {
  const reordered = { ...base, experiences: [...base.experiences].reverse() };
  const snapshot = JSON.stringify(base);
  assert.deepEqual(changed(base, reordered), []);
  assert.equal(JSON.stringify(base), snapshot);
});

test("逐字段标明修改、新增和移除的经历", () => {
  const tailored = {
    ...base,
    skills: "React, TypeScript",
    experiences: [
      { ...base.experiences[0], description: "使用 React 开发新页面" },
      { company: "丙公司", role: "前端", date: "2026", description: "制作组件库" },
    ],
  };
  const rows = changed(base, tailored);
  assert.equal(rows.find((row) => row.label === "甲公司 · 工作内容")?.status, "changed");
  assert.equal(rows.find((row) => row.label === "乙公司 · 公司")?.status, "removed");
  assert.equal(rows.find((row) => row.label === "丙公司 · 公司")?.status, "added");
  assert.equal(rows.find((row) => row.label === "技能")?.after, "React, TypeScript");
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
});

test("同公司两段经历先匹配完全相同的记录，再找改动记录", () => {
  const left = { ...base, experiences: [
    { company: "甲公司", role: "开发", date: "2024", description: "旧任务" },
    { company: "甲公司", role: "开发", date: "2025", description: "另一个任务" },
  ] };
  const right = { ...left, experiences: [
    left.experiences[1],
    { ...left.experiences[0], description: "新任务" },
  ] };
  const rows = changed(left, right);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].before, "旧任务");
  assert.equal(rows[0].after, "新任务");
});

test("每份版本按自己的 JD 分析关键词，未填写 JD 不生成覆盖率", () => {
  const frontend = analyzeDraftJobRequirements(base);
  const backend = analyzeDraftJobRequirements({ ...base, jobDescription: "需要 Python 和 Docker", skills: "Python" });
  assert.equal(frontend.find((item) => item.label === "React")?.evidence?.section, "实习经历 1");
  assert.equal(backend.find((item) => item.label === "Python")?.evidence?.section, "专业技能");
  assert.equal(backend.find((item) => item.label === "Docker")?.evidence, null);
  assert.deepEqual(analyzeDraftJobRequirements({ ...base, jobDescription: "" }), []);
});
