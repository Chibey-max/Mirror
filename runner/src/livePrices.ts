import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { aggregatorAbi } from "./abi";
import { symbols, type Symbol } from "./types";

/**
 * Real stock prices, read from Chainlink Data Feeds on Robinhood Chain
 * mainnet.
 *
 * Production Stock Token feeds exist only on mainnet; testnet ships mock
 * feeds. Reading one is a free eth_call — no wallet, no gas, no LINK — so the
 * runner reads mainnet and publishes the value into the testnet deployment's
 * own oracle, which is the only thing the contracts ever see.
 *
 * Addresses are the feed proxies from Chainlink's registry
 * (reference-data-directory, feeds-robinhood-mainnet.json). All three report
 * 8 decimals, the same as MockAggregatorV3, so values pass through unchanged.
 * Each updates on a 0.5% deviation or a 24h heartbeat.
 */
export const LIVE_FEED_CHAIN_ID = 4663;
export const DEFAULT_LIVE_FEED_RPC = "https://rpc.mainnet.chain.robinhood.com";

export const LIVE_FEEDS: Record<Symbol, { address: Address; description: string }> = {
  mNVDA: { address: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15", description: "NVDA / USD" },
  mAAPL: { address: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0", description: "AAPL / USD" },
  mTSLA: { address: "0x4A1166a659A55625345e9515b32adECea5547C38", description: "TSLA / USD" },
};

const FEED_DECIMALS = 8;
/** Heartbeat is 24h. Past this, a feed is not live and nothing should trade on it. */
export const MAX_FEED_AGE_SECONDS = 26 * 60 * 60;

/**
 * A feed older than its heartbeat. On equity feeds this is usually not a
 * fault: they stop updating when the US market closes, so from Saturday
 * afternoon to Monday's open (and on market holidays) every feed is past
 * 24h. The first weekend after live prices went on, treating that as an
 * error failed every run for two days. The caller makes it a pause — no
 * new tick, nothing sent — rather than a failure.
 */
export class StaleFeedError extends Error {}

/**
 * Whether the US regular session is probably open: weekdays, 14:30-20:00
 * UTC, the part of the 09:30-16:00 New York session that is the same under
 * both daylight and standard time. Market holidays are not modelled, so on
 * those a stale feed only costs a warning, never a failure.
 */
export function usMarketLikelyOpen(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  return minutes >= 14 * 60 + 30 && minutes < 20 * 60;
}

export type LivePrice = { price: bigint; roundId: bigint; updatedAt: bigint };
export type LivePrices = Record<Symbol, LivePrice>;

/** The subset of a viem client the reader needs, so tests can supply one. */
export type FeedClient = Pick<PublicClient, "readContract" | "getChainId">;

export function liveFeedClient(rpcUrl = process.env.PRICE_FEED_RPC_URL?.trim() || DEFAULT_LIVE_FEED_RPC): FeedClient {
  return createPublicClient({ transport: http(rpcUrl) });
}

const decimalsAbi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
] as const;

/**
 * One reading of all three feeds. Throws rather than returning a partial or
 * suspect set: a wrong chain, an unexpected decimals value, a non-positive
 * answer or a feed past its heartbeat all mean the price is not the real
 * market, and an agent must not trade on it.
 */
export async function readLivePrices(client: FeedClient, nowSeconds = BigInt(Math.floor(Date.now() / 1000))): Promise<LivePrices> {
  const chainId = await client.getChainId();
  if (chainId !== LIVE_FEED_CHAIN_ID) {
    throw new Error(`Price feed RPC is chain ${chainId}; live prices come from Robinhood Chain mainnet (${LIVE_FEED_CHAIN_ID})`);
  }
  const prices = {} as LivePrices;
  for (const symbol of symbols) {
    const { address, description } = LIVE_FEEDS[symbol];
    const decimals = await client.readContract({ address, abi: decimalsAbi, functionName: "decimals" });
    if (Number(decimals) !== FEED_DECIMALS) {
      throw new Error(`${description} feed reports ${decimals} decimals; the oracle expects ${FEED_DECIMALS}`);
    }
    const [roundId, answer, , updatedAt] = await client.readContract({
      address,
      abi: aggregatorAbi,
      functionName: "latestRoundData",
    });
    if (answer <= BigInt(0)) throw new Error(`${description} feed answered ${answer}`);
    if (nowSeconds - updatedAt > BigInt(MAX_FEED_AGE_SECONDS)) {
      throw new StaleFeedError(`${description} feed last updated ${nowSeconds - updatedAt}s ago, past its 24h heartbeat`);
    }
    prices[symbol] = { price: answer, roundId, updatedAt };
  }
  return prices;
}
