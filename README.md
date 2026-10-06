# ResumePilot · 简历编辑器

[在线站点](https://resumepilot-ai-career.guolinghao6.chatgpt.site/) · [配套面试训练 EchoHire](https://github.com/GUOGE667/echohire-ai-interview)

ResumePilot 帮助学生整理个人经历，对照目标岗位修改简历，并将简历带入 EchoHire 做模拟面试。面试反馈可以带回简历编辑页形成修改线索。公开站点无需 ChatGPT 登录。

## 已实现

- 结构化编辑个人信息、教育、经历、项目和技能；两套模板与实时 A4 预览。
- 上传头像，并随简历预览导出 PDF；PDF 由浏览器端 `html2canvas` 和 `jsPDF` 生成。
- 浏览器本地草稿保存；岗位关键词逐条对照 JD 与简历原文，标明未提及项；免费规则检查；付费 AI 优化默认关闭。
- 点击按钮以 URL 片段把简历正文和岗位描述交给 EchoHire；EchoHire 反馈也可用 URL 片段返回。头像、联系方式不在该正向交接的简历正文中。
- EchoHire 当前免费题目只依据岗位与职位 JD 生成；导入的简历正文暂不参与出题。

## 数据与边界

- 草稿保存在**当前浏览器 localStorage**，不是云端账户；换浏览器或清理本地数据后不会自动恢复。
- “检查当前内容”会把当前段落和职位 JD 发给站点接口，由免费规则返回建议；站点不持久保存这些内容。
- 岗位关键词对照在浏览器内运行，只检查可识别词语的文字提及情况，不能验证实际能力、判断是否胜任，也不表示录用概率。
- 即使服务端配置了 OpenAI API Key，也不会自动产生付费请求。只有所有者显式配置 `RESUMEPILOT_ALLOW_PAID_API=true` 后才会调用；公开站点启用该开关后，访客也可能触发费用。模型调用设置 `store: false`。
- URL 片段交接由用户点击发起；简历内容可能保留在本机浏览器历史等环境中，不应用于敏感资料的安全传输。
- 站点与 EchoHire 没有统一身份、共享数据库或自主执行的跨产品 Agent。

## 本地运行

Node.js ≥ 22.13、pnpm 11：

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

本地运行默认无需 API Key。若所有者将来决定启用付费模型，再同时配置 `RESUMEPILOT_ALLOW_PAID_API=true` 与自己的 `OPENAI_API_KEY`；不要将真实密钥提交到 Git。运行 `pnpm lint`、`pnpm build` 检查源码。跨站闭环的人工验收步骤见 [EchoHire 作品集说明](https://github.com/GUOGE667/echohire-ai-interview/blob/main/docs/PORTFOLIO.md)。

## 说明

默认简历是示例内容，不是作者的真实履历。项目用于学习和作品集展示。
