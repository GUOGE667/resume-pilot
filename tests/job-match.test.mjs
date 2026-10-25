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

test("前置、后置和并列否定都不会变成岗位要求", () => {
  const cases = [
    ["React 不要求，熟悉 Vue 即可。", ["Vue"]],
    ["不要求 React 和 Vue；要求 TypeScript。", ["TypeScript"]],
    ["React、Vue 均非必需；需要 Python。", ["Python"]],
    ["熟悉 React，Redis 非必需。", ["React"]],
    ["无须掌握 Docker，不过 Git 是必需的。", ["Git"]],
  ];
  for (const [jd, expected] of cases) {
    assert.deepEqual(analyzeJobRequirements(jd, []).map((item) => item.label), expected, jd);
  }
});

test("首次提及被否定后，保留后续明确的正向要求及其原句", () => {
  const jd = "无需 React，但熟悉 React 优先；不需要 Python，不过 Python 项目经验加分。";
  const result = analyzeJobRequirements(jd, [{ section: "项目经历", excerpt: "使用 React 开发看板，使用 Python 整理数据。" }]);
  assert.deepEqual(result.map((item) => item.label), ["React", "Python"]);
  assert.match(result[0].jdExcerpt, /熟悉 React 优先/);
  assert.match(result[1].jdExcerpt, /Python 项目经验加分/);
  assert.ok(result.every((item) => item.evidence?.section === "项目经历"));
});

test("常见后端与 Agent 技术别名能识别，且不能借用别的技能作证据", () => {
  const jd = "熟悉 SpringBoot、Postgres、Redis 和 Model Context Protocol。";
  const sections = [{ section: "技能", excerpt: "Spring Boot、SQL、Redis、MCP" }];
  const result = analyzeJobRequirements(jd, sections);
  assert.deepEqual(result.map((item) => item.label), ["Spring Boot", "PostgreSQL", "Redis", "MCP"]);
  assert.equal(result[0].evidence?.section, "技能");
  assert.equal(result[1].evidence, null);
  assert.equal(result[2].evidence?.section, "技能");
  assert.equal(result[3].evidence?.section, "技能");
});

test("别名必须是完整词，避免技术名称子串误匹配", () => {
  const result = analyzeJobRequirements("需要 PostgreSQL 和 Java。", [{ section: "技能", excerpt: "SQL、JavaScript" }]);
  assert.deepEqual(result.map((item) => item.label), ["PostgreSQL", "Java"]);
  assert.ok(result.every((item) => item.evidence === null));
  assert.deepEqual(analyzeJobRequirements("熟悉 Next.js 与 Vue.js。", []).map((item) => item.label), ["Next.js", "Vue"]);
});
