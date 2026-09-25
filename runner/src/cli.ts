import { loadConfig, loadFixture, loadManifest, loadStrategy, strategyFileHash } from "./config";
import { RunnerLock } from "./lock";
import { MirrorRunner } from "./runtime";
import type { AgentKey } from "./types";

function argument(name: string): string | undefined {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseAgent(value: string | undefined): AgentKey {
  if (value === "pulse" || value === "red" || value === "drift") return value;
  throw new Error("--agent must be pulse, red, or drift");
}

async function main(): Promise<void> {
  const agent = parseAgent(argument("agent"));
  const tick = Number(argument("tick"));
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error("--tick must be a non-negative integer");

  const config = loadConfig();
  const lock = await RunnerLock.acquire(`${config.journalPath}.lock`);
  try {
    const [manifest, fixture, strategy, committedHash] = await Promise.all([
      loadManifest(config.manifestPath, config.privateKey),
      loadFixture(config.fixturePath),
      loadStrategy(agent),
      strategyFileHash(agent),
    ]);
    const strategyIndex = agent === "pulse" ? 0 : agent === "red" ? 1 : 2;
    if (committedHash !== manifest.strategyHashes[strategyIndex]) {
      throw new Error(`${agent} strategy bytes do not match the on-chain manifest commitment`);
    }
    const runner = await MirrorRunner.create(config, manifest);
    await runner.verifyWiring();
    const fills = await runner.runTick(agent, fixture, strategy, tick);
    process.stdout.write(`Completed ${agent} tick ${tick}: ${fills} fill(s)\n`);
  } finally {
    await lock.release();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
