/**
 * TrackRecord returns an agent's fills oldest first. These are the paging
 * arguments for the newest `limit` of them: reading from offset 0 instead
 * shows the first fills ever recorded once an agent has more than `limit`.
 */
export function latestFillPage(
  count: bigint,
  limit: number,
): { offset: bigint; limit: bigint } {
  const pageSize = BigInt(limit);
  const size = count < pageSize ? count : pageSize;
  return { offset: count - size, limit: size };
}
