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
  const s = String(v ?? "").toLowerCase