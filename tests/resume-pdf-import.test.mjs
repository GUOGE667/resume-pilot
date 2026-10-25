import test from "node:test";
import assert from "node:assert/strict";
import { parseResumePdfText } from "../lib/resume-pdf-import.ts";

test("extracts explicit details from a text resume without inventing data", () => {
  const preview = parseResumePdfText([`郭灵昊
求职方向：AI Agent 实习生
邮箱：guo@example.com | 手机：138 0000 0000 | 所在地：上海
个人简介
使用 TypeScript 构建可解释的简历对照工具。
教育经历
示例大学 | 计算机科学 本科 | 2023.09 — 2027.06
实习经历
公司：示例科技
职位：开发实习生
2025.06 — 2025.09
实现候选人资料核对流程。
项目经历
项目名称：履历台
角色：独立开发
使用 React 实现可编辑简历与 PDF 导出。
专业技能
TypeScript、React、Git`]);

  assert.equal(preview.draft.name, "郭灵昊");
  assert.equal(preview.draft.title, "AI Agent 实习生");
  assert.equal(preview.draft.email, "guo@example.com");
  assert.equal(preview.draft.phone, "138 0000 0000");
  assert.equal(preview.draft.city, "上海");
  assert.match(preview.draft.summary, /TypeScript/);
  assert.deepEqual(preview.draft.educations, [{ school: "示例大学", degree: "计算机科学 本科", date: "2023.09 — 2027.06" }]);
  assert.equal(preview.draft.experiences[0].company, "示例科技");
  assert.equal(preview.draft.experiences[0].role, "开发实习生");
  assert.match(preview.draft.experiences[0].description, /候选人资料核对/);
  assert.equal(preview.draft.projects[0].name, "履历台");
  assert.equal(preview.draft.projects[0].role, "独立开发");
  assert.match(preview.draft.skills, /React/);
  assert.equal(preview.draft.avatar, "");
  assert.equal(preview.draft.jobDescription, "");
});

test("leaves uncertain sections blank while preserving the extracted original", () => {
  const preview = parseResumePdfText([`个人简历
联系邮箱：person@example.com
这里有一段未标记为教育或项目的任意文本，解析器不能把它当成学校、公司、成果或工作时间。`]);
  assert.equal(preview.draft.name, "");
  assert.equal(preview.draft.email, "person@example.com");
  assert.deepEqual(preview.draft.educations, []);
  assert.deepEqual(preview.draft.experiences, []);
  assert.deepEqual(preview.draft.projects, []);
  assert.match(preview.extractedText, /任意文本/);
  assert.ok(preview.warnings.some((warning) => warning.includes("未能可靠识别姓名")));
});

test("rejects image-only or nearly blank PDFs", () => {
  assert.throws(() => parseResumePdfText(["", "  "]), /扫描件暂不支持导入/);
  assert.throws(() => parseResumePdfText(["个人简历"]), /文字版 PDF/);
});

test("keeps uncertain entry content editable rather than assigning fabricated labels", () => {
  const preview = parseResumePdfText([`张小明
联系方式：xiao@example.com
实习经历
参与服务端接口维护与单元测试，排查线上错误并记录处理过程。
项目经历
设计了一个本地简历检索工具，并完成手工验证。`]);
  assert.equal(preview.draft.experiences[0].company, "");
  assert.equal(preview.draft.experiences[0].role, "");
  assert.match(preview.draft.experiences[0].description, /排查线上错误/);
  assert.equal(preview.draft.projects[0].name, "");
  assert.match(preview.draft.projects[0].description, /本地简历检索工具/);
  assert.ok(preview.warnings.some((warning) => warning.includes("请核对")));
});

test("splits multiple entries only when explicit labels identify their boundaries", () => {
  const preview = parseResumePdfText([`姓名：王小明
邮箱：wang@example.com
实习经历
公司：甲科技
岗位：开发实习生
2024.06-2024.09
开发内部工具。
公司：乙科技
岗位：测试实习生
2025.06-2025.09
维护自动化测试。
项目经历
项目名称：项目 A
完成数据清洗。
项目名称：项目 B
完成结果可视化。`]);
  assert.equal(preview.draft.experiences.length, 2);
  assert.equal(preview.draft.experiences[0].company, "甲科技");
  assert.equal(preview.draft.experiences[1].company, "乙科技");
  assert.equal(preview.draft.projects.length, 2);
  assert.equal(preview.draft.projects[0].name, "项目 A");
  assert.equal(preview.draft.projects[1].name, "项目 B");
});

