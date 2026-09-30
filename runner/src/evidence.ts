import { decodeErrorResult, decodeEventLog, parseAbi, type Address, type Hex, type PublicClient, type TransactionReceipt } from "viem";
import type { DeploymentManifest } from "./types";
import { tapeReadAbi } from "./migrate";

export const evidenceAbi = parseAbi([
  "event Deposited(address indexed user,uint256 amount)",
  "event Followed(address indexed user,uint256 indexed agentId,uint256 cap)",
  "event Mirrored(address indexed user,uint256 indexed agentId,uint256 indexed fillId,uint256 size,bool isBuy)",
  "event MirrorRejected(address indexed user,uint256 indexed agentId,uint256 indexed fillId,bytes reason)",
  "event Unfollowed(address indexed user,uint256 indexed agentId,uint256 returnedAmount)",
  "event Withdrawn(address indexed user,uint256 amount)",
  "event PolicyKilled(address indexed user,uint256 indexed agentId)",
  "error CapExceeded(uint256 attempted,uint256 cap)",
  "function allocationOf(address,uint256) view returns(uint256)",
  "function positionOf(address,uint256,address) view returns(uint256)",
  "function followFillBoundaryOf(address,uint256) view returns(uint256)",
  "function followersOf(uint256) view returns(address[])",
  "function balanceOf(address) view returns(uint256)",
  "function spentToday(address,uint256) view returns(uint256)",
  "function getPolicy(address,uint256) view returns((uint256 maxNotionalPerDay,uint256 maxSlippageBps,bool active))",
]);
export type EvidenceInput = { follower: Address; deposit: Hex; follow: Hex; accepted: Hex; rejected: Hex; unfollow: Hex; withdraw: Hex };

