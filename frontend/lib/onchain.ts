import { formatUnits, type Hex } from "viem";

/** TrackRecord prices mirror MockAggregatorV3's 8-decimal answers. */
export const PRICE_DECIMALS = 8;

export function formatRecordedPrice(price: bigint): string {
  return formatUnits(price, PRICE_DECIMALS);
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
