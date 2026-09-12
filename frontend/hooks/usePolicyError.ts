import { useCallback } from "react";
import type { PolicyRejectReason } from "@/components/PolicyRejectBanner";

/**
 * Decodes a reverted CopyVault/PolicyModule call into a PolicyRejectReason
 * the banner can render (PRD §4.6). The design mock's "Simulate a mirror
 * attempt" control on the agent detail screen exists for exactly this: a
 * reliable, reproducible way to trigger each of the four variants during a
 * demo without depending on live market conditions.
 *
 * TODO(Day 5+, once PolicyModule's ABI is frozen and exported from
 * lib/contracts.ts): replace `decode` with viem's decodeErrorResult against
 * the real ABI, matching on CapExceeded / TokenNotAllowed / PolicyInactive /
 * InsufficientBalance. Until then it only understands the fixture shape
 * `simulate` produces, so wiring a live tx through it early will silently
 * return null — don't ship that without swapping this first.
 */
export function usePolicyError() {
  const decode = useCallback((error: unknown): PolicyRejectReason | null => {
    if (
      error &&
      typeof error === "object" &&
      "__fixtureReason" in error
    ) {
      return (error as { __fixtureReason: PolicyRejectReason }).__fixtureReason;
    }
    // TODO: real decodeErrorResult path goes here.
    return null;
  }, []);

  const simulate = useCallback(
    (reason: PolicyRejectReason) => ({ __fixtureReason: reason }),
    [],
  );

  return { decode, simulate };
}
