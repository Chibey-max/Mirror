import type { Abi, Address } from "viem";

/**
 * The two ERC-20 views the UI needs to render a fill.
 *
 * TrackRecord records a token address, a size and a price, and none of the
 * three means anything on screen without the token's own decimals: the same
 * `size` is 0.42 shares or 420000000000000000 depending on them. The stock
 * tokens' decimals aren't frozen in any doc, and asking the team to freeze
 * them isn't necessary, every ERC-20 already answers this itself.
 */
export const erc20MetadataAbi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const satisfies Abi;

export type TokenMetadata = { symbol: string; decimals: number };

/** What to show for a token whose metadata hasn't resolved: its short
 *  address, never a guessed symbol. */
export function shortAddress(token: Address): string {
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
