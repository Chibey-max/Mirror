import type { Address, Hex } from "viem";

export const symbols = ["mNVDA", "mAAPL", "mTSLA"] as const;
export type Symbol = (typeof symbols)[number];
export type AgentKey = "pulse" | "red" | "drift";

export type PriceTick = {
  tick: number;
  prices: Record<Symbol, bigint>;
};

export type StrategyDefinition = {
  schema: "mirror.strategy.v1";
  agent: "Pulse" | "Red" | "Drift";
  modelVersion: string;
  strategyType: "momentum" | "mean-reversion" | "pairs-rotation";
  universe: Symbol[];
  signal: Record<string, number | string[]>;
  execution: {
    buySizeTokenUnits: string;
    maxFillsPerTokenPerOracleRound: number;
  };
};

export type DeploymentManifest = {
  schema: "mirror.deployments.v1";
  chainId: number;
  deploymentBlock: number;
  deployer: Address;
  policyAdmin: Address;
  runner: Address;
  agentRegistrar: Address;
  agentRegistry: Address;
  trackRecord: Address;
  policyModule: Address;
  copyVault: Address;
  usdg: Address;
  stockTokens: [Address, Address, Address];
  priceFeeds: [Address, Address, Address];
  agentIds: [number, number, number];
  strategyHashes: [Hex, Hex, Hex];
  coreRuntimeCodeHashes: [Hex, Hex, Hex, Hex];
  transactions: {
    agentRegistry: Hex;
    trackRecord: Hex;
    usdg: Hex;
    stockTokens: [Hex, Hex, Hex];
    priceFeeds: [Hex, Hex, Hex];
    policyModule: Hex;
    copyVault: Hex;
    tokenAllowlist: [Hex, Hex, Hex];
    agentRegistrations: [Hex, Hex, Hex];
  };
};

export type FillDecision = {
  symbol: Symbol;
  isBuy: boolean;
  size: bigint;
};
