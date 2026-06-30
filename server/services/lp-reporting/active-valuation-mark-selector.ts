import type { MarkStatus, ParsedValuationMark } from './metrics-engine';

const EXCLUDED_MARK_STATUS = new Set<MarkStatus>(['superseded', 'reversed']);

export interface ActiveValuationMarkSelection<T extends ParsedValuationMark> {
  active: T[];
  excludedFutureMarkIds: number[];
}

export function isoDay(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function isPreferredMark<T extends ParsedValuationMark>(candidate: T, existing: T): boolean {
  const candidateDay = isoDay(candidate.markDate);
  const existingDay = isoDay(existing.markDate);
  if (candidateDay > existingDay) {
    return true;
  }
  if (candidateDay < existingDay) {
    return false;
  }
  return candidate.id > existing.id;
}

/**
 * Select the valuation marks that contribute to NAV at an as-of date.
 *
 * Rules:
 * - markDate must be on or before the asOfDate.
 * - superseded/reversed marks do not contribute.
 * - one mark is selected per companyId; missing companyId falls back to mark id.
 * - the selected mark is the latest markDate, tie-broken by higher id.
 */
export function selectActiveValuationMarks<T extends ParsedValuationMark>(
  marks: readonly T[],
  asOfDate: string
): ActiveValuationMarkSelection<T> {
  const asOfDay = isoDay(asOfDate);
  const excludedFutureMarkIds: number[] = [];
  const byKey = new Map<string, T>();

  for (const mark of marks) {
    if (isoDay(mark.markDate) > asOfDay) {
      excludedFutureMarkIds.push(mark.id);
      continue;
    }
    if (mark.status && EXCLUDED_MARK_STATUS.has(mark.status)) {
      continue;
    }

    const key = mark.companyId !== undefined ? `c:${mark.companyId}` : `m:${mark.id}`;
    const existing = byKey.get(key);
    if (!existing || isPreferredMark(mark, existing)) {
      byKey.set(key, mark);
    }
  }

  return {
    active: Array.from(byKey.values()),
    excludedFutureMarkIds,
  };
}
