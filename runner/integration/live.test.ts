import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, getContractAddress,
  http, keccak256, parseAbi, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MirrorRunner } from "../src/runtime";
import { loadFixture, loadStrategy, strategyFileHash } from "../src/config";
import { migrateLegacy, tapeReadAbi, verifyLiveJournal } from "../src/migrate";
import { RunnerJournal } from "../src/journal";
import { collectEvidence } from "../src/evidence";
import type { DeploymentManifest } from "../src/types";

it("runs real contracts, migrates legacy positions, recovers a recorded fill and prevents replay", async () => {
  execFileSync("forge", ["build"], { cwd: new URL("../../contracts", import.meta.url), stdio: "pipe" });
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const process = spawn("anvil", ["--port", String(port), "--chain-id", "46630", "--silent"], { stdio: "ignore" });
  try {
    const url = `http://127.0.0.1:${port}`;
    const chain = defineChain({ id: 46630, name: "local test", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [url] } } });
    const client = createPublicClient({ chain, transport: http(url), pollingInterval: 10 });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { await client.getChainId(); ready = true; break; } catch { await delay(50); }
    }
    if (!ready) throw new Error("Anvil did not start");
    const wallet = createWalletClient({ chain, transport: http(url) });
    const [deployer, admin, registrar, follower] = await wallet.getAddresses();
    // Public, deterministic LOCAL TEST key only. Never used on either deployed testnet.
    const key = `0x${"1".padStart(64, "0")}` as Hex;
    const runner = privateKeyToAccount(key).address;
    await client.request({ method: "anvil_setBalance" as never, params: [runner, "0x56bc75e2d63100000"] as never });
    async function artifact(name: string) {
      const json = JSON.parse(await readFile(new URL(`../../contracts/out/${name}.sol/${name}.json`, import.meta.url), "utf8"));
      return { abi: json.abi as Abi, bytecode: json.bytecode.object as Hex };
    }
    async function deploy(name: string, args: readonly unknown[] = []) {
      const a = await artifact(name);
      const hash = await wallet.deployContract({ ...a, args, account: deployer });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deploy ${name} failed`);
      return { address: receipt.contractAddress, hash };
    }
    async function write(account: Address, address: Address, abi: Abi, name: string, args: readonly unknown[]) {
      const hash = await wallet.sendTransaction({ account, to: address, data: encodeFunctionData({ abi, functionName: name, args }) });
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success"); return hash;
    }
    const registry = await deploy("AgentRegistry");
    const tape = await deploy("TrackRecord", [registry.address, runner]);
    const usdg = await deploy("MockUSDG");
    const stocks: Array<{ address: Address; hash: Hex }> = [];
    for (const symbol of ["mNVDA", "mAAPL", "mTSLA"]) stocks.push(await deploy("MockStock", [symbol, symbol]));
    const feeds: typeof stocks = [];
    for (let i = 0; i < 3; i++) feeds.push(await deploy("MockAggregatorV3", [runner]));
    const nonce = await client.getTransactionCount({ address: deployer });
    const predicted = getContractAddress({ from: deployer, nonce: BigInt(nonce + 1) });
    const policy = await deploy("PolicyModule", [predicted, admin]);
    const vault = await deploy("CopyVault", [tape.address, policy.address, usdg.address, runner]);
    expect(vault.address.toLowerCase()).toBe(predicted.toLowerCase());
    const policyAbi = (await artifact("PolicyModule")).abi;
    const vaultAbi = (await artifact("CopyVault")).abi;
    const usdgAbi = (await artifact("MockUSDG")).abi;
    const strategyHashes = await Promise.all(["pulse", "red", "drift"].map((a) => strategyFileHash(a as "pulse" | "red" | "drift")));
    const allowlist: Hex[] = [], registrations: Hex[] = [];
    for (let i = 0; i < 3; i++) {
      allowlist.push(await write(admin, policy.address, policyAbi, "setTokenAllowlist", [stocks[i].address, true]));
      registrations.push(await write(registrar, registry.address, (await artifact("AgentRegistry")).abi, "registerAgent",
        [["Pulse", "Red", "Drift"][i], strategyHashes[i], "test"]));
    }
    const coreRuntimeCodeHashes = await Promise.all([registry, tape, policy, vault].map(async (c) => keccak256((await client.getCode({ address: c.address }))!)));
    const manifest = { schema: "mirror.deployments.v1", chainId: 46630, deploymentBlock: 1,
      deployer, policyAdmin: admin, runner, agentRegistrar: registrar, agentRegistry: registry.address,
      trackRecord: tape.address, policyModule: policy.address, copyVault: vault.address, usdg: usdg.address,
      stockTokens: stocks.map((s) => s.address), priceFeeds: feeds.map((s) => s.address), agentIds: [1, 2, 3],
      strategyHashes, coreRuntimeCodeHashes, transactions: { agentRegistry: registry.hash, trackRecord: tape.hash,
        usdg: usdg.hash, policyModule: policy.hash, copyVault: vault.hash, stockTokens: stocks.map((s) => s.hash),
        priceFeeds: feeds.map((s) => s.hash), tokenAllowlist: allowlist, agentRegistrations: registrations } } as DeploymentManifest;
    const directory = await mkdtemp(join(tmpdir(), "mirror-integration-"));
    const config = { rpcUrl: url, publicRpcUrl: url, privateKey: key, manifestPath: "unused", fixturePath: "unused", journalPath: join(directory, "journal.json") };
    let runtime = await MirrorRunner.create(config, manifest);
    await runtime.verifyWiring();
    await write(follower, usdg.address, usdgAbi, "mint", [follower, 100_000_000n]);
    await write(follower, usdg.address, usdgAbi, "approve", [vault.address, 100_000_000n]);
    const depositHash = await write(follower, vault.address, vaultAbi, "deposit", [100_000_000n]);
    const followHash = await write(follower, vault.address, vaultAbi, "follow", [1n, 60_000_000n, 50n]);
    const fixture = await loadFixture(new URL("../fixtures/prices.jsonl", import.meta.url).pathname);
    const strategy = await loadStrategy("pulse");
    for (let tick = 0; tick <= 3; tick++) await runtime.runTick("pulse", fixture, strategy, tick);
    expect(await client.readContract({ address: tape.address, abi: tapeReadAbi, functionName: "fillCount" })).toBe(2n);
    const spent = () => client.readContract({ address: policy.address, abi: parseAbi(["function spentToday(address,uint256) view returns(uint256)"]), functionName: "spentToday", args: [follower, 1n] });
    expect(await spent()).toBe(54_684_000n);
    const migrated = await migrateLegacy(client, manifest, config.journalPath, "broadcast");
    await verifyLiveJournal(client, manifest, config.journalPath, migrated);
    await expect(migrateLegacy(client, manifest, join(directory, "missing.json"), "broadcast")).rejects.toThrow();
    expect(migrated.nextTick).toBe(4);
    expect(migrated.positions.pulse).toHaveLength(2); // Agent held both; follower cap rejected TSLA.
    const liveTick = { tick: 4, prices: { mNVDA: 13_020_000_000n, mAAPL: 23_000_000_000n, mTSLA: 41_600_000_000n } };
    const sell = [{ symbol: "mNVDA" as const, isBuy: false, size: 420_000_000_000_000_000n }];
    await expect(runtime.runLiveObservation("pulse", "recovery-test", liveTick, sell, (kind) => {
      if (kind === "mirror") throw new Error("injected crash after recording");
    })).rejects.toThrow("injected crash");
    expect(await client.readContract({ address: tape.address, abi: tapeReadAbi, functionName: "fillCount" })).toBe(3n);
    runtime = await MirrorRunner.create(config, manifest);
    await runtime.runLiveObservation("pulse", "recovery-test", liveTick, sell, () => {});
    await runtime.runLiveObservation("pulse", "recovery-test", liveTick, sell, () => { throw new Error("must not sign again"); });
    expect(await client.readContract({ address: tape.address, abi: tapeReadAbi, functionName: "fillCount" })).toBe(3n);
    const journal = (await RunnerJournal.open(config.journalPath)).snapshot();
    await expect(client.simulateContract({ account: runner, address: vault.address, abi: vaultAbi,
      functionName: "mirrorFill", args: [3n] })).rejects.toThrow("FillAlreadyMirrored");
    expect(Object.values(journal.trades).every((t) => t.status === "complete")).toBe(true);
    await expect(verifyLiveJournal(client, manifest, config.journalPath, migrated)).rejects.toThrow("ahead");
    migrated.nextTick = 5;
    await verifyLiveJournal(client, manifest, config.journalPath, migrated);
    expect(await spent()).toBe(54_684_000n); // Sell does not consume cap.
    const unfollowHash = await write(follower, vault.address, vaultAbi, "unfollow", [1n]);
    const withdrawHash = await write(follower, vault.address, vaultAbi, "withdraw", [100_000_000n]);
    expect(await client.readContract({ address: usdg.address, abi: parseAbi(["function balanceOf(address) view returns(uint256)"]), functionName: "balanceOf", args: [follower] })).toBe(100_000_000n);
    const prefix = `deployment:46630:${vault.address.toLowerCase()}:agent:pulse:tick:3:`;
    const proof = await collectEvidence(client, manifest, { follower, deposit: depositHash, follow: followHash,
      accepted: journal.transactions[`${prefix}mNVDA:buy:mirror`].hash,
      rejected: journal.transactions[`${prefix}mTSLA:buy:mirror`].hash,
      unfollow: unfollowHash, withdraw: withdrawHash });
    expect(proof.acceptedFillId).toBe(1n);
    expect(proof.rejectedFillId).toBe(2n);
    await expect(collectEvidence(client, manifest, { follower: registrar, deposit: depositHash, follow: followHash,
      accepted: journal.transactions[`${prefix}mNVDA:buy:mirror`].hash,
      rejected: journal.transactions[`${prefix}mTSLA:buy:mirror`].hash,
      unfollow: unfollowHash, withdraw: withdrawHash })).rejects.toThrow("events");
  } finally {
    process.kill("SIGTERM");
    if (process.exitCode === null) await once(process, "exit");
  }
}, 120_000);
