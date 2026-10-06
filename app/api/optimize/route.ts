import { env } from "cloudflare:workers";

type OptimizeRequest = {
  section?: "profile" | "experience" | "project" | "target";
  content?: string;
  jobDescription?: string;
  title?: string;
};

type OptimizeResult = {
  headline: string;
  optimizedText: string;
  strengths: string[];
  improvements: string[];
  keywords: string[];
  source: "ai" | "fallback";
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    optimizedText: { type: "string" },
    strengths: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" } },
    improvements: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" } },
    keywords: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
  },
  required: ["headline", "optimizedText", "strengths", "improvements", "keywords"],
};

function fallback(content: string, jobDescription: string): OptimizeResult {
  const keywords = Array.from(new Set((jobDescription.match(/[A-Za-z][A-Za-z.+#-]{2,}|[\u4e00-\u9fff]{2,6}/g) ?? []).slice(0, 6)));
  return {
    headline: "先补充证据，再压缩表达",
    optimizedText: content.trim(),
    strengths: ["内容与目标岗位方向基本一致", "已经包含可继续深化的具体经历"],
    improvements: ["补充你采取的具体行动和技术取舍", "加入真实可验证的结果或量化指标", "删除无法证明能力的泛化表达"],
    keywords: keywords.length >= 3 ? keywords : ["项目成果", "技术能力", "团队协作"],
    source: "fallback",
  };
}

function outputText(payload: unknown) {
  const response = payload as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  return response.output_text ?? response.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
}

export async function POST(request: Request) {
  let safeContent = "";
  let safeJobDescription = "";
  try {
    const body = await request.json() as OptimizeRequest;
    const section = body.section ?? "profile";
    const content = body.content?.trim() ?? "";
    const jobDescription = body.jobDescription?.trim() ?? "";
    safeContent = content;
    safeJobDescription = jobDescription;
    if (content.length < 10) return Response.json({ error: "请至少填写 10 个字后再进行优化。" }, { status: 400 });

    // The public editor must not charge the owner's API account by default.
    // A configured key alone never enables paid requests.
    if (env.RESUMEPILOT_ALLOW_PAID_API !== "true") {
      return Response.json(fallback(content, jobDescription));
    }
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return Response.json(fallback(content, jobDescription));

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5.4-mini",
        store: false,
        instructions: "你是一位严格、诚实的中文简历教练。只使用用户提供的信息，不得虚构经历、技术、职责或数据。优化内容应适合 ATS 阅读，优先使用动作、方法和结果结构；缺失信息必须作为建议提出，不能自行补全。",
        input: [{ role: "user", content: [{ type: "input_text", text: `优化章节：${section}\n求职方向：${body.title ?? "未填写"}\n目标岗位 JD：\n${jobDescription || "未填写"}\n\n当前内容：\n${content}` }] }],
        text: { format: { type: "json_schema", name: "resume_optimization", strict: true, schema } },
        max_output_tokens: 1200,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new Error(`OPENAI_${response.status}`);
    const text = outputText(await response.json());
    if (!text) throw new Error("OPENAI_EMPTY_OUTPUT");
    return Response.json({ ...(JSON.parse(text) as Omit<OptimizeResult, "source">), source: "ai" });
  } catch (error) {
    console.warn("Resume optimization fallback", error instanceof Error ? error.message : error);
    return Response.json(fallback(safeContent || "请继续补充这部分简历内容。", safeJobDescription));
  }
}
