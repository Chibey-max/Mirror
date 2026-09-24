import { describe, expect, it } from "vitest";
import { latestFillPage } from "@/lib/onchain";

describe("latestFillPage", () => {
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
  });

  it("asks for nothing when the agent has no fills", () => {
    expect(latestFillPage(BigInt(0), 50)).toEqual({
      offset: BigInt(0),
      limit: BigInt(0),
    });
  });
});
