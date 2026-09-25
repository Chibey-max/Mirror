import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TransactionReceiptNotFoundError } from "viem";
import { RunnerJournal } from "../src/journal";
import {
  DurableTransactionSender,
  TransactionFailedError,
  type TransactionPort,
} from "../src/sender";

const raw = "0x0102" as const;
const hash = `0x${"12".repeat(32)}` as const;

describe("DurableTransactionSender", () => {
  it("persists before sending and reuses identical signed bytes after a restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mirror-runner-"));
    const path = join(directory, "journal.json");
    const firstJournal = await RunnerJournal.open(path);
    const firstPort: TransactionPort = {
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
