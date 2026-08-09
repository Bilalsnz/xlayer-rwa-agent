# X-RWA Agent — AI RWA Analyst & Execution Agent on OKX X Layer

AI analyst that scores tokenized real-world assets (xStocks-style equities/ETFs),
returns **schema-valid JSON**, anchors each analysis **on-chain on X Layer**, and
routes execution through **OKX DEX**.

## Verified X Layer config
| | Chain ID | RPC | Explorer |
|---|---|---|---|
| Mainnet | 196 (0xC4) | https://rpc.xlayer.tech · https://xlayerrpc.okx.com | https://www.oklink.com/xlayer |
| Testnet | 1952 (0x7A0) | https://testrpc.xlayer.tech/terigon · https://xlayertestrpc.okx.com/terigon | https://www.oklink.com/x-layer-testnet |

Gas token: **OKB**.

## Structure
- `contracts/` — Foundry project (`RWAAgentRegistry.sol` + tests + deploy script)
- `web/` — Next.js 15 + wagmi/viem app (chat, on-chain anchor, OKX DEX path)

## Quickstart

### Contracts
```bash
cd contracts
forge install foundry-rs/forge-std   # first time
forge build
forge test
cp .env.example .env                  # add a TESTNET PRIVATE_KEY
forge script script/Deploy.s.sol --rpc-url xlayer_testnet --broadcast
```
Copy the deployed address into `web/.env`.

### Web
```bash
cd web
npm install
cp .env.example .env                  # add AI_API_KEY (free Groq key) + registry address
npm run dev
```

## $0-cost stack
- **AI:** free **Groq** key (console.groq.com, no card). Any OpenAI-compatible
  endpoint works — set `AI_BASE_URL` / `AI_MODEL`.
- **Swaps:** free OKX DEX **deep link** (no API key). Prepared-tx API is optional.
- **Contract:** deploy to **testnet (1952)** with free faucet OKB.
- **Hosting:** GitHub + Vercel Hobby — both free.

See [DEPLOY.md](./DEPLOY.md) for phone-only, tap-by-tap deployment.

## How the JSON stays reliable
The `/api/analyze` route forces the model to answer through a single function
(`submit_rwa_analysis`) whose parameters ARE the required RWA schema (enums +
numeric bounds), with `tool_choice` pinned to it. The model cannot return prose —
only structured, schema-shaped arguments.

## OKX DEX execution (two paths)
1. **Prepared transaction (preferred, reliable volume path).** `/api/okx` calls the
   OKX DEX Aggregator API (`/api/v5/dex/aggregator/{quote,swap,approve-transaction}`)
   server-side with signed `OK-ACCESS-*` headers, and returns calldata the **user
   signs** in their wallet (approve → swap). Funds never touch the server. Requires
   `OKX_API_*` env vars (request access via dexapi@okx.com) and **verified token
   addresses** in `src/lib/tokens.ts`.
2. **Deep link (automatic fallback).** When the API isn't configured, a token
   address isn't verified, or the trade can't be sized, the UI falls back to
   `buildOkxDexSwapUrl` — opening the OKX DEX swap UI for the user to confirm.

> Safety: `src/lib/tokens.ts` ships with EMPTY address placeholders on purpose.
> Fill each only with an address verified on OKLink — a wrong ERC-20 address can
> misroute funds. Non-stablecoin sell-sides need a price oracle (out of MVP scope),
> so those also fall back to the deep link.

## Security notes
- `ANTHROPIC_API_KEY` is server-only (never `NEXT_PUBLIC_`).
- No funds or keys held; all on-chain writes and swaps are user-signed.
- Rate-limit `/api/analyze` before any public deployment.
