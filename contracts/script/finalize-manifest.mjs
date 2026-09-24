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
