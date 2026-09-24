import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const frontendSource = await readFile(resolve(repositoryRoot, "frontend/lib/contracts.ts"), "utf8");
const parseSource = frontendSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const targets = [
  ["agentRegistryAbi", "AgentRegistry.sol", "AgentRegistry"],
  ["trackRecordAbi", "TrackRecord.sol", "TrackRecord"],
  ["policyModuleAbi", "PolicyModule.sol", "PolicyModule"],
  ["copyVaultAbi", "CopyVault.sol", "CopyVault"],
  ["usdgAbi", "MockUSDG.sol", "MockUSDG"],
];

function extractArray(name) {
  const marker = `export const ${name} =`;
  const declaration = parseSource.indexOf(marker);
  if (declaration < 0) throw new Error(`Cannot find ${name}`);
  const start = parseSource.indexOf("[", declaration + marker.length);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < parseSource.length; ++index) {
    const character = parseSource[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "[") depth++;
    else if (character === "]" && --depth === 0) {
      return vm.runInNewContext(`(${parseSource.slice(start, index + 1)})`, Object.create(null));
    }
  }
  throw new Error(`Cannot parse ${name}`);
}

function parameter(value) {
  return {
    type: value.type,
    ...(value.indexed === undefined ? {} : { indexed: value.indexed }),
    ...(value.components ? { components: value.components.map(parameter) } : {}),
  };
}

function normalized(value) {
  return {
    type: value.type,
    name: value.name ?? "",
    ...(value.stateMutability ? { stateMutability: value.stateMutability } : {}),
    ...(value.anonymous === undefined && value.type !== "event" ? {} : { anonymous: value.anonymous ?? false }),
    inputs: (value.inputs ?? []).map(parameter),
    ...(value.type === "function" ? { outputs: (value.outputs ?? []).map(parameter) } : {}),
  };
}

let checked = 0;
for (const [fragmentName, artifactDirectory, contractName] of targets) {
  const frontendAbi = extractArray(fragmentName);
  const artifact = JSON.parse(
    await readFile(resolve(repositoryRoot, `contracts/out/${artifactDirectory}/${contractName}.json`), "utf8"),
  );
  for (const item of frontendAbi) {
    const expected = JSON.stringify(normalized(item));
    const candidates = artifact.abi.filter((candidate) => candidate.type === item.type && candidate.name === item.name);
    if (!candidates.some((candidate) => JSON.stringify(normalized(candidate)) === expected)) {
      throw new Error(`${fragmentName} ${item.type} ${item.name} does not match compiled ${contractName} ABI`);
    }
    checked++;
  }
}

process.stdout.write(`Verified ${checked} frontend ABI entries against compiled Foundry artifacts\n`);
