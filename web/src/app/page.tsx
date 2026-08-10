import { ConnectButton } from "@/components/ConnectButton";
import { AppShell } from "@/components/AppShell";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-32">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            X-RWA Agent <span className="text-accent">·</span>{" "}
            <span className="text-muted text-sm font-normal">AI RWA analyst on X Layer</span>
          </h1>
          <p className="text-xs text-muted">Tokenized equities & ETFs · structured analysis · execute on OKX DEX</p>
        </div>
        <ConnectButton />
      </header>
      <AppShell />
      <footer className="mt-12 text-center text-xs text-muted">
        Not financial advice. Built for the OKX X Layer BuildX AI hackathon.
      </footer>
    </main>
  );
}
