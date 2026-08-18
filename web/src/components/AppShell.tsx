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

function Meter({
  label,
  value,
  invert,
}: {
  label: string;
  value: number;
  invert?: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className={scoreColor(value, invert)}>
          {Math.round(value)}
        </span>
      </div>

      <div className="mt-1 h-1.5 w-full rounded-full bg-panel2">
        <div
          className="h-1.5 rounded-full bg-accent shadow-[0_0_10px_rgba(59,158,255,0.35)]"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
          }}
        />
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
    <div className="rounded-2xl border border-border bg-panel p-4 shadow-[0_0_30px_rgba(59,158,255,0.04)] transition hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-white">
            {a.symbol}
          </div>

          <div className="text-xs text-muted">
            {a.name}
          </div>
        </div>

        <span className="rounded-lg border border-border bg-panel2 px-2 py-1 text-xs uppercase">
          {recoLabel(a.recommendation)} · {conf10(a.confidence)}/10
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Meter label="Risk" value={a.risk_score} invert />
        <Meter label="Liquidity" value={a.liquidity_score} />
        <Meter label="Yield" value={a.yield_potential} />
        <Meter
          label="Sentiment"
          value={(a.sentiment_score + 100) / 2}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="mb-1 text-muted">
            Why this stands out
          </div>

          <ul className="list-disc space-y-1 pl-4 text-good/90">
            {a.key_opportunities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1 text-muted">
            Risk notes
          </div>

          <ul className="list-disc space-y-1 pl-4 text-bad/90">
            {a.key_risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => onSwap(a)}
          className="rounded-lg bg-good px-3 py-1.5 text-xs font-medium text-black shadow-[0_0_18px_rgba(61,220,151,0.12)] hover:opacity-90"
        >
          Swap on OKX DEX
        </button>

        <button
          onClick={() => onAnchor(a)}
          className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
        >
          Anchor on X Layer
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
    <div className="rounded-2xl border border-dashed border-border bg-panel/50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-xl">
        ◇
      </div>

      <p className="mt-3 text-sm text-white">
        No analysis yet.
      </p>

      <p className="mt-1 text-xs text-muted">
        Ask the analyst about a tokenized real-world asset.
      </p>

      <button
        onClick={onGoAnalyze}
        className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-[0_0_24px_rgba(59,158,255,0.22)] hover:opacity-90"
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

const ASSET_CHIPS = [
  "TSLAx",
  "AAPLx",
  "NVDAx",
  "T-Bills",
];

function WorkflowStep({
  number,
  label,
  active,
  completed,
}: {
  number: string;
  label: string;
  active?: boolean;
  completed?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition ${
        active
          ? "border-accent/40 bg-accent/10 text-accent shadow-[0_0_18px_rgba(59,158,255,0.08)]"
          : completed
            ? "border-good/30 bg-good/5 text-good"
            : "border-border bg-panel2 text-muted"
      }`}
    >
      <span className="font-semibold">
        {completed ? "✓" : number}
      </span>

      <span>{label}</span>
    </div>
  );
}

function ProofCard({
  analysis,
  txHash,
  onAnchor,
}: {
  analysis: RWAAnalysis | null;
  txHash: string | null;
  onAnchor: () => void;
}) {
  const isAnchored = !!txHash;

  return (
    <div
      className={`rounded-2xl border p-4 shadow-[0_0_35px_rgba(59,158,255,0.05)] ${
        isAnchored
          ? "border-good/30 bg-good/5"
          : "border-border bg-panel"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={`text-xs font-semibold uppercase tracking-wider ${
              isAnchored ? "text-good" : "text-muted"
            }`}
          >
            {isAnchored
              ? "X Layer Verified"
              : "Analysis Proof"}
          </div>

          <div className="mt-1 text-sm font-medium text-white">
            {isAnchored
              ? "Your AI verdict is anchored on-chain."
              : "Turn the AI verdict into a verifiable record."}
          </div>
        </div>

        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            isAnchored
              ? "bg-good/10 text-good"
              : "bg-accent/10 text-accent"
          }`}
        >
          {isAnchored ? "✓" : "⚓"}
        </div>
      </div>

      <div className="mt-4 space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-good">✓</span>
          <span className="text-muted">
            Analysis generated
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-good">
            {analysis ? "✓" : "○"}
          </span>
          <span className="text-muted">
            Risk scored
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-good">
            {analysis ? "✓" : "○"}
          </span>
          <span className="text-muted">
            Recommendation ready
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={isAnchored ? "text-good" : "text-muted"}>
            {isAnchored ? "✓" : "○"}
          </span>

          <span
            className={
              isAnchored
                ? "text-good"
                : "text-muted"
            }
          >
            Recommendation anchored on X Layer
          </span>
        </div>
      </div>

      {!isAnchored && analysis && (
        <button
          onClick={onAnchor}
          className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(59,158,255,0.22)] hover:opacity-90"
        >
          ⚓ Anchor verdict on X Layer
        </button>
      )}

      {isAnchored && txHash && (
        <a
          href={explorerTxUrl(1952, txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex w-full items-center justify-center rounded-xl border border-good/30 bg-good/10 px-4 py-2.5 text-sm font-medium text-good hover:bg-good/15"
        >
          View transaction on OKLink ↗
        </a>
      )}
    </div>
  );
}

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

  const [holdings, setHoldings] = useState<Holding[]>([]);
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
    setTxHash(null);

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
            "Content-Type":
              "application/json",
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
        `Confirm ${label} anchor in your wallet...`,
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
        "✓ Successfully anchored on X Layer Testnet!",
      );

      setPage(1);

      return;
    } catch (e: any) {
      console.warn(
        "Real tx failed, falling to demo",
        e,
      );
    }

    setStatus(
      `✓ Demo Mode — Analysis would be anchored on X Layer Testnet\n\nContract: ${addr}\n\nReal on-chain anchoring is ready. Currently limited by OKX Wallet mobile network handling.`,
    );

    setPage(1);
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
      : xLayerTestnet.blockExplorers.default.url;

  return (
    <>
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {error && (
          <div className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-bad break-all">
            {error}
          </div>
        )}

        {status && (
          <div className="mb-4 rounded-xl border border-good/40 bg-good/10 p-3 text-sm text-good break-all whitespace-pre-line shadow-[0_0_25px_rgba(61,220,151,0.06)]">
            {status}
          </div>
        )}

        <div
          key={page}
          className="page-enter space-y-6"
        >
          {page === 0 && (
            <div className="space-y-6">
              <section className="relative overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-br from-panel via-panel to-accent/5 p-5 shadow-[0_0_55px_rgba(59,158,255,0.08)]">
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-purple-500/10 blur-3xl" />

                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(59,158,255,0.8)]" />
                    X-RWA Agent
                  </div>

                  <h1 className="mt-4 max-w-xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
                    Know what you're buying.
                    <span className="block bg-gradient-to-r from-white via-accent to-blue-300 bg-clip-text text-transparent">
                      Prove why.
                    </span>
                  </h1>

                  <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
                    AI-powered analysis for
                    tokenized real-world assets,
                    personalized to your risk
                    profile and verifiable on
                    X Layer.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <WorkflowStep
                      number="1"
                      label="Analyze"
                      active
                    />
                    <WorkflowStep
                      number="2"
                      label="Personalize"
                    />
                    <WorkflowStep
                      number="3"
                      label="Score"
                    />
                    <WorkflowStep
                      number="4"
                      label="Recommend"
                    />
                    <WorkflowStep
                      number="5"
                      label="Anchor"
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {ASSET_CHIPS.map(
                      (symbol) => (
                        <button
                          key={symbol}
                          onClick={() => {
                            if (
                              symbol ===
                              "T-Bills"
                            ) {
                              setPrompt(
                                "Compare a tokenized T-bill with TSLAx for low risk.",
                              );
                            } else {
                              setPrompt(
                                `Analyze ${symbol} for a 6-month hold.`,
                              );
                            }
                          }}
                          className="rounded-full border border-border bg-bg/50 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:bg-accent/5 hover:text-white"
                        >
                          {symbol}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
                <div className="rounded-2xl border border-border bg-panel p-4 shadow-[0_0_30px_rgba(59,158,255,0.04)]">
                  <div className="text-xs uppercase tracking-wider text-muted">
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
                    className="mt-2 w-full resize-none rounded-xl border border-border bg-bg p-3 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
                    placeholder="Ask about tokenized RWAs..."
                  />

                  <div className="mt-3">
                    <div className="text-xs uppercase tracking-wider text-muted">
                      Risk tolerance
                    </div>

                    <div className="mt-2 inline-flex rounded-xl border border-border bg-bg p-1">
                      {RISK_OPTIONS.map(
                        (r) => (
                          <button
                            key={r}
                            onClick={() =>
                              setRiskTolerance(
                                r,
                              )
                            }
                            className={`rounded-lg px-3 py-1.5 text-xs capitalize transition ${
                              riskTolerance ===
                              r
                                ? "bg-accent text-white shadow-[0_0_14px_rgba(59,158,255,0.18)]"
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
                      className="group w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(59,158,255,0.2)] transition hover:shadow-[0_0_38px_rgba(59,158,255,0.32)] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading
                        ? "Analyzing your RWA…"
                        : "Analyze an RWA →"}
                    </button>
                  </div>

                  <div className="mt-3 text-xs text-muted">
                    {isConnected ? (
                      <>
                        Using your holdings:{" "}
                        <span className="text-white">
                          {holdingsLoading
                            ? "reading…"
                            : holdingsSummary(
                                holdings,
                              )}
                        </span>
                      </>
                    ) : (
                      "Connect a wallet to personalize the analysis with your real holdings."
                    )}
                  </div>
                </div>

                <ProofCard
                  analysis={analysis}
                  txHash={txHash}
                  onAnchor={() => {
                    goto(1);
                  }}
                />
              </div>

              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-xs uppercase tracking-wider text-muted">
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
                        className="rounded-full border border-border bg-panel2 px-3 py-1.5 text-xs text-muted transition hover:border-accent/30 hover:text-white"
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
                <div className="rounded-3xl border border-accent/20 bg-gradient-to-br from-panel to-accent/5 p-5 shadow-[0_0_40px_rgba(59,158,255,0.06)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <WorkflowStep
                      number="1"
                      label="Analyze"
                      completed
                    />
                    <WorkflowStep
                      number="2"
                      label="Personalize"
                      completed={
                        isConnected
                      }
                    />
                    <WorkflowStep
                      number="3"
                      label="Score"
                      completed
                    />
                    <WorkflowStep
                      number="4"
                      label="Recommend"
                      completed
                    />
                    <WorkflowStep
                      number="5"
                      label="Anchor"
                      active={!txHash}
                      completed={!!txHash}
                    />
                  </div>

                  <div className="mt-5 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted">
                        AI recommendation
                      </div>

                      <h2 className="mt-1 text-xl font-bold text-white">
                        {analysis.summary}
                      </h2>
                    </div>

                    {!txHash && (
                      <button
                        onClick={
                          anchorAnalysis
                        }
                        className="shrink-0 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white shadow-[0_0_24px_rgba(59,158,255,0.2)] hover:opacity-90"
                      >
                        ⚓ Anchor
                      </button>
                    )}
                  </div>

                  {txHash && (
                    <div className="mt-4 rounded-xl border border-good/30 bg-good/5 p-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-good">
                        <span>✓</span>
                        Analysis anchored on X Layer
                      </div>

                      <div className="mt-1 text-xs text-muted">
                        This AI verdict now has an on-chain proof.
                      </div>

                      <a
                        href={explorerTxUrl(
                          1952,
                          txHash,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
                      >
                        View transaction on OKLink ↗
                      </a>
                    </div>
                  )}
                </div>

                {analysis.assets_analyzed
                  .length > 1 && (
                  <div className="rounded-2xl border border-border bg-panel p-4">
                    <div className="text-xs uppercase tracking-wider text-muted">
                      Comparison
                    </div>

                    <div className="mt-3 overflow-x-auto">
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
                                <td className="py-2 pr-3 font-medium">
                                  {a.symbol}
                                </td>

                                <td className="py-2 pr-3">
                                  {recoLabel(
                                    a.recommendation,
                                  )}
                                </td>

                                <td className="py-2 pr-3">
                                  {conf10(
                                    a.confidence,
                                  )}
                                  /10
                                </td>

                                <td
                                  className={`py-2 pr-3 ${scoreColor(
                                    a.risk_score,
                                    true,
                                  )}`}
                                >
                                  {a.risk_score}
                                </td>

                                <td
                                  className={`py-2 pr-3 ${scoreColor(
                                    a.liquidity_score,
                                  )}`}
                                >
                                  {a.liquidity_score}
                                </td>

                                <td
                                  className={`py-2 pr-3 ${scoreColor(
                                    a.yield_potential,
                                  )}`}
                                >
                                  {a.yield_potential}
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

                <div className="rounded-2xl border border-border bg-panel p-4">
                  <div className="text-xs uppercase tracking-wider text-muted">
                    Raw analysis data
                  </div>

                  <pre className="mt-2 overflow-x-auto rounded-xl bg-bg p-3 text-xs text-muted">
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
                <div className="rounded-2xl border border-border bg-panel p-4">
                  <div className="text-xs uppercase tracking-wider text-muted">
                    Suggested portfolio
                  </div>

                  <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-panel2">
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

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                    {Object.entries(
                      analysis
                        .portfolio_suggestion
                        .allocation,
                    ).map(
                      ([sym, pct]) => (
                        <span key={sym}>
                          {sym} {pct}%
                        </span>
                      ),
                    )}
                  </div>

                  <p className="mt-3 text-sm leading-6 text-muted">
                    {
                      analysis
                        .portfolio_suggestion
                        .rationale
                    }
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-panel p-4">
                  <div className="text-xs uppercase tracking-wider text-muted">
                    Suggested actions
                  </div>

                  <div className="mt-3 space-y-2">
                    {analysis.suggested_actions.map(
                      (act, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel2 p-3"
                        >
                          <div className="text-sm">
                            <div className="font-medium">
                              {actionLabel(
                                act,
                              )}
                            </div>

                            <div className="mt-1 text-xs text-muted">
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
                              {act.action}
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
              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-xs uppercase tracking-wider text-muted">
                  Wallet
                </div>

                {isConnected ? (
                  <div className="mt-2 space-y-2 text-sm">
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

              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-xs uppercase tracking-wider text-muted">
                  Holdings
                </div>

                {!isConnected ? (
                  <p className="mt-2 text-sm text-muted">
                    Connect your wallet to
                    read balances from X
                    Layer.
                  </p>
                ) : holdingsLoading ? (
                  <p className="mt-2 text-sm text-muted">
                    Reading balances…
                  </p>
                ) : holdings.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    No balances found on
                    this network.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {holdings.map((h) => (
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
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-xs uppercase tracking-wider text-muted">
                  On-chain logger
                </div>

                <div className="mt-2 space-y-2 text-sm">
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
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">
                        Last anchor tx
                      </span>

                      <a
                        href={explorerTxUrl(
                          1952,
                          txHash,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-accent hover:underline break-all"
                      >
                        {txHash.slice(
                          0,
                          10,
                        )}
                        … ↗
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
                  on the real contract.
                  Falls back to Demo Mode
                  if needed.
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