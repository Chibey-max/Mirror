import { keccak256, toBytes } from "viem";
import { symbols, type PriceTick, type Symbol } from "./types";

/**
 * The price tape, extended past the committed fixture without end.
 *
 * `fixtures/prices.jsonl` holds ten ticks, and the agents ran all ten on the
 * first deployment, so the runner had nothing left to trade on. PRD §6 asks
 * for a tape that is "reproducible from a fixed seed", and this is that: any
 * tick N is a pure function of the fixture and the seed, so every machine,
 * every CI run and every later audit derives the same prices for it.
 *
 * Two properties the on-chain record depends on:
 *
 *   1. Ticks up to the fixture's last one are returned untouched. The fills
 *      already recorded were priced from them, and changing them would make
 *      the ledger disagree with the tape that produced it.
 *   2. Nothing here is part of an on-chain commitment. `strategyHash` is the
 *      keccak of `strategies/<agent>.json`, not of any price, so extending
 *      the tape cannot invalidate what was committed at deploy.
 *
 * The continuation moves in regimes rather than as a plain random walk: a
 * run of ticks drifting one way, noise on top, then a new direction. A pure
 * walk has no trends for momentum to follow, so which agent led would be a
 * coin toss, and the product's "we show the losing agent honestly" story
 * would depend on luck. Trending regimes are what Pulse (momentum) is built
 * to catch and what Red (buys weakness against the trend) is built to lose
 * on — the same shape as the committed fixture, carried forward. The tape is
 * synthetic and the README says so; the regimes are why, not a secret.
 */

export const TAPE_SEED = "mirror:tape:v1";

/** Ticks per regime. Long enough for a 3-tick momentum signal to fire. */
const REGIME_TICKS = 12;
/** Per-tick drift inside a regime, in basis points. */
const DRIFT_MIN_BPS = 55;
const DRIFT_RANGE_BPS = 90;
/** Symmetric per-tick noise, in basis points. */
const NOISE_BPS = 38;
/** A floor well under any fixture price, so a long fall can never reach zero. */
const PRICE_FLOOR = BigInt(1_000_000_000);

/** Uniform in [0, 1), derived from the seed and a label. */
function unit(label: string): number {
  const digest = keccak256(toBytes(`${TAPE_SEED}:${label}`));
  // 48 bits is plenty and keeps the division exact in a double.
  return Number(BigInt(digest.slice(0, 14))) / 2 ** 48;
}

/**
 * How strongly a regime leans back toward the symbol's anchor price. Without
 * it, a slight upward lean compounds: a first cut of this tape took mAAPL
 * from $230 to $1,718 in 500 ticks, and a stock token at seven times its
 * real price reads as fake to anyone who knows the ticker. With it, trends
 * still run for a whole regime, but the level stays in a believable band.
 */
const ANCHOR_PULL = 1.6;

/**
 * A regime's drift, chosen at the regime's first tick from where the price
 * sits relative to its anchor. Above the anchor, a down-regime is likelier;
 * below it, an up-regime. Clamped so neither direction is ever ruled out.
 */
function regimeDriftBps(symbol: Symbol, regime: number, price: bigint, anchor: bigint): number {
  const distance = Math.log(Number(price) / Number(anchor));
  const upProbability = Math.min(0.8, Math.max(0.2, 0.56 - ANCHOR_PULL * distance));
  const direction = unit(`${symbol}:regime:${regime}:direction`) < upProbability ? 1 : -1;
  const size = DRIFT_MIN_BPS + Math.floor(unit(`${symbol}:regime:${regime}:size`) * DRIFT_RANGE_BPS);
  return direction * size;
}

function noiseBps(symbol: Symbol, tick: number): number {
  return Math.round((unit(`${symbol}:tick:${tick}:noise`) * 2 - 1) * NOISE_BPS);
}

/**
 * The fixture, extended with generated ticks through `throughTick`.
 * Generation is sequential (each tick moves from the previous price) and
 * deterministic, so the result for any given tick never changes.
 */
export function extendTape(fixture: PriceTick[], throughTick: number): PriceTick[] {
  if (fixture.length === 0) throw new Error("The price tape needs at least one fixture tick");
  const last = fixture[fixture.length - 1];
  if (throughTick <= last.tick) return fixture;

  const tape = [...fixture];
  // Each symbol leans back toward where the committed fixture left it.
  const anchor = last.prices;
  let prices = { ...last.prices };
  const drift = {} as Record<Symbol, number>;
  for (let tick = last.tick + 1; tick <= throughTick; ++tick) {
    const regime = Math.floor(tick / REGIME_TICKS);
    const regimeStart = tick === last.tick + 1 || tick % REGIME_TICKS === 0;
    const next = {} as Record<Symbol, bigint>;
    for (const symbol of symbols) {
      if (regimeStart) drift[symbol] = regimeDriftBps(symbol, regime, prices[symbol], anchor[symbol]);
      const step = drift[symbol] + noiseBps(symbol, tick);
      const moved = (prices[symbol] * BigInt(10_000 + step)) / BigInt(10_000);
      next[symbol] = moved < PRICE_FLOOR ? PRICE_FLOOR : moved;
    }
    tape.push({ tick, prices: next });
    prices = next;
  }
  return tape;
}
