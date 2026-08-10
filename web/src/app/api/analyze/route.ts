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

/**
 * Groq validates the model's tool call against the tool's JSON schema on THEIR
 * server and rejects the whole request when the model emits a value outside an
 * `enum` or numeric bound (e.g. action "buy" instead of "swap"). That made
 * analysis intermittently fail. Fix: hand Groq a RELAXED schema (no enums, no
 * bounds, all numbers) so it never rejects, then normalize the output back to
 * our strict shape server-side. See normalizeAnalysis below.
 */
function relaxSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(relaxSchema);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "enum" || k === "minimum" || k === "maximum") continue; // drop strict constraints
      if (k === "type" && v === "integer") { out[k] = "number"; continue; }
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

/** Coerce whatever the model returned into a guaranteed-valid RWAAnalysis, so the
 *  frontend and the on-chain enum mapping can never receive an invalid value. */
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
      const parsed = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
      analysis = normalizeAnalysis(parsed); // coerce to guaranteed-valid shape
    } catch {
      return NextResponse.json({ error: "Model returned malformed JSON" }, { status: 502 });
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Analysis failed: ${msg}` }, { status: 502 });
  }
}
