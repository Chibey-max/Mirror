"use client";

import { use, useState } from "react";
import { AgentTapeTable } from "@/components/AgentTapeTable";
import { Badge } from "@/components/Badge";
import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { PageAtmosphere } from "@/components/PageAtmosphere";
import { SiteHeader } from "@/components/SiteHeader";
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
import { usePolicyError } from "@/hooks/usePolicyError";
import { useAgent } from "@/hooks/useAgents";
import { useDeposit } from "@/hooks/useDeposit";
import { useFollow } from "@/hooks/useFollow";
import { useWithdraw } from "@/hooks/useWithdraw";
import { MetalButton } from "@/components/MetalButton";

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
  const { walletBalance, vaultBalance, deposit, creditWallet } = useDeposit();
  const { allocatedByAgent, freeBalance, follow, addFreeBalance, subtractFreeBalance } =
    useFollow(vaultBalance);
  const { withdraw } = useWithdraw(freeBalance, subtractFreeBalance, creditWallet);

  const [rejectReason, setRejectReason] = useState<PolicyRejectReason | null>(null);
  const [killed, setKilled] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const allocated = agent ? (allocatedByAgent[agent.id] ?? 0) : 0;

  if (!Number.isInteger(agentId) || agentId <= 0) {
    return (
      <div className="relative overflow-x-clip">
        <PageAtmosphere />
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
          <PageHeader
            eyebrow="Registry"
            title="Agent not found"
            description="This route does not map to an agent id."
            actions={
              <MetalButton tone="quiet" href="/agents" size="sm">
                Browse agents
              </MetalButton>
            }
          />
        </main>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-clip">
      <PageAtmosphere />
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
      {agent && (
        <div className="border-b border-border pb-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                Agent #{agent.id} &middot; {agent.strategy}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="font-display text-4xl tracking-tight">
                  {agent.name}
                </h1>
                {agent.isLosing ? (
                  <Badge variant="losing">Losing agent</Badge>
                ) : (
                  <Badge variant="verified">Verified</Badge>
                )}
              </div>
              {/*
                What the registry actually holds about this agent. The hash is
                the claim the tape is checked against, so it belongs on the
                page rather than only in the card that linked here.
              */}
              <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-2 font-mono text-[11px] text-muted">
                <div className="flex gap-2">
                  <dt className="uppercase tracking-[0.08em]">Model</dt>
                  <dd className="text-text">{agent.modelVersion}</dd>
                </div>
                <div className="flex min-w-0 gap-2">
                  <dt className="uppercase tracking-[0.08em]">Strategy hash</dt>
                  <dd className="truncate text-text">
                    {agent.strategyHash.slice(0, 10)}…{agent.strategyHash.slice(-6)}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="uppercase tracking-[0.08em]">Registered</dt>
                  <dd className="text-text">{agent.registeredAt}</dd>
                </div>
              </dl>
            </div>

            <div className="flex-none">
              <TrustBadge fillCount={agent.fills} verifiedThroughBlock={1284392} />
            </div>
          </div>
        </div>
      )}

      {!agent && (
        <div className="mt-8 panel rounded-3xl p-6 text-sm text-muted">
          Agent #{agentId} is not in the current fixture set. Once
          AgentRegistry is wired, this page will resolve from chain reads.
        </div>
      )}

      {agent && (
        <>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
            <div className="min-w-0">
              <section>
                <SectionHeader
                  label="Verified tape"
                  description="Every row carries its own explorer link."
                />
                <AgentTapeTable fills={tapeFills} />
              </section>

              <section className="mt-10">
                <SectionHeader
                  label="Live activity"
                  description="Fills as the runner mirrors them into your vault."
                />
                <FillFeed fills={fills} />

                {/*
                  Demo controls, boxed and labelled so nobody watching the
                  demo mistakes them for something a follower would ever see.
                  They stand in for live market state (docs/demo-script.md).
                */}
                <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    Demo controls &middot; not part of the product
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  { type: "CapExceeded", attempted: 80, cap: 50 },
                  { type: "TokenNotAllowed", token: "mTSLA" },
                  { type: "PolicyInactive" },
                  { type: "InsufficientBalance" },
                ] as PolicyRejectReason[]
              ).map((reason) => (
                <MetalButton
                  tone="quiet"
                  size="sm"
                  key={reason.type}
                  onClick={() => setRejectReason(decode(simulate(reason)))}
                >
                  Simulate {reason.type} →
                </MetalButton>
              ))}
            </div>

                </div>

                {rejectReason && (
                  <div className="mt-4">
                    <PolicyRejectBanner
                      reason={rejectReason}
                      txHash="0x8e11c0b4da9f3c5e1b7d9f3a5c7e1b9d3f5a7c1e9b3d5f7a1c9e3b5d7f1a9c3"
                      onDismiss={() => setRejectReason(null)}
                    />
                  </div>
                )}
              </section>
            </div>

            {/*
              Balances and the actions that change them travel together, and
              stay in view while the tape is scrolled.
            */}
            <aside className="order-first lg:order-none lg:sticky lg:top-6 lg:self-start">
              <div className="panel rounded-3xl p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  Your position
                </p>
                <dl className="mt-3 divide-y divide-border">
                  {[
                    { label: "Wallet", value: walletBalance },
                    { label: "Vault free", value: freeBalance },
                    { label: "Allocated here", value: allocated },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between gap-3 py-2.5"
                    >
                      <dt className="text-sm text-muted">{row.label}</dt>
                      <dd className="tabular font-semibold">
                        {row.value.toFixed(2)}{" "}
                        <span className="text-xs text-muted">USDG</span>
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5 flex flex-col gap-2">
                  <MetalButton
                    tone="primary"
                    fullWidth
                    onClick={() => setDepositOpen(true)}
                  >
                    Deposit
                  </MetalButton>
                  <MetalButton
                    tone="quiet"
                    fullWidth
                    onClick={() => setFollowOpen(true)}
                    disabled={allocated > 0}
                  >
                    {allocated > 0 ? "Following" : "Follow with cap"}
                  </MetalButton>
                  <MetalButton tone="quiet" fullWidth onClick={() => setWithdrawOpen(true)}>
                    Withdraw
                  </MetalButton>
                </div>
              </div>

              {!killed && allocated > 0 && (
                <div className="mt-4">
                  <KillButton
                    agentName={agent.name}
                    allocatedAmount={allocated}
                    onKill={async () => ({
                      txHash:
                        "0xb7d2c5e1a9f3b5d7c1e9a3f5b7d1c9e3a5f7b1d9c3e5a7f9b1d3a5c7e9f1b3d",
                    })}
                    verify={async () => {
                      setKilled(true);
                      return true;
                    }}
                  />
                </div>
              )}
            </aside>
          </div>

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

      </main>
    </div>
  );
}
