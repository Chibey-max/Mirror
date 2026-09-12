/**
 * Sample data — exactly the values from docs/claude-design-prompt.md, so the
 * UI matches the Design Canvas mock pixel-for-pixel while contracts aren't
 * live yet (PRD §5.2/§5.3). Every consumer must treat this as sample data,
 * never as a source of truth once real reads exist.
 *
 * TODO(Day 7+, after Jason publishes deployments/46630.json): replace every
 * import of this file with the corresponding hook in /hooks, which will read
 * AgentRegistry / TrackRecord / CopyVault directly.
 */

export type FixtureAgent = {
  id: number;
  name: string;
  strategy: string;
  modelVersion: string;
  strategyHash: string;
  registeredAt: string;
  pnlPct: number;
  pnlUsd: number;
  fills: number;
  followers: number;
  volumeUsd: number;
  isLosing: boolean;
};

export const fixtureAgents: FixtureAgent[] = [
  {
    id: 1,
    name: "Pulse",
    strategy: "Momentum",
    modelVersion: "pulse-v1.2",
    strategyHash: "0x7a3f1e9c2b4d6a8f0e1c3b5d7a9f1e3c5b7d9f1a3c5e7b9d1f3a5c7ec91e",
    registeredAt: "2026-09-14",
    pnlPct: 18.4,
    pnlUsd: 184.2,
    fills: 142,
    followers: 9,
    volumeUsd: 12480,
    isLosing: false,
  },
  {
    id: 2,
    name: "Red",
    strategy: "Mean reversion",
    modelVersion: "red-v1.0",
    strategyHash: "0x4be08a1c3e5f7b9d1a3c5e7f9b1d3a5c7e9f1b3d5a7c9e1f3b5d7a9c2d07",
    registeredAt: "2026-09-14",
    pnlPct: -11.7,
    pnlUsd: -58.5,
    fills: 128,
    followers: 3,
    volumeUsd: 7310,
    isLosing: true,
  },
  {
    id: 3,
    name: "Drift",
    strategy: "Pairs",
    modelVersion: "drift-v1.0",
    strategyHash: "0x2c5e8a1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b3f4a",
    registeredAt: "2026-09-16",
    pnlPct: 1.2,
    pnlUsd: 4.1,
    fills: 37,
    followers: 1,
    volumeUsd: 2140,
    isLosing: false,
  },
];

export type FixtureFill = {
  id: string;
  agentId: number;
  side: "BUY" | "SELL";
  token: string;
  size: string;
  price: string;
  time: string;
  txHash: string;
  block: number;
};

export const fixtureFills: FixtureFill[] = [
  {
    id: "fill-1",
    agentId: 1,
    side: "BUY",
    token: "mNVDA",
    size: "0.42",
    price: "128.41",
    time: "2 min ago",
    txHash: "0x5c1ea9f0b3d7c5e1a9f3b5d7c1e9a3f5b7d1c9e3a5f7b1d9c3e5a7f9b1d3a5",
    block: 1284392,
  },
  {
    id: "fill-2",
    agentId: 1,
    side: "SELL",
    token: "mAAPL",
    size: "1.10",
    price: "214.06",
    time: "18 min ago",
    txHash: "0x8e11c0b4da9f3c5e1b7d9f3a5c7e1b9d3f5a7c1e9b3d5f7a1c9e3b5d7f1a9c3",
    block: 1284370,
  },
];

export const fixtureWallet = {
  address: "0x9F2c…41aB",
  walletUsdg: 250.0,
  vaultFree: 150.0,
  allocated: { 1: 50.0 } as Record<number, number>,
};
