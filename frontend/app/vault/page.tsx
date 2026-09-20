"use client";

import Link from "next/link";
import { useState } from "react";
import { DepositModal } from "@/components/DepositModal";
import { LedgerStats } from "@/components/LedgerStats";
import { MetalButton } from "@/components/MetalButton";
import { PageAtmosphere } from "@/components/PageAtmosphere";
import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { useTrackedWrite } from "@/components/TransactionToasts";
import { useRequireConnection } from "@/hooks/useRequireConnection";
import { WithdrawModal } from "@/components/WithdrawModal";
import { useAgents } from "@/hooks/useAgents";
import { useDeposit } from "@/hooks/useDeposit";
import { useFollow } from "@/hooks/useFollow";
import { useSpentToday } from "@/hooks/useSpentToday";
import { useWithdraw } from "@/hooks/useWithdraw";

/**
 * The vault, across every agent followed — not just the one you happen to
 * be looking at (design prompt §3: "a persistent vault summary").
 *
 * Before this page, balances existed only on one agent's detail screen:
 * follow two agents and there was nowhere to see the total position, or
 * what any of them had spent against their cap today. This is that screen.
 *
 * `agentIds` is every registered agent — `useFollow`'s allocation reads are
 * per (user, agent) pair with no "agents I follow" view on-chain, so the
 * caller has to name every pair worth checking. A wallet with two follows
 * out of forty agents still means forty reads; cheap relative to the
 * alternative of a screen that silently misses a follow.
 */
export default function VaultPage() {
  const { agents } = useAgents();
  const agentIds = agents.map((agent) => agent.id);

  const { walletBalance, vaultBalance, deposit, creditWallet } = useDeposit();
  const { allocatedByAgent, freeBalance, addFreeBalance, subtractFreeBalance } =
    useFollow(vaultBalance, agentIds);
  const { withdraw } = useWithdraw(freeBalance, subtractFreeBalance, creditWallet);
  const track = useTrackedWrite();
  const { requireConnection } = useRequireConnection();

  const followedIds = agentIds.filter((id) => (allocatedByAgent[id] ?? 0) > 0);
  const spentToday = useSpentToday(followedIds);
  const totalAllocated = followedIds.reduce(
    (sum, id) => sum + (allocatedByAgent[id] ?? 0),
    0,
  );

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  return (
    <div className="relative overflow-x-clip">
      <PageAtmosphere />
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
        <PageHeader
          eyebrow="Your position"
          title="Vault"
          description="Every follow, one place. The cap is enforced on-chain per agent — this is where you see what each one has actually used."
        />

        <LedgerStats
          className="mt-8"
          stats={[
            { label: "Wallet", value: `${walletBalance.toFixed(2)} USDG` },
            { label: "Vault free", value: `${freeBalance.toFixed(2)} USDG` },
            { label: "Allocated", value: `${totalAllocated.toFixed(2)} USDG` },
            { label: "Following", value: followedIds.length.toString() },
          ]}
        />

        <div className="mt-6 flex flex-wrap gap-2">
          <MetalButton
            tone="primary"
            onClick={() => requireConnection(() => setDepositOpen(true))}
          >
            Deposit
          </MetalButton>
          <MetalButton
            tone="quiet"
            onClick={() => requireConnection(() => setWithdrawOpen(true))}
          >
            Withdraw
          </MetalButton>
        </div>

        <section className="mt-10">
          <SectionHeader
            label="Active follows"
            description="Spent today is enforced by PolicyModule — this bar can't fall behind what the chain would actually block."
          />

          {followedIds.length === 0 ? (
            <div className="panel rounded-3xl p-6 text-sm text-muted">
              You&apos;re not following any agents yet.{" "}
              <Link href="/agents" className="text-accent hover:underline">
                Browse agents
              </Link>{" "}
              to set a daily cap and start mirroring.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {followedIds.map((id) => {
                const agent = agents.find((candidate) => candidate.id === id);
                const cap = allocatedByAgent[id] ?? 0;
                const spent = spentToday[id] ?? 0;
                // Cap enforcement is server-side (on-chain); a fill can still
                // land between reads and put this over 100% for a moment —
                // clamped so the bar never draws past its own track.
                const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;

                return (
                  <li key={id} className="panel rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/agents/${id}`}
                        className="font-medium text-text hover:text-accent"
                      >
                        {agent?.name ?? `Agent #${id}`}
                      </Link>
                      <span className="tabular text-xs text-muted">
                        ${spent.toFixed(2)} / ${cap.toFixed(2)} today
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`Spent today against ${agent?.name ?? `agent #${id}`}'s cap`}
                      aria-valuenow={Math.round(pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border"
                    >
                      <div
                        className={`h-full rounded-full transition-[width] ${
                          pct >= 100 ? "bg-loss" : "bg-accent"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <SiteFooter />

      <DepositModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        walletBalance={walletBalance}
        vaultBalance={vaultBalance}
        onDeposit={(amount, onProgress) =>
          track(`Deposit ${amount.toFixed(2)} USDG`, async (progress) => {
            const result = await deposit(amount, (event) => {
              progress(event);
              onProgress?.(event);
            });
            addFreeBalance(amount);
            return result;
          })
        }
      />
      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        freeBalance={freeBalance}
        onWithdraw={(amount, onProgress) =>
          track(`Withdraw ${amount.toFixed(2)} USDG`, (progress) => {
            return withdraw(amount, (event) => {
              progress(event);
              onProgress?.(event);
            });
          })
        }
      />
    </div>
  );
}
