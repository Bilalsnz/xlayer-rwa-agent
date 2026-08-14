import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { xLayer, xLayerTestnet } from "./chains";

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
    injected(),
  ],
  transports: {
    [xLayer.id]: http("https://rpc.xlayer.tech"),
    [xLayerTestnet.id]: http("https://testrpc.xlayer.tech/terigon"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}