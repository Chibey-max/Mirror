import { access, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig, loadFixture, loadManifest, loadStrategy, strategyFileHash } from "./config";
import { RunnerLock } from "./lock";
import { ledgerDisagreement } from "./ledger";
import { MirrorRunner } from "./runtime";
import { extendTape } from "./tape";
import type { AgentKey, DeploymentManifest, PriceTick, StrategyDefinition } from "./types";

const AGENTS: AgentKey[] = ["pulse", "red", "drift"];

function argument(name: string): string | undefined {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseAgent(value: string | undefined): AgentKey {
  if (value === "pulse" || value === "red" || value === "drift") return value;
  throw new Error("--agent must be pulse, red, or drift");
}

async function checkedStrategy(agent: AgentKey, manifest: DeploymentManifest): Promise<StrategyDefinition> {
  const [strategy, committedHash] = await Promise.all([loadStrategy(agent), strategyFileHash(agent)]);
  const strategyIndex = agent === "pulse" ? 0 : agent === "red" ? 1 : 2;
  if (committedHash !== manifest.strategyHashes[strategyIndex]) {
    throw new Error(`${agent} strategy bytes do not match the on-chain manifest commitment`);
  }
  return strategy;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** The committed seed, relative to the runner directory. */
const DEFAULT_SEED = "state/journal.seed.json";

/**
 * A journal to start from when there is none, and the fill count it was
 * taken at.
 *
 * CI has no disk between runs, so its journal lives in the Actions cache.
 * The seed holds completed-tick markers only (no signed transactions) and
 * the on-chain fill count when it was taken. That count is also the floor
 * of what any journal descended from it must account for — see
 * ledgerDisagreement, which every run checks before it sends anything.
 */
type Seed = { fillCount: string; journal: unknown };

async function readSeed(seedPath: string): Promise<Seed> {
  const seed = JSON.parse(await readFile(seedPath, "utf8")) as Seed;
  if (!seed.fillCount || !seed.journal) throw new Error(`${seedPath} is not a runner journal seed`);
  return seed;
}

/** The seed's fill count, or 0 when there is no seed to measure against. */
async function seedFloor(seedPath: string | undefined): Promise<bigint> {
  const path = resolve(seedPath ?? DEFAULT_SEED);
  if (!(await exists(path))) return BigInt(0);
  return BigInt((await readSeed(path)).fillCount);
}

/**
 * Refuse before sending anything unless the chain and the journal agree on
 * what has been recorded. Runs on every start, not only a seeded one: a
 * cache that restores an older journal is as dangerous as a lost one.
 */
async function assertLedgerAgrees(runner: MirrorRunner, floor: bigint): Promise<void> {
  const disagreement = ledgerDisagreement({
    chainFillCount: await runner.fillCount(),
    floorFillCount: floor,
    ...runner.ledgerView(),
  });
  if (disagreement) throw new Error(`Refusing to run: ${disagreement}`);
}

/**
 * One scheduled step: every agent catches up to the most advanced one, then
 * all of them take the next tick together.
 *
 * Lockstep matters because the price feeds are shared. Each tick an agent
 * runs republishes that tick's prices, so an agent working through old ticks
 * after the others have moved on would leave the feeds showing stale prices.
 * Catching up first and advancing together means the last write of every
 * step is always the newest tick.
 */
async function runNext(steps: number, seedPath: string | undefined): Promise<void> {
  const config = loadConfig();
  const lock = await RunnerLock.acquire(`${config.journalPath}.lock`);
  let seeded = false;
  try {
    if (!(await exists(config.journalPath))) {
      if (!seedPath) throw new Error("No runner journal and no --seed to start from");
      const seed = await readSeed(resolve(seedPath));
      await writeFile(config.journalPath, `${JSON.stringify(seed.journal, null, 2)}\n`, { mode: 0o600 });
      seeded = true;
    }

    const [manifest, fixture] = await Promise.all([
      loadManifest(config.manifestPath, config.privateKey),
      loadFixture(config.fixturePath),
    ]);
    const strategies = new Map<AgentKey, StrategyDefinition>();
    for (const agent of AGENTS) strategies.set(agent, await checkedStrategy(agent, manifest));

    const runner = await MirrorRunner.create(config, manifest);
    await runner.verifyWiring();
    try {
      await assertLedgerAgrees(runner, await seedFloor(seedPath));
    } catch (error) {
      // A seed the chain has moved past must not survive as this run's
      // journal, or the cache would carry it forward to the next run.
      if (seeded) await unlink(config.journalPath);
      throw error;
    }

    for (let step = 0; step < steps; ++step) {
      const goal = Math.max(...AGENTS.map((agent) => runner.nextTick(agent)));
      const tape: PriceTick[] = extendTape(fixture, goal);

      for (const agent of AGENTS) {
        for (let tick = runner.nextTick(agent); tick < goal; ++tick) {
          const fills = await runner.runTick(agent, tape, strategies.get(agent)!, tick);
          process.stdout.write(`Caught up ${agent} tick ${tick}: ${fills} fill(s)\n`);
        }
      }
      for (const agent of AGENTS) {
        const fills = await runner.runTick(agent, tape, strategies.get(agent)!, goal);
        process.stdout.write(`Completed ${agent} tick ${goal}: ${fills} fill(s)\n`);
      }
    }
  } finally {
    await lock.release();
  }
}

async function runOne(agent: AgentKey, tick: number): Promise<void> {
  const config = loadConfig();
  const lock = await RunnerLock.acquire(`${config.journalPath}.lock`);
  try {
    const [manifest, fixture] = await Promise.all([
      loadManifest(config.manifestPath, config.privateKey),
      loadFixture(config.fixturePath),
    ]);
    const strategy = await checkedStrategy(agent, manifest);
    const runner = await MirrorRunner.create(config, manifest);
    await runner.verifyWiring();
    await assertLedgerAgrees(runner, await seedFloor(argument("seed")));
    const fills = await runner.runTick(agent, extendTape(fixture, tick), strategy, tick);
    process.stdout.write(`Completed ${agent} tick ${tick}: ${fills} fill(s)\n`);
  } finally {
    await lock.release();
  }
}

/**
 * CI owns the live chain once the schedule is on.
 *
 * Every runner keeps its own journal of what it has sent. Two runners with
 * two journals against one deployment would each believe the other's ticks
 * are still pending and record them again, and an append-only ledger can
 * never take a duplicate back. The PRD had people running ticks by hand
 * before rehearsals, so the likely way this happens is habit, not intent:
 * outside GitHub Actions the runner refuses unless --allow-local says the
 * scheduled workflow is paused.
 */
function assertRunnerOwner(): void {
  if (process.env.GITHUB_ACTIONS === "true" || flag("allow-local")) return;
  throw new Error(
    "The scheduled Agents workflow owns this deployment. Running locally as well would record " +
      "ticks it has already run. Disable the workflow first, then pass --allow-local.",
  );
}

async function main(): Promise<void> {
  assertRunnerOwner();
  if (flag("next")) {
    const steps = Number(argument("steps") ?? "1");
    if (!Number.isSafeInteger(steps) || steps < 1 || steps > 12) {
      throw new Error("--steps must be an integer from 1 to 12");
    }
    await runNext(steps, argument("seed"));
    return;
  }

  const agent = parseAgent(argument("agent"));
  const tick = Number(argument("tick"));
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error("--tick must be a non-negative integer");
  await runOne(agent, tick);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
