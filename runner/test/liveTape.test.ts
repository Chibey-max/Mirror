import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { loadFixture, loadStrategy } from "../src/config";
import { LIVE_FEED_CHAIN_ID, readLivePrices, type FeedClient, type LivePrices } from "../src/livePrices";
import { decisionTape, liveStep, loadLiveLog, marketTick, saveLiveLog } from "../src/liveTape";
import { decisionsAtTick } from "../src/strategy";
import { extendTape } from "../src/tape";
import type { PriceTick } from "../src/types";

const fixturePath = fileURLToPath(new URL("../fixtures/prices.jsonl", import.meta.url));
const NOW = BigInt(1_790_800_000);

/** Real-looking Chainlink readings: NVDA $230.42, AAPL $332.41, TSLA $355.81. */
function reading(nvda: bigint, aapl: bigint, tsla: bigint): LivePrices {
  return {
    mNVDA: { price: nvda, roundId: BigInt(1), updatedAt: NOW },
    mAAPL: { price: aapl, roundId: BigInt(2), updatedAt: NOW },
    mTSLA: { price: tsla, roundId: BigInt(3), updatedAt: NOW },
  };
}
const REAL = reading(BigInt(23_042_000_000), BigInt(33_241_000_000), BigInt(35_581_000_000));

describe("liveStep", () => {
  it("records the first live tick, then reuses it without reading the feeds again", async () => {
    const first = await liveStep(17, undefined, async () => REAL);
    expect(first.kind).toBe("recorded");
    expect(first.log.startTick).toBe(17);

    const read = vi.fn();
    const retry = await liveStep(17, first.log, read);
    expect(retry.kind).toBe("reused");
    expect(read).not.toHaveBeenCalled();
  });

  it("creates no tick when no feed has moved", async () => {
    const { log } = await liveStep(17, undefined, async () => REAL);
    const step = await liveStep(18, log, async () => REAL);
    expect(step).toMatchObject({ kind: "idle", since: 17 });
    expect(step.log.ticks).toHaveLength(1);
  });

  it("records a tick once any feed moves", async () => {
    const { log } = await liveStep(17, undefined, async () => REAL);
    const moved = reading(BigInt(23_200_000_000), REAL.mAAPL.price, REAL.mTSLA.price);
    const step = await liveStep(18, log, async () => moved);
    expect(step.kind).toBe("recorded");
    expect(marketTick(step.log, 18).prices.mNVDA).toBe(BigInt(23_200_000_000));
  });

  it("refuses to leave a gap in the live history", async () => {
    const { log } = await liveStep(17, undefined, async () => REAL);
    await expect(liveStep(19, log, async () => REAL)).rejects.toThrow("would leave a gap");
  });

  it("round-trips through disk", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "mirror-live-")), "live.json");
    const { log } = await liveStep(17, undefined, async () => REAL);
    await saveLiveLog(path, log);
    expect(await loadLiveLog(path)).toEqual(log);
    expect(await loadLiveLog(join(tmpdir(), "does-not-exist.json"))).toBeUndefined();
  });
});

describe("decisionTape", () => {
  it("leaves every seeded tick exactly as it ran", async () => {
    const fixture = await loadFixture(fixturePath);
    const { log } = await liveStep(17, undefined, async () => REAL);
    const tape = decisionTape(fixture, log, 17);
    expect(tape.slice(0, 17)).toEqual(extendTape(fixture, 16));
  });

  it("makes the hand-over a flat step, and keeps every real move's percentage", async () => {
    const fixture = await loadFixture(fixturePath);
    const recorded = await liveStep(17, undefined, async () => REAL);
    // NVDA up 1%, AAPL down 2%, TSLA unchanged.
    const next = reading(BigInt(23_272_420_000), BigInt(32_576_180_000), REAL.mTSLA.price);
    const { log } = await liveStep(18, recorded.log, async () => next);
    const tape = decisionTape(fixture, log, 18);
    const [last, first, second] = [tape[16].prices, tape[17].prices, tape[18].prices];

    expect(first).toEqual(last);
    const change = (from: bigint, to: bigint) => Number(((to - from) * BigInt(1_000_000)) / from) / 1e4;
    expect(change(first.mNVDA, second.mNVDA)).toBeCloseTo(1, 3);
    expect(change(first.mAAPL, second.mAAPL)).toBeCloseTo(-2, 3);
    expect(second.mTSLA).toEqual(first.mTSLA);

    // On chain, only the real prices ever appear.
    expect(marketTick(log, 18).prices.mNVDA).toBe(BigInt(23_272_420_000));
  });

  it("stops agents trading on an imaginary move at the hand-over", async () => {
    // The trap this design exists for. At tick 16 the seeded tape has TSLA at
    // about $463; the real feed says $356. Spliced naively that is a 23% crash
    // in one tick: Pulse sells into it and Red buys the "dip", both on a move
    // that never happened in either market.
    const fixture = await loadFixture(fixturePath);
    const [pulse, red] = await Promise.all([loadStrategy("pulse"), loadStrategy("red")]);
    const seeded = extendTape(fixture, 16);
    const naive: PriceTick[] = [
      ...seeded,
      { tick: 17, prices: { mNVDA: REAL.mNVDA.price, mAAPL: REAL.mAAPL.price, mTSLA: REAL.mTSLA.price } },
    ];
    expect(decisionsAtTick("pulse", pulse, naive, 17)).toEqual([expect.objectContaining({ symbol: "mTSLA", isBuy: false })]);
    expect(decisionsAtTick("red", red, naive, 17)).toEqual([expect.objectContaining({ symbol: "mTSLA", isBuy: true })]);

    const { log } = await liveStep(17, undefined, async () => REAL);
    const converted = decisionTape(fixture, log, 17);
    expect(decisionsAtTick("pulse", pulse, converted, 17)).toEqual([]);
    expect(decisionsAtTick("red", red, converted, 17)).toEqual([]);
  });
});

describe("readLivePrices", () => {
  function client(overrides: { chainId?: number; decimals?: number; answer?: bigint; updatedAt?: bigint } = {}): FeedClient {
    return {
      getChainId: async () => overrides.chainId ?? LIVE_FEED_CHAIN_ID,
      readContract: (async ({ functionName }: { functionName: string }) =>
        functionName === "decimals"
          ? (overrides.decimals ?? 8)
          : [BigInt(7), overrides.answer ?? BigInt(23_042_000_000), NOW, overrides.updatedAt ?? NOW, BigInt(7)]) as FeedClient["readContract"],
    };
  }

  it("reads all three feeds", async () => {
    const prices = await readLivePrices(client(), NOW);
    expect(prices.mNVDA).toEqual({ price: BigInt(23_042_000_000), roundId: BigInt(7), updatedAt: NOW });
  });

  it("refuses anything that is not the real market", async () => {
    await expect(readLivePrices(client({ chainId: 46630 }), NOW)).rejects.toThrow("Robinhood Chain mainnet");
    await expect(readLivePrices(client({ decimals: 18 }), NOW)).rejects.toThrow("18 decimals");
    await expect(readLivePrices(client({ answer: BigInt(0) }), NOW)).rejects.toThrow("answered 0");
    await expect(readLivePrices(client({ updatedAt: NOW - BigInt(27 * 3600) }), NOW)).rejects.toThrow("heartbeat");
  });
});
