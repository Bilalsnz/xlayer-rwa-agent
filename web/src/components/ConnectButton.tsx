"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { xLayer, xLayerTestnet } from "@/lib/chains";

const SUPPORTED = [xLayerTestnet.id, xLayer.id] as const;

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const onWrongChain = isConnected && !SUPPORTED.includes(chainId as (typeof SUPPORTED)[number]);

  if (!isConnected) {
    const okx = connectors.find((c) => c.id === "okxwallet") ?? connectors[0];
    return (
      <button
        onClick={() => connect({ connector: okx })}
        disabled={isPending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect OKX Wallet"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {onWrongChain && (
        <button
          onClick={() => switchChain({ chainId: xLayerTestnet.id })}
          className="rounded-lg bg-warn px-3 py-2 text-sm font-medium text-black"
        >
          Switch to X Layer
        </button>
      )}
      <span className="rounded-lg border border-border bg-panel px-3 py-2 text-xs text-muted">
        {address?.slice(0, 6)}…{address?.slice(-4)} · {chainId === xLayer.id ? "Mainnet" : "Testnet"}
      </span>
      <button
        onClick={() => disconnect()}
        className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-white"
      >
        Disconnect
      </button>
    </div>
  );
}
