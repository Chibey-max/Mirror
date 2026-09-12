import type { Address } from "viem";

/**
 * Contract addresses per chain.
 *
 * Jason owns /deployments/46630.json and /deployments/421614.json (PRD §2) and
 * publishes them on Day 7. Until then these are placeholders and reads run
 * against a local anvil fork. When the file lands, this is the only frontend
 * file that changes.
 */
export type MirrorAddresses = {
  agentRegistry: Address;
  trackRecord: Address;
  policyModule: Address;
  copyVault: Address;
  usdg: Address;
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export const addresses: Record<number, MirrorAddresses> = {
  // Robinhood Chain testnet — filled from deployments/46630.json on Day 7.
  46630: {
    agentRegistry: ZERO,
    trackRecord: ZERO,
    policyModule: ZERO,
    copyVault: ZERO,
    usdg: ZERO,
  },
  // Local anvil — deploy stubs here while waiting for the testnet deploy.
  31337: {
    agentRegistry: ZERO,
    trackRecord: ZERO,
    policyModule: ZERO,
    copyVault: ZERO,
    usdg: ZERO,
  },
};

export function addressesFor(chainId: number): MirrorAddresses | undefined {
  return addresses[chainId];
}

// TODO(Day 3, after the ABI freeze): export the four ABIs here as `as const`
// arrays generated from contracts/out, so wagmi infers argument types.
