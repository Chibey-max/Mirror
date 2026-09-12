"use client";

import { use, useState } from "react";
import Link from "next/link";
import { TrustBadge } from "@/components/TrustBadge";
import { FillFeed } from "@/components/FillFeed";
import { KillButton } from "@/components/KillButton";
import {
  PolicyRejectBanner,
  type PolicyRejectReason,
} from "@/components/PolicyRejectBanner";
import { useFillEvents } from "@/hooks/useFillEvents";
import { usePolicyError } from "@/hooks/usePolicyError";
import { fixtureAgents, fixtureWallet } from "@/lib/fixtures";

// Day 3–4 (David, PRD §5.2): tape table, deposit, follow. This file also
// carries the consequences-flow pieces (Patrick, PRD §5.3) below the
// divider so the two halves of the same screen are visible together while
// contracts aren't live yet — swap fixtures for real reads per each
// component's TODO once addresses/ABIs land (PRD §4, Day 7+).
export default function AgentDetailPage({
  params,
}: PageProps<"/agents/[id]">) {
  const { id } = use(params);
  const agent = fixtureAgents.find((a) => String(a.id) === id);
  const { fills } = useFillEvents(agent?.id);
  const { decode, simulate } = usePolicyError();

  const [rejectReason, setRejectReason] = useState<PolicyRejectReason | null>(null);
  const [killed, setKilled] = useState(false);

  const allocated = agent ? (fixtureWallet.allocated[agent.id] ?? 0) : 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        {agent ? agent.name : `Agent #${id}`}
      </h1>
      <p className="mt-2 text-muted">
        {agent ? `${agent.strategy} · ${agent.fills} fills` : "Not found in fixtures."}
      </p>

      {agent && (
        <>
          <div className="mt-4">
            <TrustBadge fillCount={agent.fills} verifiedThroughBlock={1284392} />
          </div>

          {/* --- Deposit / follow panel lands here (David, PRD §5.2) --- */}

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
                      setKilled(true);
                      return true;
                    }}
                  />
                </div>
              )}
            </div>

            <div className="mt-4">
              <FillFeed fills={fills} />
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
        </>
      )}

      <Link href="/agents" className="mt-10 inline-block text-accent">
        Back to agents
      </Link>
    </main>
  );
}
