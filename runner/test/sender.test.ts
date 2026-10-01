import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TransactionReceiptNotFoundError } from "viem";
import { RunnerJournal } from "../src/journal";
import {
  DurableTransactionSender,
  RetryBudgetExhaustedError,
  RunnerUnfundedError,
  TransactionFailedError,
  type TransactionPort,
} from "../src/sender";

const raw = "0x0102" as const;
const hash = `0x${"12".repeat(32)}` as const;

describe("DurableTransactionSender", () => {
  it("leaves an unfunded transaction signed, then rebroadcasts the same bytes once funded", async () => {
    // Found on a fork: an empty wallet marked the transaction failed, and
    // every later run replayed that failure, so topping up could not restart
    // the agents.
    const directory = await mkdtemp(join(tmpdir(), "mirror-runner-"));
    const path = join(directory, "journal.json");
    const broke: TransactionPort = {
      confirmedNonce: vi.fn().mockResolvedValue(0),
      broadcast: vi.fn().mockRejectedValue(new Error("Insufficient funds for gas * price + value")),
      receipt: vi.fn(),
    };
    const signer = vi.fn().mockResolvedValue({ rawTransaction: raw, hash, nonce: 196 });
    const first = new DurableTransactionSender(await RunnerJournal.open(path), broke, { sleep: async () => undefined });

    await expect(first.send("oracle:1", signer)).rejects.toBeInstanceOf(RunnerUnfundedError);
    // Stopped at once rather than burning the retry budget on an empty wallet.
    expect(broke.broadcast).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(path, "utf8")).transactions["oracle:1"].status).toBe("signed");

    const funded: TransactionPort = {
      confirmedNonce: vi.fn().mockResolvedValue(0),
      broadcast: vi.fn().mockResolvedValue(hash),
      receipt: vi.fn().mockResolvedValue({ status: "success", blockNumber: BigInt(12) }),
    };
    const forbiddenSigner = vi.fn().mockRejectedValue(new Error("must not sign twice"));
    const second = new DurableTransactionSender(await RunnerJournal.open(path), funded, { sleep: async () => undefined });

    const confirmed = await second.send("oracle:1", forbiddenSigner);
    expect(forbiddenSigner).not.toHaveBeenCalled();
    expect(funded.broadcast).toHaveBeenCalledWith(raw);
    expect(confirmed).toMatchObject({ status: "confirmed", hash, nonce: 196 });
  });

  it("persists before sending and reuses identical signed bytes after a restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mirror-runner-"));
    const path = join(directory, "journal.json");
    const firstJournal = await RunnerJournal.open(path);
    const firstPort: TransactionPort = {
      confirmedNonce: vi.fn().mockResolvedValue(0),
      broadcast: vi.fn().mockRejectedValue(new Error("RPC timeout")),
      receipt: vi.fn().mockRejectedValue(new Error("transaction not found")),
    };
    const firstSigner = vi.fn().mockResolvedValue({ rawTransaction: raw, hash, nonce: 7 });
    const first = new DurableTransactionSender(firstJournal, firstPort, {
      maxAttempts: 1,
      sleep: async () => undefined,
    });

    await expect(first.send("fill:1", firstSigner)).rejects.toThrow("Retry budget exhausted");
    expect(firstSigner).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(path, "utf8")).transactions["fill:1"].rawTransaction).toBe(raw);

    const secondJournal = await RunnerJournal.open(path);
    const secondPort: TransactionPort = {
      confirmedNonce: vi.fn().mockResolvedValue(0),
      broadcast: vi.fn().mockResolvedValue(hash),
      receipt: vi.fn().mockResolvedValue({ status: "success", blockNumber: BigInt(99) }),
    };
    const forbiddenSigner = vi.fn().mockRejectedValue(new Error("must not sign twice"));
    const second = new DurableTransactionSender(secondJournal, secondPort, { sleep: async () => undefined });

    const confirmed = await second.send("fill:1", forbiddenSigner);
    expect(forbiddenSigner).not.toHaveBeenCalled();
    expect(secondPort.broadcast).toHaveBeenCalledWith(raw);
    expect(confirmed).toMatchObject({ status: "confirmed", hash, nonce: 7, blockNumber: "99" });
  });

  it("keeps waiting when viem reports the receipt could not be found yet", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mirror-runner-"));
    const journal = await RunnerJournal.open(join(directory, "journal.json"));
    const port: TransactionPort = {
      confirmedNonce: vi.fn().mockResolvedValue(0),
      broadcast: vi.fn().mockResolvedValue(hash),
      // viem's real error, whose message says "could not be found": the
      // wording the old text match missed, so a mined transaction was
      // journalled as failed on its first receipt check.
      receipt: vi
        .fn()
        .mockRejectedValueOnce(new TransactionReceiptNotFoundError({ hash }))
        .mockResolvedValue({ status: "success", blockNumber: BigInt(5) }),
    };
    const signer = vi.fn().mockResolvedValue({ rawTransaction: raw, hash, nonce: 0 });
    const sender = new DurableTransactionSender(journal, port, { sleep: async () => undefined });

    const confirmed = await sender.send("oracle:1", signer);
    expect(confirmed).toMatchObject({ status: "confirmed", hash, blockNumber: "5" });
    expect(port.receipt).toHaveBeenCalledTimes(2);
  });

  it("treats a reverted receipt as final and never signs a replacement", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mirror-runner-"));
    const path = join(directory, "journal.json");
    const journal = await RunnerJournal.open(path);
    const port: TransactionPort = {
      confirmedNonce: vi.fn().mockResolvedValue(0),
      broadcast: vi.fn().mockResolvedValue(hash),
      receipt: vi.fn().mockResolvedValue({ status: "reverted", blockNumber: BigInt(8) }),
    };
    const signer = vi.fn().mockResolvedValue({ rawTransaction: raw, hash, nonce: 2 });
    const sender = new DurableTransactionSender(journal, port, { sleep: async () => undefined });

    await expect(sender.send("mirror:1", signer)).rejects.toBeInstanceOf(TransactionFailedError);
    expect(journal.transaction("mirror:1")?.status).toBe("failed");
    await expect(sender.send("mirror:1", signer)).rejects.toBeInstanceOf(TransactionFailedError);
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it("waits for the same hash after nonce-too-low instead of assuming success", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mirror-runner-"));
    const journal = await RunnerJournal.open(join(directory, "journal.json"));
    const port: TransactionPort = {
      confirmedNonce: vi.fn().mockResolvedValue(0),
      broadcast: vi.fn().mockRejectedValue(new Error("nonce too low")),
      receipt: vi.fn().mockResolvedValue({ status: "success", blockNumber: BigInt(12) }),
    };
    const sender = new DurableTransactionSender(journal, port, { sleep: async () => undefined });

    await sender.send("oracle:1", async () => ({ rawTransaction: raw, hash, nonce: 4 }));
    expect(port.receipt).toHaveBeenCalledWith(hash);
    expect(journal.transaction("oracle:1")?.status).toBe("confirmed");
  });

  it("rejects an RPC that returns a different transaction hash", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mirror-runner-"));
    const journal = await RunnerJournal.open(join(directory, "journal.json"));
    const otherHash = `0x${"34".repeat(32)}` as const;
    const port: TransactionPort = {
      confirmedNonce: vi.fn().mockResolvedValue(0),
      broadcast: vi.fn().mockResolvedValue(otherHash),
      receipt: vi.fn(),
    };
    const sender = new DurableTransactionSender(journal, port);
    await expect(
      sender.send("fill:wrong-hash", async () => ({ rawTransaction: raw, hash, nonce: 1 })),
    ).rejects.toBeInstanceOf(TransactionFailedError);
    expect(port.receipt).not.toHaveBeenCalled();
  });
});

