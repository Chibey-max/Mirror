import type { Hex } from "viem";
import type { RunnerJournal, TransactionEntry } from "./journal";

export type SignedTransaction = {
  rawTransaction: Hex;
  hash: Hex;
  nonce: number;
};

export type TransactionReceipt = {
  status: "success" | "reverted";
  blockNumber: bigint;
};

export interface TransactionPort {
  broadcast(rawTransaction: Hex): Promise<Hex>;
  receipt(hash: Hex): Promise<TransactionReceipt>;
}

export type SenderOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

export class TransactionFailedError extends Error {}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPotentiallyAccepted(error: unknown): boolean {
  const text = message(error).toLowerCase();
  return text.includes("already known") || text.includes("nonce too low") || text.includes("replacement underpriced");
}

function isTransient(error: unknown): boolean {
  const text = message(error).toLowerCase();
  return (
    text.includes("429") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("not found") ||
    text.includes("server error") ||
    text.includes("503") ||
    text.includes("502") ||
    text.includes("network") ||
    text.includes("fetch failed") ||
    text.includes("socket")
  );
}

export class DurableTransactionSender {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;

  constructor(
    private readonly journal: RunnerJournal,
    private readonly port: TransactionPort,
    options: SenderOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 8;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  async send(id: string, signOnce: () => Promise<SignedTransaction>): Promise<TransactionEntry> {
    let entry = this.journal.transaction(id);
    if (entry?.status === "confirmed") return entry;
    if (entry?.status === "failed") throw new TransactionFailedError(entry.failure ?? `${id} previously failed`);

    if (!entry) {
      const signed = await signOnce();
      entry = { status: "signed", ...signed };
      // Durability boundary: signed bytes and their hash exist on disk before the first RPC send.
      await this.journal.saveTransaction(id, entry);
    }

    let lastError = "transaction did not reach a receipt";
    for (let attempt = 0; attempt < this.maxAttempts; ++attempt) {
      try {
        const broadcastHash = await this.port.broadcast(entry.rawTransaction);
        if (broadcastHash.toLowerCase() !== entry.hash.toLowerCase()) {
          lastError = `RPC returned ${broadcastHash} for signed transaction ${entry.hash}`;
          await this.journal.failTransaction(id, lastError);
          throw new TransactionFailedError(lastError);
        }
      } catch (error) {
        if (error instanceof TransactionFailedError) throw error;
        if (!isPotentiallyAccepted(error) && !isTransient(error)) {
          lastError = message(error);
          await this.journal.failTransaction(id, lastError);
          throw new TransactionFailedError(lastError);
        }
        lastError = message(error);
      }

      try {
        const receipt = await this.port.receipt(entry.hash);
        if (receipt.status === "reverted") {
          lastError = `Transaction ${entry.hash} reverted`;
          await this.journal.failTransaction(id, lastError);
          throw new TransactionFailedError(lastError);
        }
        await this.journal.confirmTransaction(id, receipt.blockNumber);
        return this.journal.transaction(id)!;
      } catch (error) {
        if (error instanceof TransactionFailedError) throw error;
        if (!isTransient(error)) {
          lastError = message(error);
          await this.journal.failTransaction(id, lastError);
          throw new TransactionFailedError(lastError);
        }
        lastError = message(error);
      }

      if (attempt + 1 < this.maxAttempts) await this.sleep(this.delay(attempt));
    }

    // Do not mark a timeout failed: it may still be pending, and the next run must resume the same hash.
    throw new Error(`Retry budget exhausted for ${entry.hash}: ${lastError}`);
  }

  private delay(attempt: number): number {
    const capped = Math.min(this.baseDelayMs * 2 ** attempt, 4_000);
    return Math.round(capped * (0.75 + this.random() * 0.5));
  }
}
