import assert from "node:assert/strict";
import test from "node:test";
import { checkResumeContent } from "../lib/resume-feedback.ts";

test("宽泛经历引用原句，并要求补充个人行动和真实结果", () => {
  const content = "参与项目开发，负责相关工作。协助团队完成任务。";
  const result = checkResumeContent({ section: "experience", content, jobDescription: "需要 React 开发经验。" });
  assert.equal(result.source, "local");
  assert.ok(result.findings.length >= 2);
  assert.ok(result.findings.every((finding) => content.includes(finding.quote)));
  assert.match(result.findings.map((finding) => finding.suggestion).join(" "), /不要编造指标/);
  assert.equal(result.keywords.length, 0);
});

test("具体行动、方法和结果获得有原文依据的正向反馈", () => {
  const content = "使用 React 开发招聘看板，优化首屏加载，将耗时从 3 秒缩短至 1.8 秒。";
  const result = checkResumeContent({ section: "project", content, jobDescription: "熟悉 React 和 TypeScript。" });
  assert.deepEqual(result.findings, []);
  assert.ok(result.strengths.some((item) => item.includes("行动")));
  assert.ok(result.strengths.some((item) => item.includes("方法或技术")));
  assert.ok(result.strengths.some((item) => item.includes("结果线索")));
  assert.deepEqual(result.keywords, ["React"]);
});

test("目标岗位检查只报告明确识别的要求，不作录用判断", () => {
  const content = "招聘前端开发实习生，要求 React 和 TypeScript。";
  const result = checkResumeContent({ section: "target", content });
  assert.deepEqual(result.keywords, ["React", "TypeScript"]);
  assert.match(result.headline, /2 项/);
  assert.match(result.strengths[0], /不代表能力要求已满足/);
});

test("无法识别的 JD 给人工核对提示，原句引用不改写", () => {
  const content = "负责和客户讨论业务问题，并撰写方案说明书。";
  const result = checkResumeContent({ section: "target", content });
  assert.equal(result.findings.length, 1);
  assert.ok(content.includes(result.findings[0].quote));
  assert.match(result.findings[0].suggestion, /人工标出/);
});

test("短内容明确要求补充，不给空泛的夸奖", () => {
  assert.throws(() => checkResumeContent({ section: "profile", content: "前端" }), /至少填写 10 个字/);
  const content = "热爱学习，具有良好的沟通能力。";
  const result = checkResumeContent({ section: "profile", content });
  assert.equal(result.strengths.length, 0);
  assert.ok(result.findings.every((finding) => content.includes(finding.quote)));
});
