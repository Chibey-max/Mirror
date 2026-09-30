import { parseAbi, decodeEventLog, keccak256, TransactionReceiptNotFoundError, type PublicClient } from "viem";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { RunnerJournal } from "./journal";
import { trackRecordAbi, copyVaultAbi } from "./abi";
import { agents, type LiveState, type SavedPosition } from "./live-state";
import type { DeploymentManifest, Symbol } from "./types";
import { symbols } from "./types";

export const tapeReadAbi = parseAbi([
  "function fillCount() view returns (uint256)",
  "function getFill(uint256) view returns ((uint256 fillId,uint256 agentId,address token,bool isBuy,uint256 size,uint256 price,uint64 timestamp,bytes32 oracleRoundId))",
]);

function legacyFingerprint(snapshot: ReturnType<RunnerJournal["snapshot"]>): string {
  return createHash("sha256").update(JSON.stringify(Object.fromEntries(
    ["transactions", "trades", "ticks"].map((key) => [key, Object.fromEntries(
      Object.entries(snapshot[key as "transactions"]).filter(([id]) => !id.includes(":live:")).sort(([a], [b]) => a.localeCompare(b)),
    )]),
  ))).digest("hex");
}

/** An unexplained historical write is an operator reconciliation task, never an empty starting portfolio. */
export async function migrateLegacy(client: PublicClient, manifest: DeploymentManifest, path: string,
  mode: LiveState["mode"]): Promise<LiveState> {
  await readFile(path); // Unlike RunnerJournal.open, migration MUST NOT create an empty journal.
  const journal = await RunnerJournal.open(path);
  const old = journal.snapshot();
  const deployment = `${manifest.chainId}:${manifest.copyVault.toLowerCase()}`;
  const prefix = `deployment:${deployment}:agent:`;
  const portfolios = Object.fromEntries(agents.map((a) => [a, new Map<Symbol, SavedPosition>()])) as Record<typeof agents[number], Map<Symbol, SavedPosition>>;
  let lastTick = -1;
  const lastByAgent = { pulse: -1, red: -1, drift: -1 };
  const known = new Map<string, { agent: typeof agents[number]; tick: number; symbol: Symbol; buy: boolean; id: string }>();
  for (const [id, tx] of Object.entries(old.transactions)) {
    if (!id.startsWith(`deployment:${deployment}:`)) throw new Error("Journal belongs to another deployment");
    if (tx.status !== "confirmed") throw new Error(`Resolve legacy transaction ${id} by its original hash before migration`);
    const receipt = await client.getTransactionReceipt({ hash: tx.hash });
    if (receipt.status !== "success" || receipt.from.toLowerCase() !== manifest.runner.toLowerCase()
      || receipt.blockNumber.toString() !== tx.blockNumber) throw new Error(`Legacy receipt mismatch: ${id}`);
  }
  for (const id of Object.keys(old.ticks)) {
    if (!id.startsWith(prefix)) throw new Error("Live state is missing or journal deployment differs; restore state backup");
    const match = id.match(/:tick:(\d+)$/);
    if (match) lastTick = Math.max(lastTick, Number(match[1]));
    const agent = id.slice(prefix.length).split(":")[0] as typeof agents[number];
    if (match && agents.includes(agent)) lastByAgent[agent] = Math.max(lastByAgent[agent], Number(match[1]));
  }
  for (const [id, trade] of Object.entries(old.trades)) {
    if (!id.startsWith(prefix)) throw new Error("Cannot bootstrap from an already-live journal; restore live state");
    const match = id.slice(prefix.length).match(/^(pulse|red|drift):tick:(\d+):(mNVDA|mAAPL|mTSLA):(buy|sell)$/);
    if (!match || trade.status !== "complete" || !trade.fillId) throw new Error(`Resolve unfinished legacy trade: ${id}`);
    if (known.has(trade.fillId)) throw new Error("Duplicate legacy fill ID");
    known.set(trade.fillId, { agent: match[1] as typeof agents[number], tick: Number(match[2]),
      symbol: match[3] as Symbol, buy: match[4] === "buy", id });
    lastTick = Math.max(lastTick, Number(match[2]));
  }
  const count = await client.readContract({ address: manifest.trackRecord, abi: tapeReadAbi, functionName: "fillCount" });
  if (count !== BigInt(known.size)) throw new Error(`Journal covers ${known.size} of ${count} fills; reconcile missing history first`);
  for (let id = 1n; id <= count; id++) {
    const entry = known.get(id.toString());
    if (!entry) throw new Error(`Unexplained fill ${id}`);
    const fill = await client.readContract({ address: manifest.trackRecord, abi: tapeReadAbi, functionName: "getFill", args: [id] });
    const tx = journal.transaction(`${entry.id}:record`);
    if (!tx) throw new Error(`No recording receipt for fill ${id}`);
    const receipt = await client.getTransactionReceipt({ hash: tx.hash });
    const matches = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== manifest.trackRecord.toLowerCase()) return false;
      try { const decoded = decodeEventLog({ abi: trackRecordAbi, data: log.data, topics: log.topics });
        return decoded.eventName === "FillRecorded" && decoded.args.fillId === id;
      } catch { return false; }
    });
    if (!matches || fill.agentId !== BigInt(manifest.agentIds[agents.indexOf(entry.agent)])
      || fill.token.toLowerCase() !== manifest.stockTokens[symbols.indexOf(entry.symbol)].toLowerCase()
      || fill.isBuy !== entry.buy) throw new Error(`Fill/journal mismatch ${id}`);
    if (!await client.readContract({ address: manifest.copyVault, abi: copyVaultAbi, functionName: "isMirrored", args: [id] })) {
      throw new Error(`Legacy fill ${id} not processed; reconcile before cutover`);
    }
    const positions = portfolios[entry.agent];
    if (fill.isBuy) {
      if (positions.has(entry.symbol)) throw new Error("Repeated buy in legacy history; manual reconciliation required");
      positions.set(entry.symbol, { symbol: entry.symbol, size: fill.size.toString(), entryPrice: fill.price.toString(), entryTick: entry.tick });
    } else {
      if (positions.get(entry.symbol)?.size !== fill.size.toString()) throw new Error("Legacy sell does not close held position");
      positions.delete(entry.symbol);
    }
  }
  // Each legacy agent could advance independently. Preserve holding age at the common cutover tick.
  for (const agent of agents) for (const p of portfolios[agent].values()) {
    p.entryTick += lastTick - lastByAgent[agent];
  }
  return { schema: "mirror.live.v1", deployment, mode, legacyFingerprint: legacyFingerprint(old), nextTick: lastTick + 1,
    positions: Object.fromEntries(agents.map((a) => [a, [...portfolios[a].values()]])) as LiveState["positions"], history: [] };
}

