import crypto from "node:crypto";

/**
 * Server-only OKX DEX Aggregator API client.
 * Docs: https://web3.okx.com/build/dev-docs (DEX API / aggregator).
 *
 * Auth: every request carries OK-ACCESS-* headers. The signature is
 *   Base64( HMAC-SHA256( timestamp + method + requestPath + queryString , secret ) )
 * The querystring signed here MUST byte-match the querystring on the sent URL.
 *
 * NEVER import this from client code — it reads secret credentials from env.
 */

const BASE_URL = process.env.OKX_API_BASE_URL ?? "https://web3.okx.com";
const API_PREFIX = "/api/v5/dex/aggregator";

interface OkxCreds {
  key: string;
  secret: string;
  passphrase: string;
  project: string;
}

function readCreds(): OkxCreds | null {
  const key = process.env.OKX_API_KEY;
  const secret = process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_API_PASSPHRASE;
  const project = process.env.OKX_API_PROJECT ?? "";
  if (!key || !secret || !passphrase) return null;
  return { key, secret, passphrase, project };
}

function sign(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

async function okxGet<T = unknown>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const creds = readCreds();
  if (!creds) throw new Error("OKX API credentials not configured on the server.");

  // Build a stable querystring and reuse the exact same string for signing + URL.
  const queryString = "?" + new URLSearchParams(params).toString();
  const requestPath = `${API_PREFIX}${path}`;
  const timestamp = new Date().toISOString();
  const prehash = timestamp + "GET" + requestPath + queryString;

  const res = await fetch(`${BASE_URL}${requestPath}${queryString}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": creds.key,
      "OK-ACCESS-SIGN": sign(creds.secret, prehash),
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": creds.passphrase,
      "OK-ACCESS-PROJECT": creds.project,
    },
  });

  const json = (await res.json()) as { code?: string; msg?: string } & T;
  if (!res.ok) throw new Error(`OKX API HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  if (json.code && json.code !== "0") throw new Error(`OKX API error ${json.code}: ${json.msg ?? "unknown"}`);
  return json;
}

export interface SwapTx {
  to: string;
  data: string;
  value: string;
  gas?: string;
  gasPrice?: string;
}

export function okxCredsConfigured(): boolean {
  return readCreds() !== null;
}

export function getQuote(p: {
  chainId: string;
  amount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
}) {
  return okxGet<{ data: unknown[] }>("/quote", p);
}

export function getApproveTransaction(p: {
  chainId: string;
  tokenContractAddress: string;
  approveAmount: string;
}) {
  return okxGet<{ data: { data: string; dexContractAddress: string }[] }>("/approve-transaction", p);
}

export function getSwap(p: {
  chainId: string;
  amount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  slippage: string;
  userWalletAddress: string;
}) {
  return okxGet<{ data: { tx: SwapTx; routerResult?: unknown }[] }>("/swap", p);
}
