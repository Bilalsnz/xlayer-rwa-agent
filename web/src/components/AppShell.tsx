"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useWriteContract,
  useSendTransaction,
} from "wagmi";

import type {
  AssetAnalysis,
  RWAAnalysis,
  SuggestedAction,
} from "@/lib/schema";

import {
  LOGGER_ABI,
  loggerAddress,
  buildRecommendationString,
  readLatestRecommendation,
  explorerTxUrl,
  type AnchorPayload,
} from "@/lib/logger";

import {
  readHoldings,
  holdingsSummary,
  type Holding,
} from "@/lib/holdings";

import {
  buildOkxDexSwapUrl,
  buildSwapUrlForSymbol,
  actionLabel,
} from "@/lib/okxDex";

import { xLayer, xLayerTestnet } from "@/lib/chains";
import { BottomNav, type NavPage } from "@/components/BottomNav";

const RECO_LABEL: Record<string, string> = {
  buy: "Buy",
  hold: "Hold",
  sell: "Reduce",
  avoid: "Avoid",
};

const recoLabel = (r: string) => RECO_LABEL[r] ?? r;

const conf10 = (c: number) =>
  c > 0 ? Math.max(1, Math.round(c / 10)) : 0;

type RiskTolerance =
  | "conservative"
  | "moderate"
  | "aggressive";

function scoreColor(v: number, invert = false) {
  const good = invert ? v <= 33 : v >= 66;
  const bad = invert ? v >= 66 : v <= 33;

  return good
    ? "text-good"
    : bad
      ? "text-bad"
      : "text-warn";
}

function scoreBarClass(v: number, invert = false) {
  const good = invert ? v <= 33 : v >= 66;
  const bad = invert ? v >= 66 : v <= 33;

  return good
    ? "bg-good"
    : bad
      ? "bg-bad"
      : "bg-warn";
}

function Meter({
  label,
  value,
  invert,
}: {
  label: string;
  value: number;
  invert?: boolean;
}) {
  const safeValue = Math.max(
    0,
    Math.min(100, Number.isFinite(value) ? value : 0),
  );

  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted">{label}</span>

        <span
          className={`font-semibold ${scoreColor(
            safeValue,
            invert,
          )}`}
        >
          {Math.round(safeValue)}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel2">
        <div
          className={`h-full rounded-full transition-all ${scoreBarClass(
            safeValue,
            invert,
          )}`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function AnchorBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-[10px] font-medium text-accent">
      <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_currentColor]" />
      X Layer Testnet
    </div>
  );
}

