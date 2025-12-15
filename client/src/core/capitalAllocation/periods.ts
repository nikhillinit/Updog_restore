/**
 * Period Generation for Capital Allocation
 *
 * Generates periods based on timeline and rebalance frequency.
 * Periods are the fundamental unit for period-loop processing.
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 4
 */

/**
 * A discrete period for allocation processing.
 */
export interface Period {
  /** Period identifier (e.g., "2024-Q4", "2024-11") */
  id: string;
  /** Period start date (inclusive) */
  startDate: string;
  /** Period end date (inclusive) */
  endDate: string;
  /** Human-readable label */
  label: string;
}

/**
 * Rebalance frequency types.
 */
export type RebalanceFrequency = 'monthly' | 'quarterly' | 'annual';

/**
 * Parse a YYYY-MM-DD date string to year, month, day.
 */
function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  return {
    year: parseInt(yearStr, 10),
    month: parseInt(monthStr, 10),
    day: parseInt(dayStr, 10),
  };
}

/**
 * Format year, month, day to YYYY-MM-DD.
 */
function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Get the last day of a month.
 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Get the quarter (1-4) for a month (1-12).
 */
function getQuarter(month: number): number {
  return Math.ceil(month / 3);
}

/**
 * Get the first month of a quarter (1-indexed).
 */
function quarterStartMonth(quarter: number): number {
  return (quarter - 1) * 3 + 1;
}

/**
 * Get the last month of a quarter (1-indexed).
 */
function quarterEndMonth(quarter: number): number {
  return quarter * 3;
}

/**
 * Generate periods for a timeline based on rebalance frequency.
 */
export function generatePeriods(
  startDate: string,
  endDate: string,
  frequency: RebalanceFrequency
): Period[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  switch (frequency) {
    case 'monthly':
      return generateMonthlyPeriods(start, end, startDate, endDate);
    case 'quarterly':
      return generateQuarterlyPeriods(start, end, startDate, endDate);
    case 'annual':
      return generateAnnualPeriods(start, end, startDate, endDate);
    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }
}

function generateMonthlyPeriods(
  start: { year: number; month: number; day: number },
  end: { year: number; month: number; day: number },
  originalStart: string,
  originalEnd: string
): Period[] {
  const periods: Period[] = [];
  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    const periodStart =
      year === start.year && month === start.month
        ? originalStart
        : formatDate(year, month, 1);

    const periodEndDay = lastDayOfMonth(year, month);
    let periodEnd =
      year === end.year && month === end.month
        ? originalEnd
        : formatDate(year, month, periodEndDay);

    if (periodEnd > originalEnd) {
      periodEnd = originalEnd;
    }

    periods.push({
      id: `${year}-${String(month).padStart(2, '0')}`,
      startDate: periodStart,
      endDate: periodEnd,
      label: `${year}-${String(month).padStart(2, '0')}`,
    });

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return periods;
}

function generateQuarterlyPeriods(
  start: { year: number; month: number; day: number },
  end: { year: number; month: number; day: number },
  originalStart: string,
  originalEnd: string
): Period[] {
  const periods: Period[] = [];
  let year = start.year;
  let quarter = getQuarter(start.month);
  const endQuarter = getQuarter(end.month);

  while (year < end.year || (year === end.year && quarter <= endQuarter)) {
    const qStartMonth = quarterStartMonth(quarter);
    const qEndMonth = quarterEndMonth(quarter);
    const qEndDay = lastDayOfMonth(year, qEndMonth);

    const isFirstPeriod = year === start.year && quarter === getQuarter(start.month);
    const periodStart = isFirstPeriod
      ? originalStart
      : formatDate(year, qStartMonth, 1);

    const isLastPeriod = year === end.year && quarter >= endQuarter;
    let periodEnd = isLastPeriod
      ? originalEnd
      : formatDate(year, qEndMonth, qEndDay);

    if (periodEnd > originalEnd) {
      periodEnd = originalEnd;
    }

    periods.push({
      id: `${year}-Q${quarter}`,
      startDate: periodStart,
      endDate: periodEnd,
      label: `${year}-Q${quarter}`,
    });

    quarter++;
    if (quarter > 4) {
      quarter = 1;
      year++;
    }
  }

  return periods;
}

function generateAnnualPeriods(
  start: { year: number; month: number; day: number },
  end: { year: number; month: number; day: number },
  originalStart: string,
  originalEnd: string
): Period[] {
  const periods: Period[] = [];

  for (let year = start.year; year <= end.year; year++) {
    const periodStart = year === start.year ? originalStart : `${year}-01-01`;
    let periodEnd = year === end.year ? originalEnd : `${year}-12-31`;

    if (periodEnd > originalEnd) {
      periodEnd = originalEnd;
    }

    periods.push({
      id: String(year),
      startDate: periodStart,
      endDate: periodEnd,
      label: String(year),
    });
  }

  return periods;
}

export function isDateInPeriod(date: string, period: Period): boolean {
  return date >= period.startDate && date <= period.endDate;
}

export function findPeriodForDate(date: string, periods: Period[]): Period | undefined {
  return periods.find((p) => isDateInPeriod(date, p));
}
