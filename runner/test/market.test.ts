import { describe, expect, it, vi } from "vitest";
import { normalizePrice, parseObservation, PythMarket, feedNames } from "../src/market";
import { symbols } from "../src/types";

const ids = { mNVDA: "1".repeat(64), mAAPL: "2".repeat(64), mTSLA: "3".repeat(64) };
const payload = () => ({ parsed: symbols.map((s) => ({ id: ids[s],
  price: { price: "12345678900", conf: "1000", expo: -8, publish_time: 1000 } })) });

describe("live market input", () => {
  it("normalizes using integer arithmetic and rejects zero/overflow", () => {
    expect(normalizePrice("123456789", -6)).toBe(12345678900n);
    expect(normalizePrice("123456789123", -10)).toBe(1234567891n);
    for (const [p, e] of [["0", -8], ["-1", -8], ["1", -30], ["9".repeat(78), 30]] as const) {
      expect(() => normalizePrice(p, e)).toThrow();
    }
  });
  it("retains source timestamps and gives unchanged quotes a stable ID", () => {
    const a = parseObservation(payload(), ids, 1001);
    const b = parseObservation(payload(), ids, 1002);
    expect(a.id).toBe(b.id);
    expect(a.quotes.mNVDA.raw8).toBe("12345678900");
    expect(() => parseObservation(payload(), ids, 1002, a)).toThrow("not advanced");
  });
  it("rejects closed-market stale prices, future data, wide confidence and missing feeds", () => {
    expect(() => parseObservation(payload(), ids, 1121)).toThrow("stale");
    expect(() => parseObservation(payload(), ids, 999)).toThrow("future");
    const wide = payload(); wide.parsed[0].price.conf = "123456790";
    expect(() => parseObservation(wide, ids, 1000)).toThrow("confidence");
    const missing = payload(); missing.parsed.pop();
    expect(() => parseObservation(missing, ids, 1000)).toThrow("Missing");
  });
  it("authenticates on a fixed origin, validates feed identities, and classifies throttling", async () => {
    const request = vi.fn(async (url: string | URL | Request) => {
      const symbol = symbols.find((s) => String(url).includes(encodeURIComponent(feedNames[s])))!;
      return new Response(JSON.stringify([{ id: ids[symbol], attributes: { symbol: feedNames[symbol] } }]));
    });
    const market = new PythMarket("test-key", ids, request as typeof fetch);
    await market.verifyFeeds();
    expect(request.mock.calls).toHaveLength(3);
    const throttled = new PythMarket("test-key", ids, vi.fn(async () => new Response(null, { status: 429 })));
    await expect(throttled.latest()).rejects.toThrow("429");
    const wrong = new PythMarket("test-key", ids, vi.fn(async () => new Response("[]")));
    await expect(wrong.verifyFeeds()).rejects.toThrow("identity");
  });
});
