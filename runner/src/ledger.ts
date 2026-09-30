/**
 * Whether the chain and this runner's journal agree about what has been
 * recorded, checked before a run sends anything.
 *
 * Every fill on TrackRecord comes from the runner (recordFill is onlyRunner)
 * and fill IDs count up from 1 (`fillId = ++_fillCount`), so a journal that
 * has saved fill N is vouching for exactly N fills on chain. The chain may
 * be ahead of that only by trades whose record transaction went out without
 * the ID being saved yet. Anything more means the journal is behind the
 * chain: a stale cache, a lost save, or a second runner. Running from it
 * would re-record trades that are already on chain, and TrackRecord can
 * never remove a fill, so the only safe answer is to send nothing.
 *
 * `floorFillCount` is the committed seed's count. A journal seeded from it
 * holds no fill IDs until its first trade, and without the floor its
 * expectation would be zero against a chain that already has the seeded
 * history.
 */
export type LedgerCheck = {
  chainFillCount: bigint;
  floorFillCount: bigint;
  highestFillId: bigint;
  unresolvedRecords: number;
};

export function ledgerDisagreement(check: LedgerCheck): string | undefined {
  const expected = check.highestFillId > check.floorFillCount ? check.highestFillId : check.floorFillCount;
  const ceiling = expected + BigInt(check.unresolvedRecords);
  if (check.chainFillCount < expected) {
    return (
      `TrackRecord has ${check.chainFillCount} fills but this journal accounts for ${expected}. ` +
      "The journal is from a different deployment or the chain is not the one it expects."
    );
  }
  if (check.chainFillCount > ceiling) {
    return (
      `TrackRecord has ${check.chainFillCount} fills but this journal accounts for at most ${ceiling} ` +
      `(${expected} saved, ${check.unresolvedRecords} in flight). It is behind the chain — a stale cache, ` +
      "a lost save, or another runner — and running from it would record trades a second time."
    );
  }
  return undefined;
}
