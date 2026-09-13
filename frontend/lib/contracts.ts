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
    name: "allocationOf",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
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