/** Catch lost state, outside writes, failed receipts and a restored journal from another chain. */
export async function verifyLiveJournal(client: PublicClient, manifest: DeploymentManifest, path: string,
  state: LiveState): Promise<void> {
  const snapshot = (await RunnerJournal.open(path)).snapshot();
  if (legacyFingerprint(snapshot) !== state.legacyFingerprint) throw new Error("Legacy journal changed after cutover; reconcile state");
  const prefix = `deployment:${state.deployment}:`;
  const ids = new Set<string>();
  for (const [id, tx] of Object.entries(snapshot.transactions)) {
    if (!id.startsWith(prefix) || keccak256(tx.rawTransaction) !== tx.hash) throw new Error("Journal identity/hash mismatch");
    if (tx.status === "failed") throw new Error(`Resolve failed transaction ${id}`);
    if (id.includes(":live:")) {
      const tick = Number(id.match(/:tick:(\d+):/)?.[1]);
      if (!Number.isSafeInteger(tick) || tick > state.nextTick
        || (tick === state.nextTick && !id.includes(`:live:${state.pending?.observation.id}:`))) {
        throw new Error("Journal is ahead of live state; restore matching backups");
      }
    }
    try {
      const receipt = await client.getTransactionReceipt({ hash: tx.hash });
      if (receipt.status !== "success" || receipt.from.toLowerCase() !== manifest.runner.toLowerCase()
        || (tx.status === "confirmed" && receipt.blockNumber.toString() !== tx.blockNumber)) throw new Error(`Receipt mismatch ${id}`);
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== manifest.trackRecord.toLowerCase()) continue;
        try {
          const event = decodeEventLog({ abi: trackRecordAbi, data: log.data, topics: log.topics });
          if (event.eventName === "FillRecorded") ids.add(event.args.fillId.toString());
        } catch { /* unrelated event */ }
      }
    } catch (error) {
      if (tx.status === "signed" && error instanceof TransactionReceiptNotFoundError) continue;
      throw error;
    }
  }
  const count = await client.readContract({ address: manifest.trackRecord, abi: tapeReadAbi, functionName: "fillCount" });
  if (count !== BigInt(ids.size)) throw new Error("Tape has fills missing from journal; reconcile before continuing");
}
