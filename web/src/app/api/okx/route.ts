import { NextResponse } from "next/server";
import { getQuote, getSwap, getApproveTransaction, okxCredsConfigured } from "@/lib/okxApi";
import { resolveToken, isExecutable, usdToAmount, NATIVE_TOKEN_ADDRESS } from "@/lib/tokens";

export const runtime = "nodejs";

/**
 * Prepared-transaction path for OKX DEX on X Layer. The client sends the
 * suggested action (symbols + USD amount); we resolve verified token addresses,
 * convert the amount, and return calldata the USER signs in their wallet.
 * Funds never touch the server. If tokens aren't verified/executable, we return
 * a 422 so the client can fall back to the OKX DEX deep link.
 */
export async function POST(req: Request) {
  if (!okxCredsConfigured()) {
    return NextResponse.json({ error: "OKX API not configured", fallback: true }, { status: 503 });
  }

  let body: {
    action?: "quote" | "swap";
    chainId?: number;
    fromSymbol?: string;
    toSymbol?: string;
    amountUsd?: number;
    slippage?: string;
    userWalletAddress?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const chainId = Number(body.chainId);
  if (!chainId) return NextResponse.json({ error: "Missing chainId" }, { status: 400 });

  const from = resolveToken(chainId, body.fromSymbol ?? "");
  const to = resolveToken(chainId, body.toSymbol ?? "");
  if (!isExecutable(from) || !isExecutable(to)) {
    return NextResponse.json(
      { error: "Token address not verified for this chain — use deep link.", fallback: true },
      { status: 422 },
    );
  }

  const amount = usdToAmount(from, Number(body.amountUsd ?? 0));
  if (!amount || amount === "0") {
    return NextResponse.json(
      { error: "Cannot size trade (need stablecoin sell-side or a price oracle).", fallback: true },
      { status: 422 },
    );
  }

  const common = {
    chainId: String(chainId),
    amount,
    fromTokenAddress: from.address,
    toTokenAddress: to.address,
  };

  try {
    if (body.action === "quote") {
      const quote = await getQuote(common);
      return NextResponse.json({ quote: quote.data });
    }

    if (!body.userWalletAddress) {
      return NextResponse.json({ error: "Missing userWalletAddress for swap" }, { status: 400 });
    }

    // ERC-20 sell-side needs an approval tx to the OKX router before the swap.
    let approveTx: { to: string; data: string } | null = null;
    if (from.address !== NATIVE_TOKEN_ADDRESS) {
      const appr = await getApproveTransaction({
        chainId: String(chainId),
        tokenContractAddress: from.address,
        approveAmount: amount,
      });
      const a = appr.data?.[0];
      if (a) approveTx = { to: a.dexContractAddress, data: a.data };
    }

    const swap = await getSwap({
      ...common,
      slippage: body.slippage ?? "0.01",
      userWalletAddress: body.userWalletAddress,
    });
    const tx = swap.data?.[0]?.tx;
    if (!tx) return NextResponse.json({ error: "OKX returned no swap tx" }, { status: 502 });

    return NextResponse.json({ approveTx, tx });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OKX request failed";
    return NextResponse.json({ error: msg, fallback: true }, { status: 502 });
  }
}
