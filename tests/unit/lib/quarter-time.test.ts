import { describe, expect, it } from 'vitest';
import {
  addQuarters,
  excelSerialToQuarter,
  formatQuarter,
  getQuartersInRange,
  isValidQuarter,
  migrateToQuarterIndex,
  parseQuarter,
  quarterToExcelSerial,
  toQuarterIndex,
} from '@/lib/quarter-time';

describe('Wave 3 quarter-time helpers', () => {
  it('round trips quarter indexes and Excel serial conversions', () => {
    const quarter = { year: 2026, quarter: 2 as const };

    expect(toQuarterIndex(addQuarters(quarter, 3))).toBe(toQuarterIndex({ year: 2027, quarter: 1 }));
    expect(excelSerialToQuarter(quarterToExcelSerial(quarter))).toEqual(quarter);
  });

  it('parses, formats, and validates quarter values defensively', () => {
    expect(parseQuarter('Q3 2027')).toEqual({ year: 2027, quarter: 3 });
    expect(formatQuarter({ year: 2027, quarter: 3 })).toBe('Q3 2027');
    expect(isValidQuarter({ year: 2027, quarter: 3 })).toBe(true);
    expect(isValidQuarter({ year: '2027', quarter: 3 })).toBe(false);
    expect(isValidQuarter({ year: 2027, quarter: 5 })).toBe(false);
  });

  it('builds ranges and rejects invalid migration inputs', () => {
    expect(
      getQuartersInRange({
        start: { year: 2026, quarter: 4 },
        end: { year: 2027, quarter: 2 },
      })
    ).toEqual([
      { year: 2026, quarter: 4 },
      { year: 2027, quarter: 1 },
      { year: 2027, quarter: 2 },
    ]);
    expect(() => migrateToQuarterIndex('not-a-date')).toThrow('Invalid date string: not-a-date');
  });
});
