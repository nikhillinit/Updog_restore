/** Engine month key: local year-month of plannedDate, zero-padded (2026-09). */
export function currentMonthKey(now: Date): string {
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

/**
 * Net flow of the current month's bucket, or null when the analysis has no
 * bucket for this month. summary.netCashFlow is the net of all executed
 * history, so it must never stand in for "this month".
 */
export function currentMonthNetFlow(
  byMonth: ReadonlyArray<{ month: string; netFlow: number }>,
  now: Date = new Date()
): number | null {
  const key = currentMonthKey(now);
  return byMonth.find((month) => month.month === key)?.netFlow ?? null;
}
