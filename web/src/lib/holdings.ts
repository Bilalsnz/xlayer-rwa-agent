import { formatUnits, erc20Abi } from "viem";
import { publicClientFor } from "./rpc";
import { TOKENS, NATIVE_TOKEN_ADDRESS } from "./tokens";

export interface Holding {
  symbol: string;
  balance: string; // human-readable
  raw: string; // smallest units
  isNative: boolean;
}

/**
 * Read the connected wallet's balances on X Layer using the free public RPC:
 *   - native OKB (always available)
 *   - any tokenized-stock / stable ERC-20 that has a verified address in tokens.ts
 *
 * Tokens without a verified address are skipped (see the safety note in tokens.ts),
 * so on networks where the xStocks aren't live yet you simply see your OKB balance.
 */
export async function readHoldings(chainId: number, address: `0x${string}`): Promise<Holding[]> {
  const client = publicClientFor(chainId);
  const out: Holding[] = [];

  // Native OKB
  try {
    const bal = await client.getBalance({ address });
    out.push({ symbol: "OKB", balance: formatUnits(bal, 18), raw: bal.toString(), isNative: true });
  } catch {
    /* ignore RPC hiccup */
  }

  // ERC-20s with a verified address
  const table = TOKENS[chainId] ?? {};
  const erc20s = Object.values(table).filter(
    (t) => t.address && t.address !== NATIVE_TOKEN_ADDRESS && /^0x[a-fA-F0-9]{40}$/.test(t.address),
  );
  await Promise.all(
    erc20s.map(async (t) => {
      try {
        const raw = (await client.readContract({
          address: t.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;
        out.push({ symbol: t.symbol, balance: formatUnits(raw, t.decimals), raw: raw.toString(), isNative: false });
      } catch {
        /* token not deployed on this chain / read failed — skip */
      }
    }),
  );

  return out;
}

/** Compact one-line summary fed to the AI so it can reference real holdings. */
export function holdingsSummary(holdings: Holding[]): string {
  const nonzero = holdings.filter((h) => Number(h.balance) > 0);
  if (!nonzero.length) return "No tracked balances detected on this network.";
  return nonzero
    .map((h) => `${Number(h.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${h.symbol}`)
    .join(", ");
}
