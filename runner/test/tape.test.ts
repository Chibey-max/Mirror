import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadFixture } from "../src/config";
import { extendTape } from "../src/tape";

const fixturePath = fileURLToPath(new URL("../fixtures/prices.jsonl", import.meta.url));

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
});
