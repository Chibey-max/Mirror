import { describe, expect, it } from "vitest";
import {
  assertSuccessfulReceipt,
  formatRecordedPrice,
  latestFillPage,
  TransactionRevertedError,
} from "@/lib/onchain";

const HASH = `0x${"ab".repeat(32)}` as const;

describe("on-chain unit boundaries", () => {
  it("formats the PRD's 8-decimal $128.41 price correctly", () => {
    expect(formatRecordedPrice(BigInt("12841000000"))).toBe("128.41");
  });

  it("requests the newest page from an oldest-first tape", () => {
    expect(latestFillPage(BigInt(120), 50)).toEqual({
      offset: BigInt(70),
      limit: BigInt(50),
    });
    expect(latestFillPage(BigInt(12), 50)).toEqual({
      offset: BigInt(0),
      limit: BigInt(12),
    });
  });

  it("widens backwards as more is loaded, never past the first fill", () => {
    expect(latestFillPage(BigInt(120), 100)).toEqual({
      offset: BigInt(20),
      limit: BigInt(100),
    });
    expect(latestFillPage(BigInt(120), 150)).toEqual({
      offset: BigInt(0),
      limit: BigInt(120),
    });
    expect(latestFillPage(BigInt(0), 50)).toEqual({
      offset: BigInt(0),
      limit: BigInt(0),
    });
  });

  it("accepts only successful mined receipts", () => {
    expect(() => assertSuccessfulReceipt({ status: "success" }, HASH)).not.toThrow();
    expect(() => assertSuccessfulReceipt({ status: "reverted" }, HASH)).toThrow(
      TransactionRevertedError,
    );
  });
});
