import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agents, finishObservation, prepareObservation, readState, saveJson, verifyPendingDecisions, type LiveState } from "../src/live-state";
import { parseObservation } from "../src/market";
import { loadStrategy, loadFixture } from "../src/config";
import { decisionsAtTick } from "../src/strategy";
import { symbols, type AgentKey, type StrategyDefinition } from "../src/types";

const ids = { mNVDA: "1".repeat(64), mAAPL: "2".repeat(64), mTSLA: "3".repeat(64) };
const quote = (time: number, prices = [100, 100, 100]) => parseObservation({ parsed: symbols.map((s, i) => ({
  id: ids[s], price: { price: String(prices[i] * 1e8), expo: -8, conf: "1", publish_time: time },
})) }, ids, time);
const state = (): LiveState => ({ schema: "mirror.live.v1", deployment: "test", mode: "dry-run", legacyFingerprint: "test", nextTick: 10,
  positions: { pulse: [], red: [], drift: [] }, history: [] });
async function strategies() {
  return Object.fromEntries(await Promise.all(agents.map(async (a) => [a, await loadStrategy(a)]))) as Record<AgentKey, StrategyDefinition>;
}

describe("durable live strategy state", () => {
  it("warms up from live observations and persists exact decisions across restart", async () => {
    const s = state(), definitions = await strategies();
    for (let i = 0; i < 5; i++) {
      prepareObservation(s, quote(1000 + i * 300), definitions);
      expect(s.pending!.decisions.drift).toEqual([]);
      finishObservation(s);
    }
    prepareObservation(s, quote(2500, [100, 110, 100]), definitions);
    expect(s.pending!.decisions.drift).toEqual([{ symbol: "mTSLA", isBuy: true, size: "180000000000000000" }]);
    const path = join(await mkdtemp(join(tmpdir(), "mirror-live-")), "state.json");
    await saveJson(path, s);
    const restored = (await readState(path, "test", "dry-run"))!;
    expect(restored).toEqual(s);
    verifyPendingDecisions(restored, definitions);
    const corrupted = structuredClone(restored);
    corrupted.pending!.decisions.drift[0].size = "1";
    expect(() => verifyPendingDecisions(corrupted, definitions)).toThrow("Saved decisions");
    expect(() => prepareObservation(restored, quote(2800), definitions)).toThrow("Resume");
    finishObservation(restored);
    expect(restored.positions.drift[0].size).toBe("180000000000000000");
    expect(restored.positions.drift[0].entryTick).toBe(15);
    await expect(readState(path, "test", "broadcast")).rejects.toThrow("mismatch");
    expect(JSON.parse(await readFile(path, "utf8")).pending).toBeDefined();
  });
  it("Drift fires on the original fixture and sells on convergence", async () => {
    const ticks = await loadFixture(new URL("../fixtures/prices.jsonl", import.meta.url).pathname);
    const drift = await loadStrategy("drift");
    expect(ticks.flatMap((t) => decisionsAtTick("drift", drift, ticks, t.tick)).some((d) => d.isBuy)).toBe(true);
    const s = state(), definitions = await strategies();
    for (let i = 0; i < 5; i++) { prepareObservation(s, quote(1000 + i * 300), definitions); finishObservation(s); }
    prepareObservation(s, quote(2500, [100, 110, 100]), definitions); finishObservation(s);
    prepareObservation(s, quote(2800, [100, 102, 100]), definitions);
    expect(s.pending!.decisions.drift).toEqual([{ symbol: "mTSLA", isBuy: false, size: "180000000000000000" }]);
  });
});
