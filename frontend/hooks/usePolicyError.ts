import { useCallback } from "react";
import { type Abi, type Hex, BaseError, ContractFunctionRevertedError, formatUnits } from "viem";
import type { PolicyRejectReason } from "@/components/PolicyRejectBanner";

/** USDG is 6-decimal (PRD v2.0 §7) — every notional value in PolicyModule's
 * custom errors is a raw integer in this unit, same as every other USDG
 * amount in the system. */
const USDG_DECIMALS = 6;

/**
 * The PolicyModule + CopyVault user-facing custom errors (PRD §4.3/§4.4/§4.6),
 * hand-kept in sync with IPolicyModule.sol and ICopyVault.sol on
 * origin/feat/contracts-scaffold (Isaac/Jason). That branch isn't merged
 * yet, and this frontend doesn't depend on the contracts workspace at all —
 * this fragment is a deliberate duplicate, not an import, so the two
 * workspaces stay independently buildable. If either interface's errors
 * change post-ABI-freeze, that's a whole-team sync (contracts/README.md)
 * and this array is part of it.
 *
 * InsufficientBalance decodes for real even though CopyVault.sol itself
 * isn't implemented yet (Jason) — decoding only needs the error shape from
 * ICopyVault.sol, which is already published and frozen, same as
 * PolicyModule's errors below.
 */
const policyErrorsAbi = [
  {
    type: "error",
    name: "CapExceeded",
    inputs: [
      { name: "attempted", type: "uint256" },
      { name: "cap", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "TokenNotAllowed",
    inputs: [{ name: "token", type: "address" }],
  },
  { type: "error", name: "PolicyInactive", inputs: [] },
  { type: "error", name: "OnlyVault", inputs: [] },
  { type: "error", name: "InsufficientBalance", inputs: [] },
] as const satisfies Abi;

/** Maps a decoded token address to the symbol PolicyRejectBanner renders. */
export type TokenSymbolResolver = (token: `0x${string}`) => string;

/**
 * Raw 6-decimal USDG bigint -> a display number, rounded to cents.
 *
 * Bug fixed here (PRD v2.0 §7, found while specifying the notional unit
 * convention): this previously went straight to `Number(attempted)` with no
 * decimal conversion — a real CapExceeded revert would have rendered
 * "$80000000" instead of "$80". Never caught because every path exercised
 * so far was the fixture/simulate path, which already used human-scale
 * numbers.
 */
function toDisplayUsdg(raw: bigint): number {
  return Math.round(Number(formatUnits(raw, USDG_DECIMALS)) * 100) / 100;
}

/**
 * Decodes a reverted CopyVault/PolicyModule call into a PolicyRejectReason
 * the banner can render (PRD §4.6), for all four variants. Real decoding
 * now — viem's decodeErrorResult only needs the error ABI shape above, not
 * a live contract or even a finished implementation, so this doesn't have
 * to wait for deployments/46630.json or for Jason to write CopyVault.sol.
 *
 * `simulate` still exists for the design mock's "Simulate a mirror attempt"
 * demo control (docs/demo-script.md) — it fabricates the same shape a real
 * decode would produce, so the banner and this hook don't know or care
 * whether the reason came from a real revert or a rehearsal.
 */
export function usePolicyError(resolveSymbol?: TokenSymbolResolver) {
  const decode = useCallback(
    (error: unknown): PolicyRejectReason | null => {
      if (error && typeof error === "object" && "__fixtureReason" in error) {
        return (error as { __fixtureReason: PolicyRejectReason }).__fixtureReason;
      }

      if (!(error instanceof BaseError)) return null;

      const revert = error.walk(
        (e) => e instanceof ContractFunctionRevertedError,
      ) as ContractFunctionRevertedError | undefined;
      const data = revert?.data;
      if (!data?.errorName) return null;

      switch (data.errorName) {
        case "CapExceeded": {
          const [attempted, cap] = (data.args ?? []) as [bigint, bigint];
          return {
            type: "CapExceeded",
            attempted: toDisplayUsdg(attempted),
            cap: toDisplayUsdg(cap),
          };
        }
        case "TokenNotAllowed": {
          const [token] = (data.args ?? []) as [Hex];
          return { type: "TokenNotAllowed", token: resolveSymbol?.(token) ?? token };
        }
        case "PolicyInactive":
          return { type: "PolicyInactive" };
        case "InsufficientBalance":
          return { type: "InsufficientBalance" };
        default:
          // OnlyVault is an access-control error, never user-facing — no banner copy for it.
          return null;
      }
    },
    [resolveSymbol],
  );

  const simulate = useCallback(
    (reason: PolicyRejectReason) => ({ __fixtureReason: reason }),
    [],
  );

  return { decode, simulate, policyErrorsAbi };
}
