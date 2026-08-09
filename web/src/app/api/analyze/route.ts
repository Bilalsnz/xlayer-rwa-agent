import { NextResponse } from "next/server";
import { RWA_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { RWA_ANALYSIS_JSON_SCHEMA, type RWAAnalysis } from "@/lib/schema";

export const runtime = "nodejs";

/**
 * AI analysis via any OpenAI-compatible chat-completions endpoint.
 * Default = Groq (free tier). Works unchanged with OpenRouter free models,
 * Cerebras, or Gemini's OpenAI-compat endpoint — just change AI_BASE_URL/AI_MODEL.
 *
 * Reliability: we force the model to answer through a single function
 * (`submit_rwa_analysis`) whose parameters ARE the required JSON schema, with
 * tool_choice pinned to it. The model cannot return prose — only structured args.
 */
const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1";
const AI_MODEL = process.env.AI_MODEL ?? "llama-3.3-70b-versatile";

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "submit_rwa_analysis",
    description: "Submit the structured RWA analysis. This is the ONLY way to answer the user.",
    parameters: RWA_ANALYSIS_JSON_SCHEMA,
  },
};

export async function POST(req: Request) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server missing AI_API_KEY (get a free key at console.groq.com)" },
      { status: 500 },
    );
  }

  let body: { prompt?: string; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").toString().slice(0, 4000).trim();
  if (!prompt) return NextResponse.json({ error: "Missing 'prompt'" }, { status: 400 });

  const userContent = body.context
    ? `${prompt}\n\nContext (JSON):\n${JSON.stringify(body.context).slice(0, 6000)}`
    : prompt;

  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.2,
        max_tokens: 2048,
        messages: [
          { role: "system", content: RWA_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: "function", function: { name: "submit_rwa_analysis" } },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      return NextResponse.json({ error: `AI provider error: ${msg}` }, { status: 502 });
    }

    const rawArgs = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!rawArgs) {
      return NextResponse.json({ error: "Model returned no structured output" }, { status: 502 });
    }

    let analysis: RWAAnalysis;
    try {
      analysis = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return NextResponse.json({ error: "Model returned malformed JSON" }, { status: 502 });
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Analysis failed: ${msg}` }, { status: 502 });
  }
}
