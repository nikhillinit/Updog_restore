/**
 * Server-safe hashing helpers for LP economics V1 schemas.
 *
 * This module deliberately owns the runtime `canonicalSha256` dependency.
 * Browser schema consumers must import the V1.0/V1.1 contract modules instead.
 */
import { canonicalSha256 } from '../../lib/canonical-hash';

export interface LpEconomicsReasonTupleV1 {
  readonly code: string;
  readonly detail?: string | undefined;
  readonly context?: Readonly<Record<string, string>> | undefined;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Sorts by `code` (ties broken by `detail`, then by the dedupe hash as a
 * final deterministic tiebreak) and dedupes on the `canonicalSha256` of the
 * full `{ code, detail, context }` tuple.
 */
export function sortAndDedupeLpEconomicsReasonsV1<T extends LpEconomicsReasonTupleV1>(
  reasons: readonly T[]
): readonly T[] {
  const seen = new Set<string>();
  const entries: Array<{ reason: T; dedupeKey: string }> = [];
  for (const reason of reasons) {
    const dedupeKey = canonicalSha256({
      code: reason.code,
      detail: reason.detail,
      context: reason.context,
    });
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    entries.push({ reason, dedupeKey });
  }

  return entries
    .sort(
      (left, right) =>
        compareStrings(left.reason.code, right.reason.code) ||
        compareStrings(left.reason.detail ?? '', right.reason.detail ?? '') ||
        compareStrings(left.dedupeKey, right.dedupeKey)
    )
    .map((entry) => entry.reason);
}

/**
 * Deterministic, basis-only event identity (section 6 R3(a)): a hash of
 * stable `sourceId`, `periodEnd`, and array position.
 */
export function buildLpEconomicsEventIdV1(input: {
  readonly sourceId: string;
  readonly periodEnd: string;
  readonly eventSequence: number;
}): string {
  return canonicalSha256({
    sourceId: input.sourceId,
    periodEnd: input.periodEnd,
    eventSequence: input.eventSequence,
  });
}
