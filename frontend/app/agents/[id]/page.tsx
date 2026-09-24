"use client";

import { use, useState } from "react";
import { AgentTapeTable } from "@/components/AgentTapeTable";
import { Badge } from "@/components/Badge";
import { CopyableHash } from "@/components/Copyable";
import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { PnlChart } from "@/components/PnlChart";
import { RetryBanner } from "@/components/RetryBanner";
import { Reveal } from "@/components/Reveal";
import { PageAtmosphere } from "@/components/PageAtmosphere";
import { SiteFooter } from "@/components/SiteFooter";
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
import { useAgentPnlHistory } from "@/hooks/useAgentPnlHistory";
import { useFillEvents } from "@/hooks/useFillEvents";
import { useKillVerification } from "@/hooks/useKillVerification";
import { useMirrorOutcomes } from "@/hooks/useMirrorOutcomes";
import { useSpentToday } from "@/hooks/useSpentToday";
import { usePolicyError, useMirrorRejection } from "@/hooks/usePolicyError";
import { useAgent } from "@/hooks/useAgents";
import { FAUCET_AMOUNT, useDeposit } from "@/hooks/useDeposit";
import { useFollow } from "@/hooks/useFollow";
import { useWithdraw } from "@/hooks/useWithdraw";
import { MetalButton } from "@/components/MetalButton";
import { useTrackedWrite } from "@/components/TransactionToasts";
import { useRequireConnection } from "@/hooks/useRequireConnection";
import { spentTodayTier } from "@/lib/format";