/** Entirely read-only. Input hashes may repeat when a transaction contains multiple relevant events. */
export async function collectEvidence(client: PublicClient, manifest: DeploymentManifest, input: EvidenceInput) {
  if (await client.getChainId() !== manifest.chainId) throw new Error("Evidence RPC has wrong chain");
  const events = (receipt: TransactionReceipt, address: Address) => receipt.logs.flatMap((log) => {
    if (log.address.toLowerCase() !== address.toLowerCase()) return [];
    try { return [decodeEventLog({ abi: evidenceAbi, data: log.data, topics: log.topics })]; } catch { return []; }
  }).filter((e) => e.args.user.toLowerCase() === input.follower.toLowerCase());
  const hashes = [input.deposit, input.follow, input.accepted, input.rejected, input.unfollow, input.withdraw];
  const receipts = await Promise.all(hashes.map(async (hash) => {
    const r = await client.getTransactionReceipt({ hash });
    if (r.status !== "success" || r.to?.toLowerCase() !== manifest.copyVault.toLowerCase()) throw new Error(`Wrong target or reverted receipt ${hash}`);
    return r;
  }));
  for (let i = 1; i < receipts.length; i++) {
    const prev = receipts[i - 1], next = receipts[i];
    if (next.blockNumber < prev.blockNumber || (next.blockNumber === prev.blockNumber && next.transactionIndex < prev.transactionIndex)) {
      throw new Error("Evidence transactions are out of order");
    }
  }
  const deposited = events(receipts[0], manifest.copyVault).find((e) => e.eventName === "Deposited");
  const followed = events(receipts[1], manifest.copyVault).find((e) => e.eventName === "Followed");
  const mirrored = events(receipts[2], manifest.copyVault).find((e) => e.eventName === "Mirrored");
  const rejected = events(receipts[3], manifest.copyVault).find((e) => e.eventName === "MirrorRejected");
  const unfollowed = events(receipts[4], manifest.copyVault).find((e) => e.eventName === "Unfollowed");
  const killed = events(receipts[4], manifest.policyModule).find((e) => e.eventName === "PolicyKilled");
  const withdrawn = events(receipts[5], manifest.copyVault).find((e) => e.eventName === "Withdrawn");
  if (!deposited || !followed || !mirrored || !rejected || !unfollowed || !killed || !withdrawn) throw new Error("Required lifecycle events are missing");
  if (!mirrored.args.isBuy) throw new Error("Successful proof must be a buy");
  const agentId = followed.args.agentId;
  if ([mirrored, rejected, unfollowed, killed].some((e) => e.args.agentId !== agentId)) throw new Error("Mixed agents in evidence");
  for (const i of [0, 1, 4, 5]) if (receipts[i].from.toLowerCase() !== input.follower.toLowerCase()) throw new Error("Wrong follower sender");
  for (const i of [2, 3]) if (receipts[i].from.toLowerCase() !== manifest.runner.toLowerCase()) throw new Error("Wrong runner sender");
  const reason = decodeErrorResult({ abi: evidenceAbi, data: rejected.args.reason });
  if (reason.errorName !== "CapExceeded" || reason.args[0] <= reason.args[1] || reason.args[1] !== followed.args.cap) throw new Error("Not the expected daily-cap rejection");
  const fill = await client.readContract({ address: manifest.trackRecord, abi: tapeReadAbi, functionName: "getFill", args: [mirrored.args.fillId] });
  const blockedFill = await client.readContract({ address: manifest.trackRecord, abi: tapeReadAbi, functionName: "getFill", args: [rejected.args.fillId] });
  const followBlock = receipts[1].blockNumber;
  const boundary = await client.readContract({ address: manifest.copyVault, abi: evidenceAbi, functionName: "followFillBoundaryOf", args: [input.follower, agentId], blockNumber: followBlock });
  if (fill.agentId !== agentId || !fill.isBuy || fill.size !== mirrored.args.size || fill.fillId <= boundary
    || blockedFill.agentId !== agentId || !blockedFill.isBuy || blockedFill.fillId <= fill.fillId) throw new Error("Wrong fill or follow eligibility");
  const notional = (fill.size * fill.price + 10n ** 20n - 1n) / 10n ** 20n;
  const spent = await client.readContract({ address: manifest.policyModule, abi: evidenceAbi, functionName: "spentToday", args: [input.follower, agentId], blockNumber: receipts[2].blockNumber });
  const position = await client.readContract({ address: manifest.copyVault, abi: evidenceAbi, functionName: "positionOf", args: [input.follower, agentId, fill.token], blockNumber: receipts[2].blockNumber });
  const rejectedPosition = await client.readContract({ address: manifest.copyVault, abi: evidenceAbi, functionName: "positionOf", args: [input.follower, agentId, blockedFill.token], blockNumber: receipts[3].blockNumber });
  const spentAfterRejection = await client.readContract({ address: manifest.policyModule, abi: evidenceAbi, functionName: "spentToday", args: [input.follower, agentId], blockNumber: receipts[3].blockNumber });
  if (spent !== notional || position !== fill.size || spentAfterRejection !== spent
    || rejectedPosition !== (blockedFill.token === fill.token ? fill.size : 0n)) throw new Error("Smoke position/spend mismatch; use an isolated same-day scenario");
  const blockNumber = await client.getBlockNumber();
  const allocation = await client.readContract({ address: manifest.copyVault, abi: evidenceAbi, functionName: "allocationOf", args: [input.follower, agentId], blockNumber });
  const followers = await client.readContract({ address: manifest.copyVault, abi: evidenceAbi, functionName: "followersOf", args: [agentId], blockNumber });
  const policy = await client.readContract({ address: manifest.policyModule, abi: evidenceAbi, functionName: "getPolicy", args: [input.follower, agentId], blockNumber });
  const free = await client.readContract({ address: manifest.copyVault, abi: evidenceAbi, functionName: "balanceOf", args: [input.follower], blockNumber });
  const wallet = await client.readContract({ address: manifest.usdg, abi: evidenceAbi, functionName: "balanceOf", args: [input.follower], blockNumber });
  if (allocation !== 0n || policy.active || followers.some((a) => a.toLowerCase() === input.follower.toLowerCase())
    || free !== 0n || wallet !== deposited.args.amount || withdrawn.args.amount !== deposited.args.amount
    || unfollowed.args.returnedAmount !== followed.args.cap) throw new Error("Principal exit proof failed");
  return { schema: "mirror.smoke-evidence.v1", chainId: manifest.chainId, copyVault: manifest.copyVault,
    follower: input.follower, agentId, verifiedAtBlock: blockNumber, transactions: input,
    acceptedFillId: fill.fillId, rejectedFillId: blockedFill.fillId, position, spent, rejection: reason.args,
    exit: { allocation, active: policy.active, free, wallet, followerAbsent: true } };
}
