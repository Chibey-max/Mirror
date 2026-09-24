import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const chainIds = [46630, 421614];
const manifests = await Promise.all(
  chainIds.map(async (chainId) => JSON.parse(await readFile(resolve(repositoryRoot, `deployments/${chainId}.json`), "utf8"))),
);
const [primary, mirror] = manifests;
const exactFields = [
  "deployer",
  "policyAdmin",
  "runner",
  "agentRegistrar",
  "agentRegistry",
  "trackRecord",
  "policyModule",
  "copyVault",
  "usdg",
  "stockTokens",
  "priceFeeds",
  "strategyHashes",
  "coreRuntimeCodeHashes",
];

for (const field of exactFields) {
  if (JSON.stringify(primary[field]).toLowerCase() !== JSON.stringify(mirror[field]).toLowerCase()) {
    throw new Error(`${field} differs between ${chainIds[0]} and ${chainIds[1]}`);
  }
}
process.stdout.write("Deployment addresses, roles, strategies, and core runtime hashes match across both chains\n");
