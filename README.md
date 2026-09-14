# ResumePilot

AI 岗位定制简历编辑器：将个人经历整理成更清晰、更适合 ATS 阅读的专业简历，并根据目标岗位提供关键词匹配和改进建议。

## 核心功能

- 结构化编辑个人资料、教育、实习和项目经历
- 双栏工作台与实时 A4 简历预览
- 现代单栏、经典商务两套模板
- 根据目标 JD 计算简历完成度与匹配提示
- AI 优化建议、关键词提取和可应用的优化版本
- 浏览器本地草稿保存
- 浏览器打印导出 PDF
- WebMCP 结构化简历编辑工具

## 技术栈

Next.js、TypeScript、React、Tailwind CSS、OpenAI Responses API、Structured Outputs、Cloudflare Workers、Sites。

## 本地运行

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
pnpm dev
```

请在 `.env.local` 中配置自己的 `OPENAI_API_KEY`，不要提交真实密钥。

## 数据与隐私

- 简历草稿默认保存在当前浏览器。
- OpenAI API Key 仅在服务端使用。
- AI 请求设置为 `store: false`。
- AI 不会虚构用户没有提供的经历或成果；缺失信息以改进建议呈现。
