import { describe, expect, it } from "vitest";
import { computeAgentPnl, tradesFromFills, type MirroredTrade } from "@/lib/pnl";
import { fixtureFills } from "@/lib/fixtures";

/**
 * The cases these cover are the ones where a plausible-looking
 * implementation is wrong rather than merely imprecise: a sell with nothing
 * held, a sell larger than the position, and two tokens sharing one agent's
 * book. Each of those has a wrong answer that still renders as a number on
 * the leaderboard, which is exactly what PRD v2.2 §10 is trying to prevent.
 */
const buy = (token: string, size: number, price: number): MirroredTrade => ({
  agentId: 1,
  token,
  isBuy: true,
  size,
  price,
});

const sell = (token: string, size: number, price: number): MirroredTrade => ({
  agentId: 1,
  token,
  isBuy: false,
  size,
  price,
});

/** Floats: compare cents, not bit patterns. */
const cents = (value: number) => Math.round(value * 100) / 100;

describe("computeAgentPnl", () => {
  it("realises a profit on a closed round trip", () => {
    const pnl = computeAgentPnl([buy("mNVDA", 2, 100), sell("mNVDA", 2, 120)]);
    const agent = pnl.get(1)!;

    expect(cents(agent.pnlUsd)).toBe(40);
    expect(cents(agent.closedCost)).toBe(200);
    expect(cents(agent.pnlPct)).toBe(20);
    expect(cents(agent.openCost)).toBe(0);
  });

  it("realises a loss on a closed round trip", () => {
    const pnl = computeAgentPnl([buy("mNVDA", 2, 100), sell("mNVDA", 2, 85)]);
    const agent = pnl.get(1)!;

    expect(cents(agent.pnlUsd)).toBe(-30);
    expect(cents(agent.pnlPct)).toBe(-15);
  });

  it("realises only the closed half of a partial exit", () => {
    const pnl = computeAgentPnl([buy("mNVDA", 4, 100), sell("mNVDA", 1, 150)]);
    const agent = pnl.get(1)!;

    expect(cents(agent.pnlUsd)).toBe(50);
    // One unit closed at a $100 basis; the other three stay on the books.
    expect(cents(agent.closedCost)).toBe(100);
    expect(cents(agent.openCost)).toBe(300);
    expect(cents(agent.pnlPct)).toBe(50);
  });

  it("prices the exit off the weighted average of two buys", () => {
    const pnl = computeAgentPnl([
      buy("mNVDA", 1, 100),
      buy("mNVDA", 3, 200),
      sell("mNVDA", 4, 200),
    ]);
    const agent = pnl.get(1)!;

    // Average cost is (100 + 600) / 4 = 175, so the exit at 200 makes $100 —
    // not the $0 that pricing against the last buy would report.
    expect(cents(agent.pnlUsd)).toBe(100);
    expect(cents(agent.closedCost)).toBe(700);
  });

  it("ignores a sell against a position that was never opened", () => {
    const pnl = computeAgentPnl([sell("mAAPL", 5, 200)]);
    const agent = pnl.get(1)!;

    // §7.2: nothing held is nothing to mirror. Treating this as a short
    // would book $1,000 of PnL out of thin air.
    expect(cents(agent.pnlUsd)).toBe(0);
    expect(cents(agent.closedCost)).toBe(0);
    expect(cents(agent.pnlPct)).toBe(0);
  });

  it("clamps an oversized sell to what is held", () => {
    const pnl = computeAgentPnl([buy("mNVDA", 2, 100), sell("mNVDA", 10, 120)]);
    const agent = pnl.get(1)!;

    // Only the 2 held close: $40, not the $200 an unclamped sell would give.
    expect(cents(agent.pnlUsd)).toBe(40);
    expect(cents(agent.openCost)).toBe(0);
  });

  it("keeps each token on its own book", () => {
    const pnl = computeAgentPnl([
      buy("mNVDA", 2, 100),
      buy("mAAPL", 1, 500),
      sell("mNVDA", 2, 110),
    ]);
    const agent = pnl.get(1)!;

    // The mAAPL cost must not dilute the mNVDA average: $20 realised, and
    // the untouched mAAPL lot stays open.
    expect(cents(agent.pnlUsd)).toBe(20);
    expect(cents(agent.closedCost)).toBe(200);
    expect(cents(agent.openCost)).toBe(500);
  });

  it("keeps agents separate", () => {
    const pnl = computeAgentPnl([
      { agentId: 1, token: "mNVDA", isBuy: true, size: 1, price: 100 },
      { agentId: 2, token: "mNVDA", isBuy: false, size: 1, price: 100 },
    ]);

    expect(cents(pnl.get(1)!.openCost)).toBe(100);
    // Agent 2 never bought, so its sell closes nothing.
    expect(cents(pnl.get(2)!.pnlUsd)).toBe(0);
  });
});

describe("tradesFromFills", () => {
  it("replays the tape oldest-first", () => {
    const trades = tradesFromFills(fixtureFills);
    const blocks = [...fixtureFills].map((f) => f.block).sort((a, b) => a - b);

    expect(trades).toHaveLength(fixtureFills.length);
    // The feed renders newest-first; a cost basis has to accumulate the
    // other way round, or a sell can be replayed before its own buy.
    expect(trades[0].price).toBe(
      Number(fixtureFills.find((f) => f.block === blocks[0])!.price),
    );
  });

  it("leaves the fixture tape with nothing closed", () => {
    const pnl = computeAgentPnl(tradesFromFills(fixtureFills));

    // Every sell in the fixtures is against a token that agent never bought,
    // so no agent has a realised figure yet and useLeaderboard keeps the
    // sample numbers rather than showing a misleading 0.0%.
    for (const agent of pnl.values()) {
      expect(agent.closedCost).toBe(0);
    }
  });
});
