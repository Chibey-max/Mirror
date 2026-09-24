import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  encodeFunctionData,
  fallback,
  getAddress,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt as ViemReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { aggregatorAbi, copyVaultAbi, trackRecordAbi } from "./abi";
import type { RunnerConfig } from "./config";
import { RunnerJournal } from "./journal";
import { DurableTransactionSender, type SignedTransaction, type TransactionPort } from "./sender";
import { decisionsAtTick } from "./strategy";
import type { AgentKey, DeploymentManifest, PriceTick, Symbol } from "./types";
import { symbols } from "./types";

const agentIndex: Record<AgentKey, number> = { pulse: 0, red: 1, drift: 2 };

const wiringAbi = [
  { type: "function", name: "registry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "vault", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "trackRecord", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "policyModule", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "usdg", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "isTokenAllowed",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "owner", type: "address" },
        { name: "name", type: "string" },
        { name: "strategyHash", type: "bytes32" },
        { name: "modelVersion", type: "string" },
        { name: "registeredAt", type: "uint64" },
        { name: "active", type: "bool" },
      ],
    }],
  },
] as const;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

class ViemTransactionPort implements TransactionPort {
  constructor(private readonly client: PublicClient) {}

  async broadcast(rawTransaction: Hex): Promise<Hex> {
    return this.client.sendRawTransaction({ serializedTransaction: rawTransaction });
  }

  async receipt(hash: Hex) {
    const receipt = await this.client.getTransactionReceipt({ hash });
    return { status: receipt.status, blockNumber: receipt.blockNumber };
  }
}

export class MirrorRunner {
  private readonly account;
  private readonly chain;
  private readonly publicClient;
  private readonly walletClient;
  private readonly sender;

