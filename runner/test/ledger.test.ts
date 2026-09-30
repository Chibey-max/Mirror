import { copyFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RunnerJournal } from "../src/journal";
import { ledgerDisagreement } from "../src/ledger";

const HASH = `0x${"ab".repeat(32)}` as const;
const RAW = "0x02f8" as const;

/** One trade the way processTrade leaves it once its fill ID is saved. */
async function recordedTrade(journal: RunnerJournal, id: string, fillId: number): Promise<void> {
  await journal.ensureTrade(id);
  await journal.saveTransaction(`${id}:record`, { status: "signed", rawTransaction: RAW, hash: HASH, nonce: fillId });
  await journal.confirmTransaction(`${id}:record`, BigInt(fillId));
  await journal.recordFill(id, BigInt(fillId));
}

describe("ledgerDisagreement", () => {
  const base = { floorFillCount: BigInt(19), highestFillId: BigInt(0), unresolvedRecords: 0 };

  it("accepts a seeded journal whose chain still matches the seed", () => {
    // The first CI run: seeded, no fill IDs of its own yet.
    expect(ledgerDisagreement({ ...base, chainFillCount: BigInt(19) })).toBeUndefined();
  });

  it("refuses a seeded journal once the chain has moved past the seed", () => {
    expect(ledgerDisagreement({ ...base, chainFillCount: BigInt(21) })).toMatch(/behind the chain/);
  });

  it("tolerates exactly the fills still in flight, and no more", () => {
    const inFlight = { ...base, highestFillId: BigInt(22), unresolvedRecords: 1 };
    expect(ledgerDisagreement({ ...inFlight, chainFillCount: BigInt(22) })).toBeUndefined();
    expect(ledgerDisagreement({ ...inFlight, chainFillCount: BigInt(23) })).toBeUndefined();
    expect(ledgerDisagreement({ ...inFlight, chainFillCount: BigInt(24) })).toMatch(/behind the chain/);
  });

  it("refuses a chain that is behind the journal", () => {
    expect(
      ledgerDisagreement({ ...base, highestFillId: BigInt(25), chainFillCount: BigInt(19) }),
    ).toMatch(/accounts for 25/);
  });
});

describe("RunnerJournal.ledgerView", () => {
  it("reports the highest saved fill and counts records sent without an ID", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mirror-ledger-"));
    const journal = await RunnerJournal.open(join(directory, "journal.json"));
    await recordedTrade(journal, "t:12:mAAPL:buy", 20);
    await recordedTrade(journal, "t:13:mNVDA:buy", 21);

    // Sent, never got its ID saved: the run stopped in between.
    await journal.ensureTrade("t:14:mTSLA:buy");
    await journal.saveTransaction("t:14:mTSLA:buy:record", { status: "signed", rawTransaction: RAW, hash: HASH, nonce: 3 });
    // Reverted: it minted no fill, so it must not widen the allowance.
    await journal.ensureTrade("t:15:mTSLA:sell");
    await journal.saveTransaction("t:15:mTSLA:sell:record", { status: "signed", rawTransaction: RAW, hash: HASH, nonce: 4 });
    await journal.failTransaction("t:15:mTSLA:sell:record", "reverted");
    // Planned but never sent.
    await journal.ensureTrade("t:16:mAAPL:sell");

    expect(journal.ledgerView()).toEqual({ highestFillId: BigInt(21), unresolvedRecords: 1 });
  });
});

describe("restoring an older journal", () => {
  it("refuses to run from it once a newer run has recorded fills", async () => {
    // The reviewer's reproduction: run N saves, run N+1 records Pulse's
    // tick-12 buy but its cache save is lost, so run N+2 restores run N's
    // journal. Without the check it re-records the buy as a second fill.
    const directory = await mkdtemp(join(tmpdir(), "mirror-stale-"));
    const live = join(directory, "journal.json");
    const older = join(directory, "journal.older.json");

    const runN = await RunnerJournal.open(live);
    await recordedTrade(runN, "t:10:mNVDA:buy", 19);
    await copyFile(live, older);

    const runN1 = await RunnerJournal.open(live);
    await recordedTrade(runN1, "t:12:mAAPL:buy", 20);
    const chainFillCount = BigInt(20);

    const restored = await RunnerJournal.open(older);
    const disagreement = ledgerDisagreement({ chainFillCount, floorFillCount: BigInt(19), ...restored.ledgerView() });
    expect(disagreement).toMatch(/record trades a second time/);

    // The journal that did survive agrees with the chain.
    const current = await RunnerJournal.open(live);
    expect(ledgerDisagreement({ chainFillCount, floorFillCount: BigInt(19), ...current.ledgerView() })).toBeUndefined();
  });
});
