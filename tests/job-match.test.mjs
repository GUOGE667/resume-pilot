import assert from "node:assert/strict";
import test from "node:test";
import { analyzeJobRequirements } from "../lib/job-match.ts";

test("JD 要求随输入变化，并引用实际简历原文", () => {
  const sections = [
    { section: "项目经历", excerpt: "使用 React 完成后台页面。" },
    { section: "专业技能", excerpt: "TypeScript, Git" },
  ];
  const first = analyzeJobRequirements("熟悉 React 和 TypeScript，具备产品意识。", sections);
  assert.deepEqual(first.map((item) => item.label), ["React", "TypeScript", "产品意识"]);
  assert.equal(first[0].evidence?.section, "项目经历");
  assert.match(first[0].evidence?.excerpt ?? "", /React/);
  assert.equal(first[2].evidence, null);

  const changed = analyzeJobRequirements("需要 Python 和 Docker。", sections);
  assert.deepEqual(changed.map((item) => item.label), ["Python", "Docker"]);
  assert.ok(changed.every((item) => item.evidence === null));
});

test("空 JD 和否定要求不产生匹配结论", () => {
  const sections = [{ section: "技能", excerpt: "React、Vue、JavaScript" }];
  assert.deepEqual(analyzeJobRequirements("", sections), []);
  const result = analyzeJobRequirements("无需 React，要求 Vue。", sections);
  assert.deepEqual(result.map((item) => item.label), ["Vue"]);
  assert.equal(result[0].evidence?.section, "技能");
});

test("Java 不会误匹配 JavaScript", () => {
  const result = analyzeJobRequirements("需要 Java。", [{ section: "技能", excerpt: "JavaScript" }]);
  assert.equal(result[0].label, "Java");
  assert.equal(result[0].evidence, null);
});

test("按 JD 出现顺序展示要求", () => {
  const result = analyzeJobRequirements("需要 Docker、Python 和 Git。", []);
  assert.deepEqual(result.map((item) => item.label), ["Docker", "Python", "Git"]);
});
