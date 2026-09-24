import { describe, expect, it } from "vitest";
import { encodeErrorResult, type Abi } from "viem";
import { decodePolicyReason } from "@/hooks/usePolicyError";
import { enforcedBy } from "@/components/PolicyRejectBanner";

// The reason bytes a MirrorRejected log carries are the refusing contract's
// own custom-error encoding, so tests build them the same way.
const reasons = [
  { type: "error", name: "PositionOverflow", inputs: [] },
  {
    type: "error",
    name: "CapExceeded",
    inputs: [
      { name: "attempted", type: "uint256" },
      { name: "cap", type: "uint256" },
    ],
  },
] as const satisfies Abi;

describe("decodePolicyReason", () => {
  it("decodes CopyVault's PositionOverflow as a rejection, credited to CopyVault", () => {
    const reason = decodePolicyReason(
      encodeErrorResult({ abi: reasons, errorName: "PositionOverflow" }),
    );
    expect(reason).toEqual({ type: "PositionOverflow" });
    expect(enforcedBy(reason!)).toBe("CopyVault");
  });

  it("decodes CapExceeded's running total from raw 6-decimal USDG", () => {
    const reason = decodePolicyReason(
      encodeErrorResult({
        abi: reasons,
        errorName: "CapExceeded",
        // The local rehearsal's real rejection: 54.684 spent + 174.72,
        // shown to the cent (fromUsdg rounds).
        args: [BigInt(229_404_000), BigInt(60_000_000)],
      }),
    );
    expect(reason).toEqual({ type: "CapExceeded", attempted: 229.4, cap: 60 });
    expect(enforcedBy(reason!)).toBe("PolicyModule");
  });
});
