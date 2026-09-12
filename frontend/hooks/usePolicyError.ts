import { useCallback } from "react";
import { type Abi, type Hex, BaseError, ContractFunctionRevertedError } from "viem";
import type { PolicyRejectReason } from "@/components/PolicyRejectBanner";

/**
 * The four PolicyModule custom errors (PRD §4.3/§4.6), hand-kept in sync
 * with contracts/src/interfaces/IPolicyModule.sol on origin/feat/contracts-scaffold
 * (Isaac). That branch isn't merged yet, and this frontend doesn't depend on
 * the contracts workspace at all — this fragment is a deliberate duplicate
 * of the four error signatures, not an import, so the two workspaces stay
 * independently buildable. If IPolicyModule's errors ever change post-ABI-freeze,
 * that's a whole-team sync (contracts/README.md) and this array is part of it.
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
] as const satisfies Abi;

/** Maps a decoded token address to the symbol PolicyRejectBanner renders. */
export type TokenSymbolResolver = (token: `0x${string}`) => string;

/**
 * Decodes a reverted CopyVault/PolicyModule call into a PolicyRejectReason
 * the banner can render (PRD §4.6). Real decoding now — viem's
 * decodeErrorResult only needs the error ABI shape above, not a live
 * contract, so this doesn't have to wait for deployments/46630.json.
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
          return { type: "CapExceeded", attempted: Number(attempted), cap: Number(cap) };
        }
        case "TokenNotAllowed": {
          const [token] = (data.args ?? []) as [Hex];
          return { type: "TokenNotAllowed", token: resolveSymbol?.(token) ?? token };
        }
        case "PolicyInactive":
          return { type: "PolicyInactive" };
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
