import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const chainId = Number(process.argv[2]);
const rpcUrl = process.argv[3];
if (!Number.isSafeInteger(chainId) || chainId <= 0 || !rpcUrl) {
  throw new Error("usage: node script/finalize-manifest.mjs <chain-id> <rpc-url>");
}

const root = resolve(import.meta.dirname, "../..");
const pendingPath = resolve(root, `deployments/.pending/${chainId}.json`);
const broadcastPath = resolve(root, `contracts/broadcast/Deploy.s.sol/${chainId}/run-latest.json`);
const finalPath = resolve(root, `deployments/${chainId}.json`);
const pending = JSON.parse(await readFile(pendingPath, "utf8"));
const broadcast = JSON.parse(await readFile(broadcastPath, "utf8"));

if (pending.schema !== "mirror.deployments.v1" || pending.chainId !== chainId) {
  throw new Error("pending manifest schema or chain ID is wrong");
}
if (!Array.isArray(broadcast.transactions) || !Array.isArray(broadcast.receipts)) {
  throw new Error("Forge broadcast artifact has no transactions or receipts");
}
if (broadcast.transactions.length !== broadcast.receipts.length) {
  throw new Error("not every broadcast transaction has a receipt");
}

let rpcId = 0;
async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

function abiWords(value, label) {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{64})+$/.test(value)) {
    throw new Error(`${label} returned malformed ABI data`);
  }
  return value.slice(2).match(/.{64}/g);
}

function decodeAddress(word, label) {
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(word)) throw new Error(`${label} returned a malformed address`);
  return `0x${word.slice(24)}`.toLowerCase();
}

function decodeBool(word, label) {
  const value = BigInt(`0x${word}`);
  if (value !== 0n && value !== 1n) throw new Error(`${label} returned a malformed bool`);
  return value === 1n;
}

function addressWord(address, label) {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`${label} is not an address`);
  }
  return address.slice(2).toLowerCase().padStart(64, "0");
}

