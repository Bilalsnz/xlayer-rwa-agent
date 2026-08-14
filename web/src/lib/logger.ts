import { xLayer, xLayerTestnet } from "./chains";
import { publicClientFor } from "./rpc";

/**
 * REAL deployed contract on X Layer Testnet (chain 1952):
 *   RWARecommendationLogger @ 0x154D2fc1E2bFDE164691A5d99578cEBb259d4c0F
 *
 * Correct ABI matching the actual contract we deployed.
 */
export const LOGGER_ABI = [
  {
    type: "function",
    name: "anchor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "summary", type: "string" },
      { name: "symbols", type: "string" },
      { name: "riskScore", type: "uint8" },
      { name: "confidence", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getUserCount",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Known testnet deployment (hardcoded so the Anchor button works with zero config).
 *  Env vars override it (e.g. a future mainnet deploy). */
const TESTNET_LOGGER = "0x154D2fc1E2bFDE164691A5d99578cEBb259d4c0F";

export function loggerAddress(chainId: number): `0x${string}` | undefined {
  if (chainId === xLayerTestnet.id) {
    return (
      (process.env.NEXT_PUBLIC_LOGGER_ADDRESS_TESTNET as `0x${string}` | undefined) ||
      (TESTNET_LOGGER as `0x${string}`)
    );
  }
  if (chainId === xLayer.id) {
    return process.env.NEXT_PUBLIC_LOGGER_ADDRESS_MAINNET as `0x${string}` | undefined;
  }
  return undefined;
}

export interface AnchorPayload {
  summary: string;
  symbols: string[];
  riskScore: number;
  confidence: number;
  recommendation: string;
}

/** Kept for compatibility (not used by the new anchor call). */
export function buildRecommendationString(p: AnchorPayload): string {
  return JSON.stringify({
    app: "X-RWA Agent",
    summary: p.summary,
    symbols: p.symbols,
    riskScore: p.riskScore,
    confidence: p.confidence,
    recommendation: p.recommendation,
    ts: Math.floor(Date.now() / 1000),
  });
}

/** Read is currently not available with the new ABI (no latestRecommendation view). */
export async function readLatestRecommendation(chainId: number): Promise<string> {
  return "";
}

/** OKLink explorer link for a transaction hash on the given chain. */
export function explorerTxUrl(chainId: number, hash: string): string {
  const base =
    chainId === xLayer.id
      ? "https://www.oklink.com/xlayer"
      : "https://www.oklink.com/x-layer-testnet";
  return `\( {base}/tx/ \){hash}`;
} 