import { open, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Hex } from "viem";

export type TransactionStatus = "signed" | "confirmed" | "failed";
export type TradeStatus = "planned" | "recorded" | "complete" | "failed";

export type TransactionEntry = {
  status: TransactionStatus;
  rawTransaction: Hex;
  hash: Hex;
  nonce: number;
  blockNumber?: string;
  failure?: string;
};

export type TradeEntry = {
  status: TradeStatus;
  fillId?: string;
  failure?: string;
};

type JournalState = {
  schema: "mirror.runner-journal.v1";
  transactions: Record<string, TransactionEntry>;
  trades: Record<string, TradeEntry>;
  ticks: Record<string, { status: "complete" }>;
};

const emptyState = (): JournalState => ({
  schema: "mirror.runner-journal.v1",
  transactions: {},
  trades: {},
  ticks: {},
});

export class RunnerJournal {
  private constructor(
    private readonly path: string,
    private state: JournalState,
  ) {}

  static async open(path: string): Promise<RunnerJournal> {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as JournalState;
      if (parsed.schema !== "mirror.runner-journal.v1" || !parsed.transactions || !parsed.trades) {
        throw new Error(`Unsupported runner journal at ${path}`);
      }
      parsed.ticks ??= {};
      return new RunnerJournal(path, parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return new RunnerJournal(path, emptyState());
    }
  }

  transaction(id: string): TransactionEntry | undefined {
    return this.state.transactions[id];
  }

  trade(id: string): TradeEntry | undefined {
    return this.state.trades[id];
  }

  tickComplete(id: string): boolean {
    return this.state.ticks[id]?.status === "complete";
  }

  async completeTick(id: string): Promise<void> {
    this.state.ticks[id] = { status: "complete" };
    await this.persist();
  }

  async ensureTrade(id: string): Promise<TradeEntry> {
    const existing = this.state.trades[id];
    if (existing) return existing;
    this.state.trades[id] = { status: "planned" };
    await this.persist();
    return this.state.trades[id];
  }

  async saveTransaction(id: string, entry: TransactionEntry): Promise<void> {
    this.state.transactions[id] = entry;
    await this.persist();
  }

  async confirmTransaction(id: string, blockNumber: bigint): Promise<void> {
    const entry = this.requiredTransaction(id);
    this.state.transactions[id] = { ...entry, status: "confirmed", blockNumber: blockNumber.toString() };
    await this.persist();
  }

  async failTransaction(id: string, failure: string): Promise<void> {
    const entry = this.requiredTransaction(id);
    this.state.transactions[id] = { ...entry, status: "failed", failure };
    await this.persist();
  }

  async recordFill(id: string, fillId: bigint): Promise<void> {
    this.state.trades[id] = { status: "recorded", fillId: fillId.toString() };
    await this.persist();
  }

  async completeTrade(id: string): Promise<void> {
    const trade = this.state.trades[id] ?? { status: "planned" as const };
    this.state.trades[id] = { ...trade, status: "complete" };
    await this.persist();
  }

  async failTrade(id: string, failure: string): Promise<void> {
    const trade = this.state.trades[id] ?? { status: "planned" as const };
    this.state.trades[id] = { ...trade, status: "failed", failure };
    await this.persist();
  }

  private requiredTransaction(id: string): TransactionEntry {
    const entry = this.state.transactions[id];
    if (!entry) throw new Error(`Journal transaction ${id} does not exist`);
    return entry;
  }

  private async persist(): Promise<void> {
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    const file = await open(temporary, "r");
    try {
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, this.path);
    const parent = await open(directory, "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  }
}
