import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RunnerJournal } from "../src/journal";
import { nextNonce } from "../src/nonce";

const RAW = "0x02f8" as const;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;

describe("nextNonce", () => {
  it("never signs below the last mined nonce, whatever a lagging node says", () => {
    // 16:15 UTC, 1 Oct: nonce 410 had just mined; a lagging node still said 410.
    expect(nextNonce(410, 410)).toBe(411);
    expect(nextNonce(405, 410)).toBe(411);
  });

  it("follows the chain when it is ahead, and when there is no history", () => {
    expect(nextNonce(415, 410)).toBe(415);
    expect(nextNonce(7, undefined)).toBe(7);
  });
});

describe("RunnerJournal.highestMinedNonce", () => {
  it("counts confirmed and reverted transactions, and nothing that may never have been used", async () => {
    const journal = await RunnerJournal.open(join(await mkdtemp(join(tmpdir(), "mirror-nonce-")), "journal.json"));
    expect(journal.highestMinedNonce()).toBeUndefined();

    await journal.saveTransaction("a", { status: "signed", rawTransaction: RAW, hash: hash(1), nonce: 3 });
    await journal.confirmTransaction("a", BigInt(1));
    await journal.saveTransaction("b", { status: "signed", rawTransaction: RAW, hash: hash(2), nonce: 4 });
    await journal.failTransaction("b", `Transaction ${hash(2)} reverted`);
    expect(journal.highestMinedNonce()).toBe(4);

    // Signed but never confirmed, and rejected before inclusion: their nonces
    // may be free, and counting them would leave a gap.
    await journal.saveTransaction("c", { status: "signed", rawTransaction: RAW, hash: hash(3), nonce: 9 });
    await journal.saveTransaction("d", { status: "signed", rawTransaction: RAW, hash: hash(4), nonce: 8 });
    await journal.failTransaction("d", "max fee per gas less than block base fee");
    expect(journal.highestMinedNonce()).toBe(4);
  });
});
