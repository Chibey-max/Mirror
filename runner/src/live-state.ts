import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { applyDecision, decisionsForObservation, type Position } from "./strategy";
import { symbols, type AgentKey, type FillDecision, type PriceTick, type StrategyDefinition, type Symbol } from "./types";
import type { Observation } from "./market";

export const agents: AgentKey[] = ["pulse", "red", "drift"];
export type SavedPosition = { symbol: Symbol; size: string; entryPrice: string; entryTick: number };
export type LiveState = {
  schema: "mirror.live.v1";
  deployment: string;
  mode: "dry-run" | "broadcast";
  legacyFingerprint: string;
  nextTick: number;
  positions: Record<AgentKey, SavedPosition[]>;
  history: Array<{ tick: number; observation: Observation }>;
  pending?: { tick: number; observation: Observation; decisions: Record<AgentKey, Array<{
    symbol: Symbol; isBuy: boolean; size: string;
  }>> };
};

export async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  const file = await open(temp, "r");
  try { await file.sync(); } finally { await file.close(); }
  await rename(temp, path);
  const dir = await open(dirname(path), "r");
  try { await dir.sync(); } finally { await dir.close(); }
}

export async function readState(path: string, deployment: string, mode: LiveState["mode"]): Promise<LiveState | undefined> {
  try {
    const state = JSON.parse(await readFile(path, "utf8")) as LiveState;
    if (state.schema !== "mirror.live.v1" || state.deployment !== deployment || state.mode !== mode
      || typeof state.legacyFingerprint !== "string" || !Number.isSafeInteger(state.nextTick) || !Array.isArray(state.history)
      || agents.some((agent) => !Array.isArray(state.positions?.[agent]))) throw new Error("Invalid live state or mode/deployment mismatch");
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function priceTick(tick: number, observation: Observation): PriceTick {
  return { tick, prices: Object.fromEntries(symbols.map((s) => [s, BigInt(observation.quotes[s].raw8)])) as Record<Symbol, bigint> };
}

export function positionMap(positions: SavedPosition[]): Map<Symbol, Position> {
  return new Map(positions.map((p) => [p.symbol, { ...p, size: BigInt(p.size), entryPrice: BigInt(p.entryPrice) }]));
}

export function prepareObservation(state: LiveState, observation: Observation,
  strategies: Record<AgentKey, StrategyDefinition>): void {
  if (state.pending) throw new Error("Resume pending observation first");
  const ticks = [...state.history.map((h) => priceTick(h.tick, h.observation)), priceTick(state.nextTick, observation)];
  const decisions = {} as NonNullable<LiveState["pending"]>["decisions"];
  for (const agent of agents) {
    const lookback = Number(strategies[agent].signal.lookbackTicks ?? strategies[agent].signal.ratioLookbackTicks);
    if (!Number.isSafeInteger(lookback) || lookback < 1 || lookback > 100) throw new Error("Invalid strategy lookback");
    // No fixture price can influence a live signal; require a complete live lookback.
    decisions[agent] = (ticks.length > lookback
      ? decisionsForObservation(agent, strategies[agent], ticks, positionMap(state.positions[agent])) : [])
      .map((d) => ({ ...d, size: d.size.toString() }));
  }
  state.pending = { tick: state.nextTick, observation, decisions };
}

export function pendingDecisions(state: LiveState, agent: AgentKey): FillDecision[] {
  if (!state.pending) throw new Error("No pending observation");
  return state.pending.decisions[agent].map((d) => ({ ...d, size: BigInt(d.size) }));
}

export function finishObservation(state: LiveState): void {
  const pending = state.pending;
  if (!pending) throw new Error("No pending observation");
  for (const agent of agents) {
    const positions = positionMap(state.positions[agent]);
    for (const d of pendingDecisions(state, agent)) {
      applyDecision(positions, d, BigInt(pending.observation.quotes[d.symbol].raw8), pending.tick);
    }
    state.positions[agent] = [...positions.values()].map((p) => ({ ...p, size: p.size.toString(), entryPrice: p.entryPrice.toString() }));
  }
  state.history.push({ tick: pending.tick, observation: pending.observation });
  // A separately persisted observation archive retains the complete source history.
  state.history = state.history.slice(-101);
  state.nextTick = pending.tick + 1;
  delete state.pending;
}

export function verifyPendingDecisions(state: LiveState, strategies: Record<AgentKey, StrategyDefinition>): void {
  if (!state.pending) return;
  const expected = structuredClone(state);
  delete expected.pending;
  prepareObservation(expected, state.pending.observation, strategies);
  if (JSON.stringify(expected.pending) !== JSON.stringify(state.pending)) throw new Error("Saved decisions differ from committed strategy; restore state backup");
}
