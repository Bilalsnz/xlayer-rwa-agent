import { xLayer, xLayerTestnet } from "./chains";
import { publicClientFor } from "./rpc";

/**
 * REAL deployed contract on X Layer Testnet (chain 1952):
 *   RWARecommendationLogger @ 0x154D2fc1E2bFDE164691A5d99578cEBb259d4c0F
 *
 * The contract's source/ABI is not published, so this ABI was recovered from
 * the on-chain bytecode by matching the two function selectors:
 *   - logRecommendation(string)     selector 0x94533384  (writer)
 *   - latestRecommendation() view   selector 0x0e894094  (returns string)
 *
 * The writer takes a SINGLE string, so we pack the analysis fields the brief
 * asked for (summary, symbols, riskScore, confidence, recommendation) into one
 * JSON string and store that. Anyone can verify by reading latestRecommendation().
 */
export const LOGGER_ABI = [
  {
    type: "function",
    name: "logRecommendation",
    stateMutability: "nonpayable",
    inputs: [{ name: "recommendation", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "latestRecommendation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
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

/** Pack the four brief-specified fields into the single string the contract stores. */
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

/** Read the current on-chain recommendation string (free RPC). "" if none/unavailable. */
export async function readLatestRecommendation(chainId: number): Promise<string> {
  const addr = loggerAddress(chainId);
  if (!addr) return "";
  try {
    const client = publicClientFor(chainId);
    const val = await client.readContract({
      address: addr,
      abi: LOGGER_ABI,
      functionName: "latestRecommendation",
    });
    return (val as string) ?? "";
  } catch {
    return "";
  }
}

/** OKLink explorer link for a transaction hash on the given chain. */
export function explorerTxUrl(chainId: number, hash: string): string {
  const base =
    chainId === xLayer.id
      ? "https://www.oklink.com/xlayer"
      : "https://www.oklink.com/x-layer-testnet";
  return `${base}/tx/${hash}`;
}