function uintWord(value, label) {
  let parsed;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${label} is not an integer`);
  }
  if (parsed < 0n || parsed >= 1n << 256n) throw new Error(`${label} is outside uint256`);
  return parsed.toString(16).padStart(64, "0");
}

function utf8Hex(value) {
  return `0x${Buffer.from(value, "utf8").toString("hex")}`;
}

async function selector(signature) {
  const hash = await rpc("web3_sha3", [utf8Hex(signature)]);
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error(`could not derive selector for ${signature}`);
  }
  return hash.slice(0, 10);
}

async function readContract(address, data, label) {
  const result = await rpc("eth_call", [{ to: address, data }, "latest"]);
  return abiWords(result, label);
}

function decodeAgent(words, label) {
  // Agent contains strings, so its single tuple return value must begin at the
  // canonical 0x20 offset. Reject anything else instead of guessing at a layout.
  if (words.length < 7 || BigInt(`0x${words[0]}`) !== 32n) {
    throw new Error(`${label} returned a malformed Agent tuple`);
  }
  const base = 1;
  return {
    owner: decodeAddress(words[base], `${label}.owner`),
    strategyHash: `0x${words[base + 2]}`.toLowerCase(),
    active: decodeBool(words[base + 5], `${label}.active`),
  };
}

const rpcChain = Number.parseInt(await rpc("eth_chainId", []), 16);
if (rpcChain !== chainId) throw new Error(`RPC chain ${rpcChain} does not match ${chainId}`);

const transactionByHash = new Map(
  broadcast.transactions.map((transaction) => [transaction.hash.toLowerCase(), transaction]),
);
const mined = [];
for (const artifactReceipt of broadcast.receipts) {
  const hash = artifactReceipt.transactionHash.toLowerCase();
  const transaction = transactionByHash.get(hash);
  if (!transaction) throw new Error(`receipt ${hash} has no broadcast transaction`);
  const receipt = await rpc("eth_getTransactionReceipt", [hash]);
  if (!receipt || receipt.status !== "0x1") throw new Error(`transaction ${hash} did not succeed on chain`);
  if (receipt.blockHash !== artifactReceipt.blockHash) throw new Error(`receipt ${hash} does not match the RPC`);
  mined.push({ transaction, receipt });
}

for (const { transaction } of mined) {
  const sender = transaction.transaction.from.toLowerCase();
  if (transaction.transactionType === "CREATE" && sender !== pending.deployer.toLowerCase()) {
    throw new Error(`${transaction.contractName} was not created by the manifest deployer`);
  }
  if (transaction.function === "setTokenAllowlist(address,bool)" && sender !== pending.policyAdmin.toLowerCase()) {
    throw new Error("allowlist transaction was not sent by the policy admin");
  }
  if (transaction.function === "registerAgent(string,bytes32,string)" && sender !== pending.agentRegistrar.toLowerCase()) {
    throw new Error("agent registration was not sent by the registrar");
  }
}

function creations(name) {
  return mined.filter(({ transaction }) => transaction.transactionType === "CREATE" && transaction.contractName === name);
}

function oneCreation(name, expectedAddress) {
  const matches = creations(name);
  if (matches.length !== 1) throw new Error(`expected one ${name} creation, found ${matches.length}`);
  if (matches[0].transaction.contractAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(`${name} address differs between pending manifest and broadcast`);
  }
  return matches[0].receipt.transactionHash;
}

function orderedCreationHashes(name, expectedAddresses) {
  const matches = creations(name);
  if (matches.length !== expectedAddresses.length) {
    throw new Error(`expected ${expectedAddresses.length} ${name} creations, found ${matches.length}`);
  }
  return matches.map((match, index) => {
    if (match.transaction.contractAddress.toLowerCase() !== expectedAddresses[index].toLowerCase()) {
      throw new Error(`${name}[${index}] address differs between pending manifest and broadcast`);
    }
    return match.receipt.transactionHash;
  });
}

function calls(signature, expectedCount) {
  const matches = mined.filter(({ transaction }) => transaction.function === signature);
  if (matches.length !== expectedCount) throw new Error(`expected ${expectedCount} ${signature} calls, found ${matches.length}`);
  return matches.map(({ receipt }) => receipt.transactionHash);
}

const deployedAddresses = [
  pending.agentRegistry,
  pending.trackRecord,
  pending.policyModule,
  pending.copyVault,
  pending.usdg,
  ...pending.stockTokens,
  ...pending.priceFeeds,
];
const codeByAddress = new Map();
for (const address of deployedAddresses) {
  const code = await rpc("eth_getCode", [address, "latest"]);
  if (code === "0x") throw new Error(`no deployed code at ${address}`);
  codeByAddress.set(address.toLowerCase(), code);
}
for (const [index, address] of [
  pending.agentRegistry,
  pending.trackRecord,
  pending.policyModule,
  pending.copyVault,
].entries()) {
  const actualHash = await rpc("web3_sha3", [codeByAddress.get(address.toLowerCase())]);
  if (actualHash.toLowerCase() !== pending.coreRuntimeCodeHashes[index].toLowerCase()) {
    throw new Error(`runtime bytecode hash mismatch at ${address}`);
  }
}

if (pending.stockTokens.length !== 3 || pending.agentIds.length !== 3 || pending.strategyHashes.length !== 3) {
  throw new Error("pending manifest must contain three stocks, agent IDs and strategy hashes");
}

const [ownerSelector, allowlistSelector, getAgentSelector] = await Promise.all([
  selector("owner()"),
  selector("isTokenAllowed(address)"),
  selector("getAgent(uint256)"),
]);

const ownerWords = await readContract(pending.policyModule, ownerSelector, "policyModule.owner()");
if (ownerWords.length !== 1) throw new Error("policyModule.owner() returned the wrong number of words");
const actualPolicyAdmin = decodeAddress(ownerWords[0], "policyModule.owner()");
if (actualPolicyAdmin !== pending.policyAdmin.toLowerCase()) {
  throw new Error(`PolicyModule owner ${actualPolicyAdmin} does not match ${pending.policyAdmin}`);
}

for (const stock of pending.stockTokens) {
  const words = await readContract(
    pending.policyModule,
    `${allowlistSelector}${addressWord(stock, "stock token")}`,
    `isTokenAllowed(${stock})`,
  );
  if (words.length !== 1 || !decodeBool(words[0], `isTokenAllowed(${stock})`)) {
    throw new Error(`stock ${stock} is not allowlisted`);
  }
}

for (let index = 0; index < pending.agentIds.length; index += 1) {
  const agentId = pending.agentIds[index];
  const words = await readContract(
    pending.agentRegistry,
    `${getAgentSelector}${uintWord(agentId, `agentIds[${index}]`)}`,
    `getAgent(${agentId})`,
  );
  const agent = decodeAgent(words, `getAgent(${agentId})`);
  if (agent.owner !== pending.agentRegistrar.toLowerCase()) {
    throw new Error(`agent ${agentId} owner ${agent.owner} does not match ${pending.agentRegistrar}`);
  }
  if (agent.strategyHash !== pending.strategyHashes[index].toLowerCase()) {
    throw new Error(`agent ${agentId} strategy hash does not match the manifest`);
  }
  if (!agent.active) throw new Error(`agent ${agentId} is not active`);
}

const deploymentBlocks = mined.map(({ receipt }) => Number.parseInt(receipt.blockNumber, 16));
const finalManifest = {
  ...pending,
  deploymentBlock: Math.min(...deploymentBlocks),
  transactions: {
    agentRegistry: oneCreation("AgentRegistry", pending.agentRegistry),
    trackRecord: oneCreation("TrackRecord", pending.trackRecord),
    usdg: oneCreation("MockUSDG", pending.usdg),
    stockTokens: orderedCreationHashes("MockStock", pending.stockTokens),
    priceFeeds: orderedCreationHashes("MockAggregatorV3", pending.priceFeeds),
    policyModule: oneCreation("PolicyModule", pending.policyModule),
    copyVault: oneCreation("CopyVault", pending.copyVault),
    tokenAllowlist: calls("setTokenAllowlist(address,bool)", 3),
    agentRegistrations: calls("registerAgent(string,bytes32,string)", 3),
  },
};

await mkdir(dirname(finalPath), { recursive: true });
const temporary = `${finalPath}.tmp`;
await writeFile(temporary, `${JSON.stringify(finalManifest, null, 2)}\n`, { mode: 0o644 });
await rename(temporary, finalPath);
process.stdout.write(`Finalized ${finalPath} from ${mined.length} successful mined receipts\n`);
