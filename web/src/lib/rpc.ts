import { createPublicClient, http } from "viem";
import { xLayer, xLayerTestnet } from "./chains";

/**
 * Read-only viem client over the FREE public X Layer RPCs (no key required).
 * Used for wallet balance reads and reading the on-chain logger's latest value.
 */
export function publicClientFor(chainId: number) {
  const chain = chainId === xLayer.id ? xLayer : xLayerTestnet;
  return createPublicClient({ chain, transport: http() });
}
