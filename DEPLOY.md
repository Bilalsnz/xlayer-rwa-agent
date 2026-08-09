# Deploy on a phone — $0, step by step

Goal: a public link (`https://your-app.vercel.app`) where anyone can chat with the
AI RWA analyst. Everything here is free. ~20–30 minutes.

You need 3 free accounts (all work in a phone browser):
1. **GitHub** — holds the code (you have this)
2. **Groq** — free AI key: https://console.groq.com  → "API Keys" → Create
3. **Vercel** — free hosting: https://vercel.com  → "Sign up with GitHub"

The AI chat + structured JSON works with just Groq. The on-chain "Anchor" button
needs the contract deployed (Part C, optional for a first live demo). Swaps use the
free deep link, no key.

---

## Part A — Get the code onto GitHub

If I pushed it for you, skip to Part B. Otherwise, from a phone you have two easy
options:

**Option 1 — GitHub web upload (no tools):**
1. github.com → new repo → name it `xlayer-rwa-agent` → Create.
2. On the repo page tap **"uploading an existing file"**.
3. Upload the project files (the `web/` and `contracts/` folders + README).
4. Commit.

**Option 2 — ask me to push it** (if you log GitHub in here). Then it's already up.

---

## Part B — Deploy the web app on Vercel (this gives your link)

1. vercel.com → **Add New… → Project**.
2. **Import** the `xlayer-rwa-agent` repo.
3. IMPORTANT — set **Root Directory** to `web` (tap Edit next to Root Directory,
   pick the `web` folder). The app lives in `web/`, not the repo root.
4. Framework preset: **Next.js** (auto-detected).
5. Open **Environment Variables** and add:
   - `AI_API_KEY` = your Groq key (starts `gsk_`)
   - `AI_BASE_URL` = `https://api.groq.com/openai/v1`
   - `AI_MODEL` = `llama-3.3-70b-versatile`
6. Tap **Deploy**. Wait ~2 min. You get `https://xlayer-rwa-agent.vercel.app`.

That link now works: connect a wallet, ask a question, get structured JSON.

To change env vars later: Vercel → Project → Settings → Environment Variables →
edit → then Deployments → Redeploy.

---

## Part C — Deploy the contract to X Layer testnet (optional, free)

This powers the on-chain "Anchor on-chain" button. Skip for a first demo; add later.

Testnet OKB is free from a faucet, so this costs nothing. Foundry needs a computer
or a cloud shell (GitHub Codespaces is free and works from a phone browser):

1. On the repo → tap **Code → Codespaces → Create codespace**.
2. In the terminal:
   ```bash
   curl -L https://foundry.paradigm.xyz | bash && ~/.foundry/bin/foundryup
   cd contracts
   forge install foundry-rs/forge-std --no-commit
   forge build && forge test
   ```
3. Create a throwaway wallet in OKX Wallet, switch it to **X Layer testnet (1952)**,
   and get free OKB from the X Layer testnet faucet.
4. Put that wallet's private key in `contracts/.env` as `PRIVATE_KEY` (testnet only —
   never a wallet with real funds).
5. Deploy:
   ```bash
   source .env
   forge script script/Deploy.s.sol --rpc-url xlayer_testnet --broadcast
   ```
6. Copy the printed address. In Vercel, set
   `NEXT_PUBLIC_REGISTRY_ADDRESS_TESTNET` = that address, then Redeploy.

Now the "Anchor on-chain" button writes your AI analysis to X Layer.

---

## What judges will see
- A live link, dark UI, wallet connect to X Layer.
- Ask about TSLAx/AAPLx → clean **structured JSON** analysis (scored cards + raw JSON).
- "Anchor on-chain" → a real testnet transaction on OKLink.
- "Trade on OKX DEX" → opens OKX DEX swap for X Layer (volume path).

## Cost recap: $0
- Groq AI: free tier. Vercel: free Hobby. GitHub: free. Testnet OKB: free faucet.
- Nothing here needs a card or real money. Keep it on testnet to stay at $0.
