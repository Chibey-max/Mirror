import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createPublicClient, http, keccak256 } from "viem";
import { loadConfig, loadManifest, loadStrategy, strategyFileHash } from "./config";
import { RunnerLock } from "./lock";
import { MirrorRunner } from "./runtime";
import { MarketUnavailable, PythMarket } from "./market";
import { agents, finishObservation, pendingDecisions, prepareObservation, priceTick, readState, saveJson, verifyPendingDecisions } from "./live-state";
import { migrateLegacy, verifyLiveJournal } from "./migrate";
import { symbols, type AgentKey, type StrategyDefinition, type Symbol } from "./types";

const log = (event: string, fields: Record<string, unknown> = {}) =>
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), event, ...fields }, (_, v) => typeof v === "bigint" ? v.toString() : v)}\n`);
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const options = process.argv.slice(2);
  if (options.some((arg) => !["--broadcast", "--once"].includes(arg))) throw new Error("Usage: npm run watch -- [--broadcast] [--once]");
  const broadcast = options.includes("--broadcast");
  const mode = broadcast ? "broadcast" : "dry-run";
  const expires = Date.parse(required("MARKET_TRIAL_EXPIRES_AT"));
  if (!Number.isFinite(expires)) throw new Error("Invalid MARKET_TRIAL_EXPIRES_AT");
  const checkExpiry = () => { if (Date.now() >= expires) throw new Error("Market-data trial expired; new work is disabled"); };
  checkExpiry();
  if (broadcast && !process.env.MARKET_PUBLIC_USE_REFERENCE?.trim()) {
    throw new Error("Set MARKET_PUBLIC_USE_REFERENCE to the confirmed terms/permission covering public on-chain prices");
  }
  const journalPath = resolve(required("RUNNER_JOURNAL"));
  const directory = resolve(required("RUNNER_LIVE_DIR"), mode);
  const manifestPath = resolve(process.env.DEPLOYMENT_MANIFEST || "../deployments/46630.json");
  const config = broadcast ? loadConfig() : undefined;
  const manifest = await loadManifest(manifestPath, config?.privateKey);
  if (manifest.chainId !== 46630) throw new Error("Initial live rollout is restricted to Robinhood testnet 46630");
  const deployment = `${manifest.chainId}:${manifest.copyVault.toLowerCase()}`;
  const lock = await RunnerLock.acquire(`${journalPath}.lock`);
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const client = createPublicClient({ transport: http(required("RUNNER_RPC_URL"), { timeout: 15_000 }) });
    if (await client.getChainId() !== manifest.chainId) throw new Error("Wrong chain");
    const contracts = [manifest.agentRegistry, manifest.trackRecord, manifest.policyModule, manifest.copyVault];
    for (let i = 0; i < contracts.length; i++) {
      const code = await client.getCode({ address: contracts[i] });
      if (!code || keccak256(code) !== manifest.coreRuntimeCodeHashes[i]) throw new Error("Deployment runtime mismatch");
    }
    const strategies = {} as Record<AgentKey, StrategyDefinition>;
    for (const [i, agent] of agents.entries()) {
      strategies[agent] = await loadStrategy(agent);
      if (await strategyFileHash(agent) !== manifest.strategyHashes[i]) throw new Error(`${agent}: strategy commitment mismatch`);
    }
    const ids = {} as Record<Symbol, string>;
    for (const symbol of symbols) {
      ids[symbol] = required(`PYTH_FEED_${symbol.slice(1).toUpperCase()}`).replace(/^0x/, "").toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(ids[symbol])) throw new Error(`Invalid ${symbol} feed ID`);
    }
    const market = new PythMarket(required("PYTH_API_KEY"), ids);
    await market.verifyFeeds();
    await access(journalPath);
    const statePath = resolve(directory, "state.json");
    let state = await readState(statePath, deployment, mode);
    if (!state) {
      state = await migrateLegacy(client, manifest, journalPath, mode);
      await saveJson(statePath, state);
      log("cutover", { deployment, mode, nextTick: state.nextTick });
    }
    const runner = config ? await MirrorRunner.create(config, manifest) : undefined;
    verifyPendingDecisions(state, strategies);
    for (const observation of [...state.history.map((h) => h.observation), ...(state.pending ? [state.pending.observation] : [])]) {
      if (symbols.some((s) => observation.quotes[s].id !== ids[s])) throw new Error("Feed IDs changed after cutover; reconcile source history");
    }
    if (runner) {
      await verifyLiveJournal(client, manifest, journalPath, state);
      await runner.verifyWiring();
      if (await client.getBalance({ address: manifest.runner }) === 0n) throw new Error("Runner has no gas funds");
      await saveJson(`${journalPath}.live`, { deployment, statePath });
    }
    log("started", { mode, deployment, trialExpiresAt: new Date(expires).toISOString() });
    do {
      checkExpiry();
      if (!state.pending) {
        try {
          const observation = await market.latest(state.history.at(-1)?.observation);
          await saveJson(resolve(directory, "observations", `${observation.id}.json`), observation);
          prepareObservation(state, observation, strategies);
          await saveJson(statePath, state);
        } catch (error) {
          if (!(error instanceof MarketUnavailable)) throw error;
          log("waiting_for_prices", { reason: error.message });
        }
      }
      if (state.pending) {
        const pending = state.pending;
        for (const agent of agents) {
          const decisions = pendingDecisions(state, agent);
          log("decisions", { agent, observation: pending.observation.id, mode,
            decisions: decisions.map((d) => ({ ...d, size: d.size.toString() })) });
          if (runner) await runner.runLiveObservation(agent, pending.observation.id,
            priceTick(pending.tick, pending.observation), decisions, (kind) => {
              checkExpiry();
              if (kind !== "mirror" && symbols.some((s) => Date.now() / 1000 - pending.observation.quotes[s].publishTime > 120)) {
                throw new Error("Pending observation expired; stop and reconcile before accepting another tick");
              }
            });
          if (runner) log("mirror_outcomes", { agent, outcomes: await runner.liveOutcomes(agent, pending.observation.id) });
        }
        finishObservation(state);
        await saveJson(statePath, state);
        log("observation_complete", { id: pending.observation.id, mode });
      }
      if (options.includes("--once") || shutdown.signal.aborted) break;
      try { await delay(Math.min(300_000, Math.max(0, expires - Date.now())), undefined, { signal: shutdown.signal }); }
      catch (error) { if (!shutdown.signal.aborted) throw error; }
    } while (!shutdown.signal.aborted);
  } finally {
    await lock.release();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}

main().catch((error: unknown) => {
  // viem errors can include authenticated RPC URLs. Keep fatal output credential-free.
  let message = error instanceof Error ? error.message.split("\n")[0] : "Unknown error";
  for (const [name, value] of Object.entries(process.env)) {
    if (value && /KEY|SECRET|TOKEN|RPC_URL/.test(name)) message = message.split(value).join("[redacted]");
  }
  message = message.replace(/https?:\/\/\S+/g, "[redacted URL]").replace(/0x[a-fA-F0-9]{64,}/g, "[redacted hex]");
  log("fatal", { message, action: "Preserve state and reconcile before restarting." });
  process.exitCode = 1;
});
