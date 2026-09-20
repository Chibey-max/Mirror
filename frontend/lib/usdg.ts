import { formatUnits, parseUnits } from "viem";

/**
 * USDG is 6-decimal (PRD v2.0 §7). Every notional value in the system —
 * balances, caps, allocations, the numbers inside PolicyModule's custom
 * errors — is a raw integer in this unit, and every number the UI shows is
 * a human-scale float. These two functions are the only place that
 * conversion happens.
 */
export const USDG_DECIMALS = 6;

/**
 * TrackRecord's `price` field, not a USDG amount — 8-decimal, matching
 * MockAggregatorV3's convention (ITrackRecord.sol). Confusing this with
 * USDG_DECIMALS renders every live fill's price 100x too large: dividing a
 * raw oracle price by 10^6 instead of 10^8 leaves two extra powers of ten
 * in the result. Fixtures never exercise this — they carry hand-written
 * decimal strings — so the bug is invisible until a real fill decodes.
 */
export const ORACLE_PRICE_DECIMALS = 8;

/**
 * Display number -> raw on-chain amount.
 *
 * Goes through toFixed first: 0.1 + 0.2 is 0.30000000000000004 in binary
 * floating point, and parseUnits on that string throws on the extra digits.
 * Cents are the smallest unit the UI ever offers, so truncating to the
 * token's own precision loses nothing.
 */
export function toUsdg(amount: number): bigint {
  return parseUnits(amount.toFixed(USDG_DECIMALS), USDG_DECIMALS);
}

/** Raw on-chain amount -> display number, rounded to cents. */
export function fromUsdg(raw: bigint): number {
  return Math.round(Number(formatUnits(raw, USDG_DECIMALS)) * 100) / 100;
}
