import { createPublicClient, http, isAddress, type Hex } from "viem";
import { loadManifest } from "./config";
import { collectEvidence, type EvidenceInput } from "./evidence";

async function main() {
  const follower = process.env.SMOKE_FOLLOWER_ADDRESS;
  if (!follower || !isAddress(follower)) throw new Error("SMOKE_FOLLOWER_ADDRESS is required");
  const input = { follower } as EvidenceInput;
  for (const key of ["deposit", "follow", "accepted", "rejected", "unfollow", "withdraw"] as const) {
    const hash = process.env[`SMOKE_${key.toUpperCase()}_TX`];
    if (!hash || !/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error(`SMOKE_${key.toUpperCase()}_TX is required`);
    input[key] = hash as Hex;
  }
  if (!process.env.RUNNER_RPC_URL) throw new Error("RUNNER_RPC_URL is required");
  const manifest = await loadManifest(process.env.DEPLOYMENT_MANIFEST || "../deployments/46630.json");
  const client = createPublicClient({ transport: http(process.env.RUNNER_RPC_URL) });
  const result = await collectEvidence(client, manifest, input);
  process.stdout.write(`${JSON.stringify(result, (_, v) => typeof v === "bigint" ? v.toString() : v, 2)}\n`);
}
main().catch(() => {
  process.stderr.write("Evidence verification failed: check transaction hashes, follower, chain, archive RPC access and isolated same-day smoke state. No evidence was produced.\n");
  process.exitCode = 1;
});
