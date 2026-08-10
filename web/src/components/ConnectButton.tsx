"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { xLayer, xLayerTestnet } from "@/lib/chains";

const SUPPORTED = [xLayerTestnet.id, xLayer.id] as const;

/** True when some EIP-1193 wallet is injected into this page (extension on
 *  desktop, or the OKX in-app browser on mobile). In a plain mobile browser
 *  nothing is injected, so there is nothing for wagmi to connect to. */
function hasInjectedWallet(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { okxwallet?: unknown; ethereum?: unknown };
  return Boolean(w.okxwallet || w.ethereum);
}

/** Open this dApp inside the OKX app's built-in browser, where OKX Wallet is
 *  injected. This is OKX's official mobile connect path. See:
 *  https://web3.okx.com/build/docs/waas/app-universal-link */
function openInOkxApp() {
  const dappUrl = window.location.href;
  const deepLink = "okx://wallet/dapp/url?dappUrl=" + encodeURIComponent(dappUrl);
  // Wrap in the download URL so users without the app get sent to install it.
  const universal = "https://web3.okx.com/download?deeplink=" + encodeURIComponent(deepLink);
  window.location.href = universal;
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const onWrongChain = isConnected && !SUPPORTED.includes(chainId as (typeof SUPPORTED)[number]);

  function handleConnect() {
    // No injected provider (typical mobile browser) → hand off to the OKX app
    // instead of calling connect(), which would otherwise fail silently.
    if (!hasInjectedWallet()) {
      openInOkxApp();
      return;
    }
    const okx = connectors.find((c) => c.id === "okxwallet") ?? connectors[0];
    connect({ connector: okx });
  }

  if (!isConnected) {
    return (
      <button
        onClick={handleConnect}
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