describe("DurableTransactionSender: dead transactions", () => {
  const stale = { rawTransaction: "0x0aaa" as const, hash: `0x${"aa".repeat(32)}` as const, nonce: 405 };
  const fresh = { rawTransaction: "0x0bbb" as const, hash: `0x${"bb".repeat(32)}` as const, nonce: 411 };
  const tooLow = () => new Error("nonce too low: next nonce 411, tx nonce 405");
  const fast = { maxAttempts: 2, sleep: async () => undefined };

  /** A port where the stale transaction can never land and the fresh one lands at once. */
  function chain(overrides: Partial<TransactionPort> = {}): TransactionPort {
    return {
      broadcast: vi.fn(async (raw: string) => {
        if (raw === stale.rawTransaction) throw tooLow();
        return fresh.hash;
      }),
      receipt: vi.fn(async (h: string) => {
        if (h === fresh.hash) return { status: "success" as const, blockNumber: BigInt(77) };
        throw new TransactionReceiptNotFoundError({ hash: h as `0x${string}` });
      }),
      confirmedNonce: vi.fn(async () => 411),
      ...overrides,
    };
  }

  /** The 16:15 incident: a transaction left signed with a used nonce by an earlier run. */
  async function carriedOver(): Promise<string> {
    const path = join(await mkdtemp(join(tmpdir(), "mirror-dead-")), "journal.json");
    const earlier = await RunnerJournal.open(path);
    await earlier.saveTransaction("red:tick:37:oracle:mAAPL", { status: "signed", ...stale });
    return path;
  }

  it("re-signs a transaction from an earlier run whose nonce is taken and that never mined", async () => {
    const path = await carriedOver();
    const signer = vi.fn().mockResolvedValue(fresh);
    const sender = new DurableTransactionSender(await RunnerJournal.open(path), chain(), fast);

    const confirmed = await sender.send("red:tick:37:oracle:mAAPL", signer);
    expect(signer).toHaveBeenCalledTimes(1);
    expect(confirmed).toMatchObject({ status: "confirmed", hash: fresh.hash, nonce: 411, replaces: stale.hash });
  });

  it("never judges a transaction signed in this run: the next run does", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "mirror-dead-")), "journal.json");
    const signer = vi.fn().mockResolvedValue(stale);
    const sender = new DurableTransactionSender(await RunnerJournal.open(path), chain(), fast);

    await expect(sender.send("red:tick:37:oracle:mAAPL", signer)).rejects.toBeInstanceOf(RetryBudgetExhaustedError);
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it("does not re-sign when the receipt turns up during the checks (it was mined, a node lagged)", async () => {
    const path = await carriedOver();
    const signer = vi.fn().mockResolvedValue(fresh);
    let calls = 0;
    const lagging = chain({
      receipt: vi.fn(async (h: string) => {
        // Missing for the whole delivery budget, then visible.
        if (++calls > fast.maxAttempts) return { status: "success" as const, blockNumber: BigInt(70) };
        throw new TransactionReceiptNotFoundError({ hash: h as `0x${string}` });
      }),
    });
    const sender = new DurableTransactionSender(await RunnerJournal.open(path), lagging, fast);

    await expect(sender.send("red:tick:37:oracle:mAAPL", signer)).rejects.toBeInstanceOf(RetryBudgetExhaustedError);
    expect(signer).not.toHaveBeenCalled();
  });

  it("does not re-sign while the transaction's nonce is still free (it may yet be mined)", async () => {
    const path = await carriedOver();
    const signer = vi.fn().mockResolvedValue(fresh);
    const pending = chain({
      broadcast: vi.fn(async () => stale.hash),
      confirmedNonce: vi.fn(async () => stale.nonce),
    });
    const sender = new DurableTransactionSender(await RunnerJournal.open(path), pending, fast);

    await expect(sender.send("red:tick:37:oracle:mAAPL", signer)).rejects.toBeInstanceOf(RetryBudgetExhaustedError);
    expect(signer).not.toHaveBeenCalled();
  });
});