// Day 3–4 (David, PRD §5.2): tape table, deposit, follow. This file also
// carries the consequences-flow pieces (Patrick, PRD §5.3) below the
// divider so the two halves of the same screen are visible together. Every
// hook below reads the chain where one is deployed and falls back to
// fixtures where it isn't (PRD §4), so this page needs no fixture imports.
export default function AgentDetailPage({
  params,
}: PageProps<"/agents/[id]">) {
  const { id } = use(params);
  const agentId = Number(id);
  const { agent, fills: tapeFills, isLoading, error, refetch } = useAgent(agentId);
  const { points: pnlHistory } = useAgentPnlHistory(agentId);
  const { fills, totalCount, hasMore, loadMore } = useFillEvents(agent?.id);
  const { decode, simulate } = usePolicyError();
  // Proves the kill from chain state rather than trusting the write (§10).
  const { verify: verifyKill } = useKillVerification(agentId);
  // A real rejection from the chain (§7.1). Inert until CopyVault is
  // deployed; the simulate buttons below are the demo stand-in until then.
  const { rejection, clear: clearRejection } = useMirrorRejection(agentId);
  // Per-fill: mirrored, blocked, or never touched this vault (§7.1).
  const mirrorOutcomes = useMirrorOutcomes(agentId);

  const {
    walletBalance,
    vaultBalance,
    deposit,
    creditWallet,
    faucetAvailable,
    getTestUsdg,
  } = useDeposit();
  const {
    allocatedByAgent,
    freeBalance,
    follow,
    unfollow,
    addFreeBalance,
    subtractFreeBalance,
  } = useFollow(vaultBalance, [agentId]);
  const { withdraw } = useWithdraw(freeBalance, subtractFreeBalance, creditWallet);
  // Reports every write to the header's pending count and a toast that
  // outlives whichever modal started it (closing mid-transaction used to
  // make the transaction disappear).
  const track = useTrackedWrite();
  // A disconnected visitor browses read-only; an action prompts them to
  // connect instead of running against nothing and failing silently at the
  // wallet layer (§13), easy to miss, since the fixture path renders a
  // full "as if following" demo state with nobody connected at all.
  const { isConnected, requireConnection } = useRequireConnection();
  const allocated = agent ? (allocatedByAgent[agent.id] ?? 0) : 0;
  // Only asked live while there's a cap to measure against (design prompt
  // §5: "spent today, progress bar against the cap"), allocated doubles as
  // the cap because follow() sets both from the one capAmount argument.
  const spentToday = useSpentToday(allocated > 0 ? [agentId] : []);

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
  /*
   * Keeps KillButton mounted across the kill. It renders the "can no longer
   * move your funds" badge itself, off its own verified state, and the
   * allocation it was mounted for is zero by then, so mounting on the
   * allocation alone tears the badge down at the moment it is earned.
   */
  const [killStarted, setKillStarted] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  if (!Number.isInteger(agentId) || agentId <= 0) {
    return (
      <div className="relative overflow-x-clip">
        <PageAtmosphere />
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="outline-none mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
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
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="relative overflow-x-clip">
      <PageAtmosphere />
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
      {isLoading && (
        <div className="mt-8 animate-pulse" aria-label="Loading agent">
          <div className="h-9 w-48 rounded-lg bg-surface" />
          <div className="mt-3 h-4 w-80 rounded-lg bg-surface" />
          <div className="mt-8 h-64 rounded-3xl bg-surface" />
        </div>
      )}

      {error && (
        <RetryBanner
          className="mt-8"
          message="Could not load this agent from the chain. The RPC may be unreachable."
          onRetry={refetch}
        />
      )}

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
                  <dd className="min-w-0 text-text">
                    <CopyableHash
                      value={agent.strategyHash}
                      label="Copy the full strategy hash"
                    />
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

      {/*
        The big PnL figure plus a ranged chart (design prompt §5), the page
        had neither before this, only the number buried in a card elsewhere.
        Same pnlPct/pnlUsd as the leaderboard and the agent cards; the chart
        is the evidence behind that one number, not a second computation.
      */}
      {agent && (
        <Reveal>
          <section className="mt-8 panel rounded-3xl p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  Realised PnL
                </p>
                <p
                  className={`tabular mt-1 text-3xl font-semibold ${
                    agent.pnlPct < 0 ? "text-loss" : "text-profit"
                  }`}
                >
                  {agent.pnlPct > 0 ? "+" : ""}
                  {agent.pnlPct.toFixed(1)}%
                  <span className="ml-2 text-base text-muted">
                    {agent.pnlUsd > 0 ? "+" : ""}
                    {agent.pnlUsd.toFixed(2)} USDG
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-5">
              <PnlChart points={pnlHistory} />
            </div>
          </section>
        </Reveal>
      )}

      {!isLoading && !error && !agent && (
        <div className="mt-8 panel rounded-3xl p-6 text-sm text-muted">
          Agent #{agentId} is not in the current fixture set. Once
          AgentRegistry is wired, this page will resolve from chain reads.
        </div>
      )}

      {agent && (
        <>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
            <Reveal className="min-w-0">
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
                <FillFeed
                  fills={fills}
                  outcomes={mirrorOutcomes}
                  totalCount={totalCount}
                  hasMore={hasMore}
                  onLoadMore={loadMore}
                />

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
            </Reveal>

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

                {/*
                  The follow panel design prompt §5 asks for: cap, spent
                  today against it, allocation (above), kill switch (below).
                  Only shown while following, spending against a cap that
                  doesn't exist isn't a state that means anything.
                */}
                {allocated > 0 && (() => {
                  const spent = spentToday[agentId] ?? 0;
                  // Enforcement is on-chain; a fill can still land between
                  // reads and put this over 100% for a moment, clamped so
                  // the bar never draws past its own track.
                  const pct = Math.min(100, (spent / allocated) * 100);
                  return (
                    <div className="mt-4 border-t border-border pt-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm text-muted">Spent today</p>
                        <p className="tabular text-sm font-semibold">
                          {pct >= 100 ? (
                            <span className="text-loss">Cap reached</span>
                          ) : (
                            <>
                              ${spent.toFixed(2)}
                              <span className="text-muted"> / ${allocated.toFixed(2)}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`Spent today against ${agent.name}'s cap`}
                        aria-valuenow={Math.round(pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
                      >
                        <div
                          className={`h-full rounded-full transition-[width] ${spentTodayTier(pct)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {pct >= 100 && (
                        <p className="mt-1.5 text-xs text-muted">
                          Buys will reject until the cap resets; sells still
                          pass.
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="mt-5 flex flex-col gap-2">
                  <MetalButton
                    tone="primary"
                    fullWidth
                    onClick={() => requireConnection(() => setDepositOpen(true))}
                  >
                    Deposit
                  </MetalButton>
                  <MetalButton
                    tone="quiet"
                    fullWidth
                    onClick={() => requireConnection(() => setFollowOpen(true))}
                    disabled={allocated > 0}
                  >
                    {allocated > 0 ? "Following" : "Follow with cap"}
                  </MetalButton>
                  <MetalButton
                    tone="quiet"
                    fullWidth
                    onClick={() => requireConnection(() => setWithdrawOpen(true))}
                  >
                    Withdraw
                  </MetalButton>
                </div>
              </div>

              {(allocated > 0 || killStarted) && (
                <div className="mt-4">
                  <KillButton
                    agentName={agent.name}
                    allocatedAmount={allocated}
                    onKill={(onProgress) => {
                      if (!isConnected) {
                        requireConnection(() => {});
                        return Promise.reject(
                          new Error("Connect your wallet to kill a follow."),
                        );
                      }
                      setKillStarted(true);
                      return track(`Kill follow: ${agent.name}`, (progress) => {
                        return unfollow(agent.id, (event) => {
                          progress(event);
                          onProgress?.(event);
                        });
                      });
                    }}
                    verify={verifyKill}
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
            onGetTestUsdg={
              faucetAvailable
                ? () =>
                    track(
                      `Get ${FAUCET_AMOUNT.toLocaleString()} test USDG`,
                      (progress) => getTestUsdg(progress),
                    )
                : undefined
            }
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
          <FollowModal
            open={followOpen}
            onClose={() => setFollowOpen(false)}
            agentId={agent.id}
            agentName={agent.name}
            freeBalance={freeBalance}
            alreadyFollowing={allocated > 0}
            onFollow={(input, onProgress) =>
              track(`Follow with $${input.capAmount.toFixed(2)} cap`, (progress) => {
                return follow(input, (event) => {
                  progress(event);
                  onProgress?.(event);
                });
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
        </>
      )}

      </main>
      <SiteFooter />
    </div>
  );
}
