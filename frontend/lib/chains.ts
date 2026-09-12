import { defineChain } from "viem";
import { arbitrumSepolia } from "viem/chains";

/**
 * Robinhood Chain testnet — the primary deploy target (PRD §2).
 *
 * TODO(Jason, Day 2): confirm the public RPC and explorer URLs, then drop them
 * in as the fallbacks below. Until then set NEXT_PUBLIC_RH_RPC_URL locally.
 */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RH_RPC_URL ?? "https://testnet-rpc.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Explorer",
      url: process.env.NEXT_PUBLIC_RH_EXPLORER_URL ?? "https://testnet-explorer.robinhood.com",
    },
  },
  testnet: true,
});

export { arbitrumSepolia };

/** The chain every write goes to. Everything else is a wrong-network state. */
export const targetChain = robinhoodTestnet;

/** Explorer deep links — every fill row needs one (PRD §5.2). */
export function txUrl(hash: string) {
  return `${targetChain.blockExplorers.default.url}/tx/${hash}`;
}

export function addressUrl(address: string) {
  return `${targetChain.blockExplorers.default.url}/address/${address}`;
}
