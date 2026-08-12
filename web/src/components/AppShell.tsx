"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useWriteContract, useSendTransaction, useSwitchChain } from "wagmi";
import type { AssetAnalysis, RWAAnalysis, SuggestedAction } from "@/lib/schema";
import {
  LOGGER_ABI,
  loggerAddress,
  buildRecommendationString,
  readLatestRecommendation,
  explorerTxUrl,
  type AnchorPayload,
} from "@/lib/logger";
import { readHoldings, holdingsSummary, type Holding } from "@/lib/holdings";
import { buildOkxDexSwapUrl, buildSwapUrlForSymbol, actionLabel } from "@/lib/okxDex";
import { xLayer, xLayerTestnet } from "@/lib/chains";
import { BottomNav, type NavPage } from "@/components/BottomNav";

/* ---------------------------------------------------------------- shared UI */

const RECO_LABEL: Record<string, string> = { buy: "Buy", hold: "Hold", sell: "Reduce", avoid: "Avoid" };
const recoLabel = (r: string) => RECO_LABEL[r] ?? r;
/** Schema stores confidence 0-100; the UI shows it as x/10. */
const conf10 = (c: number) => (c > 0 ? Math.max(1, Math.round(c / 10)) : 0);

type RiskTolerance = "conservative" | "moderate" | "aggressive";

/**
 * The RWARecommendationLogger contract is deployed on X Layer TESTNET (1952) —
 * verified on-chain (it is NOT on mainnet 196). We anchor there no matter what
 * network the wallet starts on. If a mainnet logger address is ever configured
 * (NEXT_PUBLIC_LOGGER_ADDRESS_MAINNET), this automatically prefers mainnet (196).
 */
const ANCHOR_CHAIN = loggerAddress(xLayer.id) ? xLayer : xLayerTestnet;

/** Turn wallet/RPC errors into one friendly line. */
function anchorErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|user denied|rejected the request|\b4001\b/i.test(msg)) {
    return "You cancelled the request in your wallet.";
  }
  if (/\b4902\b|unrecognized chain|add.*chain|switch/i.test(msg)) {
    return `Couldn't switch your wallet to ${ANCHOR_CHAIN.name}. Add the network in your wallet and try again.`;
  }
  return msg.length > 180 ? `${msg.slice(0, 180)}…` : msg;
}

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