test("does not absorb the next labeled field on the same line", () => {
  const preview = parseResumePdfText([`姓名：李小白 求职方向：产品实习生 邮箱：li@example.com 手机：139 1111 2222
个人简介
负责需求分析、用户访谈和产品方案记录。`]);
  assert.equal(preview.draft.name, "李小白");
  assert.equal(preview.draft.title, "产品实习生");
  assert.equal(preview.draft.phone, "139 1111 2222");
});

test("separates a Chinese school from degree on one unseparated line", () => {
  const preview = parseResumePdfText([`姓名：陈小华
邮箱：chen@example.com
教育背景
示例大学 计算机科学与技术 本科 2022.09-2026.06`]);
  assert.equal(preview.draft.educations[0].school, "示例大学");
  assert.equal(preview.draft.educations[0].degree, "计算机科学与技术 本科");
  assert.equal(preview.draft.educations[0].date, "2022.09-2026.06");
});

test("parses the site's own text-PDF style with adjacent unlabeled headings", () => {
  const preview = parseResumePdfText([`演示资料 · 仍有示例内容，请核对后使用
林知远
前端开发实习生
hello@example.com 138 0000 0000 中国 · 深圳
个⼈简介
关注用户体验与工程质量的前端开发者，能够独立完成需求拆解与部署上线。
教育经历
示例大学 2023 — 2027
计算机科学 · 本科
实习经历
示例科技有限公司 2025.06 — 2025.09
前端开发实习生
参与核心业务页面开发。
项⽬经历
EchoHire AI 模拟面试平台 独立开发者
使用 Next.js 和 TypeScript 搭建岗位问答流程。
专业技能
TypeScript React Next.js Tailwind CSS Git`]);
  assert.equal(preview.draft.name, "林知远");
  assert.equal(preview.draft.title, "前端开发实习生");
  assert.deepEqual(preview.draft.educations, [{ school: "示例大学", degree: "计算机科学 · 本科", date: "2023 — 2027" }]);
  assert.equal(preview.draft.experiences[0].company, "示例科技有限公司");
  assert.equal(preview.draft.experiences[0].role, "前端开发实习生");
  assert.equal(preview.draft.projects[0].name, "EchoHire AI 模拟面试平台");
  assert.equal(preview.draft.projects[0].role, "独立开发者");
});

test("parses browser PDF.js text items with spaced headings and separate role lines", () => {
  const preview = parseResumePdfText([`演示资料 · 仍有示例内容，请核对后使用
林知远
前端开发实习生
hello@example.com 138 0000 0000 中国 · 深圳
个 ⼈ 简 介
关注用户体验与工程质量的前端开发者，能够独立完成需求拆解与部署上线。
教 育 经 历
示例大学
2023 — 2027
计算机科学 · 本科
实 习 经 历
示例科技有限公司
2025.06 — 2025.09
前端开发实习生
参与核心业务页面开发。
项 ⽬ 经 历
EchoHire AI 模拟面试平台
独立开发者
使用 Next.js 和 TypeScript 搭建岗位问答流程。
专 业 技 能
TypeScript React Next.js Tailwind CSS Git`]);
  assert.equal(preview.draft.summary.startsWith("关注用户体验"), true);
  assert.equal(preview.draft.educations[0].school, "示例大学");
  assert.equal(preview.draft.educations[0].date, "2023 — 2027");
  assert.equal(preview.draft.experiences[0].company, "示例科技有限公司");
  assert.equal(preview.draft.experiences[0].role, "前端开发实习生");
  assert.equal(preview.draft.projects[0].name, "EchoHire AI 模拟面试平台");
  assert.equal(preview.draft.projects[0].role, "独立开发者");
  assert.match(preview.draft.skills, /TypeScript/);
});