function RecommendationBadge({
  recommendation,
}: {
  recommendation: string;
}) {
  const r = recommendation.toLowerCase();

  const classes =
    r === "buy"
      ? "border-good/30 bg-good/10 text-good"
      : r === "sell" || r === "avoid"
        ? "border-bad/30 bg-bad/10 text-bad"
        : "border-warn/30 bg-warn/10 text-warn";

  return (
    <span
      className={`rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${classes}`}
    >
      {recoLabel(recommendation)}
    </span>
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
    <div className="group rounded-2xl border border-border bg-panel p-4 transition hover:border-accent/30 hover:shadow-[0_0_30px_rgba(59,158,255,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tracking-tight">
            {a.symbol}
          </div>

          <div className="mt-0.5 text-xs text-muted">
            {a.name}
          </div>
        </div>

        <RecommendationBadge
          recommendation={a.recommendation}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        <Meter
          label="Risk"
          value={a.risk_score}
          invert
        />

        <Meter
          label="Liquidity"
          value={a.liquidity_score}
        />

        <Meter
          label="Yield"
          value={a.yield_potential}
        />

        <Meter
          label="Sentiment"
          value={(a.sentiment_score + 100) / 2}
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Opportunity
          </div>

          <ul className="space-y-1.5 text-xs leading-5 text-good/90">
            {a.key_opportunities.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-good">+</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Risk factors
          </div>

          <ul className="space-y-1.5 text-xs leading-5 text-bad/90">
            {a.key_risks.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-bad">!</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          onClick={() => onSwap(a)}
          className="rounded-lg bg-good px-3 py-2 text-xs font-semibold text-black transition hover:opacity-90"
        >
          Trade on OKX
        </button>

        <button
          onClick={() => onAnchor(a)}
          className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition hover:border-accent hover:bg-accent/20"
        >
          ⚓ Anchor
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  onGoAnalyze,
}: {
  onGoAnalyze: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-panel/60 p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-xl text-accent">
        ◈
      </div>

      <div className="mt-4 text-sm font-semibold">
        No analysis yet
      </div>

      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
        Ask X-RWA Agent about a tokenized equity,
        ETF, T-bill or portfolio allocation.
      </p>

      <button
        onClick={onGoAnalyze}
        className="mt-5 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90"
      >
        Start analysis →
      </button>
    </div>
  );
}

const EXAMPLE_PROMPTS = [
  "Analyze TSLAx and AAPLx for a 6-month hold.",
  "Compare TSLAx vs a tokenized T-bill for low risk.",
  "Is NVDAx a buy right now?",
];

const RISK_OPTIONS: RiskTolerance[] = [
  "conservative",
  "moderate",
  "aggressive",
];

export function AppShell() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [prompt, setPrompt] = useState(
    "Analyze TSLAx and AAPLx for a 6-month hold.",
  );

  const [riskTolerance, setRiskTolerance] =
    useState<RiskTolerance>("moderate");

  const [analysis, setAnalysis] =
    useState<RWAAnalysis | null>(null);

  const [rawJson, setRawJson] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [status, setStatus] =
    useState<string | null>(null);

  const [holdings, setHoldings] =
    useState<Holding[]>([]);

  const [holdingsLoading, setHoldingsLoading] =
    useState(false);

  const [txHash, setTxHash] =
    useState<string | null>(null);

  const [latestOnChain, setLatestOnChain] =
    useState<string>("");

  const [page, setPage] = useState(0);

  const touchStart = useRef<{
    x: number;
    y: number;
  } | null>(null);

  const PAGES: NavPage[] = [
    { id: 0, label: "Analyze" },
    {
      id: 1,
      label: "Results",
      hasData: !!analysis,
    },
    {
      id: 2,
      label: "Actions",
      hasData: !!analysis,
    },
    {
      id: 3,
      label: "Wallet",
    },
  ];

  function goto(id: number) {
    setPage(
      Math.max(
        0,
        Math.min(PAGES.length - 1, id),
      ),
    );
  }

  useEffect(() => {
    if (!isConnected || !address) {
      setHoldings([]);
      return;
    }

    let cancelled = false;

    setHoldingsLoading(true);

    readHoldings(
      chainId,
      address as `0x${string}`,
    )
      .then((h) => {
        if (!cancelled) setHoldings(h);
      })
      .catch(() => {
        if (!cancelled) setHoldings([]);
      })
      .finally(() => {
        if (!cancelled) {
          setHoldingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isConnected, address, chainId]);

  useEffect(() => {
    let cancelled = false;

    readLatestRecommendation(chainId)
      .then((v) => {
        if (!cancelled) setLatestOnChain(v);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [chainId]);

  function onTouchStart(
    e: React.TouchEvent,
  ) {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }

  function onTouchEnd(
    e: React.TouchEvent,
  ) {
    const s = touchStart.current;

    touchStart.current = null;

    if (!s) return;

    const dx =
      e.changedTouches[0].clientX - s.x;

    const dy =
      e.changedTouches[0].clientY - s.y;

    if (
      Math.abs(dx) > 60 &&
      Math.abs(dx) > Math.abs(dy) * 1.5
    ) {
      goto(page + (dx < 0 ? 1 : -1));
    }
  }

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const context = {
        network:
          chainId === xLayer.id
            ? "X Layer Mainnet (196)"
            : "X Layer Testnet (1952)",

        riskTolerance,

        walletConnected: isConnected,

        holdings: isConnected
          ? holdingsSummary(holdings)
          : "wallet not connected",
      };

      const res = await fetch(
        "/api/analyze",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            prompt,
            context,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ?? "Request failed",
        );
      }

      setAnalysis(data.analysis);

      setRawJson(
        JSON.stringify(
          data.analysis,
          null,
          2,
        ),
      );

      setPage(1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed",
      );
    } finally {
      setLoading(false);
    }
  }

  async function doAnchor(
    payload: AnchorPayload,
    label: string,
  ) {
    setError(null);
    setStatus(null);
    setTxHash(null);

    if (!isConnected) {
      setError(
        "Connect your OKX wallet first, then try Anchor.",
      );

      setPage(3);
      return;
    }

    const addr = loggerAddress(1952);

    if (!addr) {
      setError(
        "Contract address not found.",
      );

      setPage(3);
      return;
    }

    const X_LAYER_TESTNET_PARAMS = {
      chainId: "0x7a0",

      chainName: "X Layer Testnet",

      nativeCurrency: {
        name: "OKB",
        symbol: "OKB",
        decimals: 18,
      },

      rpcUrls: [
        "https://testrpc.xlayer.tech/terigon",
        "https://xlayertestrpc.okx.com/terigon",
      ],

      blockExplorerUrls: [
        "https://www.oklink.com/x-layer-testnet",
      ],
    };

    try {
      setStatus(
        "Switching to X Layer Testnet...",
      );

      const provider =
        (window as any).okxwallet ||
        (window as any).ethereum;

      if (provider) {
        try {
          await provider.request({
            method:
              "wallet_switchEthereumChain",

            params: [
              {
                chainId: "0x7a0",
              },
            ],
          });
        } catch (switchError: any) {
          if (
            switchError?.code === 4902
          ) {
            await provider.request({
              method:
                "wallet_addEthereumChain",

              params: [
                X_LAYER_TESTNET_PARAMS,
              ],
            });
          }
        }

        await new Promise((r) =>
          setTimeout(r, 1200),
        );
      }
    } catch (e) {
      console.warn(
        "Switch failed",
        e,
      );
    }

    try {
      setStatus(
        "Confirm the transaction in your wallet...",
      );

      const recString =
        buildRecommendationString(
          payload,
        );

      const hash =
        await writeContractAsync({
          address: addr,
          abi: LOGGER_ABI,
          functionName:
            "logRecommendation",
          args: [recString],
        });

      setTxHash(hash);

      setStatus(
        "Successfully anchored on X Layer Testnet!",
      );

      setPage(3);

      return;
    } catch (e: any) {
      console.warn(
        "Real tx failed, falling to demo",
        e,
      );
    }

    setStatus(
      `Demo Mode — Analysis would be anchored on X Layer Testnet

Contract: ${addr}

Real on-chain anchoring is ready. Currently limited by OKX Wallet mobile network handling.`,
    );

    setPage(3);
  }

  function anchorAnalysis() {
    if (!analysis) return;

    const assets =
      analysis.assets_analyzed;

    const avg = (xs: number[]) =>
      xs.length
        ? Math.round(
            xs.reduce(
              (s, x) => s + x,
              0,
            ) / xs.length,
          )
        : 0;

    doAnchor(
      {
        summary: analysis.summary,

        symbols: assets.map(
          (a) => a.symbol,
        ),

        riskScore: avg(
          assets.map(
            (a) => a.risk_score,
          ),
        ),

        confidence: avg(
          assets.map(
            (a) => a.confidence,
          ),
        ),

        recommendation: recoLabel(
          assets[0]
            ?.recommendation ??
            "hold",
        ),
      },
      "this analysis",
    );
  }

  function anchorAsset(
    a: AssetAnalysis,
  ) {
    doAnchor(
      {
        summary:
          analysis?.summary ??
          `${a.symbol} analysis`,

        symbols: [a.symbol],

        riskScore: a.risk_score,

        confidence: a.confidence,

        recommendation: recoLabel(
          a.recommendation,
        ),
      },
      a.symbol,
    );
  }

  function openDeepLink(
    action: SuggestedAction,
  ) {
    window.open(
      buildOkxDexSwapUrl(
        action,
        chainId || xLayer.id,
      ),
      "_blank",
      "noopener",
    );
  }

  function swapSymbol(
    a: AssetAnalysis,
  ) {
    window.open(
      buildSwapUrlForSymbol(
        a.symbol,
        chainId || xLayer.id,
      ),
      "_blank",
      "noopener",
    );
  }

  async function execute(
    action: SuggestedAction,
  ) {
    setError(null);
    setStatus(null);

    if (!address) {
      openDeepLink(action);
      return;
    }

    try {
      const res = await fetch(
        "/api/okx",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            action: "swap",

            chainId:
              chainId || xLayer.id,

            fromSymbol:
              action.from_token,

            toSymbol:
              action.to_token,

            amountUsd:
              action.amount_usd,

            slippage: "0.01",

            userWalletAddress:
              address,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        if (data.fallback) {
          openDeepLink(action);
          return;
        }

        throw new Error(
          data.error ??
            "OKX request failed",
        );
      }

      if (data.approveTx) {
        setStatus(
          "Confirm the token approval in your wallet…",
        );

        await sendTransactionAsync({
          to: data.approveTx.to,
          data: data.approveTx.data,
        });
      }

      setStatus(
        "Confirm the swap in your wallet…",
      );

      const hash =
        await sendTransactionAsync({
          to: data.tx.to,
          data: data.tx.data,

          value: data.tx.value
            ? BigInt(data.tx.value)
            : undefined,
        });

      setStatus(
        `Swap submitted to OKX DEX. Tx: ${hash}`,
      );
    } catch (e) {
      openDeepLink(action);

      setError(
        e instanceof Error
          ? `${e.message} — opened OKX DEX as fallback.`
          : "Opened OKX DEX as fallback.",
      );
    }
  }

  const explorer =
    chainId === xLayer.id
      ? xLayer.blockExplorers.default.url
      : xLayerTestnet.blockExplorers
          .default.url;

  const averageConfidence =
    analysis?.assets_analyzed.length
      ? Math.round(
          analysis.assets_analyzed.reduce(
            (sum, a) =>
              sum + a.confidence,
            0,
          ) /
            analysis.assets_analyzed
              .length,
        )
      : 0;

  const averageRisk =
    analysis?.assets_analyzed.length
      ? Math.round(
          analysis.assets_analyzed.reduce(
            (sum, a) =>
              sum + a.risk_score,
            0,
          ) /
            analysis.assets_analyzed
              .length,
        )
      : 0;

  return (
    <>
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="pb-4"
      >
        {error && (
          <div className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-xs leading-5 text-bad break-all">
            {error}
          </div>
        )}

        {status && (
          <div className="mb-4 rounded-xl border border-good/40 bg-good/10 p-4 text-xs leading-5 text-good break-all whitespace-pre-line">
            {status}
          </div>
        )}

        <div
          key={page}
          className="page-enter space-y-5"
        >
          {/* =====================================================
              ANALYZE
          ====================================================== */}

          {page === 0 && (
            <div className="space-y-5">
              <div className="relative overflow-hidden rounded-3xl border border-accent/20 bg-panel p-5 shadow-[0_0_45px_rgba(59,158,255,0.08)]">
                <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />

                <div className="pointer-events-none absolute -bottom-24 -left-20 h-40 w-40 rounded-full bg-purple-500/10 blur-3xl" />

                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-good shadow-[0_0_10px_currentColor]" />

                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-good">
                          AI RWA Analyst
                        </span>
                      </div>

                      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
                        X-RWA Agent
                      </h1>

                      <p className="mt-1 max-w-md text-sm leading-6 text-muted">
                        Analyze tokenized equities,
                        ETFs and real-world assets
                        with structured AI
                        intelligence on X Layer.
                      </p>
                    </div>

                    <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-xl text-accent shadow-[0_0_25px_rgba(59,158,255,0.12)] sm:flex">
                      ◈
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {[
                      "Tokenized Equities",
                      "ETFs",
                      "T-Bills",
                      "X Layer",
                    ].map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border bg-bg/60 px-3 py-1.5 text-[10px] text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-panel p-4 shadow-[0_0_30px_rgba(59,158,255,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                      Ask the analyst
                    </div>

                    <div className="mt-1 text-sm">
                      What should X-RWA Agent analyze?
                    </div>
                  </div>

                  <div className="rounded-lg border border-good/20 bg-good/5 px-2 py-1 text-[9px] font-semibold text-good">
                    AI READY
                  </div>
                </div>

                <textarea
                  value={prompt}
                  onChange={(e) =>
                    setPrompt(e.target.value)
                  }
                  rows={4}
                  className="mt-4 w-full resize-none rounded-xl border border-border bg-bg p-4 text-sm leading-6 outline-none transition placeholder:text-muted/60 focus:border-accent/60 focus:ring-1 focus:ring-accent/20"
                  placeholder="Ask about tokenized RWAs..."
                />

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Risk tolerance
                      </div>

                      <div className="mt-1 text-[11px] text-muted">
                        Adjust how aggressively the
                        analyst evaluates opportunities.
                      </div>
                    </div>

                    <span className="hidden text-xs capitalize text-accent sm:block">
                      {riskTolerance}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {RISK_OPTIONS.map((r) => {
                      const active =
                        riskTolerance === r;

                      return (
                        <button
                          key={r}
                          onClick={() =>
                            setRiskTolerance(r)
                          }
                          className={`rounded-xl border px-3 py-2.5 text-xs font-medium capitalize transition ${
                            active
                              ? "border-accent/60 bg-accent/15 text-accent shadow-[0_0_18px_rgba(59,158,255,0.08)]"
                              : "border-border bg-bg text-muted hover:text-white"
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    onClick={runAnalysis}
                    disabled={
                      loading ||
                      !prompt.trim()
                    }
                    className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-[0_0_25px_rgba(59,158,255,0.2)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Analyzing RWA data…
                      </span>
                    ) : (
                      "Analyze →"
                    )}
                  </button>

                  {isConnected ? (
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-good" />
                      Wallet connected
                      <span className="text-white">
                        ·{" "}
                        {holdingsLoading
                          ? "Reading holdings…"
                          : holdingsSummary(
                              holdings,
                            )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                      Connect wallet for personalized
                      analysis
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      Quick analysis
                    </div>

                    <div className="mt-1 text-xs text-muted">
                      Start with a predefined RWA
                      research question.
                    </div>
                  </div>

                  <span className="text-[10px] text-muted">
                    3 examples
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {EXAMPLE_PROMPTS.map(
                    (ex, index) => (
                      <button
                        key={ex}
                        onClick={() =>
                          setPrompt(ex)
                        }
                        className="group flex w-full items-center gap-3 rounded-xl border border-border bg-bg p-3 text-left transition hover:border-accent/30 hover:bg-accent/5"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-panel2 text-[10px] font-semibold text-accent">
                          0{index + 1}
                        </span>

                        <span className="flex-1 text-xs leading-5 text-muted group-hover:text-white">
                          {ex}
                        </span>

                        <span className="text-muted group-hover:text-accent">
                          →
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["01", "Structured analysis"],
                  ["02", "Risk scoring"],
                  ["03", "Portfolio context"],
                  ["04", "On-chain actions"],
                ].map(([num, label]) => (
                  <div
                    key={num}
                    className="rounded-xl border border-border bg-panel/70 p-3"
                  >
                    <div className="text-[10px] font-semibold text-accent">
                      {num}
                    </div>

                    <div className="mt-1 text-[11px] text-muted">
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-1 text-center text-[10px] leading-5 text-muted">
                X-RWA Agent provides analytical
                information only. Not financial advice.
              </div>
            </div>
          )}

          {/* =====================================================
              RESULTS
          ====================================================== */}

          {page === 1 &&
            (analysis ? (
              <div className="space-y-5">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                      AI intelligence
                    </div>

                    <h2 className="mt-1 text-xl font-semibold">
                      Analysis results
                    </h2>
                  </div>

                  <AnchorBadge />
                </div>

                <div className="relative overflow-hidden rounded-3xl border border-accent/20 bg-panel p-5 shadow-[0_0_40px_rgba(59,158,255,0.07)]">
                  <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />

                  <div className="relative">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                          AI verdict
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-2xl font-semibold">
                            {recoLabel(
                              analysis
                                .assets_analyzed[0]
                                ?.recommendation ??
                                "hold",
                            )}
                          </span>

                          <span className="rounded-lg border border-accent/20 bg-accent/10 px-2 py-1 text-[10px] text-accent">
                            {averageConfidence > 0
                              ? `${conf10(
                                  averageConfidence,
                                )}/10 confidence`
                              : "AI assessment"}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={
                          anchorAnalysis
                        }
                        className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/20"
                      >
                        ⚓ Anchor analysis
                      </button>
                    </div>

                    <p className="mt-5 max-w-3xl text-sm leading-7 text-muted">
                      {analysis.summary}
                    </p>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-border bg-bg/60 p-3">
                        <div className="text-[9px] uppercase tracking-wide text-muted">
                          Assets
                        </div>

                        <div className="mt-1 text-lg font-semibold">
                          {
                            analysis
                              .assets_analyzed
                              .length
                          }
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-bg/60 p-3">
                        <div className="text-[9px] uppercase tracking-wide text-muted">
                          Confidence
                        </div>

                        <div className="mt-1 text-lg font-semibold text-accent">
                          {conf10(
                            averageConfidence,
                          )}
                          /10
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-bg/60 p-3">
                        <div className="text-[9px] uppercase tracking-wide text-muted">
                          Risk
                        </div>

                        <div
                          className={`mt-1 text-lg font-semibold ${scoreColor(
                            averageRisk,
                            true,
                          )}`}
                        >
                          {averageRisk}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-bg/60 p-3">
                        <div className="text-[9px] uppercase tracking-wide text-muted">
                          Profile
                        </div>

                        <div className="mt-1 text-sm font-semibold capitalize text-white">
                          {riskTolerance}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {analysis.assets_analyzed.length >
                  1 && (
                  <div className="rounded-2xl border border-border bg-panel p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                      Asset comparison
                    </div>

                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                            <th className="py-2 pr-3">
                              Asset
                            </th>

                            <th className="py-2 pr-3">
                              Call
                            </th>

                            <th className="py-2 pr-3">
                              Confidence
                            </th>

                            <th className="py-2 pr-3">
                              Risk
                            </th>

                            <th className="py-2 pr-3">
                              Liquidity
                            </th>

                            <th className="py-2">
                              Yield
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {analysis.assets_analyzed.map(
                            (a) => (
                              <tr
                                key={a.symbol}
                                className="border-t border-border"
                              >
                                <td className="py-3 pr-3 font-semibold">
                                  {a.symbol}
                                </td>

                                <td className="py-3 pr-3">
                                  <RecommendationBadge
                                    recommendation={
                                      a.recommendation
                                    }
                                  />
                                </td>

                                <td className="py-3 pr-3">
                                  {conf10(
                                    a.confidence,
                                  )}
                                  /10
                                </td>

                                <td
                                  className={`py-3 pr-3 font-semibold ${scoreColor(
                                    a.risk_score,
                                    true,
                                  )}`}
                                >
                                  {
                                    a.risk_score
                                  }
                                </td>

                                <td
                                  className={`py-3 pr-3 font-semibold ${scoreColor(
                                    a.liquidity_score,
                                  )}`}
                                >
                                  {
                                    a.liquidity_score
                                  }
                                </td>

                                <td
                                  className={`py-3 font-semibold ${scoreColor(
                                    a.yield_potential,
                                  )}`}
                                >
                                  {
                                    a.yield_potential
                                  }
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Asset intelligence
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {analysis.assets_analyzed.map(
                      (a) => (
                        <AssetCard
                          key={a.symbol}
                          a={a}
                          onAnchor={
                            anchorAsset
                          }
                          onSwap={
                            swapSymbol
                          }
                        />
                      ),
                    )}
                  </div>
                </div>

                <details className="rounded-2xl border border-border bg-panel">
                  <summary className="cursor-pointer list-none p-4 text-xs text-muted hover:text-white">
                    <div className="flex items-center justify-between">
                      <span>
                        Developer / API data
                      </span>

                      <span className="text-[10px]">
                        JSON
                      </span>
                    </div>
                  </summary>

                  <div className="border-t border-border p-4">
                    <pre className="overflow-x-auto rounded-xl bg-bg p-3 text-[10px] leading-5 text-muted">
                      {rawJson}
                    </pre>
                  </div>
                </details>
              </div>
            ) : (
              <EmptyState
                onGoAnalyze={() =>
                  setPage(0)
                }
              />
            ))}

          {/* =====================================================
              ACTIONS
          ====================================================== */}

          {page === 2 &&
            (analysis ? (
              <div className="space-y-5">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                    Execution layer
                  </div>

                  <h2 className="mt-1 text-xl font-semibold">
                    Portfolio actions
                  </h2>

                  <p className="mt-1 text-xs text-muted">
                    Turn the analyst's assessment into
                    actionable portfolio decisions.
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-panel p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        Suggested allocation
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        AI portfolio structure
                      </div>
                    </div>

                    <span className="rounded-lg border border-accent/20 bg-accent/10 px-2 py-1 text-[10px] text-accent">
                      {riskTolerance}
                    </span>
                  </div>

                  <div className="mt-5 flex h-4 w-full overflow-hidden rounded-full bg-bg">
                    {Object.entries(
                      analysis
                        .portfolio_suggestion
                        .allocation,
                    ).map(
                      ([sym, pct], i) => (
                        <div
                          key={sym}
                          title={`${sym}: ${pct}%`}
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              [
                                "#5b8cff",
                                "#3ddc97",
                                "#ffcc66",
                                "#ff6b6b",
                                "#a78bfa",
                              ][
                                i % 5
                              ],
                          }}
                        />
                      ),
                    )}
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {Object.entries(
                      analysis
                        .portfolio_suggestion
                        .allocation,
                    ).map(
                      ([sym, pct]) => (
                        <div
                          key={sym}
                          className="flex items-center justify-between rounded-xl border border-border bg-bg p-3"
                        >
                          <span className="text-xs font-medium">
                            {sym}
                          </span>

                          <span className="text-sm font-semibold text-accent">
                            {pct}%
                          </span>
                        </div>
                      ),
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-bg p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted">
                      Analyst rationale
                    </div>

                    <p className="mt-2 text-xs leading-5 text-muted">
                      {
                        analysis
                          .portfolio_suggestion
                          .rationale
                      }
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-panel p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Suggested actions
                  </div>

                  <div className="mt-3 space-y-2">
                    {analysis.suggested_actions.map(
                      (act, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-border bg-bg p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">
                                {actionLabel(
                                  act,
                                )}
                              </div>

                              <div className="mt-1 text-xs leading-5 text-muted">
                                {
                                  act.reason
                                }
                              </div>
                            </div>

                            {act.action ===
                            "swap" ? (
                              <button
                                onClick={() =>
                                  execute(
                                    act,
                                  )
                                }
                                className="shrink-0 rounded-lg bg-good px-3 py-2 text-[10px] font-semibold text-black transition hover:opacity-90"
                              >
                                Execute
                              </button>
                            ) : (
                              <span className="shrink-0 rounded-lg border border-border px-3 py-2 text-[10px] text-muted">
                                {act.action}
                              </span>
                            )}
                          </div>

                          {act.action ===
                            "swap" && (
                            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted">
                              <span className="rounded-md bg-panel2 px-2 py-1">
                                From:{" "}
                                {act.from_token}
                              </span>

                              <span className="rounded-md bg-panel2 px-2 py-1">
                                To:{" "}
                                {act.to_token}
                              </span>

                              <span className="rounded-md bg-panel2 px-2 py-1">
                                ${act.amount_usd}
                              </span>
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-accent">
                    <span>◈</span>
                    On-chain intelligence
                  </div>

                  <p className="mt-2 text-[11px] leading-5 text-muted">
                    Analysis can be anchored to X Layer
                    Testnet as verifiable recommendation
                    data.
                  </p>

                  <button
                    onClick={anchorAnalysis}
                    className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[10px] font-semibold text-accent hover:bg-accent/20"
                  >
                    ⚓ Anchor this analysis
                  </button>
                </div>

                <p className="text-center text-[10px] leading-5 text-muted">
                  {analysis.disclaimer}
                </p>
              </div>
            ) : (
              <EmptyState
                onGoAnalyze={() =>
                  setPage(0)
                }
              />
            ))}

          {/* =====================================================
              WALLET
          ====================================================== */}

          {page === 3 && (
            <div className="space-y-5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Portfolio intelligence
                </div>

                <h2 className="mt-1 text-xl font-semibold">
                  Wallet
                </h2>

                <p className="mt-1 text-xs text-muted">
                  Your wallet context powers personalized
                  RWA analysis and execution.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted">
                      Wallet status
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isConnected
                            ? "bg-good shadow-[0_0_8px_currentColor]"
                            : "bg-warn"
                        }`}
                      />

                      <span className="text-sm font-semibold">
                        {isConnected
                          ? "Connected"
                          : "Not connected"}
                      </span>
                    </div>
                  </div>

                  {isConnected && (
                    <span className="rounded-lg border border-good/20 bg-good/5 px-2 py-1 text-[9px] text-good">
                      ACTIVE
                    </span>
                  )}
                </div>

                {isConnected ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-border bg-bg p-3">
                      <div className="text-[9px] uppercase tracking-wide text-muted">
                        Address
                      </div>

                      <div className="mt-1 break-all font-mono text-[10px] text-white">
                        {address}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-border bg-bg p-3">
                        <div className="text-[9px] uppercase tracking-wide text-muted">
                          Network
                        </div>

                        <div className="mt-1 text-xs font-medium text-accent">
                          {chainId ===
                          xLayer.id
                            ? "X Layer Mainnet"
                            : chainId ===
                                xLayerTestnet.id
                              ? "X Layer Testnet"
                              : `Unsupported (${chainId})`}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-bg p-3">
                        <div className="text-[9px] uppercase tracking-wide text-muted">
                          Chain ID
                        </div>

                        <div className="mt-1 font-mono text-xs">
                          {chainId}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-warn/20 bg-warn/5 p-3 text-xs leading-5 text-muted">
                    Connect your OKX Wallet from the
                    header to personalize analysis with
                    your real holdings.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted">
                      Holdings
                    </div>

                    <div className="mt-1 text-sm font-medium">
                      On-chain assets
                    </div>
                  </div>

                  {isConnected && (
                    <span className="text-[10px] text-muted">
                      {holdings.length} assets
                    </span>
                  )}
                </div>

                {!isConnected ? (
                  <p className="mt-4 text-xs leading-5 text-muted">
                    Connect your wallet to read balances
                    from X Layer.
                  </p>
                ) : holdingsLoading ? (
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted">
                    <span className="h-3 w-3 animate-spin rounded-full border border-muted/30 border-t-accent" />
                    Reading balances…
                  </div>
                ) : holdings.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center">
                    <div className="text-xs font-medium">
                      No balances found
                    </div>

                    <div className="mt-1 text-[10px] text-muted">
                      No supported assets were detected on
                      this network.
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {holdings.map((h) => (
                      <div
                        key={h.symbol}
                        className="flex items-center justify-between rounded-xl border border-border bg-bg p-3"
                      >
                        <div>
                          <div className="text-xs font-semibold">
                            {h.symbol}
                          </div>

                          {h.isNative && (
                            <div className="mt-0.5 text-[9px] text-muted">
                              Native asset
                            </div>
                          )}
                        </div>

                        <div className="font-mono text-xs">
                          {Number(
                            h.balance,
                          ).toLocaleString(
                            undefined,
                            {
                              maximumFractionDigits: 6,
                            },
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 shadow-[0_0_28px_rgba(59,158,255,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-muted">
                      On-chain proof
                    </div>

                    <div className="mt-1 text-sm font-semibold">
                      Recommendation registry
                    </div>
                  </div>

                  <AnchorBadge />
                </div>

                <div className="mt-5 space-y-3 text-xs">
                  <div className="rounded-xl border border-border bg-bg p-3">
                    <div className="text-[9px] uppercase tracking-wide text-muted">
                      Contract
                    </div>

                    <div
                      className={`mt-1 break-all font-mono text-[10px] ${
                        loggerAddress(
                          chainId,
                        )
                          ? "text-good"
                          : "text-warn"
                      }`}
                    >
                      {loggerAddress(
                        chainId,
                      ) ??
                        "Not available on this chain"}
                    </div>
                  </div>

                  {txHash && (
                    <div className="rounded-xl border border-good/30 bg-good/5 p-4">
                      <div className="flex items-center gap-2 text-good">
                        <span>✓</span>

                        <span className="font-semibold">
                          Analysis anchored
                        </span>
                      </div>

                      <div className="mt-2 text-[10px] text-muted">
                        Transaction confirmed
                      </div>

                      <a
                        href={explorerTxUrl(
                          1952,
                          txHash,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block break-all font-mono text-[10px] text-accent hover:underline"
                      >
                        {txHash}
                      </a>

                      <a
                        href={explorerTxUrl(
                          1952,
                          txHash,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block rounded-lg bg-good px-3 py-2 text-[10px] font-semibold text-black hover:opacity-90"
                      >
                        View transaction ↗
                      </a>
                    </div>
                  )}

                  {latestOnChain && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted">
                        Latest recommendation
                      </div>

                      <pre className="mt-2 overflow-x-auto rounded-xl bg-bg p-3 text-[10px] leading-5 text-muted">
                        {latestOnChain}
                      </pre>
                    </div>
                  )}

                  <a
                    href={explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[10px] text-accent hover:underline"
                  >
                    Open OKLink explorer ↗
                  </a>
                </div>

                <p className="mt-4 text-[10px] leading-5 text-muted">
                  “Anchor” records the AI recommendation
                  through{" "}
                  <span className="text-white">
                    logRecommendation(string)
                  </span>{" "}
                  on X Layer Testnet.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomNav
        pages={PAGES}
        active={page}
        onSelect={goto}
      />
    </>
  );
}