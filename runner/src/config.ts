import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bytesToHex, getAddress, isAddress, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AgentKey, DeploymentManifest, PriceTick, StrategyDefinition, Symbol } from "./types";
import { symbols } from "./types";

export type RunnerConfig = {
  rpcUrl: string;
  publicRpcUrl: string;
  privateKey: Hex;
  manifestPath: string;
  fixturePath: string;
  journalPath: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(): RunnerConfig {
  const key = required("RUNNER_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(key) || /^0x0{64}$/.test(key)) {
    throw new Error("RUNNER_PRIVATE_KEY must be a non-zero 32-byte hex key");
  }
  return {
    rpcUrl: required("RUNNER_RPC_URL"),
    publicRpcUrl: process.env.RUNNER_PUBLIC_RPC_URL?.trim() || "https://rpc.testnet.chain.robinhood.com",
    privateKey: key as Hex,
    manifestPath: resolve(process.env.DEPLOYMENT_MANIFEST?.trim() || "../deployments/46630.json"),
    fixturePath: resolve(process.env.RUNNER_FIXTURE?.trim() || "fixtures/prices.jsonl"),
    journalPath: resolve(process.env.RUNNER_JOURNAL?.trim() || ".mirror-runner.journal.json"),
  };
}

function address(value: unknown, field: string): Address {
  if (typeof value !== "string" || !isAddress(value)) throw new Error(`Invalid ${field} in deployment manifest`);
  const parsed = getAddress(value);
  if (parsed === "0x0000000000000000000000000000000000000000") throw new Error(`${field} cannot be zero`);
  return parsed;
}

function tuple3<T>(value: unknown, field: string, parse: (item: unknown, name: string) => T): [T, T, T] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${field} must contain exactly three entries`);
  return [parse(value[0], `${field}[0]`), parse(value[1], `${field}[1]`), parse(value[2], `${field}[2]`)];
}

function integer(value: unknown, field: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function hash(value: unknown, field: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`Invalid ${field}`);
  return value as Hex;
}

export async function loadManifest(path: string, privateKey: Hex): Promise<DeploymentManifest> {
  const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  if (raw.schema !== "mirror.deployments.v1") throw new Error("Unsupported deployment manifest schema");
  if (!Array.isArray(raw.coreRuntimeCodeHashes) || raw.coreRuntimeCodeHashes.length !== 4) {
    throw new Error("coreRuntimeCodeHashes must contain four entries");
  }
  const coreRuntimeCodeHashes = raw.coreRuntimeCodeHashes.map((item, index) => {
    if (typeof item !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(item)) {
      throw new Error(`Invalid coreRuntimeCodeHashes[${index}]`);
    }
    return item as Hex;
  }) as [Hex, Hex, Hex, Hex];
  const manifest: DeploymentManifest = {
    schema: "mirror.deployments.v1",
    chainId: integer(raw.chainId, "chainId"),
    deploymentBlock: integer(raw.deploymentBlock, "deploymentBlock"),
    deployer: address(raw.deployer, "deployer"),
    policyAdmin: address(raw.policyAdmin, "policyAdmin"),
    runner: address(raw.runner, "runner"),
    agentRegistrar: address(raw.agentRegistrar, "agentRegistrar"),
    agentRegistry: address(raw.agentRegistry, "agentRegistry"),
    trackRecord: address(raw.trackRecord, "trackRecord"),
    policyModule: address(raw.policyModule, "policyModule"),
    copyVault: address(raw.copyVault, "copyVault"),
    usdg: address(raw.usdg, "usdg"),
    stockTokens: tuple3(raw.stockTokens, "stockTokens", address),
    priceFeeds: tuple3(raw.priceFeeds, "priceFeeds", address),
    agentIds: tuple3(raw.agentIds, "agentIds", integer),
    strategyHashes: tuple3(raw.strategyHashes, "strategyHashes", hash),
    coreRuntimeCodeHashes,
    transactions: (() => {
      const transactions = raw.transactions as Record<string, unknown> | undefined;
      if (!transactions) throw new Error("Deployment manifest has no mined transaction record");
      return {
        agentRegistry: hash(transactions.agentRegistry, "transactions.agentRegistry"),
        trackRecord: hash(transactions.trackRecord, "transactions.trackRecord"),
        usdg: hash(transactions.usdg, "transactions.usdg"),
        stockTokens: tuple3(transactions.stockTokens, "transactions.stockTokens", hash),
        priceFeeds: tuple3(transactions.priceFeeds, "transactions.priceFeeds", hash),
        policyModule: hash(transactions.policyModule, "transactions.policyModule"),
        copyVault: hash(transactions.copyVault, "transactions.copyVault"),
        tokenAllowlist: tuple3(transactions.tokenAllowlist, "transactions.tokenAllowlist", hash),
        agentRegistrations: tuple3(transactions.agentRegistrations, "transactions.agentRegistrations", hash),
      };
    })(),
  };
  const signer = privateKeyToAccount(privateKey).address;
  if (getAddress(signer) !== manifest.runner) {
    throw new Error(`Runner key ${signer} does not match manifest runner ${manifest.runner}`);
  }
  if (manifest.deploymentBlock === 0) throw new Error("Deployment manifest was not finalized from mined receipts");
  const roles = [manifest.deployer, manifest.policyAdmin, manifest.runner, manifest.agentRegistrar];
  if (new Set(roles.map((role) => role.toLowerCase())).size !== roles.length) {
    throw new Error("Deployment manifest roles are not pairwise distinct");
  }
  return manifest;
}

export async function loadFixture(path: string): Promise<PriceTick[]> {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter((line) => line.trim());
  const ticks = lines.map((line, index) => {
    const raw = JSON.parse(line) as Record<string, unknown>;
    const tick = integer(raw.tick, `fixture line ${index + 1} tick`);
    const prices = {} as Record<Symbol, bigint>;
    for (const symbol of symbols) {
      const value = raw[symbol];
      if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
        throw new Error(`Invalid ${symbol} price at fixture tick ${tick}`);
      }
      prices[symbol] = BigInt(value);
    }
    return { tick, prices };
  });
  for (let index = 1; index < ticks.length; ++index) {
    if (ticks[index].tick <= ticks[index - 1].tick) throw new Error("Fixture ticks must be strictly increasing");
  }
  return ticks;
}

export async function loadStrategy(agent: AgentKey): Promise<StrategyDefinition> {
  const url = new URL(`./strategies/${agent}.json`, import.meta.url);
  const strategy = JSON.parse(await readFile(url, "utf8")) as StrategyDefinition;
  const expected = agent === "pulse" ? "Pulse" : agent === "red" ? "Red" : "Drift";
  if (strategy.schema !== "mirror.strategy.v1" || strategy.agent !== expected) {
    throw new Error(`Strategy file for ${agent} has the wrong identity`);
  }
  return strategy;
}

export async function strategyFileHash(agent: AgentKey): Promise<Hex> {
  const bytes = await readFile(new URL(`./strategies/${agent}.json`, import.meta.url));
  return keccak256(bytesToHex(bytes));
}
