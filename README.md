# ResumePilot · 简历编辑器

[在线站点](https://resumepilot-ai-career.guolinghao6.chatgpt.site/) · [配套面试训练 EchoHire](https://github.com/GUOGE667/echohire-ai-interview)

ResumePilot 帮助学生整理个人经历，对照目标岗位修改简历，并将简历带入 EchoHire 做模拟面试。面试反馈可以带回简历编辑页形成修改线索。

## 已实现

- 结构化编辑个人信息、教育、经历、项目和技能；两套模板与实时 A4 预览。
- 上传头像，并随简历预览导出 PDF；PDF 由浏览器端 `html2canvas` 和 `jsPDF` 生成。
- 浏览器本地草稿保存、岗位关键词提示、OpenAI 简历建议及规则降级。
- 点击按钮以 URL 片段把简历正文和岗位描述交给 EchoHire；EchoHire 反馈也可用 URL 片段返回。头像、联系方式不在该正向交接的简历正文中。

## 数据与边界

- 草稿保存在**当前浏览器 localStorage**，不是云端账户；换浏览器或清理本地数据后不会自动恢复。
- OpenAI 密钥只在服务端环境变量中；API 不可用时显示 `fallback` 建议，不会虚构新经历。
- URL 片段交接由用户点击发起；简历内容可能保留在本机浏览器历史等环境中，不应用于敏感资料的安全传输。
- 站点与 EchoHire 没有统一身份、共享数据库或自主执行的跨产品 Agent。

## 本地运行

Node.js ≥ 22.13、pnpm 11：

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

如需真实 AI 建议，在 `.env.local` 中配置自己的 `OPENAI_API_KEY`；不要将真实密钥提交到 Git。运行 `pnpm lint`、`pnpm build` 检查源码。跨站闭环的人工验收步骤见 [EchoHire 作品集说明](https://github.com/GUOGE667/echohire-ai-interview/blob/main/docs/PORTFOLIO.md)。

## 说明

默认简历是示例内容，不是作者的真实履历。项目用于学习和作品集展示。
