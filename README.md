# ResumePilot

[公开站点](https://resumepilot-ai-career.guolinghao6.chatgpt.site/) · [GitHub 仓库](https://github.com/GUOGE667/resume-pilot)

ResumePilot 是免登录的简历编辑器：将个人经历整理成更清晰、更适合 ATS 阅读的专业简历，并根据目标岗位提供关键词匹配和改进建议。草稿只保存在当前浏览器，换设备或清除网站数据后无法恢复。

## 核心功能

- 结构化编辑个人资料、教育、实习和项目经历
- 双栏工作台与实时 A4 简历预览
- 现代单栏、经典商务两套模板
- 根据目标 JD 计算简历完成度与匹配提示
- 免费规则检查、关键词提取和改进建议；付费 AI 优化默认关闭
- 浏览器本地草稿保存
- 浏览器打印导出 PDF
- WebMCP 结构化简历编辑工具

## 技术栈

Next.js、TypeScript、React、Tailwind CSS、Cloudflare Workers、Sites；OpenAI Responses API 接口保留为可选能力，当前公开站点默认不调用。

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

本地运行默认无需 API Key。仅当所有者将来明确决定启用付费模型时，才同时设置 `RESUMEPILOT_ALLOW_PAID_API=true` 与自己的 `OPENAI_API_KEY`；公开站点启用该开关后，访客也可能触发费用。密钥不要提交。

## 数据与隐私

- 简历草稿默认保存在当前浏览器。
- “检查当前内容”会把当前段落和职位 JD 发给站点接口，由免费规则返回建议；站点不持久保存这些内容。
- 即使服务端配置了 OpenAI API Key，也不会自动产生付费请求；只有显式开启开关后才会调用，调用时设置 `store: false`。
- AI 不会虚构用户没有提供的经历或成果；缺失信息以改进建议呈现。
