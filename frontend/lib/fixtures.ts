/**
 * Sample data, exactly the values from docs/claude-design-prompt.md, so the
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
  /**
   * Cumulative PnL %, oldest to newest, ending at pnlPct. Sample data, like
   * everything else here: the real series must be computed client-side from
   * Mirrored events priced at each fill (PRD v2.2 §7.3/§10) and never from
   * allocationOf, which is principal-only.
   */
  pnlSeries: number[];
};

export const fixtureAgents: FixtureAgent[] = [
  {
    id: 1,
    name: "Pulse",
    strategy: "Momentum",
    modelVersion: "pulse-v1.2",
    strategyHash: "0x8d32353838e901b918e9d1fb1d50c19fe0ac35a9dbe82da1b3c755033c91d0c3",
    registeredAt: "2026-09-14",
    pnlPct: 18.4,
    pnlUsd: 184.2,
    fills: 142,
    followers: 9,
    volumeUsd: 12480,
    isLosing: false,
    pnlSeries: [0, 1.2, 0.6, 3.4, 5.1, 4.2, 7.8, 9.6, 12.1, 14, 16.9, 18.4],
  },
  {
    id: 2,
    name: "Red",
    strategy: "Mean reversion",
    modelVersion: "red-v1.0",
    strategyHash: "0xacbf6fccaf5e4c5dad8c8cc2d66c13cd3cfe57b9070cea12262b2d09efe869f9",
    registeredAt: "2026-09-14",
    pnlPct: -11.7,
    pnlUsd: -58.5,
    fills: 128,
    followers: 3,
    volumeUsd: 7310,
    isLosing: true,
    pnlSeries: [0, -0.8, 0.4, -2.1, -3.6, -2.9, -5.4, -7.2, -6.5, -9.1, -10.8, -11.7],
  },
  {
    id: 3,
    name: "Drift",
    strategy: "Pairs",
    modelVersion: "drift-v1.0",
    strategyHash: "0xe394056ed936fd2705b87058e1c331ba6fac94d5e090505f3753bfbc096aa573",
    registeredAt: "2026-09-16",
    pnlPct: 1.2,
    pnlUsd: 4.1,
    fills: 37,
    followers: 1,
    volumeUsd: 2140,
    isLosing: false,
    pnlSeries: [0, 0.3, -0.2, 0.5, 0.9, 0.4, 0.7, 1.1, 0.8, 1, 0.9, 1.2],
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
  /** Monotonic ordering key: the fill's own id on chain, the block it
   *  landed in for these fixtures. Never displayed. */
  sequence: number;
};

export const fixtureFills: FixtureFill[] = [
  {
    // The agent's trade still landed on the tape, it was this follower's
    // mirror that PolicyModule rejected (PRD v2.2 §7.1). See
    // hooks/useMirrorOutcomes for the per-follower outcome of each fill.
    id: "fill-0",
    agentId: 1,
    side: "BUY",
    token: "mNVDA",
    size: "0.90",
    price: "129.10",
    time: "1 min ago",
    txHash: "0x2f7b9d1c3e5a7f9b1d3a5c7e9f1b3d5a7c9e1f3b5d7a9c1e3f5b7d9a1c3e5f7",
    sequence: 1284401,
  },
  {
    id: "fill-1",
    agentId: 1,
    side: "BUY",
    token: "mNVDA",
    size: "0.42",
    price: "128.41",
    time: "2 min ago",
    txHash: "0x5c1ea9f0b3d7c5e1a9f3b5d7c1e9a3f5b7d1c9e3a5f7b1d9c3e5a7f9b1d3a5",
    sequence: 1284392,
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
    sequence: 1284370,
  },
  {
    id: "fill-3",
    agentId: 2,
    side: "BUY",
    token: "mAAPL",
    size: "0.74",
    price: "218.90",
    time: "24 min ago",
    txHash: "0x3a91f0b6c4e2d8a1f7b5c3d9e1a7f5c2b8d4e6a0c9f1b3d5e7a9c1f3b5d7e9a1",
    sequence: 1284355,
  },
  {
    id: "fill-4",
    agentId: 2,
    side: "SELL",
    token: "mNVDA",
    size: "0.31",
    price: "124.02",
    time: "41 min ago",
    txHash: "0x6d8a2f4c0e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e8b2d4",
    sequence: 1284318,
  },
  {
    id: "fill-5",
    agentId: 3,
    side: "BUY",
    token: "mMSFT",
    size: "0.18",
    price: "507.12",
    time: "1 hr ago",
    txHash: "0x1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b2d4f6a8c0e2b4d6f8a0c2e4b6d8f1a3c5",
    sequence: 1284250,
  },
];

export const fixtureWallet = {
  address: "0x9F2c…41aB",
  walletUsdg: 250.0,
  vaultFree: 150.0,
  allocated: { 1: 50.0 } as Record<number, number>,
};