function AssetCard({
  a,
  onAnchor,
  onSwap,
}: {
  a: AssetAnalysis;
  onAnchor: (a: AssetAnalysis) => void;
  onSwap: (a: AssetAnalysis) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{a.symbol}</div>
          <div className="text-xs text-muted">{a.name}</div>
        </div>
        <span className="rounded-md border border-border bg-panel2 px-2 py-1 text-xs uppercase">
          {recoLabel(a.recommendation)} · {conf10(a.confidence)}/10
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
          <div className="text-muted">Why (thesis)</div>
          <ul className="list-disc pl-4 text-good/90">{a.key_opportunities.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        <div>
          <div className="text-muted">Risk notes</div>
          <ul className="list-disc pl-4 text-bad/90">{a.key_risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => onSwap(a)}
          className="rounded-lg bg-good px-3 py-1.5 text-xs font-medium text-black hover:opacity-90"
        >
          Swap on OKX DEX
        </button>
        <button
          onClick={() => onAnchor(a)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-white"
        >
          Anchor on X Layer
        </button>
      </div>
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
  "Analyze TSLAx and AAPLx for a 6-month hold.",
  "Compare TSLAx vs a tokenized T-bill for low risk.",
  "Is NVDAx a buy right now?",
];

const RISK_OPTIONS: RiskTolerance[] = ["conservative", "moderate", "aggressive"];

/* -------------------------------------------------------------------- shell */

export function AppShell() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();

  const [prompt, setPrompt] = useState("Analyze TSLAx and AAPLx for a 6-month hold.");
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>("moderate");
  const [analysis, setAnalysis] = useState<RWAAnalysis | null>(null);
  const [rawJson, setRawJson] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Wallet holdings (read from free RPC) + on-chain state.
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [latestOnChain, setLatestOnChain] = useState<string>("");

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

  // Feature 1: read real balances whenever the wallet / chain changes.
  useEffect(() => {
    if (!isConnected || !address) {
      setHoldings([]);
      return;
    }
    let cancelled = false;
    setHoldingsLoading(true);
    readHoldings(chainId, address as `0x${string}`)
      .then((h) => !cancelled && setHoldings(h))
      .catch(() => !cancelled && setHoldings([]))
      .finally(() => !cancelled && setHoldingsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, chainId]);

  // Show the current on-chain recommendation (read-back) on load + chain change.
  useEffect(() => {
    let cancelled = false;
    readLatestRecommendation(chainId)
      .then((v) => !cancelled && setLatestOnChain(v))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chainId]);

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
      // Feature 1 + 2: give the model the user's REAL holdings + risk tolerance.
      const context = {
        network: chainId === xLayer.id ? "X Layer Mainnet (196)" : "X Layer Testnet (1952)",
        riskTolerance,
        walletConnected: isConnected,
        holdings: isConnected ? holdingsSummary(holdings) : "wallet not connected",
      };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, context }),
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

  /* ------------------------------------------------- on-chain anchor (real) */

  // Anchors to the REAL deployed RWARecommendationLogger via logRecommendation(string).
  // Ensures the wallet is on X Layer FIRST (adding the network if missing), then pins
  // the transaction to that chain so it can never be sent on Ethereum by mistake.
  async function doAnchor(payload: AnchorPayload, label: string) {
    setError(null);
    setStatus(null);
    setTxHash(null);
    if (!isConnected) {
      setError("Connect your OKX wallet first (top-right), then anchor.");
      setPage(3);
      return;
    }
    const addr = loggerAddress(ANCHOR_CHAIN.id);
    if (!addr) {
      setError("On-chain logger address isn't configured. Contact the app owner.");
      setPage(3);
      return;
    }
    try {
      // 1) Make sure the wallet is on X Layer. If the wallet doesn't have the
      //    network yet, wagmi falls back to wallet_addEthereumChain using the
      //    chain definition in chains.ts (RPC, OKB, OKLink explorer).
      if (chainId !== ANCHOR_CHAIN.id) {
        setStatus(`Switching your wallet to ${ANCHOR_CHAIN.name}…`);
        await switchChainAsync({ chainId: ANCHOR_CHAIN.id });
      }

      // 2) Anchor on-chain. chainId is PINNED so wagmi refuses to send on the
      //    wrong network — this is what stops the "sent on Ethereum" bug.
      const recString = buildRecommendationString(payload);
      setStatus(`Confirm in your wallet to anchor ${label} on ${ANCHOR_CHAIN.name}…`);
      const hash = await writeContractAsync({
        chainId: ANCHOR_CHAIN.id,
        address: addr,
        abi: LOGGER_ABI,
        functionName: "logRecommendation",
        args: [recString],
      });

      // 3) Success — surface the tx hash + a clickable OKLink explorer link.
      setTxHash(hash);
      setStatus(`✅ Anchored ${label} on ${ANCHOR_CHAIN.name}.`);
      setPage(3); // Wallet tab shows the tx link + reads the value back on-chain
      readLatestRecommendation(ANCHOR_CHAIN.id).then(setLatestOnChain).catch(() => {});
    } catch (e) {
      setError(anchorErrorMessage(e));
      setPage(3);
    }
  }

  function anchorAnalysis() {
    if (!analysis) return;
    const assets = analysis.assets_analyzed;
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
    doAnchor(
      {
        summary: analysis.summary,
        symbols: assets.map((a) => a.symbol),
        riskScore: avg(assets.map((a) => a.risk_score)),
        confidence: avg(assets.map((a) => a.confidence)),
        recommendation: recoLabel(assets[0]?.recommendation ?? "hold"),
      },
      "this analysis",
    );
  }

  function anchorAsset(a: AssetAnalysis) {
    doAnchor(
      {
        summary: analysis?.summary ?? `${a.symbol} analysis`,
        symbols: [a.symbol],
        riskScore: a.risk_score,
        confidence: a.confidence,
        recommendation: recoLabel(a.recommendation),
      },
      a.symbol,
    );
  }

  /* ----------------------------------------------------- OKX DEX execution */

  function openDeepLink(action: SuggestedAction) {
    window.open(buildOkxDexSwapUrl(action, chainId || xLayer.id), "_blank", "noopener");
  }

  function swapSymbol(a: AssetAnalysis) {
    window.open(buildSwapUrlForSymbol(a.symbol, chainId || xLayer.id), "_blank", "noopener");
  }

  async function execute(action: SuggestedAction) {
    setError(null);
    setStatus(null);
    // Try the OKX DEX Aggregator API for a prepared, user-signed transaction;
    // fall back to the deep link whenever tokens aren't verified/executable or
    // the API isn't configured (server responds with { fallback: true }).
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
      openDeepLink(action);
      setError(e instanceof Error ? `${e.message} — opened OKX DEX as fallback.` : "Opened OKX DEX as fallback.");
    }
  }

  const explorer =
    chainId === xLayer.id ? xLayer.blockExplorers.default.url : xLayerTestnet.blockExplorers.default.url;

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

                {/* Feature 2: risk tolerance drives position sizing. */}
                <div className="mt-3">
                  <div className="text-xs uppercase text-muted">Risk tolerance</div>
                  <div className="mt-1 inline-flex rounded-lg border border-border bg-bg p-0.5">
                    {RISK_OPTIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setRiskTolerance(r)}
                        className={`rounded-md px-3 py-1 text-xs capitalize ${
                          riskTolerance === r ? "bg-accent text-white" : "text-muted hover:text-white"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    onClick={runAnalysis}
                    disabled={loading || !prompt.trim()}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? "Analyzing…" : "Analyze"}
                  </button>
                  {isConnected ? (
                    <span className="text-xs text-muted">
                      Using your holdings: <span className="text-white">{holdingsLoading ? "reading…" : holdingsSummary(holdings)}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted">Connect a wallet to personalize with your real holdings.</span>
                  )}
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase text-muted">Summary</div>
                    <button
                      onClick={anchorAnalysis}
                      className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    >
                      ⚓ Anchor on X Layer
                    </button>
                  </div>
                  <p className="mt-2 text-sm">{analysis.summary}</p>
                </div>

                {/* Feature 4: side-by-side comparison when >1 asset. */}
                {analysis.assets_analyzed.length > 1 && (
                  <div className="rounded-xl border border-border bg-panel p-4">
                    <div className="text-xs uppercase text-muted">Comparison</div>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted">
                            <th className="py-1 pr-3">Asset</th>
                            <th className="py-1 pr-3">Call</th>
                            <th className="py-1 pr-3">Conf.</th>
                            <th className="py-1 pr-3">Risk</th>
                            <th className="py-1 pr-3">Liq.</th>
                            <th className="py-1 pr-3">Yield</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.assets_analyzed.map((a) => (
                            <tr key={a.symbol} className="border-t border-border">
                              <td className="py-1.5 pr-3 font-medium">{a.symbol}</td>
                              <td className="py-1.5 pr-3">{recoLabel(a.recommendation)}</td>
                              <td className="py-1.5 pr-3">{conf10(a.confidence)}/10</td>
                              <td className={`py-1.5 pr-3 ${scoreColor(a.risk_score, true)}`}>{a.risk_score}</td>
                              <td className={`py-1.5 pr-3 ${scoreColor(a.liquidity_score)}`}>{a.liquidity_score}</td>
                              <td className={`py-1.5 pr-3 ${scoreColor(a.yield_potential)}`}>{a.yield_potential}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {analysis.assets_analyzed.map((a) => (
                    <AssetCard key={a.symbol} a={a} onAnchor={anchorAsset} onSwap={swapSymbol} />
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
                            Swap on OKX DEX
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

              {/* Feature 1: real balances read from the free RPC. */}
              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="text-xs uppercase text-muted">Holdings</div>
                {!isConnected ? (
                  <p className="mt-2 text-sm text-muted">Connect your wallet to read balances from X Layer.</p>
                ) : holdingsLoading ? (
                  <p className="mt-2 text-sm text-muted">Reading balances…</p>
                ) : holdings.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No balances found on this network.</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {holdings.map((h) => (
                      <div key={h.symbol} className="flex justify-between text-sm">
                        <span className="text-muted">{h.symbol}{h.isNative ? " (native)" : ""}</span>
                        <span className="font-mono">{Number(h.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                      </div>
                    ))}
                    <p className="pt-1 text-xs text-muted">Tokenized-stock balances appear here once their X Layer addresses are verified in the token registry.</p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="text-xs uppercase text-muted">On-chain logger</div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Contract</span>
                    <span className={loggerAddress(chainId) ? "font-mono text-xs text-good break-all" : "text-warn"}>
                      {loggerAddress(chainId) ?? "not available on this chain"}
                    </span>
                  </div>
                  {txHash && (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">Last anchor tx</span>
                      <a href={explorerTxUrl(ANCHOR_CHAIN.id, txHash)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-accent hover:underline break-all">
                        {txHash.slice(0, 10)}… ↗
                      </a>
                    </div>
                  )}
                  {latestOnChain && (
                    <div className="pt-1">
                      <div className="text-muted">Latest recommendation on-chain</div>
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-bg p-2 text-xs text-muted">{latestOnChain}</pre>
                    </div>
                  )}
                  <a href={explorer} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 text-xs text-accent hover:underline">
                    Open OKLink explorer ↗
                  </a>
                </div>
                <p className="mt-3 text-xs text-muted">
                  “Anchor on X Layer” calls <span className="text-white">logRecommendation(string)</span> on the real
                  RWARecommendationLogger contract, storing the analysis (summary, symbols, risk, confidence,
                  recommendation) so anyone can read it back on-chain. No funds are ever held.
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
