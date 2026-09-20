"use client";

import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20MetadataAbi, type TokenMetadata } from "@/lib/tokens";

/**
 * `symbol` and `decimals` for a set of token addresses.
 *
 * Read from the tokens themselves rather than kept in a table: the stock
 * tokens' decimals aren't frozen in any doc, and a table that drifts renders
 * a fill three orders of magnitude wrong while looking perfectly normal.
 * Both values are immutable per token, so this is cached indefinitely.
 */
export function useTokenMetadata(
  tokens: Address[],
  enabled = true,
): Map<Address, TokenMetadata> {
  const reads = useReadContracts({
    contracts: tokens.flatMap((address) => [
      { address, abi: erc20MetadataAbi, functionName: "symbol" } as const,
      { address, abi: erc20MetadataAbi, functionName: "decimals" } as const,
    ]),
    query: { enabled: enabled && tokens.length > 0, staleTime: Infinity },
  });

  const metadata = new Map<Address, TokenMetadata>();
  tokens.forEach((address, index) => {
    const symbol = reads.data?.[index * 2]?.result;
    const decimals = reads.data?.[index * 2 + 1]?.result;
    // Both or neither: a symbol without decimals can't size a fill, and
    // half-resolved metadata is what produces a confidently wrong number.
    if (typeof symbol === "string" && typeof decimals === "number") {
      metadata.set(address, { symbol, decimals });
    }
  });

  return metadata;
}
