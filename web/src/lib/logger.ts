 import { xLayer, xLayerTestnet } from "./chains";
import { publicClientFor } from "./rpc";

/**
 * REAL deployed contract on X Layer Testnet (chain 1952):
 *   0x154D2fc1E2bFDE164691A5d99578cEBb259d4c0F
 *
 * This contract only has:
 *   - logRecommendation(string)
 *   - latestRecommendation() view
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

const TESTNET_LOGGER = "0x154D2fc1E2bFDE164691A5d99578cEBb259d4c0F";

export function loggerAddress(chainId: number): `0x${string}` | undefined {
  if (chainId === xLayerTestnet.id) {
    return (
      (process.env.NEXT_PUBLIC_LOGGER_ADDRESS_TESTNET as `0x${string}` | undefined) ||
      (TESTNET_LOGGER as `0x${string}`)