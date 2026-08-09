import { xLayer, xLayerTestnet } from "./chains";

/** Minimal ABI for the frontend — matches contracts/src/RWAAgentRegistry.sol. */
export const REGISTRY_ABI = [
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [{ name: "metadataURI", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "logAnalysis",
    stateMutability: "nonpayable",
    inputs: [
      { name: "analysisId", type: "bytes32" },
      { name: "assetSymbol", type: "string" },
      { name: "riskScore", type: "uint8" },
      { name: "liquidityScore", type: "uint8" },
      { name: "yieldPotential", type: "uint8" },
      { name: "sentimentScore", type: "int8" },
      { name: "confidence", type: "uint8" },
      { name: "recommendation", type: "uint8" },
      { name: "contentHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "voteAnalysis",
    stateMutability: "nonpayable",
    inputs: [
      { name: "analysisId", type: "bytes32" },
      { name: "endorse", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reputation",
    stateMutability: "view",
    inputs: [{ name: "analysisId", type: "bytes32" }],
    outputs: [
      { name: "up", type: "uint256" },
      { name: "down", type: "uint256" },
    ],
  },
] as const;

/** Recommendation string -> on-chain enum (NONE=0, BUY=1, HOLD=2, SELL=3, AVOID=4). */
export const RECOMMENDATION_ENUM: Record<string, number> = {
  buy: 1,
  hold: 2,
  sell: 3,
  avoid: 4,
};

export function registryAddress(chainId: number): `0x${string}` | undefined {
  if (chainId === xLayer.id) {
    return process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_MAINNET as `0x${string}` | undefined;
  }
  if (chainId === xLayerTestnet.id) {
    return process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_TESTNET as `0x${string}` | undefined;
  }
  return undefined;
}
