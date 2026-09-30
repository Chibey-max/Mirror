import { formatUnits, type Hex } from "viem";

/** TrackRecord prices mirror MockAggregatorV3's 8-decimal answers. */
export const PRICE_DECIMALS = 8;

export function formatRecordedPrice(price: bigint): string {
  return formatUnits(price, PRICE_DECIMALS);
}

/**
 * A recorded price for display, to the cent: the simulated tape produces
 * prices like 232.43970054, and all eight decimals on screen read as noise.
 * No thousands separator, callers still multiply this string. Math uses
 * formatRecordedPrice, never this.
 */
export function displayRecordedPrice(price: bigint): string {
  return Number(formatUnits(price, PRICE_DECIMALS)).toFixed(2);
}

/**
 * Splits a log read into block windows. One call over the whole deployment
 * grows by ~500k blocks a day on Robinhood Chain (0.17s blocks), and a node
 * that caps the range fails the read outright. Two million blocks is well
 * inside what the public RPC answers.
 */
export const LOG_WINDOW_BLOCKS = BigInt(2_000_000);

export function logWindows(
  fromBlock: bigint,
  toBlock: bigint,
  size: bigint = LOG_WINDOW_BLOCKS,
): { fromBlock: bigint; toBlock: bigint }[] {
  const windows: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let start = fromBlock; start <= toBlock; start += size) {
    const end = start + size - BigInt(1);
    windows.push({ fromBlock: start, toBlock: end < toBlock ? end : toBlock });
  }
  return windows;
}

/** Oldest-first TrackRecord paging arguments for the newest `limit` fills. */
export function latestFillPage(
  count: bigint,
  limit: number,
): { offset: bigint; limit: bigint } {
  const pageSize = BigInt(limit);
  const size = count < pageSize ? count : pageSize;
  return { offset: count - size, limit: size };
}

export class TransactionRevertedError extends Error {
  readonly hash: Hex;

  constructor(hash: Hex) {
    super(`Transaction reverted: ${hash}`);
    this.name = "TransactionRevertedError";
    this.hash = hash;
  }
}

export function assertSuccessfulReceipt(
  receipt: { status: "success" | "reverted" },
  hash: Hex,
): void {
  if (receipt.status !== "success") throw new TransactionRevertedError(hash);
}
