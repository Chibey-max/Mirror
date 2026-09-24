import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadFixture, loadStrategy } from "../src/config";
import { decisionsAtTick } from "../src/strategy";

const fixtureUrl = new URL("../fixtures/prices.jsonl", import.meta.url);

describe("committed strategies", () => {
  it("Pulse deterministically buys strength and exits on reversal", async () => {
    const [ticks, strategy] = await Promise.all([loadFixture(fixtureUrl.pathname), loadStrategy("pulse")]);
    expect(decisionsAtTick("pulse", strategy, ticks, 3)).toEqual([
      { symbol: "mNVDA", isBuy: true, size: BigInt("420000000000000000") },
      { symbol: "mTSLA", isBuy: true, size: BigInt("420000000000000000") },
    ]);
    expect(decisionsAtTick("pulse", strategy, ticks, 4)).toEqual([
      { symbol: "mNVDA", isBuy: false, size: BigInt("420000000000000000") },
    ]);
  });

  it("Red and Drift can emit no more than one fill per token and round", async () => {
    const ticks = await loadFixture(fixtureUrl.pathname);
    for (const agent of ["red", "drift"] as const) {
      const strategy = await loadStrategy(agent);
      for (const tick of ticks) {
        const decisions = decisionsAtTick(agent, strategy, ticks, tick.tick);
        expect(new Set(decisions.map((decision) => decision.symbol)).size).toBe(decisions.length);
      }
    }
  });

  it("rejects duplicate or unordered fixture ticks", async () => {
    expect((await readFile(fixtureUrl, "utf8")).trim().split("\n")).toHaveLength(10);
  });
});
