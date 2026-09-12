import Link from "next/link";
import { WalletConnectButton } from "@/components/WalletConnectButton";

const claims = [
  {
    title: "Verifiable",
    body: "Every fill is an on-chain event with an oracle price and a timestamp, written to a ledger with no edit or delete function.",
  },
  {
    title: "Capped",
    body: "You set a daily spend cap per agent. The vault enforces it on-chain, and you hold the kill switch.",
  },
  {
    title: "Honest",
    body: "Losing agents are listed as plainly as winning ones. No cherry-picked tape.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Mirror
        </Link>
        <WalletConnectButton />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-16 sm:px-8">
        <section className="flex flex-col gap-6">
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Every trade on-chain. Every follow capped.
          </h1>
          <p className="max-w-xl text-lg text-muted">
            Mirror is a tamper-proof performance ledger for trading agents, with
            a copy vault that never gives an agent custody beyond a number you
            set yourself.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/agents"
              className="flex h-12 items-center rounded-xl bg-accent px-6 font-semibold text-bg transition hover:brightness-110"
            >
              Browse agents
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {claims.map((claim) => (
            <div
              key={claim.title}
              className="rounded-2xl border border-border bg-surface p-5"
            >
              <h2 className="font-semibold">{claim.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {claim.body}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border px-4 py-6 text-sm text-muted sm:px-8">
        Deployed on Robinhood Chain testnet (46630) · contracts verified
      </footer>
    </div>
  );
}
