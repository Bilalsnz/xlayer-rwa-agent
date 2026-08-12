/**
 * X Layer token registry for OKX DEX execution.
 *
 * IMPORTANT — SAFETY: addresses below are intentionally EMPTY placeholders.
 * A wrong ERC-20 address can send funds to the wrong contract. Fill each
 * `address` ONLY with an address you have verified on OKLink for the given
 * chain (196 mainnet / 1952 testnet). Until an address is filled, the app
 * falls back to the OKX DEX deep link instead of building a transaction.
 *
 * Native OKB uses the OKX sentinel address below (not a real contract).
 */

export const NATIVE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export interface TokenInfo {
  symbol: string;
  address: string; // "" until verified; NATIVE_TOKEN_ADDRESS for OKB
  decimals: number;
  isStable?: boolean; // used to convert amount_usd -> token amount
}

type Registry = Record<number, Record<string, TokenInfo>>;

// chainId -> UPPERCASE symbol -> TokenInfo
export const TOKENS: Registry = {
  196: {
    OKB: { symbol: "OKB", address: NATIVE_TOKEN_ADDRESS, decimals: 18 },
    // Verify these on https://www.oklink.com/xlayer before filling:
    USDC: { symbol: "USDC", address: "", decimals: 6, isStable: true },
    USDT: { symbol: "USDT", address: "", decimals: 6, isStable: true },
    // xStocks-style tokenized equities (fill when live on X Layer):
    TSLAX: { symbol: "TSLAx", address: "", decimals: 18 },
    AAPLX: { symbol: "AAPLx", address: "", decimals: 18 },
    NVDAX: { symbol: "NVDAx", address: "", decimals: 18 },
  },
  1952: {
    OKB: { symbol: "OKB", address: NATIVE_TOKEN_ADDRESS, decimals: 18 },
    USDC: { symbol: "USDC", address: "", decimals: 6, isStable: true },
    // Tokenized stocks tracked for the holdings panel. Balances are only read
    // once a verified X Layer Testnet ERC-20 address is filled in below — until
    // then the wallet simply shows its OKB balance (never a wrong-address read).
    TSLAX: { symbol: "TSLAx", address: "", decimals: 18 },
    AAPLX: { symbol: "AAPLx", address: "", decimals: 18 },
    NVDAX: { symbol: "NVDAx", address: "", decimals: 18 },
  },
};

export function resolveToken(chainId: number, symbol: string): TokenInfo | undefined {
  const key = symbol.trim().toUpperCase();
  return TOKENS[chainId]?.[key];
}

/** A token is executable if we have a verified address (or it's native). */
export function isExecutable(t: TokenInfo | undefined): t is TokenInfo {
  return !!t && (t.address === NATIVE_TOKEN_ADDRESS || /^0x[a-fA-F0-9]{40}$/.test(t.address));
}

/** Convert a USD amount to smallest-unit string, only when `from` is a stablecoin. */
export function usdToAmount(from: TokenInfo, amountUsd: number): string | undefined {
  if (!from.isStable) return undefined; // need a price oracle for non-stables (out of MVP scope)
  const units = BigInt(Math.round(amountUsd * 10 ** from.decimals));
  return units.toString();
}