  private constructor(
    private readonly config: RunnerConfig,
    private readonly manifest: DeploymentManifest,
    private readonly journal: RunnerJournal,
  ) {
    this.account = privateKeyToAccount(config.privateKey);
    this.chain = defineChain({
      id: manifest.chainId,
      name: `Mirror ${manifest.chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl, config.publicRpcUrl] } },
    });
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: fallback([http(config.rpcUrl), http(config.publicRpcUrl)]),
    });
    this.walletClient = createWalletClient({ account: this.account, chain: this.chain, transport: http(config.rpcUrl) });
    this.sender = new DurableTransactionSender(this.journal, new ViemTransactionPort(this.publicClient));
  }

  static async create(config: RunnerConfig, manifest: DeploymentManifest): Promise<MirrorRunner> {
    return new MirrorRunner(config, manifest, await RunnerJournal.open(config.journalPath));
  }

  async verifyWiring(): Promise<void> {
    const actualChain = await this.publicClient.getChainId();
    if (actualChain !== this.manifest.chainId) {
      throw new Error(`RPC chain ${actualChain} does not match manifest chain ${this.manifest.chainId}`);
    }
    const checks: Array<[string, Address, Address]> = [
      [
        "trackRecord.registry",
        await this.publicClient.readContract({ address: this.manifest.trackRecord, abi: wiringAbi, functionName: "registry" }),
        this.manifest.agentRegistry,
      ],
      [
        "trackRecord.runner",
        await this.publicClient.readContract({ address: this.manifest.trackRecord, abi: trackRecordAbi, functionName: "runner" }),
        this.manifest.runner,
      ],
      [
        "policyModule.vault",
        await this.publicClient.readContract({ address: this.manifest.policyModule, abi: wiringAbi, functionName: "vault" }),
        this.manifest.copyVault,
      ],
      [
        "policyModule.owner",
        await this.publicClient.readContract({ address: this.manifest.policyModule, abi: wiringAbi, functionName: "owner" }),
        this.manifest.policyAdmin,
      ],
      [
        "copyVault.trackRecord",
        await this.publicClient.readContract({ address: this.manifest.copyVault, abi: wiringAbi, functionName: "trackRecord" }),
        this.manifest.trackRecord,
      ],
      [
        "copyVault.policyModule",
        await this.publicClient.readContract({ address: this.manifest.copyVault, abi: wiringAbi, functionName: "policyModule" }),
        this.manifest.policyModule,
      ],
      [
        "copyVault.usdg",
        await this.publicClient.readContract({ address: this.manifest.copyVault, abi: wiringAbi, functionName: "usdg" }),
        this.manifest.usdg,
      ],
      [
        "copyVault.runner",
        await this.publicClient.readContract({ address: this.manifest.copyVault, abi: copyVaultAbi, functionName: "runner" }),
        this.manifest.runner,
      ],
    ];
    for (const [field, actual, expected] of checks) {
      if (getAddress(actual) !== getAddress(expected)) throw new Error(`${field} is ${actual}; expected ${expected}`);
    }

    const core: Array<[string, Address, Hex]> = [
      ["AgentRegistry", this.manifest.agentRegistry, this.manifest.coreRuntimeCodeHashes[0]],
      ["TrackRecord", this.manifest.trackRecord, this.manifest.coreRuntimeCodeHashes[1]],
      ["PolicyModule", this.manifest.policyModule, this.manifest.coreRuntimeCodeHashes[2]],
      ["CopyVault", this.manifest.copyVault, this.manifest.coreRuntimeCodeHashes[3]],
    ];
    for (const [name, address, expectedHash] of core) {
      const code = await this.publicClient.getCode({ address });
      if (!code || keccak256(code) !== expectedHash) throw new Error(`${name} runtime bytecode does not match manifest`);
    }

    for (let index = 0; index < this.manifest.stockTokens.length; ++index) {
      const token = this.manifest.stockTokens[index];
      const allowed = await this.publicClient.readContract({
        address: this.manifest.policyModule,
        abi: wiringAbi,
        functionName: "isTokenAllowed",
        args: [token],
      });
      if (!allowed) throw new Error(`Stock token ${token} is not allowlisted`);
      const agent = await this.publicClient.readContract({
        address: this.manifest.agentRegistry,
        abi: wiringAbi,
        functionName: "getAgent",
        args: [BigInt(this.manifest.agentIds[index])],
      });
      if (getAddress(agent.owner) !== this.manifest.agentRegistrar || !agent.active) {
        throw new Error(`Agent ${this.manifest.agentIds[index]} has the wrong owner or is inactive`);
      }
      if (agent.strategyHash !== this.manifest.strategyHashes[index]) {
        throw new Error(`Agent ${this.manifest.agentIds[index]} strategy hash does not match manifest`);
      }
    }
  }

  async runTick(agent: AgentKey, ticks: PriceTick[], strategy: Parameters<typeof decisionsAtTick>[1], tick: number) {
    const decisions = decisionsAtTick(agent, strategy, ticks, tick);
    const index = ticks.findIndex((candidate) => candidate.tick === tick);
    if (index < 0) throw new Error(`Unknown fixture tick ${tick}`);
    const deploymentKey = `${this.manifest.chainId}:${this.manifest.copyVault.toLowerCase()}`;
    const tickId = `deployment:${deploymentKey}:agent:${agent}:tick:${tick}`;
    if (this.journal.tickComplete(tickId)) return decisions.length;
    if (index > 0) {
      const previous = `deployment:${deploymentKey}:agent:${agent}:tick:${ticks[index - 1].tick}`;
      if (!this.journal.tickComplete(previous)) {
        throw new Error(`${agent} tick ${tick} is out of order; complete tick ${ticks[index - 1].tick} first`);
      }
    }

    const priceTick = ticks[index];
    await this.updateOraclePrices(agent, deploymentKey, priceTick);
    for (const decision of decisions) {
      await this.processTrade(
        agent,
        deploymentKey,
        tick,
        decision.symbol,
        decision.isBuy,
        decision.size,
        priceTick.prices[decision.symbol],
      );
    }
    await this.journal.completeTick(tickId);
    return decisions.length;
  }

  private async updateOraclePrices(agent: AgentKey, deploymentKey: string, tick: PriceTick): Promise<void> {
    for (let index = 0; index < symbols.length; ++index) {
      const symbol = symbols[index];
      const id = `deployment:${deploymentKey}:agent:${agent}:tick:${tick.tick}:oracle:${symbol}`;
      const price = tick.prices[symbol];
      await this.sender.send(id, () =>
        this.signContractCall(this.manifest.priceFeeds[index], encodeFunctionData({
          abi: aggregatorAbi,
          functionName: "setPrice",
          args: [price],
        }), async () => {
          await this.publicClient.simulateContract({
            account: this.account,
            address: this.manifest.priceFeeds[index],
            abi: aggregatorAbi,
            functionName: "setPrice",
            args: [price],
          });
        }),
      );
      const [, answer] = await this.publicClient.readContract({
        address: this.manifest.priceFeeds[index],
        abi: aggregatorAbi,
        functionName: "latestRoundData",
      });
      if (answer !== price) throw new Error(`${symbol} oracle recorded ${answer}; expected ${price}`);
    }
  }

  private async processTrade(
    agent: AgentKey,
    deploymentKey: string,
    tick: number,
    symbol: Symbol,
    isBuy: boolean,
    size: bigint,
    expectedPrice: bigint,
  ): Promise<void> {
    const tradeId = `deployment:${deploymentKey}:agent:${agent}:tick:${tick}:${symbol}:${isBuy ? "buy" : "sell"}`;
    const existing = await this.journal.ensureTrade(tradeId);
    if (existing.status === "complete") return;
    if (existing.status === "failed") throw new Error(`${tradeId} previously failed: ${existing.failure}`);

    try {
      const symbolIndex = symbols.indexOf(symbol);
      const token = this.manifest.stockTokens[symbolIndex];
      const feed = this.manifest.priceFeeds[symbolIndex];
      const [roundId, price] = await this.publicClient.readContract({
        address: feed,
        abi: aggregatorAbi,
        functionName: "latestRoundData",
      });
      if (price <= BigInt(0) || price !== expectedPrice) {
        throw new Error(`${symbol} oracle price ${price} does not match fixture ${expectedPrice}`);
      }
      const oracleRoundId = toHex(roundId, { size: 32 });
      const id = BigInt(this.manifest.agentIds[agentIndex[agent]]);
      const recordTxId = `${tradeId}:record`;

      await this.sender.send(recordTxId, () =>
        this.signContractCall(this.manifest.trackRecord, encodeFunctionData({
          abi: trackRecordAbi,
          functionName: "recordFill",
          args: [id, token, isBuy, size, BigInt(price), oracleRoundId],
        }), async () => {
          await this.publicClient.simulateContract({
            account: this.account,
            address: this.manifest.trackRecord,
            abi: trackRecordAbi,
            functionName: "recordFill",
            args: [id, token, isBuy, size, BigInt(price), oracleRoundId],
          });
        }),
      );

      let trade = this.journal.trade(tradeId)!;
      let fillId = trade.fillId ? BigInt(trade.fillId) : undefined;
      if (fillId === undefined) {
        const recordEntry = this.journal.transaction(recordTxId)!;
        const receipt = await this.publicClient.getTransactionReceipt({ hash: recordEntry.hash });
        fillId = this.fillIdFrom(receipt);
        await this.journal.recordFill(tradeId, fillId);
        trade = this.journal.trade(tradeId)!;
      }

      const alreadyMirrored = await this.publicClient.readContract({
        address: this.manifest.copyVault,
        abi: copyVaultAbi,
        functionName: "isMirrored",
        args: [fillId],
      });
      if (alreadyMirrored) {
        await this.journal.completeTrade(tradeId);
        return;
      }

      const mirrorTxId = `${tradeId}:mirror`;
      await this.sender.send(mirrorTxId, () =>
        this.signContractCall(this.manifest.copyVault, encodeFunctionData({
          abi: copyVaultAbi,
          functionName: "mirrorFill",
          args: [fillId!],
        }), async () => {
          await this.publicClient.simulateContract({
            account: this.account,
            address: this.manifest.copyVault,
            abi: copyVaultAbi,
            functionName: "mirrorFill",
            args: [fillId!],
          });
        }),
      );
      await this.journal.completeTrade(tradeId);
    } catch (error) {
      const failure = errorText(error);
      // Contract simulation errors are final for this logical trade, including
      // InvalidTokenDecimals and NotionalOverflow. Never build a replacement transaction.
      if (failure.includes("InvalidTokenDecimals") || failure.includes("NotionalOverflow") || failure.includes("reverted")) {
        await this.journal.failTrade(tradeId, failure);
      }
      throw error;
    }
  }

  private async signContractCall(to: Address, data: Hex, simulate: () => Promise<void>): Promise<SignedTransaction> {
    await simulate();
    const request = await this.walletClient.prepareTransactionRequest({ account: this.account, to, data });
    const rawTransaction = await this.walletClient.signTransaction(request);
    return { rawTransaction, hash: keccak256(rawTransaction), nonce: request.nonce };
  }

  private fillIdFrom(receipt: ViemReceipt): bigint {
    for (const log of receipt.logs) {
      if (getAddress(log.address) !== this.manifest.trackRecord) continue;
      try {
        const decoded = decodeEventLog({ abi: trackRecordAbi, data: log.data, topics: log.topics });
        if (decoded.eventName === "FillRecorded") return decoded.args.fillId;
      } catch {
        // Ignore unrelated TrackRecord logs; only FillRecorded identifies the immutable fill.
      }
    }
    throw new Error(`FillRecorded was absent from transaction ${receipt.transactionHash}`);
  }
}
