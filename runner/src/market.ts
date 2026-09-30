import { createHash } from "node:crypto";
import { symbols, type Symbol } from "./types";

export const feedNames: Record<Symbol, string> = {
  mNVDA: "Equity.US.NVDA/USD", mAAPL: "Equity.US.AAPL/USD", mTSLA: "Equity.US.TSLA/USD",
};
export type Quote = { id: string; price: string; conf: string; expo: number; publishTime: number; raw8: string };
export type Observation = { id: string; receivedAt: number; quotes: Record<Symbol, Quote> };
export class MarketUnavailable extends Error {}

export function normalizePrice(price: string, expo: number): bigint {
  if (typeof price !== "string" || !/^[1-9][0-9]*$/.test(price) || price.length > 78 || !Number.isInteger(expo) || Math.abs(expo) > 30) {
    throw new MarketUnavailable("Invalid price or exponent");
  }
  const shift = expo + 8;
  const value = shift >= 0 ? BigInt(price) * 10n ** BigInt(shift) : BigInt(price) / 10n ** BigInt(-shift);
  if (value <= 0n || value >= 2n ** 255n) throw new MarketUnavailable("Price outside aggregator range");
  return value;
}

export function parseObservation(payload: unknown, ids: Record<Symbol, string>, now: number,
  previous?: Observation): Observation {
  const parsed = (payload as { parsed?: unknown[] })?.parsed;
  if (!Array.isArray(parsed)) throw new MarketUnavailable("Missing parsed price data");
  const quotes = {} as Record<Symbol, Quote>;
  for (const symbol of symbols) {
    const matches = parsed.filter((item) => (item as { id?: string })?.id?.replace(/^0x/, "").toLowerCase() === ids[symbol]);
    if (matches.length !== 1) throw new MarketUnavailable(`Missing or duplicate ${symbol} feed`);
    const p = (matches[0] as { price?: { price: string; conf: string; expo: number; publish_time: number } }).price;
    if (!p || typeof p.conf !== "string" || !/^[0-9]+$/.test(p.conf) || p.conf.length > 78) throw new MarketUnavailable(`Invalid ${symbol} quote`);
    const raw8 = normalizePrice(p.price, p.expo).toString();
    if (!Number.isSafeInteger(p.publish_time) || p.publish_time > now || now - p.publish_time > 120) {
      throw new MarketUnavailable(`${symbol}: stale or future price; market may be closed`);
    }
    if (BigInt(p.conf) * 100n > BigInt(p.price)) throw new MarketUnavailable(`${symbol}: confidence wider than 1%`);
    if (previous && p.publish_time <= previous.quotes[symbol].publishTime) {
      throw new MarketUnavailable(`${symbol}: publication timestamp has not advanced`);
    }
    quotes[symbol] = { id: ids[symbol], price: p.price, conf: p.conf, expo: p.expo, publishTime: p.publish_time, raw8 };
  }
  const id = createHash("sha256").update(JSON.stringify(quotes)).digest("hex");
  return { id, receivedAt: now, quotes };
}

export class PythMarket {
  constructor(private readonly key: string, private readonly ids: Record<Symbol, string>,
    private readonly request: typeof fetch = fetch) {}

  private async get(path: string): Promise<unknown> {
    // Fixed origin: never send the provider credential to a configurable destination or redirect.
    const response = await this.request(`https://pyth.dourolabs.app/hermes${path}`, {
      headers: { Authorization: `Bearer ${this.key}` }, signal: AbortSignal.timeout(15_000), redirect: "error",
    });
    if (response.status === 429 || response.status >= 500) throw new MarketUnavailable(`Provider HTTP ${response.status}`);
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}; check account access`);
    return response.json();
  }

  async verifyFeeds(): Promise<void> {
    for (const symbol of symbols) {
      const data = await this.get(`/v2/price_feeds?query=${encodeURIComponent(feedNames[symbol])}&asset_type=equity`);
      if (!Array.isArray(data) || !data.some((f) => f.id?.replace(/^0x/, "").toLowerCase() === this.ids[symbol]
        && f.attributes?.symbol === feedNames[symbol])) throw new Error(`Feed identity mismatch for ${symbol}`);
    }
  }

  async latest(previous?: Observation): Promise<Observation> {
    const query = new URLSearchParams({ parsed: "true" });
    for (const symbol of symbols) query.append("ids[]", this.ids[symbol]);
    let payload: unknown;
    try { payload = await this.get(`/v2/updates/price/latest?${query}`); }
    catch (error) {
      if (error instanceof TypeError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))) {
        throw new MarketUnavailable("Provider network request failed");
      }
      throw error;
    }
    return parseObservation(payload, this.ids, Math.floor(Date.now() / 1000), previous);
  }
}
