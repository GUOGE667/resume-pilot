import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePdfReadability } from "../lib/pdf-readability.ts";

const draft = {
  avatar: "", name: "林知远", title: "前端开发实习生", email: "", phone: "", city: "", summary: "开发用户界面",
  skills: "React", jobDescription: "", educations: [{ school: "示例大学", degree: "本科", date: "" }],
  experiences: [{ company: "示例科技", role: "实习生", date: "", description: "" }],
  projects: [{ name: "履历台", role: "开发", description: "" }],
};

test("readable PDF text finds expected Chinese identity and entry names", () => {
  const result = evaluatePdfReadability(["林 知 远 前端开发实习生 个人简介 教育经历 示例大学 实习经历 示例科技 项目经历 履历台 专业技能 React"], draft);
  assert.equal(result.status, "readable");
  assert.deepEqual(result.missingFields, []);
  assert.equal(result.checkedFields, 5);
});

test("image-only PDF is reported as unreadable", () => {
  const result = evaluatePdfReadability(["", ""], draft);
  assert.equal(result.status, "unreadable");
  assert.deepEqual(result.blankPages, [1, 2]);
  assert.equal(result.hasChineseText, false);
});

test("missing project on one page and a blank second page require review", () => {
  const result = evaluatePdfReadability(["林知远 前端开发实习生 示例大学 示例科技 本人参与前端业务开发与交付。", ""], draft);
  assert.equal(result.status, "review");
  assert.deepEqual(result.missingFields, ["项目 1：名称"]);
  assert.deepEqual(result.blankPages, [2]);
});

test("a different English PDF is reviewed rather than called image-only", () => {
  const result = evaluatePdfReadability(["This is a searchable document with readable English text, but it is not the selected Chinese resume."], draft);
  assert.equal(result.status, "review");
  assert.equal(result.hasChineseText, false);
  assert.ok(result.characterCount > 20);
});
