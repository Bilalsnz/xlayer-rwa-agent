"use client";

import { useRef, useState } from "react";
import { useAccount, useChainId, useWriteContract, useSendTransaction } from "wagmi";
import { keccak256, stringToHex } from "viem";
import type { AssetAnalysis, RWAAnalysis, SuggestedAction } from "@/lib/schema";
import { REGISTRY_ABI, RECOMMENDATION_ENUM, registryAddress } from "@/lib/contract";
import { buildOkxDexSwapUrl, actionLabel } from "@/lib/okxDex";
import { xLayer, xLayerTestnet } from "@/lib/chains";
import { BottomNav, type NavPage } from "@/components/BottomNav";

/* ---------------------------------------------------------------- shared UI */

function scoreColor(v: number, invert = false) {
  const good = invert ? v <= 33 : v >= 66;
  const bad = invert ? v >= 66 : v <= 33;
  return good ? "text-good" : bad ? "text-bad" : "text-warn";
}

function Meter({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className={scoreColor(value, invert)}>{value}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-panel2">
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function AssetCard({ a, onAnchor }: { a: AssetAnalysis; onAnchor: (a: AssetAnalysis) => void }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{a.symbol}</div>
          <div className="text-xs text-muted">{a.name}</div>
        </div>
        <span className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs uppercase">
          {a.recommendation} · {a.confidence}%
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Meter label="Risk" value={a.risk_score} invert />
        <Meter label="Liquidity" value={a.liquidity_score} />
        <Meter label="Yield" value={a.yield_potential} />
        <Meter label="Sentiment" value={(a.sentiment_score + 100) / 2} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-muted">Risks</div>
          <ul className="list-disc pl-4 text-bad/90">{a.key_risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        <div>
          <div className="text-muted">Opportunities</div>
          <ul className="list-disc pl-4 text-good/90">{a.key_opportunities.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      </div>
      <button
        onClick={() => onAnchor(a)}
        className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-white"
      >
        Anchor on-chain
      </button>
    </div>
  );
}

function EmptyState({ onGoAnalyze }: { onGoAnalyze: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-panel/50 p-8 text-center">
      <p className="text-sm text-muted">No analysis yet.</p>
      <button
        onClick={onGoAnalyze}
        className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Go to Analyze
      </button>
    </div>
  );
}

const EXAMPLE_PROMPTS = [
  "Analyze TSLAx and AAPLx for a 6-month hold. Moderate risk tolerance.",
  "Compare TSLAx vs a tokenized T-bill for low risk.",
  "Is NVDAx a buy right now? Aggressive risk tolerance.",
];

/* -------------------------------------------------------------------- shell */

export function AppShell() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [prompt, setPrompt] = useState("Analyze TSLAx and AAPLx for a 6-month hold. Moderate risk tolerance.");
  const [analysis, setAnalysis] = useState<RWAAnalysis | null>(null);
  const [rawJson, setRawJson] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Which tab is showing. 0=Analyze 1=Results 2=Actions 3=Wallet.
  const [page, setPage] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const PAGES: NavPage[] = [
    { id: 0, label: "Analyze" },
    { id: 1, label: "Results", hasData: !!analysis },
    { id: 2, label: "Actions", hasData: !!analysis },
    { id: 3, label: "Wallet" },
  ];

  function goto(id: number) {
    setPage(Math.max(0, Math.min(PAGES.length - 1, id)));
  }

  // Lightweight swipe between tabs — sells the "mobile app" feel, no deps.
  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goto(page + (dx < 0 ? 1 : -1));
    }
  }

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setAnalysis(data.analysis);
      setRawJson(JSON.stringify(data.analysis, null, 2));
      setPage(1); // jump to Results as soon as it's ready
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function anchor(a: AssetAnalysis) {
    setStatus(null);
    setError(null);
    const addr = registryAddress(chainId);
    if (!addr) {
      setError("Registry address not configured for this chain. Deploy the contract and set the env var.");
      setPage(3);
      return;
    }
    try {
      // contentHash binds the on-chain record to the exact JSON payload.
      const contentHash = keccak256(stringToHex(rawJson || JSON.stringify(analysis)));
      const analysisId = keccak256(stringToHex(`${a.symbol}:${contentHash}`));
      // Ensure the agent is registered (idempotent), then log.
      await writeContractAsync({
        address: addr,
        abi: REGISTRY_ABI,
        functionName: "registerAgent",
        args: ["ipfs://x-rwa-agent"],
      });
      const tx = await writeContractAsync({
        address: addr,
        abi: REGISTRY_ABI,
        functionName: "logAnalysis",
        args: [
          analysisId,
          a.symbol,
          a.risk_score,
          a.liquidity_score,
          a.yield_potential,
          a.sentiment_score,
          a.confidence,
          RECOMMENDATION_ENUM[a.recommendation] ?? 0,
          contentHash,
        ],
      });
      setStatus(`Anchored ${a.symbol} on-chain. Tx: ${tx}`);
      setPage(3); // surface the tx on the Wallet & On-chain tab
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    }
  }

  function openDeepLink(action: SuggestedAction) {
    window.open(buildOkxDexSwapUrl(action, chainId || xLayer.id), "_blank", "noopener");
  }

  async function execute(action: SuggestedAction) {
    setError(null);
    setStatus(null);
    // 1) Try the OKX DEX Aggregator API for a prepared, user-signed transaction.
    //    Falls back to the deep link whenever tokens aren't verified/executable
    //    or the API isn't configured (server responds with { fallback: true }).
    if (!address) {
      openDeepLink(action);
      return;
    }
    try {
      const res = await fetch("/api/okx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swap",
          chainId: chainId || xLayer.id,
          fromSymbol: action.from_token,
          toSymbol: action.to_token,
          amountUsd: action.amount_usd,
          slippage: "0.01",
          userWalletAddress: address,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fallback) {
          openDeepLink(action);
          return;
        }
        throw new Error(data.error ?? "OKX request failed");
      }
      // Approve first (ERC-20 sell-side), then the swap — both signed by the user.
      if (data.approveTx) {
        setStatus("Confirm the token approval in your wallet…");
        await sendTransactionAsync({ to: data.approveTx.to, data: data.approveTx.data });
      }
      setStatus("Confirm the swap in your wallet…");
      const hash = await sendTransactionAsync({
        to: data.tx.to,
        data: data.tx.data,
        value: data.tx.value ? BigInt(data.tx.value) : undefined,
      });
      setStatus(`Swap submitted to OKX DEX. Tx: ${hash}`);
    } catch (e) {
      // Any failure (incl. user rejection) — offer the manual deep link.
      openDeepLink(action);
      setError(e instanceof Error ? `${e.message} — opened OKX DEX as fallback.` : "Opened OKX DEX as fallback.");
    }
  }

  const explorer =
    chainId === xLayer.id
      ? xLayer.blockExplorers.default.url
      : xLayerTestnet.blockExplorers.default.url;

  return (
    <>
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* Banners are global so on-chain status/errors are visible on every tab. */}
        {error && <div className="mb-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad break-all">{error}</div>}
        {status && <div className="mb-4 rounded-lg border border-good/40 bg-good/10 p-3 text-sm text-good break-all">{status}</div>}

        <div key={page} className="page-enter space-y-6">
          {/* ------------------------------------------------- 0 · Analyze */}
          {page === 0 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="text-xs uppercase text-muted">Ask the analyst</div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-lg border border-border bg-bg p-3 text-sm outline-none focus:border-accent"
                  placeholder="Ask about tokenized RWAs, e.g. 'Compare TSLAx vs a tokenized T-bill for low risk'"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    onClick={runAnalysis}
                    disabled={loading || !prompt.trim()}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? "Analyzing…" : "Analyze"}
                  </button>
                  {!isConnected && <span className="text-xs text-muted">Connect a wallet to anchor results on-chain.</span>}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="text-xs uppercase text-muted">Try an example</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setPrompt(ex)}
                      className="rounded-full border border-border bg-panel2 px-3 py-1.5 text-xs text-muted hover:text-white"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------- 1 · Results */}
          {page === 1 &&
            (analysis ? (
              <div className="space-y-6">
                <div className="rounded-xl border border-border bg-panel p-4">
                  <div className="text-xs uppercase text-muted">Summary</div>
                  <p className="mt-1 text-sm">{analysis.summary}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {analysis.assets_analyzed.map((a) => (
                    <AssetCard key={a.symbol} a={a} onAnchor={anchor} />
                  ))}
                </div>

                <details className="rounded-xl border border-border bg-panel p-4">
                  <summary className="cursor-pointer text-xs uppercase text-muted">Raw JSON output</summary>
                  <pre className="mt-2 overflow-x-auto text-xs text-muted">{rawJson}</pre>
                </details>
              </div>
            ) : (
              <EmptyState onGoAnalyze={() => setPage(0)} />
            ))}

          {/* ------------------------------------------------- 2 · Actions */}
          {page === 2 &&
            (analysis ? (
              <div className="space-y-6">
                <div className="rounded-xl border border-border bg-panel p-4">
                  <div className="text-xs uppercase text-muted">Suggested portfolio</div>
                  <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full">
                    {Object.entries(analysis.portfolio_suggestion.allocation).map(([sym, pct], i) => (
                      <div
                        key={sym}
                        title={`${sym}: ${pct}%`}
                        style={{ width: `${pct}%`, backgroundColor: ["#5b8cff", "#3ddc97", "#ffcc66", "#ff6b6b", "#a78bfa"][i % 5] }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                    {Object.entries(analysis.portfolio_suggestion.allocation).map(([sym, pct]) => (
                      <span key={sym}>{sym} {pct}%</span>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-muted">{analysis.portfolio_suggestion.rationale}</p>
                </div>

                <div className="rounded-xl border border-border bg-panel p-4">
                  <div className="text-xs uppercase text-muted">Suggested actions</div>
                  <div className="mt-2 space-y-2">
                    {analysis.suggested_actions.map((act, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel2 p-3">
                        <div className="text-sm">
                          <div className="font-medium">{actionLabel(act)}</div>
                          <div className="text-xs text-muted">{act.reason}</div>
                        </div>
                        {act.action === "swap" ? (
                          <button
                            onClick={() => execute(act)}
                            className="shrink-0 rounded-lg bg-good px-3 py-1.5 text-xs font-medium text-black hover:opacity-90"
                          >
                            Execute on OKX DEX
                          </button>
                        ) : (
                          <span className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted">
                            {act.action}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-muted">{analysis.disclaimer}</p>
              </div>
            ) : (
              <EmptyState onGoAnalyze={() => setPage(0)} />
            ))}

          {/* ------------------------------------------ 3 · Wallet & On-chain */}
          {page === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="text-xs uppercase text-muted">Wallet</div>
                {isConnected ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="break-all font-mono text-xs text-muted">{address}</div>
                    <div>
                      Network:{" "}
                      <span className="text-accent">
                        {chainId === xLayer.id ? "X Layer Mainnet (196)" : chainId === xLayerTestnet.id ? "X Layer Testnet (1952)" : `Unsupported (${chainId})`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">Not connected. Use “Connect OKX Wallet” in the header.</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="text-xs uppercase text-muted">On-chain registry</div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">This chain</span>
                    <span className={registryAddress(chainId) ? "font-mono text-xs text-good break-all" : "text-warn"}>
                      {registryAddress(chainId) ?? "not deployed yet"}
                    </span>
                  </div>
                  <a href={explorer} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-accent hover:underline">
                    Open OKLink explorer ↗
                  </a>
                </div>
                <p className="mt-3 text-xs text-muted">
                  “Anchor on-chain” (on the Results tab) writes each analysis’ compact scores plus a
                  keccak256 hash of the full JSON to <span className="text-white">RWAAgentRegistry</span> on X Layer,
                  so anyone can verify the record by re-hashing the payload. No funds are ever held.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomNav pages={PAGES} active={page} onSelect={goto} />
    </>
  );
}
