import type { Abi, Address } from "viem";

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

/**
 * Whether an address is real yet. Every entry above is the zero address until
 * Jason publishes deployments/46630.json, and subscribing to logs on the zero
 * address silently never fires — so anything that reads or watches must gate
 * on this rather than look live while doing nothing.
 */
export function isDeployed(address?: Address): boolean {
  return !!address && address !== ZERO;
}

export const agentRegistryAbi = [
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "name", type: "string" },
          { name: "strategyHash", type: "bytes32" },
          { name: "modelVersion", type: "string" },
          { name: "registeredAt", type: "uint64" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "agentCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "strategyHash", type: "bytes32", indexed: false },
    ],
  },
] as const satisfies Abi;

export const trackRecordAbi = [
  {
    type: "function",
    name: "getFillsByAgent",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "fillId", type: "uint256" },
          { name: "agentId", type: "uint256" },
          { name: "token", type: "address" },
          { name: "isBuy", type: "bool" },
          { name: "size", type: "uint256" },
          { name: "price", type: "uint256" },
          { name: "timestamp", type: "uint64" },
          { name: "oracleRoundId", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "fillCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "FillRecorded",
    inputs: [
      { name: "fillId", type: "uint256", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: false },
      { name: "size", type: "uint256", indexed: false },
      { name: "price", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint64", indexed: false },
      { name: "oracleRoundId", type: "bytes32", indexed: false },
    ],
  },
] as const satisfies Abi;

/**
 * PolicyModule's reads, hand-kept in sync with IPolicyModule.sol (Isaac).
 *
 * Only the views: setPolicy, checkAndConsume and kill are onlyVault, so the
 * frontend never calls them — it follows and unfollows through CopyVault and
 * reads the result here. The custom errors live in usePolicyError's own
 * fragment, which decodes them from MirrorRejected's reason bytes.
 */
export const policyModuleAbi = [
  {
    type: "function",
    name: "getPolicy",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "maxNotionalPerDay", type: "uint256" },
          { name: "maxSlippageBps", type: "uint256" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    // spentToday + this trade is what CapExceeded.attempted reports (§7.6).
    type: "function",
    name: "spentToday",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isTokenAllowed",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "PolicySet",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "maxNotionalPerDay", type: "uint256", indexed: false },
      { name: "maxSlippageBps", type: "uint256", indexed: false },
    ],
  },
  {
    // The kill switch's on-chain receipt.
    type: "event",
    name: "PolicyKilled",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
    ],
  },
] as const satisfies Abi;

export const copyVaultAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "follow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "capAmount", type: "uint256" },
      { name: "maxSlippageBps", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "free", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "unfollow",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [],
  },
  {
    // onlyRunner. Always succeeds, even when every follower is rejected —
    // rejections are logged as MirrorRejected, not reverted (§7.1).
    type: "function",
    name: "mirrorFill",
    stateMutability: "nonpayable",
    inputs: [{ name: "fillId", type: "uint256" }],
    outputs: [],
  },
  {
    /**
     * Principal committed to this follow, returned unchanged at unfollow
     * (PRD v2.2 §7.3) — NOT the current value of the position and NOT a
     * balance. Mirror never settles anything, so there is no mark-to-market
     * here; leaderboard PnL must come from Mirrored events priced at each
     * fill, never from this.
     */
    type: "function",
    name: "allocationOf",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    // A follower's exposure in token units, which is what the vault tracks
    // (§7.2) — a USDG running total underflowed on profitable exits.
    type: "function",
    name: "positionOf",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "followersOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "followerCountOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isMirrored",
    stateMutability: "view",
    inputs: [{ name: "fillId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Followed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "cap", type: "uint256", indexed: false },
    ],
  },
  {
    // One follower's fill actually mirrored. `size` is token units, not USDG.
    type: "event",
    name: "Mirrored",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "fillId", type: "uint256", indexed: true },
      { name: "size", type: "uint256", indexed: false },
      { name: "isBuy", type: "bool", indexed: false },
    ],
  },
  {
    /**
     * A policy rejection, logged rather than reverted (§7.1). `reason` is the
     * raw revert data from PolicyModule.checkAndConsume — decode it with
     * usePolicyError's policyErrorsAbi. This is the only on-chain record that
     * a rejection happened, and it rides a SUCCESSFUL mirrorFill tx.
     */
    type: "event",
    name: "MirrorRejected",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "fillId", type: "uint256", indexed: true },
      { name: "reason", type: "bytes", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Unfollowed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "returnedAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "InsufficientBalance", inputs: [] },
  { type: "error", name: "AlreadyFollowing", inputs: [] },
  { type: "error", name: "NotFollowing", inputs: [] },
  { type: "error", name: "ZeroRunner", inputs: [] },
  {
    type: "error",
    name: "FillNotFound",
    inputs: [{ name: "fillId", type: "uint256" }],
  },
  {
    type: "error",
    name: "FillAlreadyMirrored",
    inputs: [{ name: "fillId", type: "uint256" }],
  },
] as const satisfies Abi;

export const usdgAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;
