import { describe, expect, it } from "vitest";
import {
  assertSuccessfulReceipt,
  displayRecordedPrice,
  formatRecordedPrice,
  latestFillPage,
  logWindows,
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

describe("log windows", () => {
  it("covers the range exactly, in order, with no overlap", () => {
    const windows = logWindows(BigInt(10), BigInt(34), BigInt(10));
    expect(windows).toEqual([
      { fromBlock: BigInt(10), toBlock: BigInt(19) },
      { fromBlock: BigInt(20), toBlock: BigInt(29) },
      { fromBlock: BigInt(30), toBlock: BigInt(34) },
    ]);
  });

  it("is one window when the range fits", () => {
    expect(logWindows(BigInt(5), BigInt(5))).toEqual([
      { fromBlock: BigInt(5), toBlock: BigInt(5) },
    ]);
  });

  it("is empty when the start is past the end", () => {
    expect(logWindows(BigInt(6), BigInt(5))).toEqual([]);
  });
});

describe("recorded prices for display", () => {
  it("rounds the simulated tape's eight decimals to the cent", () => {
    expect(displayRecordedPrice(BigInt("23243970054"))).toBe("232.44");
  });

  it("keeps whole prices to two decimals, with no thousands separator", () => {
    expect(displayRecordedPrice(BigInt("41600000000"))).toBe("416.00");
    expect(displayRecordedPrice(BigInt("123456000000"))).toBe("1234.56");
  });
});
