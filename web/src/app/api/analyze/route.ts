import { NextResponse } from "next/server";
import { RWA_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { RWA_ANALYSIS_JSON_SCHEMA, type RWAAnalysis } from "@/lib/schema";

export const runtime = "nodejs";

/**
 * AI analysis via any OpenAI-compatible chat-completions endpoint.
 * Default = Groq (free tier).
 */
const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1";
const AI_MODEL = process.env.AI_MODEL ?? "openai/gpt-oss-20b";

function relaxSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(relaxSchema);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "enum" || k === "minimum" || k === "maximum") continue;
      if (k === "type" && v === "integer") {
        out[k] = "number";
        continue;
      }
      out[k] = relaxSchema(v);
    }
    return out;
  }
  return node;
}

const RELAXED_SCHEMA = relaxSchema(RWA_ANALYSIS_JSON_SCHEMA);

const num = (v: unknown, lo: number, hi: number, dflt = 0) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
};

function normRecommendation(v: unknown): RWAAnalysis["assets_analyzed"][number]["recommendation"] {
  const s = String(v ?? "").toLowerCase();
  if (/(strong )?buy|accumulate|long|add/.test(s)) return "buy";
  if (/sell|reduce|trim|exit|short/.test(s)) return "sell";
  if (/avoid|stay away|do not|don'?t/.test(s)) return "avoid";
  return "hold";
}

function normAction(v: unknown): RWAAnalysis["suggested_actions"][number]["action"] {
  const s = String(v ?? "").toLowerCase();
  if (/swap|buy|sell|trade|exchange/.test(s)) return "swap";
  if (/research|monitor|watch|wait|review|analyz/.test(s)) return "research_more";
  return "hold";
}

function normalizeAnalysis(raw: any): RWAAnalysis {
  const a = raw ?? {};
  return {
    summary: String(a.summary ?? ""),
    assets_analyzed: Array.isArray(a.assets_analyzed)
      ? a.assets_analyzed.map((x: any) => ({
          symbol: String(x?.symbol ?? "?"),
          name: String(x?.name ?? ""),
          risk_score: num(x?.risk_score, 0, 100, 50),
          liquidity_score: num(x?.liquidity_score, 0, 100, 50),
          yield_potential: num(x?.yield_potential, 0, 100, 0),
          sentiment_score: num(x?.sentiment_score, -100, 100, 0),
          key_risks: Array.isArray(x?.key_risks) ? x.key_risks.map(String) : [],
          key_opportunities: Array.isArray(x?.key_opportunities) ? x.key_opportunities.map(String) : [],
          recommendation: normRecommendation(x?.recommendation),
          confidence: num(x?.confidence, 0, 100, 50),
        }))
      : [],
    portfolio_suggestion: {
      allocation:
        a.portfolio_suggestion?.allocation && typeof a.portfolio_suggestion.allocation === "object"
          ? Object.fromEntries(
              Object.entries(a.portfolio_suggestion.allocation).map(([k, v]) => [k, num(v, 0, 100, 0)]),
            )
          : {},
      rationale: String(a.portfolio_suggestion?.rationale ?? ""),
    },
    suggested_actions: Array.isArray(a.suggested_actions)
      ? a.suggested_actions.map((x: any) => ({
          action: normAction(x?.action),
          from_token: String(x?.from_token ?? ""),
          to_token: String(x?.to_token ?? ""),
          amount_usd: Math.max(0, Number(x?.amount_usd) || 0),
          reason: String(x?.reason ?? ""),
        }))
      : [],
    disclaimer: String(a.disclaimer ?? "Not financial advice."),
  };
}

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "submit_rwa_analysis",
    description: "Submit the structured RWA analysis. This is the ONLY way to answer the user.",
    parameters: RELAXED_SCHEMA,
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
    ? `\( {prompt}\n\nContext (JSON):\n \){JSON.stringify(body.context).slice(0, 6000)}`
    : prompt;

  const requestBody = JSON.stringify({
    model: AI_MODEL,
    temperature: 0.2,
    max_tokens: 2048,
    messages: [
      { role: "system", content: RWA_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: "function", function: { name: "submit_rwa_analysis" } },
  });

  try {
    let res!: Response;
    let data: any;

    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: requestBody,
      });
      data = await res.json();
      if (res.status !== 429 || attempt === 1) break;
      const hint = /try again in ([\d.]+)\s*s/i.exec(data?.error?.message ?? "");
      const headerWait = Number(res.headers.get("retry-after"));
      const waitS = Math.min(6, Math.max(hint ? parseFloat(hint[1]) : headerWait || 2, 1));
      await new Promise((r) => setTimeout(r, Math.ceil(waitS * 1000) + 250));
    }

    if (res.status === 429) {
      return NextResponse.json(
        { error: "The AI model is busy right now (free-tier limit). Wait a few seconds and try again." },
        { status: 503 },
      );
    }
    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      return NextResponse.json({ error: `AI provider error: ${msg}` }, { status: 502 });
    }

    const message = data?.choices?.[0]?.message;
    let rawArgs = message?.tool_calls?.[0]?.function?.arguments;

    // Fallback: some models put the JSON in the content instead of tool_calls
    if (!rawArgs && message?.content) {
      const match = message.content.match(/\{[\s\S]*\}/);
      if (match) rawArgs = match[0];
    }

    if (!rawArgs) {
      return NextResponse.json({ error: "Model returned no structured output" }, { status: 502 });
    }

    let analysis: RWAAnalysis;
    try {
      // Clean common JSON problems from smaller models
      let cleaned = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
      cleaned = cleaned
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      analysis = normalizeAnalysis(parsed);
    } catch (e) {
      console.error("JSON parse failed:", rawArgs);
      return NextResponse.json({ error: "Failed to parse tool call arguments as JSON" }, { status: 502 });
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Analysis failed: ${msg}` }, { status: 502 });
  }
}