import { TransactionReceiptNotFoundError, type Hex } from "viem";
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
  /** How many of the runner's transactions are mined: its next free nonce. */
  confirmedNonce(): Promise<number>;
}

export type SenderOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  /** Checks, spaced deadCheckIntervalMs apart, before a transaction is judged dead. */
  deadChecks?: number;
  deadCheckIntervalMs?: number;
};

export class TransactionFailedError extends Error {}

/** The transaction never reached a receipt within this run's budget. Not a failure: it may still land. */
export class RetryBudgetExhaustedError extends Error {}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPotentiallyAccepted(error: unknown): boolean {
  const text = message(error).toLowerCase();
  return (
    text.includes("already known") ||
    text.includes("already imported") ||
    text.includes("nonce too low") ||
    text.includes("replacement underpriced")
  );
}

/**
 * The node refused the transaction because the runner cannot pay for it.
 *
 * Unlike a revert, nothing about the transaction is wrong: it was never
 * included, and the signed bytes (same nonce, same hash) stay valid. Marking
 * it failed would replay that failure on every later run, so a single empty
 * wallet would stop the agents permanently, top-up or not. It is left signed
 * instead, and the next run, once funded, rebroadcasts exactly those bytes.
 */
function isUnfunded(error: unknown): boolean {
  return message(error).toLowerCase().includes("insufficient funds");
}

export class RunnerUnfundedError extends Error {}

function isTransient(error: unknown): boolean {
  // A receipt that isn't there yet is the normal state straight after a
  // broadcast, not a failure. viem's wording ("could not be found") doesn't
  // contain "not found", so match the error type rather than the text.
  if (error instanceof TransactionReceiptNotFoundError) return true;
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
  private readonly deadChecks: number;
  private readonly deadCheckIntervalMs: number;
  /** Ids this process signed. Only a transaction carried over from an earlier run can be judged dead. */
  private readonly signedThisRun = new Set<string>();

  constructor(
    private readonly journal: RunnerJournal,
    private readonly port: TransactionPort,
    options: SenderOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 8;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.deadChecks = options.deadChecks ?? 3;
    this.deadCheckIntervalMs = options.deadCheckIntervalMs ?? 10_000;
  }

  async send(id: string, signOnce: () => Promise<SignedTransaction>): Promise<TransactionEntry> {
    let entry = this.journal.transaction(id);
    if (entry?.status === "confirmed") return entry;
    if (entry?.status === "failed") throw new TransactionFailedError(entry.failure ?? `${id} previously failed`);

    if (!entry) entry = await this.signAndSave(id, signOnce);

    try {
      return await this.deliver(id, entry);
    } catch (error) {
      if (!(error instanceof RetryBudgetExhaustedError)) throw error;
      // Only a transaction from an earlier run is old enough to judge: lag is
      // seconds, runs are minutes apart. One signed in this run that wedges is
      // left for the next run to judge.
      if (this.signedThisRun.has(id) || !(await this.provablyDead(entry))) throw error;
      const replacement = await this.signAndSave(id, signOnce, entry.hash);
      return await this.deliver(id, replacement);
    }
  }

  private async signAndSave(id: string, signOnce: () => Promise<SignedTransaction>, replaces?: Hex): Promise<TransactionEntry> {
    const signed = await signOnce();
    const entry: TransactionEntry = { status: "signed", ...signed, ...(replaces ? { replaces } : {}) };
    // Durability boundary: signed bytes and their hash exist on disk before the first RPC send.
    await this.journal.saveTransaction(id, entry);
    this.signedThisRun.add(id);
    return entry;
  }

  /**
   * Whether a signed transaction can never be mined.
   *
   * A nonce is used exactly once on chain. If the runner's nonce has moved
   * past this transaction's and this transaction's own hash has no receipt,
   * some other transaction took the slot and this one never ran. Checked
   * several times, spaced apart, so a lagging node cannot pass for a missing
   * receipt; any answer that is not a clear "not found" counts as not dead.
   *
   * This is what wedged the runner on 1 Oct: a write signed with an
   * already-used nonce got "nonce too low" on every rebroadcast, which the
   * sender reads as "may already be mined", and waited for a receipt that
   * could not exist, run after run.
   */
  private async provablyDead(entry: TransactionEntry): Promise<boolean> {
    for (let check = 0; check < this.deadChecks; ++check) {
      if (check > 0) await this.sleep(this.deadCheckIntervalMs);
      let mined: number;
      try {
        mined = await this.port.confirmedNonce();
      } catch {
        return false;
      }
      if (mined <= entry.nonce) return false;
      try {
        await this.port.receipt(entry.hash);
        return false;
      } catch (error) {
        const notFound = error instanceof TransactionReceiptNotFoundError || /not (be )?found/i.test(message(error));
        if (!notFound) return false;
      }
    }
    return true;
  }

  private async deliver(id: string, entry: TransactionEntry): Promise<TransactionEntry> {
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
        // Retrying inside this run is pointless while the wallet is empty.
        if (isUnfunded(error)) {
          throw new RunnerUnfundedError(
            `Runner cannot pay for ${entry.hash}: ${message(error)}. ` +
              "It stays signed; after a top-up the next run rebroadcasts the same transaction.",
          );
        }
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
    throw new RetryBudgetExhaustedError(`Retry budget exhausted for ${entry.hash}: ${lastError}`);
  }

  private delay(attempt: number): number {
    const capped = Math.min(this.baseDelayMs * 2 ** attempt, 4_000);
    return Math.round(capped * (0.75 + this.random() * 0.5));
  }
}
