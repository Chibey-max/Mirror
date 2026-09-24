import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const argv = process.argv.slice(2);
const chainId = Number(argv[0]);
const rpcUrl = argv[1];
const dryRun = argv.includes("--dry-run");
const manifestFlag = argv.indexOf("--manifest");
const repositoryRoot = resolve(import.meta.dirname, "../..");
const contractsRoot = resolve(repositoryRoot, "contracts");
const manifestPath = resolve(
  manifestFlag >= 0 ? argv[manifestFlag + 1] : resolve(repositoryRoot, `deployments/${chainId}.json`),
);

if (![46630, 421614].includes(chainId) || !rpcUrl || (manifestFlag >= 0 && !argv[manifestFlag + 1])) {
  throw new Error(
    "usage: node script/verify-deployment.mjs <chain-id> <rpc-url> [--manifest <path>] [--dry-run]",
  );
}
new URL(rpcUrl);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schema !== "mirror.deployments.v1" || Number(manifest.chainId) !== chainId) {
  throw new Error("manifest schema or chain ID is wrong");
}

function requireAddress(value, field) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

function tuple3(value, field) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${field} must contain exactly three entries`);
  return value.map((item, index) => requireAddress(item, `${field}[${index}]`));
}

const addresses = {
  agentRegistry: requireAddress(manifest.agentRegistry, "agentRegistry"),
  trackRecord: requireAddress(manifest.trackRecord, "trackRecord"),
  policyModule: requireAddress(manifest.policyModule, "policyModule"),
  copyVault: requireAddress(manifest.copyVault, "copyVault"),
  usdg: requireAddress(manifest.usdg, "usdg"),
  runner: requireAddress(manifest.runner, "runner"),
  policyAdmin: requireAddress(manifest.policyAdmin, "policyAdmin"),
  stocks: tuple3(manifest.stockTokens, "stockTokens"),
  feeds: tuple3(manifest.priceFeeds, "priceFeeds"),
};

const stockDefinitions = [
  ["Mock NVIDIA", "mNVDA"],
  ["Mock Apple", "mAAPL"],
  ["Mock Tesla", "mTSLA"],
];

const contracts = [
  {
    name: "AgentRegistry",
    address: addresses.agentRegistry,
    identifier: "src/AgentRegistry.sol:AgentRegistry",
  },
  {
    name: "TrackRecord",
    address: addresses.trackRecord,
    identifier: "src/TrackRecord.sol:TrackRecord",
    constructorArgsSpec: ["constructor(address,address)", addresses.agentRegistry, addresses.runner],
  },
  {
    name: "MockUSDG",
    address: addresses.usdg,
    identifier: "src/mocks/MockUSDG.sol:MockUSDG",
  },
  ...addresses.stocks.map((address, index) => ({
    name: `MockStock:${stockDefinitions[index][1]}`,
    address,
    identifier: "src/mocks/MockStock.sol:MockStock",
    constructorArgsSpec: ["constructor(string,string)", ...stockDefinitions[index]],
  })),
  ...addresses.feeds.map((address, index) => ({
    name: `MockAggregatorV3:${stockDefinitions[index][1]}`,
    address,
    identifier: "src/mocks/MockAggregatorV3.sol:MockAggregatorV3",
    constructorArgsSpec: ["constructor(address)", addresses.runner],
  })),
  {
    name: "PolicyModule",
    address: addresses.policyModule,
    identifier: "src/PolicyModule.sol:PolicyModule",
    constructorArgsSpec: ["constructor(address,address)", addresses.copyVault, addresses.policyAdmin],
  },
  {
    name: "CopyVault",
    address: addresses.copyVault,
    identifier: "src/CopyVault.sol:CopyVault",
    constructorArgsSpec: [
      "constructor(address,address,address,address)",
      addresses.trackRecord,
      addresses.policyModule,
      addresses.usdg,
      addresses.runner,
    ],
  },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: contractsRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    const detail = options.capture ? `: ${(result.stderr || result.stdout).trim()}` : "";
    throw new Error(`${command} failed${detail}`);
  }
  return options.capture ? result.stdout.trim() : "";
}

function constructorArgs(definition) {
  if (!definition.constructorArgsSpec) return undefined;
  return run("cast", ["abi-encode", ...definition.constructorArgsSpec], { capture: true });
}

const encoded = contracts.map((definition) => ({ ...definition, encoded: constructorArgs(definition) }));

if (dryRun) {
  for (const definition of encoded) process.stdout.write(`${definition.name} ${definition.address}\n`);
  process.stdout.write(`Prepared ${encoded.length} verification submissions for chain ${chainId}\n`);
  process.exit(0);
}

if (chainId === 421614 && !process.env.ARBISCAN_API_KEY?.trim()) {
  throw new Error("ARBISCAN_API_KEY is required for Arbitrum Sepolia verification");
}

for (const definition of encoded) {
  process.stdout.write(`Verifying ${definition.name} at ${definition.address}\n`);
  const args = [
    "verify-contract",
    definition.address,
    definition.identifier,
    "--chain-id",
    String(chainId),
    "--rpc-url",
    rpcUrl,
    "--compiler-version",
    "v0.8.24+commit.e11b9ed9",
    "--num-of-optimizations",
    "200",
    "--watch",
  ];
  if (definition.encoded) args.push("--constructor-args", definition.encoded);
  let verificationEnv;
  if (chainId === 46630) {
    args.push(
      "--verifier",
      "blockscout",
      "--verifier-url",
      "https://explorer.testnet.chain.robinhood.com/api/",
    );
  } else {
    args.push("--verifier", "etherscan");
    verificationEnv = { ETHERSCAN_API_KEY: process.env.ARBISCAN_API_KEY.trim() };
  }
  run("forge", args, { env: verificationEnv });
}

const sourceCommit = run("git", ["rev-parse", "HEAD"], { capture: true });
const explorerBase =
  chainId === 46630
    ? "https://explorer.testnet.chain.robinhood.com/address/"
    : "https://sepolia.arbiscan.io/address/";
const evidence = {
  schema: "mirror.verification.v1",
  chainId,
  sourceCommit,
  verifiedAt: new Date().toISOString(),
  contracts: encoded.map(({ name, address, identifier }) => ({
    name,
    address,
    identifier,
    explorerUrl: `${explorerBase}${address}${chainId === 421614 ? "#code" : "?tab=contract"}`,
  })),
};
const evidencePath = resolve(repositoryRoot, `deployments/evidence/${chainId}-verification.json`);
await mkdir(dirname(evidencePath), { recursive: true });
const temporary = `${evidencePath}.tmp`;
await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
await rename(temporary, evidencePath);
process.stdout.write(`Verified ${encoded.length} contracts and wrote ${evidencePath}\n`);
