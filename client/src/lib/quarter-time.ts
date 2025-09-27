/**
 * Quarter-based time utilities
 * Using integer quarterIndex for deterministic time calculations
 * quarterIndex = year * 4 + (quarter - 1)
 */

export interface QuarterTime {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

export interface QuarterRange {
  start: QuarterTime;
  end: QuarterTime;
}

// Core conversion functions
export function toQuarterIndex(qt: QuarterTime): number {
  return qt.year * 4 + (qt.quarter - 1);
}

export function fromQuarterIndex(index: number): QuarterTime {
  const year = Math.floor(index / 4);
  const quarter = ((index % 4) + 1) as 1 | 2 | 3 | 4;
  return { year, quarter };
}

// Date conversions
export function dateToQuarter(date: Date): QuarterTime {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based
  const quarter = (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4;
  return { year, quarter };
}

export function quarterToDate(qt: QuarterTime, endOfQuarter: boolean = false): Date {
  const month = (qt.quarter - 1) * 3;
  if (endOfQuarter) {
    // Last day of the quarter
    const lastMonth = month + 2;
    const lastDay = [31, 30, 30, 31][qt.quarter - 1]; // Mar, Jun, Sep, Dec
    return new Date(qt.year, lastMonth, lastDay, 23, 59, 59, 999);
  } else {
    // First day of the quarter
    return new Date(qt.year, month, 1, 0, 0, 0, 0);
  }
}

// Quarter arithmetic
export function addQuarters(qt: QuarterTime, quarters: number): QuarterTime {
  const index = toQuarterIndex(qt);
  return fromQuarterIndex(index + quarters);
}

export function quarterDiff(a: QuarterTime, b: QuarterTime): number {
  return toQuarterIndex(a) - toQuarterIndex(b);
}

// Formatting
export function formatQuarter(qt: QuarterTime): string {
  return `Q${qt.quarter} ${qt.year}`;
}

export function parseQuarter(str: string): QuarterTime | null {
  const match = str.match(/Q([1-4])\s+(\d{4})/);
  if (!match) return null;
  
  return {
    quarter: parseInt(match[1]!) as 1 | 2 | 3 | 4,
    year: parseInt(match[2]!)
  };
}

// Range operations
export function isInQuarterRange(qt: QuarterTime, range: QuarterRange): boolean {
  const index = toQuarterIndex(qt);
  const startIndex = toQuarterIndex(range.start);
  const endIndex = toQuarterIndex(range.end);
  return index >= startIndex && index <= endIndex;
}

export function getQuartersInRange(range: QuarterRange): QuarterTime[] {
  const startIndex = toQuarterIndex(range.start);
  const endIndex = toQuarterIndex(range.end);
  const quarters: QuarterTime[] = [];
  
  for (let i = startIndex; i <= endIndex; i++) {
    quarters.push(fromQuarterIndex(i));
  }
  
  return quarters;
}

// Validation
export function isValidQuarter(qt: any): qt is QuarterTime {
  return (
    typeof qt === 'object' &&
    qt !== null &&
    typeof qt.year === 'number' &&
    qt.year >= 1900 &&
    qt.year <= 2100 &&
    typeof qt.quarter === 'number' &&
    qt.quarter >= 1 &&
    qt.quarter <= 4
  );
}

// Current quarter helper
export function getCurrentQuarter(): QuarterTime {
  return dateToQuarter(new Date());
}

export function getCurrentQuarterIndex(): number {
  return toQuarterIndex(getCurrentQuarter());
}

// Excel serial date conversion (for compatibility)
export function quarterToExcelSerial(qt: QuarterTime): number {
  const date = quarterToDate(qt, true); // End of quarter
  const baseDate = new Date(1900, 0, 1);
  const diffTime = date.getTime() - baseDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 2; // Excel 1900 date system adjustment
}

export function excelSerialToQuarter(serial: number): QuarterTime {
  const baseDate = new Date(1900, 0, 1);
  const date = new Date(baseDate.getTime() + (serial - 2) * 24 * 60 * 60 * 1000);
  return dateToQuarter(date);
}

// Migration helper for existing date-based data
export function migrateToQuarterIndex(dateStr: string): number {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return toQuarterIndex(dateToQuarter(date));
}

// Export convenience constants
export const QUARTERS_PER_YEAR = 4;
export const MIN_QUARTER_INDEX = 1900 * 4; // Q1 1900
export const MAX_QUARTER_INDEX = 2100 * 4 + 3; // Q4 2100