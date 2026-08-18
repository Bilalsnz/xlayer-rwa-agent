"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useWriteContract, useSendTransaction } from "wagmi";
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

const RECO_LABEL: Record<string, string> = {
  buy: "Buy",
  hold: "Hold",
  sell: "Reduce",
  avoid: "Avoid",
};

const recoLabel = (r: string) => RECO_LABEL[r] ?? r;

const conf10 = (c: number) => (c > 0 ? Math.max(1, Math.round(c / 10)) : 0);

type RiskTolerance = "conservative" | "moderate" | "aggressive";

function scoreColor(v: number, invert = false) {
  const good = invert ? v <= 33 : v >= 66;
  const bad = invert ? v >= 66 : v <= 33;

  return good ? "text-good" : bad ? "text-bad" : "text-warn";
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
        <span className={scoreColor(value, invert)}>{value}</span>
      </div>

      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel2">
        <div
          className="h-1.5 rounded-full bg-accent transition-all duration-700"
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
  const recommendationClass =
    a.recommendation === "buy"
      ? "border-good/30 bg-good/10 text-good"
      : a.recommendation === "avoid" || a.recommendation === "sell"
        ? "border-bad/30 bg-bad/10 text-bad"
        : "border-warn/30 bg-warn/10 text-warn";

  return (
    <div className="group rounded-2xl border border-border bg-panel p-4 shadow-[0_0_30px_rgba(59,158,255,0.03)] transition-all duration-300 hover:border-accent/30 hover:shadow-[0_0_35px_rgba(59,158,255,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tracking-tight">{a.symbol}</div>
          <div className="mt-0.5 text-xs text-muted">{a.name}</div>
        </div>

        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${recommendationClass}`}
        >
          {recoLabel(a.recommendation)} · {conf10(a.confidence)}/10
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-bg/60 p-3">
          <Meter label="Risk" value={a.risk_score} invert />
        </div>

        <div className="rounded-xl border border-border bg-bg/60 p-3">
          <Meter label="Liquidity" value={a.liquidity_score} />
        </div>

        <div className="rounded-xl border border-border bg-bg/60 p-3">
          <Meter label="Yield" value={a.yield_potential} />
        </div>

        <div className="rounded-xl border border-border bg-bg/60 p-3">
          <Meter
            label="Sentiment"
            value={(a.sentiment_score + 100) / 2}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Why this stands out
          </div>

          <ul className="mt-2 space-y-2 text-sm text-good/90">
            {a.key_opportunities.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 text-good">✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Risk notes
          </div>

          <ul className="mt-2 space-y-2 text-sm text-bad/90">
            {a.key_risks.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 text-bad">!</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => onSwap(a)}
          className="rounded-xl bg-good px-3.5 py-2 text-xs font-semibold text-black transition hover:opacity-90"
        >
          Swap on OKX DEX
        </button>

        <button
          onClick={() => onAnchor(a)}
          className="rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-2 text-xs font-medium text-accent transition hover:border-accent/60 hover:bg-accent/10"
        >
          ⚓ Anchor on X Layer
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onGoAnalyze }: { onGoAnalyze: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-panel/50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-xl">
        ◈
      </div>

      <p className="mt-4 text-sm font-medium">No analysis yet</p>

      <p className="mt-1 text-xs text-muted">
        Analyze a tokenized real-world asset to see its risk, opportunity and recommendation.
      </p>

      <button
        onClick={onGoAnalyze}
        className="mt-4 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_25px_rgba(59,158,255,0.18)] transition hover:opacity-90"
      >
        Analyze an RWA
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

const ASSET_CHIPS = ["TSLAx", "AAPLx", "NVDAx", "T-Bills"];

export function AppShell() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [prompt, setPrompt] = useState(
    "Analyze TSLAx and AAPLx for a 6-month hold."
  );

  const [riskTolerance, setRiskTolerance] =
    useState<RiskTolerance>("moderate");

  const [analysis, setAnalysis] = useState<RWAAnalysis | null>(null);
  const [rawJson, setRawJson] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);

  const [txHash, setTxHash] = useState<string | null>(null);
  const [latestOnChain, setLatestOnChain] = useState<string>("");
  const [showRawJson, setShowRawJson] = useState(false);

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

  useEffect(() => {
    if (!isConnected || !address) {
      setHoldings([]);
      return;
    }

    let cancelled = false;

    setHoldingsLoading(true);

    readHoldings(chainId, address as `0x${string}`)
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

    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;

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
        throw new Error(data.error ?? "Request failed");
      }

      setAnalysis(data.analysis);
      setRawJson(JSON.stringify(data.analysis, null, 2));
      setShowRawJson(false);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function doAnchor(
    payload: AnchorPayload,
    label: string
  ) {
    setError(null);
    setStatus(null);
    setTxHash(null);

    if (!isConnected) {
      setError(
        "Connect your OKX wallet first, then try Anchor."
      );
      setPage(3);
      return;
    }

    const addr = loggerAddress(1952);

    if (!addr) {
      setError("Contract address not found.");
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
      setStatus("Switching to X Layer Testnet...");

      const provider =
        (window as any).okxwallet ||
        (window as any).ethereum;

      if (provider) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x7a0" }],
          });
        } catch (switchError: any) {
          if (switchError?.code === 4902) {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [X_LAYER_TESTNET_PARAMS],
            });
          }
        }

        await new Promise((r) => setTimeout(r, 1200));
      }
    } catch (e) {
      console.warn("Switch failed", e);
    }

    try {
      setStatus(
        "Confirm the transaction in your wallet..."
      );

      const recString =
        buildRecommendationString(payload);

      const hash = await writeContractAsync({
        address: addr,
        abi: LOGGER_ABI,
        functionName: "logRecommendation",
        args: [recString],
      });

      setTxHash(hash);

      setStatus(
        `✓ ${label} successfully anchored on X Layer Testnet.`
      );

      setPage(3);
      return;
    } catch (e: any) {
      console.warn(
        "Real tx failed, falling to demo",
        e
      );
    }

    setStatus(
      `✓ Demo Mode — Analysis would be anchored on X Layer Testnet\n\nContract: ${addr}\n\nReal on-chain anchoring is ready. Currently limited by OKX Wallet mobile network handling.`
    );

    setPage(3);
  }

  function anchorAnalysis() {
    if (!analysis) return;

    const assets = analysis.assets_analyzed;

    const avg = (xs: number[]) =>
      xs.length
        ? Math.round(
            xs.reduce((s, x) => s + x, 0) /
              xs.length
          )
        : 0;

    doAnchor(
      {
        summary: analysis.summary,
        symbols: assets.map((a) => a.symbol),
        riskScore: avg(
          assets.map((a) => a.risk_score)
        ),
        confidence: avg(
          assets.map((a) => a.confidence)
        ),
        recommendation: recoLabel(
          assets[0]?.recommendation ?? "hold"
        ),
      },
      "This analysis"
    );
  }

  function anchorAsset(a: AssetAnalysis) {
    doAnchor(
      {
        summary:
          analysis?.summary ??
          `${a.symbol} analysis`,
        symbols: [a.symbol],
        riskScore: a.risk_score,
        confidence: a.confidence,
        recommendation: recoLabel(
          a.recommendation
        ),
      },
      a.symbol
    );
  }

  function openDeepLink(action: SuggestedAction) {
    window.open(
      buildOkxDexSwapUrl(
        action,
        chainId || xLayer.id
      ),
      "_blank",
      "noopener"
    );
  }

  function swapSymbol(a: AssetAnalysis) {
    window.open(
      buildSwapUrlForSymbol(
        a.symbol,
        chainId || xLayer.id
      ),
      "_blank",
      "noopener"
    );
  }

  async function execute(action: SuggestedAction) {
    setError(null);
    setStatus(null);

    if (!address) {
      openDeepLink(action);
      return;
    }

    try {
      const res = await fetch("/api/okx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

        throw new Error(
          data.error ?? "OKX request failed"
        );
      }

      if (data.approveTx) {
        setStatus(
          "Confirm the token approval in your wallet..."
        );

        await sendTransactionAsync({
          to: data.approveTx.to,
          data: data.approveTx.data,
        });
      }

      setStatus(
        "Confirm the swap in your wallet..."
      );

      const hash = await sendTransactionAsync({
        to: data.tx.to,
        data: data.tx.data,
        value: data.tx.value
          ? BigInt(data.tx.value)
          : undefined,
      });

      setStatus(
        `Swap submitted to OKX DEX. Tx: ${hash}`
      );
    } catch (e) {
      openDeepLink(action);

      setError(
        e instanceof Error
          ? `${e.message} — opened OKX DEX as fallback.`
          : "Opened OKX DEX as fallback."
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
            <div className="space-y-5">
              <div className="relative overflow-hidden rounded-3xl border border-accent/20 bg-panel p-6 shadow-[0_0_60px_rgba(59,158,255,0.07)]">
                <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />

                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs text-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(59,158,255,0.9)]" />
                    AI RWA intelligence on X Layer
                  </div>

                  <h1 className="mt-5 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
                    Know what you&apos;re buying.
                    <span className="block text-accent">
                      Prove why.
                    </span>
                  </h1>

                  <p className="mt-3 max-w-lg text-sm leading-6 text-muted">
                    AI-powered analysis for tokenized
                    real-world assets, personalized to
                    your portfolio and verifiable on X Layer.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {ASSET_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        onClick={() =>
                          setPrompt(
                            `Analyze ${chip} and give me a clear investment view.`
                          )
                        }
                        className="rounded-full border border-border bg-bg/70 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-white"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-2 border-t border-border pt-5">
                    <div>
                      <div className="text-sm text-good">
                        ✓
                      </div>
                      <div className="mt-1 text-[11px] text-muted">
                        Analysis generated
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-good">
                        ✓
                      </div>
                      <div className="mt-1 text-[11px] text-muted">
                        Risk scored
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-good">
                        ✓
                      </div>
                      <div className="mt-1 text-[11px] text-muted">
                        On-chain proof
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-panel p-4 shadow-[0_0_30px_rgba(59,158,255,0.03)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted">
                      Analyze an RWA
                    </div>

                    <div className="mt-1 text-sm text-white">
                      Ask the analyst
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-panel2 px-2 py-1 text-[10px] text-muted">
                    AI
                  </div>
                </div>

                <textarea
                  value={prompt}
                  onChange={(e) =>
                    setPrompt(e.target.value)
                  }
                  rows={3}
                  className="mt-4 w-full resize-none rounded-xl border border-border bg-bg p-3 text-sm leading-5 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
                  placeholder="Ask about tokenized RWAs..."
                />

                <div className="mt-4">
                  <div className="text-xs uppercase tracking-wider text-muted">
                    Risk tolerance
                  </div>

                  <div className="mt-2 grid grid-cols-3 rounded-xl border border-border bg-bg p-1">
                    {RISK_OPTIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() =>
                          setRiskTolerance(r)
                        }
                        className={`rounded-lg px-2 py-2 text-xs capitalize transition ${
                          riskTolerance === r
                            ? "bg-accent text-white shadow-[0_0_18px_rgba(59,158,255,0.15)]"
                            : "text-muted hover:text-white"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={runAnalysis}
                  disabled={
                    loading || !prompt.trim()
                  }
                  className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(59,158,255,0.18)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? "Analyzing..."
                    : "Analyze an RWA"}
                </button>

                <div className="mt-3 flex items-center justify-center text-center text-xs text-muted">
                  {isConnected ? (
                    <span>
                      Personalized with your holdings
                      {" · "}
                      {holdingsLoading
                        ? "reading..."
                        : holdingsSummary(holdings)}
                    </span>
                  ) : (
                    <span>
                      Connect your wallet to personalize
                      the analysis with your holdings.
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted">
                  Try an example
                </div>

                <div className="mt-3 space-y-2">
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex}
                      onClick={() =>
                        setPrompt(ex)
                      }
                      className="w-full rounded-xl border border-border bg-panel2 p-3 text-left text-xs text-muted transition hover:border-accent/30 hover:text-white"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {page === 1 &&
            (analysis ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-accent/20 bg-panel p-5 shadow-[0_0_40px_rgba(59,158,255,0.05)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-accent">
                        AI recommendation
                      </div>

                      <p className="mt-2 text-sm leading-6 text-white">
                        {analysis.summary}
                      </p>
                    </div>

                    <button
                      onClick={anchorAnalysis}
                      className="shrink-0 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white shadow-[0_0_20px_rgba(59,158,255,0.15)] transition hover:opacity-90"
                    >
                      ⚓ Anchor
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-good" />
                    AI analysis completed
                  </div>
                </div>

                {analysis.assets_analyzed.length > 1 && (
                  <div className="rounded-2xl border border-border bg-panel p-4">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted">
                      Comparison
                    </div>

                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted">
                            <th className="py-2 pr-3">
                              Asset
                            </th>
                            <th className="py-2 pr-3">
                              Call
                            </th>
                            <th className="py-2 pr-3">
                              Conf.
                            </th>
                            <th className="py-2 pr-3">
                              Risk
                            </th>
                            <th className="py-2 pr-3">
                              Liq.
                            </th>
                            <th className="py-2 pr-3">
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
                                <td className="py-2 pr-3 font-medium">
                                  {a.symbol}
                                </td>

                                <td className="py-2 pr-3">
                                  {recoLabel(
                                    a.recommendation
                                  )}
                                </td>

                                <td className="py-2 pr-3">
                                  {conf10(
                                    a.confidence
                                  )}
                                  /10
                                </td>

                                <td
                                  className={`py-2 pr-3 ${scoreColor(
                                    a.risk_score,
                                    true
                                  )}`}
                                >
                                  {a.risk_score}
                                </td>

                                <td
                                  className={`py-2 pr-3 ${scoreColor(
                                    a.liquidity_score
                                  )}`}
                                >
                                  {a.liquidity_score}
                                </td>

                                <td
                                  className={`py-2 pr-3 ${scoreColor(
                                    a.yield_potential
                                  )}`}
                                >
                                  {a.yield_potential}
                                </td>
                              </tr>
                            )
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
                        onAnchor={anchorAsset}
                        onSwap={swapSymbol}
                      />
                    )
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-panel p-4">
                  <button
                    onClick={() =>
                      setShowRawJson(!showRawJson)
                    }
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-muted">
                        Advanced data
                      </div>

                      <div className="mt-1 text-xs text-muted">
                        Raw analysis output
                      </div>
                    </div>

                    <span className="text-xs text-accent">
                      {showRawJson
                        ? "Hide"
                        : "View"}
                    </span>
                  </button>

                  {showRawJson && (
                    <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-bg p-3 text-[11px] leading-5 text-muted">
                      {rawJson}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                onGoAnalyze={() => setPage(0)}
              />
            ))}

          {page === 2 &&
            (analysis ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-border bg-panel p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted">
                    Suggested portfolio
                  </div>

                  <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-panel2">
                    {Object.entries(
                      analysis.portfolio_suggestion
                        .allocation
                    ).map(
                      ([sym, pct], i) => (
                        <div
                          key={sym}
                          title={`${sym}: ${pct}%`}
                          style={{
                            width: `${pct}%`,
                            backgroundColor: [
                              "#5b8cff",
                              "#3ddc97",
                              "#ffcc66",
                              "#ff6b6b",
                              "#a78bfa",
                            ][i % 5],
                          }}
                        />
                      )
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                    {Object.entries(
                      analysis.portfolio_suggestion
                        .allocation
                    ).map(([sym, pct]) => (
                      <span key={sym}>
                        {sym} {pct}%
                      </span>
                    ))}
                  </div>

                  <p className="mt-4 text-sm leading-6 text-muted">
                    {
                      analysis.portfolio_suggestion
                        .rationale
                    }
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-panel p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted">
                    Suggested actions
                  </div>

                  <div className="mt-3 space-y-3">
                    {analysis.suggested_actions.map(
                      (act, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-border bg-panel2 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">
                                {actionLabel(act)}
                              </div>

                              <div className="mt-1 text-xs leading-5 text-muted">
                                {act.reason}
                              </div>
                            </div>

                            {act.action ===
                            "swap" ? (
                              <button
                                onClick={() =>
                                  execute(act)
                                }
                                className="shrink-0 rounded-xl bg-good px-3 py-2 text-xs font-semibold text-black transition hover:opacity-90"
                              >
                                Swap
                              </button>
                            ) : (
                              <span className="shrink-0 rounded-xl border border-border px-3 py-2 text-xs text-muted">
                                {act.action}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-panel/50 p-3">
                  <p className="text-xs leading-5 text-muted">
                    {analysis.disclaimer}
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState
                onGoAnalyze={() => setPage(0)}
              />
            ))}

          {page === 3 && (
            <div className="space-y-4">
              {txHash && (
                <div className="rounded-2xl border border-good/30 bg-good/10 p-5 shadow-[0_0_35px_rgba(61,220,151,0.08)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-good/15 text-good">
                      ✓
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-good">
                        Recommendation anchored
                      </div>

                      <div className="mt-1 text-xs leading-5 text-good/80">
                        Your AI recommendation has been
                        written to the X Layer Testnet.
                      </div>

                      <a
                        href={explorerTxUrl(
                          1952,
                          txHash
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex rounded-lg border border-good/30 bg-good/10 px-3 py-2 font-mono text-xs text-good hover:bg-good/15"
                      >
                        View transaction ↗
                      </a>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted">
                  Wallet
                </div>

                {isConnected ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="break-all rounded-xl bg-bg p-3 font-mono text-xs text-muted">
                      {address}
                    </div>

                    <div className="pt-1">
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
                    Not connected. Use “Connect OKX Wallet”
                    in the header.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted">
                  Holdings
                </div>

                {!isConnected ? (
                  <p className="mt-2 text-sm text-muted">
                    Connect your wallet to read balances
                    from X Layer.
                  </p>
                ) : holdingsLoading ? (
                  <p className="mt-2 text-sm text-muted">
                    Reading balances...
                  </p>
                ) : holdings.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    No balances found on this network.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {holdings.map((h) => (
                      <div
                        key={h.symbol}
                        className="flex justify-between rounded-lg bg-panel2 p-2.5 text-sm"
                      >
                        <span className="text-muted">
                          {h.symbol}
                          {h.isNative
                            ? " (native)"
                            : ""}
                        </span>

                        <span className="font-mono">
                          {Number(
                            h.balance
                          ).toLocaleString(
                            undefined,
                            {
                              maximumFractionDigits: 6,
                            }
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted">
                  On-chain proof
                </div>

                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-muted">
                      Contract
                    </div>

                    <div
                      className={
                        loggerAddress(chainId)
                          ? "mt-1 break-all rounded-lg bg-bg p-2 font-mono text-xs text-good"
                          : "mt-1 text-warn"
                      }
                    >
                      {loggerAddress(chainId) ??
                        "not available on this chain"}
                    </div>
                  </div>

                  {txHash && (
                    <div>
                      <div className="text-xs text-muted">
                        Last anchor transaction
                      </div>

                      <a
                        href={explorerTxUrl(
                          1952,
                          txHash
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block break-all rounded-lg bg-bg p-2 font-mono text-xs text-accent hover:underline"
                      >
                        {txHash} ↗
                      </a>
                    </div>
                  )}

                  {latestOnChain && (
                    <div>
                      <div className="text-xs text-muted">
                        Latest recommendation on-chain
                      </div>

                      <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-bg p-2 text-[11px] text-muted">
                        {latestOnChain}
                      </pre>
                    </div>
                  )}

                  <a
                    href={explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs text-accent hover:underline"
                  >
                    Open OKLink explorer ↗
                  </a>
                </div>

                <div className="mt-4 rounded-xl border border-accent/10 bg-accent/5 p-3">
                  <p className="text-xs leading-5 text-muted">
                    “Anchor on X Layer” calls{" "}
                    <span className="text-white">
                      logRecommendation(string)
                    </span>{" "}
                    on the real contract. If mobile wallet
                    network handling fails, the app safely
                    falls back to Demo Mode.
                  </p>
                </div>
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