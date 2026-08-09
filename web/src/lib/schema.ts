/** Structured RWA analysis schema — shared by the API route (as a Claude tool
 *  input_schema) and the frontend for typing/rendering. */

export type Recommendation = "buy" | "hold" | "sell" | "avoid";
export type SuggestedActionKind = "swap" | "hold" | "research_more";

export interface AssetAnalysis {
  symbol: string;
  name: string;
  risk_score: number; // 0-100
  liquidity_score: number; // 0-100
  yield_potential: number; // 0-100
  sentiment_score: number; // -100..100
  key_risks: string[];
  key_opportunities: string[];
  recommendation: Recommendation;
  confidence: number; // 0-100
}

export interface SuggestedAction {
  action: SuggestedActionKind;
  from_token: string;
  to_token: string;
  amount_usd: number;
  reason: string;
}

export interface RWAAnalysis {
  summary: string;
  assets_analyzed: AssetAnalysis[];
  portfolio_suggestion: {
    allocation: Record<string, number>;
    rationale: string;
  };
  suggested_actions: SuggestedAction[];
  disclaimer: string;
}

/** JSON Schema used as the Claude tool input_schema. Enforcing enums and numeric
 *  bounds here is what makes the model's JSON reliable rather than hopeful. */
export const RWA_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "assets_analyzed",
    "portfolio_suggestion",
    "suggested_actions",
    "disclaimer",
  ],
  properties: {
    summary: { type: "string" },
    assets_analyzed: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "symbol",
          "name",
          "risk_score",
          "liquidity_score",
          "yield_potential",
          "sentiment_score",
          "key_risks",
          "key_opportunities",
          "recommendation",
          "confidence",
        ],
        properties: {
          symbol: { type: "string" },
          name: { type: "string" },
          risk_score: { type: "integer", minimum: 0, maximum: 100 },
          liquidity_score: { type: "integer", minimum: 0, maximum: 100 },
          yield_potential: { type: "integer", minimum: 0, maximum: 100 },
          sentiment_score: { type: "integer", minimum: -100, maximum: 100 },
          key_risks: { type: "array", items: { type: "string" } },
          key_opportunities: { type: "array", items: { type: "string" } },
          recommendation: { type: "string", enum: ["buy", "hold", "sell", "avoid"] },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
    portfolio_suggestion: {
      type: "object",
      additionalProperties: false,
      required: ["allocation", "rationale"],
      properties: {
        allocation: {
          type: "object",
          additionalProperties: { type: "number", minimum: 0, maximum: 100 },
        },
        rationale: { type: "string" },
      },
    },
    suggested_actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "from_token", "to_token", "amount_usd", "reason"],
        properties: {
          action: { type: "string", enum: ["swap", "hold", "research_more"] },
          from_token: { type: "string" },
          to_token: { type: "string" },
          amount_usd: { type: "number", minimum: 0 },
          reason: { type: "string" },
        },
      },
    },
    disclaimer: { type: "string" },
  },
} as const;
