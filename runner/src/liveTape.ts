import { readFile, rename, writeFile } from "node:fs/promises";
import { StaleFeedError, type LivePrices } from "./livePrices";
import { extendTape } from "./tape";
import { symbols, type PriceTick, type Symbol } from "./types";

/**
 * The price history once the agents trade on real Chainlink prices.
 *
 * The seeded tape regenerates any tick from a seed; real prices cannot be
 * regenerated, and the strategies replay every tick from 0 to know what they
 * hold. So each live tick's prices are written here *before* the tick sends
 * anything, and a retry reads them back instead of asking the feeds again: a
 * tick half-published at one price must finish at that same price.
 *
 * Ticks before `startTick` stay on the seeded tape, exactly as they ran.
 */
export type LiveTick = {
  tick: number;
  /** Real 8-decimal prices, as published on chain. */
  prices: Record<Symbol, string>;
  /** Which mainnet round each price came from, so anyone can check it. */
  sources: Record<Symbol, { roundId: string; updatedAt: string }>;
};

export type LiveLog = {
  schema: "mirror.live-tape.v1";
  source: "chainlink:robinhood-mainnet";
  startTick: number;
  ticks: LiveTick[];
};

export async function loadLiveLog(path: string): Promise<LiveLog | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const log = JSON.parse(raw) as LiveLog;
  if (log.schema !== "mirror.live-tape.v1" || !Array.isArray(log.ticks) || log.ticks.length === 0) {
    throw new Error(`${path} is not a live price log`);
  }
  log.ticks.forEach((entry, index) => {
    if (entry.tick !== log.startTick + index) throw new Error(`${path} skips from tick ${log.startTick + index - 1}`);
  });
  return log;
}

export async function saveLiveLog(path: string, log: LiveLog): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(log, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function bigintPrices(prices: Record<Symbol, string>): Record<Symbol, bigint> {
  const out = {} as Record<Symbol, bigint>;
  for (const symbol of symbols) out[symbol] = BigInt(prices[symbol]);
  return out;
}

/** The real prices a live tick publishes and prices its fills at. */
export function marketTick(log: LiveLog, tick: number): PriceTick {
  const entry = log.ticks[tick - log.startTick];
  if (!entry || entry.tick !== tick) throw new Error(`No live prices recorded for tick ${tick}`);
  return { tick, prices: bigintPrices(entry.prices) };
}

/**
 * What the strategies decide on, through `throughTick`.
 *
 * The seeded history is returned untouched, so every past decision replays
 * exactly as it ran on chain. Live prices are converted into the tape's scale
 * with one fixed factor per symbol, anchored so the first live tick equals the
 * last seeded one. Without that, the hand-over would read as a jump — NVDA
 * went from about $135 on the tape to $230 for real — and momentum would buy
 * on a move that never happened. After the anchor, every real move keeps its
 * true percentage, and percentages are all the strategies use.
 */
export function decisionTape(fixture: PriceTick[], log: LiveLog, throughTick: number): PriceTick[] {
  if (log.startTick < 1) throw new Error("Live prices need at least one seeded tick before them");
  const seeded = extendTape(fixture, log.startTick - 1);
  if (throughTick < log.startTick) return seeded.slice(0, throughTick + 1);

  const anchorSeeded = seeded[log.startTick - 1].prices;
  const anchorLive = bigintPrices(log.ticks[0].prices);
  const converted: PriceTick[] = [];
  for (let tick = log.startTick; tick <= throughTick; ++tick) {
    const live = marketTick(log, tick).prices;
    const prices = {} as Record<Symbol, bigint>;
    for (const symbol of symbols) {
      const scaled = (live[symbol] * anchorSeeded[symbol]) / anchorLive[symbol];
      prices[symbol] = scaled > BigInt(0) ? scaled : BigInt(1);
    }
    converted.push({ tick, prices });
  }
  return [...seeded, ...converted];
}

export type LiveStep =
  | { kind: "recorded"; log: LiveLog }
  | { kind: "reused"; log: LiveLog }
  | { kind: "idle"; log: LiveLog; since: number }
  /** A feed is past its heartbeat — usually the market is closed. No tick. */
  | { kind: "paused"; log: LiveLog | undefined; detail: string };

/**
 * Prices for tick `goal`.
 *
 * - Already recorded (a retry, or an agent catching up): reuse, read nothing.
 * - No feed moved since the last tick: idle. The feeds move on a 0.5%
 *   deviation or a 24h heartbeat, and stock markets close, so most of the
 *   time nothing has changed; a tick then would only republish the same
 *   prices and spend gas.
 * - Otherwise record a new tick. The caller saves the log before sending.
 */
export async function liveStep(goal: number, log: LiveLog | undefined, read: () => Promise<LivePrices>): Promise<LiveStep> {
  if (log) {
    const last = log.ticks[log.ticks.length - 1];
    if (goal <= last.tick) {
      marketTick(log, goal);
      return { kind: "reused", log };
    }
    if (goal !== last.tick + 1) {
      throw new Error(`Live prices end at tick ${last.tick}; tick ${goal} would leave a gap`);
    }
  }

  let live: LivePrices;
  try {
    live = await read();
  } catch (error) {
    if (error instanceof StaleFeedError) return { kind: "paused", log, detail: error.message };
    throw error;
  }
  if (log) {
    const last = log.ticks[log.ticks.length - 1];
    if (symbols.every((symbol) => live[symbol].price === BigInt(last.prices[symbol]))) {
      return { kind: "idle", log, since: last.tick };
    }
  }

  const entry: LiveTick = { tick: goal, prices: {} as LiveTick["prices"], sources: {} as LiveTick["sources"] };
  for (const symbol of symbols) {
    entry.prices[symbol] = live[symbol].price.toString();
    entry.sources[symbol] = { roundId: live[symbol].roundId.toString(), updatedAt: live[symbol].updatedAt.toString() };
  }
  const next: LiveLog = log
    ? { ...log, ticks: [...log.ticks, entry] }
    : { schema: "mirror.live-tape.v1", source: "chainlink:robinhood-mainnet", startTick: goal, ticks: [entry] };
  return { kind: "recorded", log: next };
}
