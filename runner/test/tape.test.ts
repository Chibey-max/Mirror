import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadFixture, loadStrategy } from "../src/config";
import { decisionsAtTick } from "../src/strategy";
import { extendTape } from "../src/tape";
import type { AgentKey, PriceTick } from "../src/types";

const fixturePath = fileURLToPath(new URL("../fixtures/prices.jsonl", import.meta.url));

/** Realised PnL in USDG from replaying an agent's own decisions over the tape. */
async function realisedPnl(agent: AgentKey, tape: PriceTick[], through: number): Promise<number> {
  const strategy = await loadStrategy(agent);
  const held = new Map<string, { size: number; cost: number }>();
  let pnl = 0;
  for (let tick = 0; tick <= through; ++tick) {
    for (const decision of decisionsAtTick(agent, strategy, tape, tick)) {
      const price = Number(tape[tick].prices[decision.symbol]) / 1e8;
      const size = Number(decision.size) / 1e18;
      if (decision.isBuy) {
        held.set(decision.symbol, { size, cost: price });
      } else {
        const position = held.get(decision.symbol);
        if (position) pnl += (price - position.cost) * position.size;
        held.delete(decision.symbol);
      }
    }
  }
  return pnl;
}

describe("extendTape", () => {
  it("returns the committed fixture ticks untouched", async () => {
    const fixture = await loadFixture(fixturePath);
    const tape = extendTape(fixture, 300);
    // The fills already on chain were priced from these; they must not move.
    expect(tape.slice(0, fixture.length)).toEqual(fixture);
    expect(tape).toHaveLength(301);
    expect(tape.map((tick) => tick.tick)).toEqual(Array.from({ length: 301 }, (_, index) => index));
  });

  it("derives the same price for a tick no matter how far it is extended", async () => {
    const fixture = await loadFixture(fixturePath);
    const short = extendTape(fixture, 60);
    const long = extendTape(fixture, 400);
    expect(long.slice(0, 61)).toEqual(short);
  });

  it("keeps every price within a believable band of where the fixture ended", async () => {
    const fixture = await loadFixture(fixturePath);
    const anchor = fixture[fixture.length - 1].prices;
    for (const tick of extendTape(fixture, 1000)) {
      for (const [symbol, price] of Object.entries(tick.prices)) {
        const ratio = Number(price) / Number(anchor[symbol as keyof typeof anchor]);
        expect(ratio, `${symbol} at tick ${tick.tick}`).toBeGreaterThan(0.4);
        expect(ratio, `${symbol} at tick ${tick.tick}`).toBeLessThan(2.5);
      }
    }
  });

  it("keeps Pulse winning and Red losing on the generated tape", async () => {
    // The product's honesty story is that the losing agent is shown as
    // plainly as the winner. That only holds while the tape keeps them apart.
    const fixture = await loadFixture(fixturePath);
    for (const through of [200, 500, 1000]) {
      const tape = extendTape(fixture, through);
      expect(await realisedPnl("pulse", tape, through), `Pulse through ${through}`).toBeGreaterThan(0);
      expect(await realisedPnl("red", tape, through), `Red through ${through}`).toBeLessThan(0);
    }
  });
});
