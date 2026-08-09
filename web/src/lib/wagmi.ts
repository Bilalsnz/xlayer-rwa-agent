import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { xLayer, xLayerTestnet } from "./chains";

/**
 * OKX Wallet injects EIP-1193 as window.okxwallet (and also window.ethereum).
 * The injected connector with a target picks OKX specifically when present,
 * and falls back to any injected wallet otherwise.
 */
export const wagmiConfig = createConfig({
  chains: [xLayerTestnet, xLayer],
  connectors: [
    injected({
      target() {
        const okx =
          typeof window !== "undefined"
            ? (window as unknown as { okxwallet?: unknown }).okxwallet
            : undefined;
        return {
          id: "okxwallet",
          name: "OKX Wallet",
          provider: okx as never,
        };
      },
    }),
    injected(), // generic fallback (MetaMask, etc.)
  ],
  transports: {
    [xLayer.id]: http(),
    [xLayerTestnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
