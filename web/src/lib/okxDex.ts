import type { SuggestedAction } from "./schema";

/**
 * OKX DEX execution path.
 *
 * NOTE: OKX does not publicly document a query-param deep-link scheme for the
 * DEX swap web UI, so we build a best-effort deep link AND expose the token
 * symbols so the user can confirm the swap manually on OKX. For a production
 * "prepared transaction" flow, call the OKX DEX Aggregator API server-side
 * (GET /api/v5/dex/aggregator/swap) to obtain calldata the user signs; that is
 * the reliable path and keeps swap volume on OKX for the Launch Grant.
 *
 * Verify the live param names before demo day and adjust CHAIN param if needed.
 */
const OKX_DEX_SWAP_BASE = "https://web3.okx.com/dex-swap";

export function buildOkxDexSwapUrl(action: SuggestedAction, chainId = 196): string {
  const params = new URLSearchParams({
    inputChain: String(chainId),
    outputChain: String(chainId),
    inputCurrency: action.from_token,
    outputCurrency: action.to_token,
  });
  return `${OKX_DEX_SWAP_BASE}?${params.toString()}`;
}

/** Deep link to swap INTO a given asset (from OKB) on OKX DEX for this chain. */
export function buildSwapUrlForSymbol(symbol: string, chainId = 196): string {
  const params = new URLSearchParams({
    inputChain: String(chainId),
    outputChain: String(chainId),
    inputCurrency: "OKB",
    outputCurrency: symbol,
  });
  return `${OKX_DEX_SWAP_BASE}?${params.toString()}`;
}

/** Human label for an action button. */
export function actionLabel(action: SuggestedAction): string {
  if (action.action === "swap") {
    return `Swap ${action.from_token} → ${action.to_token} (~$${action.amount_usd})`;
  }
  if (action.action === "research_more") return `Research ${action.to_token}`;
  return `Hold ${action.to_token}`;
}
