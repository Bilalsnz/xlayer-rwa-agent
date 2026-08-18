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

type RiskTolerance = "conservative" | "moderate" | "aggressive";

function scoreColor(v: number, invert = false) {
  const good = invert ? v <= 33 : v >= 66;
  const bad = invert ? v >= 66 : v <= 33;

  return good
    ? "text-good"
    : bad
      ? "text-bad"
      : "text-warn";
}

function meterBar(v: number, invert = false) {
  const clamped = Math.max(0, Math.min(100, v));

  if (invert) {
    if (clamped >= 66) return "bg-bad";
    if (clamped <= 33) return "bg-good";
    return "bg-warn";
  }

  if (clamped >= 66) return "bg-good";
  if (clamped <= 33) return "bg-bad";
  return "bg-warn";
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
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className="rounded-lg border border-border bg-panel2/60 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={`font-semibold ${scoreColor(value, invert)}`}>
          {Math.round(value)}
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg">
        <div
          className={`h-full rounded-full transition-all ${meterBar(
            value,
            invert,
          )}`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function TrustStrip() {
  return (
    <div className="rounded-xl border border-border bg-panel/80 p-3 shadow-[0_0_30px_rgba(59,158,255,0.05)]">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-sm text-good">✓</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">
            Analysis
          </div>
        </div>

        <div>
          <div className="text-sm text-good">✓</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">
            Risk scored
          </div>
        </div>

        <div>
          <div className="text-sm text-good">✓</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">
            On-chain proof
          </div>
        </div>
      </div>
    </div>
  );
}

function NetworkProof() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-full border border-good/20 bg-good/5 px-3 py-1.5 text-[10px] uppercase tracking-wide text-good">
      <span className="h-1.5 w-1.5 rounded-full bg-good shadow-[0_0_8px_currentColor]" />
      Live on X Layer Testnet
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
  const recommendation = recoLabel(a.recommendation);

  return (
    <div className="group rounded-xl border border-border bg-panel p-4 shadow-[0_0_25px_rgba(59,158,255,0.035)] transition-all hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold tracking-tight">{a.symbol}</div>
          <div className="text-xs text-muted">{a.name}</div>
        </div>

        <span className="rounded-md border border-accent/20 bg-accent/5 px-2 py-1 text-xs font-medium text-accent">
          {recommendation} · {conf10(a.confidence)}/10
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Meter label="Risk" value={a.risk_score} invert />
        <Meter label="Liquidity" value={a.liquidity_score} />
        <Meter label="Yield" value={a.yield_potential} />
        <Meter
          label="Sentiment"
          value={(a.sentiment_score + 100) / 2}
        />
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-lg border border-good/10 bg-good/5 p-3">
          <div className="font-medium text-good">
            Why this stands out
          </div>

          <ul className="mt-2 list-disc space-y-1 pl-4 text-good/90">
            {a.key_opportunities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-bad/10 bg-bad/5 p-3">
          <div className="font-medium text-bad">
            Risk notes
          </div>

          <ul className="mt-2 list-disc space-y-1 pl-4 text-bad/90">
            {a.key_risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => onAnchor(a)}
          className="rounded-lg border border-accent/50 bg-accent px-3 py-2 text-xs font-semibold text-white shadow-[0_0_18px_rgba(59,158,255,0.22)] transition hover:brightness-110"
        >
          ⚓ Anchor on X Layer
        </button>

        <button
          onClick={() => onSwap(a)}
          className="rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-xs font-medium text-good transition hover:bg-good/20"
        >
          Swap on OKX DEX
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
    <div className="rounded-xl border border-dashed border-border bg-panel/50 p-8 text-center">
      <p className="text-sm text-muted">No analysis yet.</p>

      <button
        onClick={onGoAnalyze}
        className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-[0_0_18px_rgba(59,158,255,0.2)] hover:opacity-90"
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
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);

  const [txHash, setTxHash] = useState<string | null>(null);
  const [latestOnChain, setLatestOnChain] =
    useState<string>("");

  const [page, setPage] = useState(0);

  const touchStart = useRef<{
    x: number;
    y: number;
  } | null>(null);

  const PAGES: NavPage[] = [
    { id: 0, label: "Analyze" },
    { id: 1, label: "Results", hasData: !!analysis },
    { id: 2, label: "Actions", hasData: !!analysis },
    { id: 3, label: "Wallet" },
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
        if (!cancelled) setHoldingsLoading(false);
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

  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }

  function onTouchEnd(e: React.TouchEvent) {
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

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          context,
        }),
      });

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
          if (switchError?.code === 4902) {
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
        `Successfully anchored ${label} on X Layer Testnet.`,
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
      `Demo Mode — Analysis would be anchored on X Layer Testnet.\n\nContract: ${addr}\n\nReal on-chain anchoring is ready. Currently limited by OKX Wallet mobile network handling.`,
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

        recommendation:
          recoLabel(
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
        chainId,
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
        chainId,
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
      ? xLayer.blockExplorers
          .default.url
      : xLayerTestnet
          .blockExplorers
          .default.url;

  return (
    <>
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {error && (
          <div className="mb-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad break-all">
            {error}
          </div>
        )}

        {status && (
          <div className="mb-4 rounded-lg border border-good/40 bg-good/10 p-3 text-sm text-good break-all whitespace-pre-line shadow-[0_0_20px_rgba(61,220,151,0.08)]">
            {status}
          </div>
        )}

        <div
          key={page}
          className="page-enter space-y-6"
        >
          {page === 0 && (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-panel p-5 shadow-[0_0_45px_rgba(59,158,255,0.08)]">
                <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />

                <div className="relative">
                  <div className="mb-3 flex justify-center">
                    <NetworkProof />
                  </div>

                  <div className="text-center">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted">
                      AI RWA analyst
                    </div>

                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      Know what you're buying.
                      <span className="block text-accent">
                        Prove why.
                      </span>
                    </h2>

                    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
                      Analyze tokenized real-world
                      assets, personalize the verdict
                      to your portfolio, then anchor
                      the recommendation on X Layer.
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {[
                      "TSLAx",
                      "AAPLx",
                      "NVDAx",
                      "T-Bills",
                    ].map((symbol) => (
                      <button
                        key={symbol}
                        onClick={() =>
                          setPrompt(
                            `Analyze ${symbol} for a 6-month hold.`,
                          )
                        }
                        className="rounded-full border border-border bg-panel2 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-white"
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <TrustStrip />

              <div className="rounded-xl border border-border bg-panel p-4 shadow-[0_0_25px_rgba(59,158,255,0.03)]">
                <div className="text-xs uppercase tracking-wide text-muted">
                  Ask the analyst
                </div>

                <textarea
                  value={prompt}
                  onChange={(e) =>
                    setPrompt(
                      e.target.value,
                    )
                  }
                  rows={3}
                  className="mt-2 w-full resize-none rounded-lg border border-border bg-bg p-3 text-sm outline-none focus:border-accent"
                  placeholder="Ask about tokenized RWAs..."
                />

                <div className="mt-3">
                  <div className="text-xs uppercase tracking-wide text-muted">
                    Risk tolerance
                  </div>

                  <div className="mt-1 inline-flex rounded-lg border border-border bg-bg p-0.5">
                    {RISK_OPTIONS.map(
                      (r) => (
                        <button
                          key={r}
                          onClick={() =>
                            setRiskTolerance(
                              r,
                            )
                          }
                          className={`rounded-md px-3 py-1 text-xs capitalize ${
                            riskTolerance ===
                            r
                              ? "bg-accent text-white shadow-[0_0_12px_rgba(59,158,255,0.2)]"
                              : "text-muted hover:text-white"
                          }`}
                        >
                          {r}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    onClick={
                      runAnalysis
                    }
                    disabled={
                      loading ||
                      !prompt.trim()
                    }
                    className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(59,158,255,0.25)] transition hover:brightness-110 disabled:opacity-50"
                  >
                    {loading
                      ? "Analyzing…"
                      : "Analyze an RWA →"}
                  </button>
                </div>

                <div className="mt-3 text-center text-xs text-muted">
                  {isConnected ? (
                    <>
                      Personalized with your
                      holdings:{" "}
                      <span className="text-white">
                        {holdingsLoading
                          ? "reading…"
                          : holdingsSummary(
                              holdings,
                            )}
                      </span>
                    </>
                  ) : (
                    "Connect your wallet to personalize with your real holdings."
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="text-xs uppercase tracking-wide text-muted">
                  Try an example
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {EXAMPLE_PROMPTS.map(
                    (ex) => (
                      <button
                        key={ex}
                        onClick={() =>
                          setPrompt(ex)
                        }
                        className="rounded-full border border-border bg-panel2 px-3 py-1.5 text-xs text-muted hover:text-white"
                      >
                        {ex}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>
          )}

          {page === 1 &&
            (analysis ? (
              <div className="space-y-6">
                <div className="rounded-xl border border-border bg-panel p-4 shadow-[0_0_25px_rgba(59,158,255,0.04)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted">
                        AI recommendation
                      </div>

                      <p className="mt-2 text-sm leading-6">
                        {analysis.summary}
                      </p>
                    </div>

                    <button
                      onClick={
                        anchorAnalysis
                      }
                      className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_22px_rgba(59,158,255,0.3)] transition hover:brightness-110"
                    >
                      ⚓ Anchor on X Layer
                    </button>
                  </div>
                </div>

                <NetworkProof />

                {analysis.assets_analyzed
                  .length > 1 && (
                  <div className="rounded-xl border border-border bg-panel p-4">
                    <div className="text-xs uppercase tracking-wide text-muted">
                      Comparison
                    </div>

                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted">
                            <th className="py-1 pr-3">
                              Asset
                            </th>
                            <th className="py-1 pr-3">
                              Call
                            </th>
                            <th className="py-1 pr-3">
                              Conf.
                            </th>
                            <th className="py-1 pr-3">
                              Risk
                            </th>
                            <th className="py-1 pr-3">
                              Liq.
                            </th>
                            <th className="py-1 pr-3">
                              Yield
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {analysis.assets_analyzed.map(
                            (a) => (
                              <tr
                                key={
                                  a.symbol
                                }
                                className="border-t border-border"
                              >
                                <td className="py-1.5 pr-3 font-medium">
                                  {a.symbol}
                                </td>

                                <td className="py-1.5 pr-3">
                                  {recoLabel(
                                    a.recommendation,
                                  )}
                                </td>

                                <td className="py-1.5 pr-3">
                                  {conf10(
                                    a.confidence,
                                  )}
                                  /10
                                </td>

                                <td
                                  className={`py-1.5 pr-3 ${scoreColor(
                                    a.risk_score,
                                    true,
                                  )}`}
                                >
                                  {a.risk_score}
                                </td>

                                <td
                                  className={`py-1.5 pr-3 ${scoreColor(
                                    a.liquidity_score,
                                  )}`}
                                >
                                  {
                                    a.liquidity_score
                                  }
                                </td>

                                <td
                                  className={`py-1.5 pr-3 ${scoreColor(
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

                <div className="rounded-xl border border-border bg-panel p-4">
                  <div className="text-xs uppercase tracking-wide text-muted">
                    Raw analysis data
                  </div>

                  <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-bg p-3 text-xs leading-5 text-muted">
                    {rawJson}
                  </pre>
                </div>
              </div>
            ) : (
              <EmptyState
                onGoAnalyze={() =>
                  setPage(0)
                }
              />
            ))}

          {page === 2 &&
            (analysis ? (
              <div className="space-y-6">
                <div className="rounded-xl border border-border bg-panel p-4">
                  <div className="text-xs uppercase tracking-wide text-muted">
                    Suggested portfolio
                  </div>

                  <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full">
                    {Object.entries(
                      analysis
                        .portfolio_suggestion
                        .allocation,
                    ).map(
                      (
                        [sym, pct],
                        i,
                      ) => (
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

                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                    {Object.entries(
                      analysis
                        .portfolio_suggestion
                        .allocation,
                    ).map(
                      ([sym, pct]) => (
                        <span
                          key={sym}
                        >
                          {sym} {pct}%
                        </span>
                      ),
                    )}
                  </div>

                  <p className="mt-2 text-sm text-muted">
                    {
                      analysis
                        .portfolio_suggestion
                        .rationale
                    }
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-panel p-4">
                  <div className="text-xs uppercase tracking-wide text-muted">
                    Suggested actions
                  </div>

                  <div className="mt-2 space-y-2">
                    {analysis.suggested_actions.map(
                      (act, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel2 p-3"
                        >
                          <div className="text-sm">
                            <div className="font-medium">
                              {actionLabel(
                                act,
                              )}
                            </div>

                            <div className="text-xs text-muted">
                              {act.reason}
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
                              className="shrink-0 rounded-lg bg-good px-3 py-1.5 text-xs font-medium text-black hover:opacity-90"
                            >
                              Swap on OKX DEX
                            </button>
                          ) : (
                            <span className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted">
                              {
                                act.action
                              }
                            </span>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted">
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

          {page === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="text-xs uppercase tracking-wide text-muted">
                  Wallet
                </div>

                {isConnected ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="break-all font-mono text-xs text-muted">
                      {address}
                    </div>

                    <div>
                      Network:{" "}
                      <span className="text-accent">
                        {chainId ===
                        xLayer.id
                          ? "X Layer Mainnet (196)"
                          : chainId ===
                              xLayerTestnet.id
                            ? "X Layer Testnet (1952)"
                            : `Unsupported (${chainId})`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    Not connected. Use
                    “Connect OKX Wallet”
                    in the header.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="text-xs uppercase tracking-wide text-muted">
                  Holdings
                </div>

                {!isConnected ? (
                  <p className="mt-2 text-sm text-muted">
                    Connect your wallet to
                    read balances from X Layer.
                  </p>
                ) : holdingsLoading ? (
                  <p className="mt-2 text-sm text-muted">
                    Reading balances…
                  </p>
                ) : holdings.length ===
                  0 ? (
                  <p className="mt-2 text-sm text-muted">
                    No balances found on this
                    network.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {holdings.map(
                      (h) => (
                        <div
                          key={h.symbol}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-muted">
                            {h.symbol}
                            {h.isNative
                              ? " (native)"
                              : ""}
                          </span>

                          <span className="font-mono">
                            {Number(
                              h.balance,
                            ).toLocaleString(
                              undefined,
                              {
                                maximumFractionDigits:
                                  6,
                              },
                            )}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-accent/20 bg-panel p-4 shadow-[0_0_30px_rgba(59,158,255,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-wide text-muted">
                    On-chain proof
                  </div>

                  <NetworkProof />
                </div>

                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">
                      Contract
                    </span>

                    <span
                      className={
                        loggerAddress(
                          chainId,
                        )
                          ? "font-mono text-xs text-good break-all"
                          : "text-warn"
                      }
                    >
                      {loggerAddress(
                        chainId,
                      ) ??
                        "not available on this chain"}
                    </span>
                  </div>

                  {txHash && (
                    <div className="rounded-lg border border-good/20 bg-good/5 p-3">
                      <div className="text-xs text-good">
                        ✓ Recommendation anchored
                      </div>

                      <a
                        href={explorerTxUrl(
                          1952,
                          txHash,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block font-mono text-xs text-accent hover:underline break-all"
                      >
                        View transaction ↗
                      </a>
                    </div>
                  )}

                  {latestOnChain && (
                    <div className="pt-1">
                      <div className="text-muted">
                        Latest recommendation
                        on-chain
                      </div>

                      <pre className="mt-1 overflow-x-auto rounded-lg bg-bg p-2 text-xs text-muted">
                        {latestOnChain}
                      </pre>
                    </div>
                  )}

                  <a
                    href={explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block pt-1 text-xs text-accent hover:underline"
                  >
                    Open OKLink explorer ↗
                  </a>
                </div>

                <p className="mt-3 text-xs leading-5 text-muted">
                  “Anchor on X Layer” calls{" "}
                  <span className="text-white">
                    logRecommendation(string)
                  </span>{" "}
                  on the deployed contract.
                  Real transactions are supported,
                  with Demo Mode as a fallback when
                  mobile wallet network handling fails.
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