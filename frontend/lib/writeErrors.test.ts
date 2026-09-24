import { describe, expect, it } from "vitest";
import {
  type Abi,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  UserRejectedRequestError,
} from "viem";
import { copyVaultAbi } from "@/lib/contracts";
import {
  describeWriteError,
  StaleStateError,
  TransactionRevertedError,
} from "@/lib/writeErrors";

/** A revert as viem throws it from simulateContract: the decoded contract
 *  error wrapped in the execution error that names the call. */
function revert(abi: Abi, data: `0x${string}`, functionName: string) {
  return new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({ abi, data, functionName }),
    { abi, functionName, args: [] },
  );
}

describe("describeWriteError", () => {
  it("treats a wallet rejection as a cancel, not a failure", () => {
    const failure = describeWriteError(
      new UserRejectedRequestError(new Error("User denied")),
    );
    expect(failure.cancelled).toBe(true);
  });

  it("names a CopyVault revert decoded with the call's own ABI", () => {
    const data = encodeErrorResult({
      abi: copyVaultAbi,
      errorName: "FollowerLimitReached",
      args: [BigInt(3)],
    });
    const failure = describeWriteError(revert(copyVaultAbi, data, "follow"));
    expect(failure).toMatchObject({
      cancelled: false,
      errorName: "FollowerLimitReached",
    });
    expect(failure.message).toMatch(/follower limit/);
  });

  it("recovers a USDG error a deposit reverts with, which CopyVault's ABI doesn't know", () => {
    const erc20 = [
      {
        type: "error",
        name: "ERC20InsufficientBalance",
        inputs: [
          { name: "sender", type: "address" },
          { name: "balance", type: "uint256" },
          { name: "needed", type: "uint256" },
        ],
      },
    ] as const satisfies Abi;
    const data = encodeErrorResult({
      abi: erc20,
      errorName: "ERC20InsufficientBalance",
      args: ["0x000000000000000000000000000000000000dEaD", BigInt(0), BigInt(5)],
    });
    const failure = describeWriteError(revert(copyVaultAbi, data, "deposit"));
    expect(failure.errorName).toBe("ERC20InsufficientBalance");
    expect(failure.message).toBe("Not enough USDG in your wallet.");
  });

  it("reports a mined-but-reverted transaction instead of success", () => {
    const failure = describeWriteError(new TransactionRevertedError("0xabc"));
    expect(failure.cancelled).toBe(false);
    expect(failure.message).toMatch(/reverted, so nothing changed/);
  });

  it("passes a stale-state refusal through with its own sentence", () => {
    const failure = describeWriteError(
      new StaleStateError("Your balance changed. Close this and try again."),
    );
    expect(failure).toEqual({
      cancelled: false,
      message: "Your balance changed. Close this and try again.",
    });
  });

  it("falls back to a plain sentence for anything unrecognised", () => {
    const failure = describeWriteError(new Error("socket hang up"));
    expect(failure).toEqual({
      cancelled: false,
      message:
        "The transaction didn't go through. Check your wallet and try again.",
    });
  });
});
