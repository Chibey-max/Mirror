"use client";

import { use, useState } from "react";
import Link from "next/link";
import { AgentTapeTable } from "@/components/AgentTapeTable";
import { DepositModal } from "@/components/DepositModal";
import { FollowModal } from "@/components/FollowModal";
import { WithdrawModal } from "@/components/WithdrawModal";
import { TrustBadge } from "@/components/TrustBadge";
import { FillFeed } from "@/components/FillFeed";
import { KillButton } from "@/components/KillButton";
import {
  PolicyRejectBanner,
  type PolicyRejectReason,
} from "@/components/PolicyRejectBanner";
import { useFillEvents } from "@/hooks/useFillEvents";
import { useKillVerification } from "@/hooks/useKillVerification";
import { useMirrorOutcomes } from "@/hooks/useMirrorOutcomes";
import { usePolicyError, useMirrorRejection } from "@/hooks/usePolicyError";
import { useAgent } from "@/hooks/useAgents";
import { useDeposit } from "@/hooks/useDeposit";
import { useFollow } from "@/hooks/useFollow";
import { useWithdraw } from "@/hooks/useWithdraw";

// Day 3–4 (David, PRD §5.2): tape table, deposit, follow. This file also
// carries the consequences-flow pieces (Patrick, PRD §5.3) below the
// divider so the two halves of the same screen are visible together while
// contracts aren't live yet — swap fixtures for real reads per each
// component's TODO once addresses/ABIs land (PRD §4, Day 7+).
export default function AgentDetailPage({
  params,
}: PageProps<"/agents/[id]">) {
  const { id } = use(params);
  const agentId = Number(id);
  const { agent, fills: tapeFills } = useAgent(agentId);
  const { fills } = useFillEvents(agent?.id);
  const { decode, simulate } = usePolicyError();
  // Proves the kill from chain state rather than trusting the write (§10).
  const { verify: verifyKill } = useKillVerification(agentId);
  // A real rejection from the chain (§7.1). Inert until CopyVault is
  // deployed; the simulate buttons below are the demo stand-in until then.
  const { rejection, clear: clearRejection } = useMirrorRejection(agentId);
  // Per-fill: mirrored, blocked, or never touched this vault (§7.1).
  const mirrorOutcomes = useMirrorOutcomes(agentId);

  const { walletBalance, vaultBalance, deposit, creditWallet } = useDeposit();
  const { allocatedByAgent, freeBalance, follow, addFreeBalance, subtractFreeBalance } =
    useFollow(vaultBalance, [agentId]);
  const { withdraw } = useWithdraw(freeBalance, subtractFreeBalance, creditWallet);

  const [rejectReason, setRejectReason] = useState<PolicyRejectReason | null>(null);
  /*
   * A live rejection wins over a simulated one and carries the real
   * mirrorFill tx that logged it; the demo control has only a fixture hash
   * to point at.
   */
  const banner = rejection
    ? { reason: rejection.reason, txHash: rejection.txHash }
    : rejectReason
      ? {
          reason: rejectReason,
          txHash:
            "0x8e11c0b4da9f3c5e1b7d9f3a5c7e1b9d3f5a7c1e9b3d5f7a1c9e3b5d7f1a9c3",
        }
      : null;
  const [killed, setKilled] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const allocated = agent ? (allocatedByAgent[agent.id] ?? 0) : 0;

  if (!Number.isInteger(agentId) || agentId <= 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">Agent not found</h1>
        <p className="mt-2 text-muted">This route does not map to an agent id.</p>
        <Link href="/agents" className="mt-8 inline-block text-accent">
          Back to agents
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        {agent ? agent.name : `Agent #${id}`}
      </h1>
      <p className="mt-2 text-muted">
        {agent ? `${agent.strategy} · ${agent.fills} fills` : "Not found in fixtures."}
      </p>

      {!agent && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
          Agent #{agentId} is not in the current fixture set. Once
          AgentRegistry is wired, this page will resolve from chain reads.
        </div>
      )}

      {agent && (
        <>
          <div className="mt-4">
            <TrustBadge fillCount={agent.fills} verifiedThroughBlock={1284392} />
          </div>

          <section className="mt-8 rounded-2xl border border-border bg-surface p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted">Wallet</p>
                <p className="tabular mt-1 text-xl font-semibold">
                  {walletBalance.toFixed(2)} USDG
                </p>
              </div>
              <div>
                <p className="text-sm text-muted">Vault free</p>
                <p className="tabular mt-1 text-xl font-semibold">
                  {freeBalance.toFixed(2)} USDG
                </p>
              </div>
              <div>
                <p className="text-sm text-muted">Allocated here</p>
                <p className="tabular mt-1 text-xl font-semibold">
                  {allocated.toFixed(2)} USDG
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setDepositOpen(true)}
                className="h-11 rounded-xl bg-accent px-5 font-semibold text-bg transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent/70"
              >
                Deposit
              </button>
              <button
                type="button"
                onClick={() => setFollowOpen(true)}
                disabled={allocated > 0}
                className="h-11 rounded-xl border border-border px-5 font-semibold text-text transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus:ring-2 focus:ring-accent/70"
              >
                {allocated > 0 ? "Following" : "Follow with cap"}
              </button>
              <button
                type="button"
                onClick={() => setWithdrawOpen(true)}
                className="h-11 rounded-xl border border-border px-5 font-semibold text-text transition hover:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/70"
              >
                Withdraw
              </button>
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Verified tape</h2>
                <p className="mt-1 text-sm text-muted">
                  Every row carries its own explorer link.
                </p>
              </div>
            </div>
            <AgentTapeTable fills={tapeFills} />
          </section>

          <div className="my-10 border-t border-border" />

          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Live activity</h2>
              {!killed && allocated > 0 && (
                <div className="w-48">
                  <KillButton
                    agentName={agent.name}
                    allocatedAmount={allocated}
                    onKill={async () => ({
                      txHash:
                        "0xb7d2c5e1a9f3b5d7c1e9a3f5b7d1c9e3a5f7b1d9c3e5a7f9b1d3a5c7e9f1b3d",
                    })}
                    verify={async () => {
                      const dead = await verifyKill();
                      if (dead) setKilled(true);
                      return dead;
                    }}
                  />
                </div>
              )}
            </div>

            <div className="mt-4">
              <FillFeed fills={fills} outcomes={mirrorOutcomes} />
            </div>

            {/* Mirrors the mock's "Simulate a mirror attempt →" control so the
                PolicyReject banner is demo-able without live market state. */}
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  { type: "CapExceeded", attempted: 80, cap: 50 },
                  { type: "TokenNotAllowed", token: "mTSLA" },
                  { type: "PolicyInactive" },
                  { type: "InsufficientBalance" },
                ] as PolicyRejectReason[]
              ).map((reason) => (
                <button
                  key={reason.type}
                  type="button"
                  onClick={() => setRejectReason(decode(simulate(reason)))}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-text"
                >
                  Simulate {reason.type} →
                </button>
              ))}
            </div>

            {banner && (
              <div className="mt-4">
                <PolicyRejectBanner
                  reason={banner.reason}
                  txHash={banner.txHash}
                  onDismiss={() => {
                    clearRejection();
                    setRejectReason(null);
                  }}
                />
              </div>
            )}
          </section>

          <DepositModal
            open={depositOpen}
            onClose={() => setDepositOpen(false)}
            walletBalance={walletBalance}
            vaultBalance={vaultBalance}
            onDeposit={async (amount) => {
              const result = await deposit(amount);
              addFreeBalance(amount);
              return result;
            }}
          />
          <FollowModal
            open={followOpen}
            onClose={() => setFollowOpen(false)}
            agentId={agent.id}
            agentName={agent.name}
            freeBalance={freeBalance}
            alreadyFollowing={allocated > 0}
            onFollow={follow}
          />
          <WithdrawModal
            open={withdrawOpen}
            onClose={() => setWithdrawOpen(false)}
            freeBalance={freeBalance}
            onWithdraw={withdraw}
          />
        </>
      )}

      <Link href="/agents" className="mt-10 inline-block text-accent">
        Back to agents
      </Link>
    </main>
  );
}
