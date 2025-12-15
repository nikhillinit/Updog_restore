/**
 * Cohort Sorting Tests
 *
 * Test vectors from CA-SEMANTIC-LOCK.md Section 4.3.
 * These are MANDATORY tests that must pass before implementation proceeds.
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 4.3
 */

import { describe, it, expect } from 'vitest';
import {
  cmp,
  cohortSortKey,
  compareCohorts,
  sortCohorts,
  isCanonicalDate,
  validateCohortDates,
  sortAndValidateCohorts,
  SortableCohort,
} from '../sorting';

describe('Cohort Sorting', () => {
  describe('cmp - Deterministic String Comparator', () => {
    it('returns -1 when a < b', () => {
      expect(cmp('a', 'b')).toBe(-1);
      expect(cmp('2024-01-01', '2024-06-01')).toBe(-1);
    });

    it('returns 1 when a > b', () => {
      expect(cmp('b', 'a')).toBe(1);
      expect(cmp('2024-06-01', '2024-01-01')).toBe(1);
    });

    it('returns 0 when a === b', () => {
      expect(cmp('a', 'a')).toBe(0);
      expect(cmp('2024-01-01', '2024-01-01')).toBe(0);
    });

    it('handles empty strings', () => {
      expect(cmp('', 'a')).toBe(-1);
      expect(cmp('a', '')).toBe(1);
      expect(cmp('', '')).toBe(0);
    });
  });

  describe('cohortSortKey', () => {
    it('generates key from start_date and id', () => {
      const cohort = { start_date: '2024-01-01', id: 'A' };
      const [date, id] = cohortSortKey(cohort);

      expect(date).toBe('2024-01-01');
      expect(id).toBe('a'); // lowercased
    });

    it('uses FAR_FUTURE for null start_date', () => {
      const cohort = { start_date: null, id: 'A' };
      const [date] = cohortSortKey(cohort);

      expect(date).toBe('9999-12-31');
    });

    it('uses FAR_FUTURE for empty start_date', () => {
      const cohort = { start_date: '', id: 'Z' };
      const [date] = cohortSortKey(cohort);

      expect(date).toBe('9999-12-31');
    });

    it('falls back to name when id is missing', () => {
      const cohort = { start_date: '2024-01-01', name: 'Cohort1' };
      const [, id] = cohortSortKey(cohort);

      expect(id).toBe('cohort1');
    });

    it('coerces numeric id to string', () => {
      const cohort = { start_date: '2024-01-01', id: 0 };
      const [, id] = cohortSortKey(cohort);

      expect(id).toBe('0');
    });

    it('handles completely empty cohort', () => {
      const cohort = {};
      const [date, id] = cohortSortKey(cohort);

      expect(date).toBe('9999-12-31');
      expect(id).toBe('');
    });
  });

  describe('Locked Test Vectors from Semantic Lock', () => {
    /**
     * These 6 test cases are LOCKED per CA-SEMANTIC-LOCK.md Section 4.3.
     * DO NOT MODIFY without updating the semantic lock.
     */

    it('2024-01-01 + A sorts first', () => {
      const cohorts: SortableCohort[] = [
        { start_date: '2024-06-01', id: 'A' },
        { start_date: '2024-01-01', id: 'B' },
        { start_date: '2024-01-01', id: 'A' },
      ];

      const sorted = sortCohorts(cohorts);

      expect(sorted[0]).toEqual({ start_date: '2024-01-01', id: 'A' });
    });

    it('2024-01-01 + B sorts second (same date, id tiebreak)', () => {
      const cohorts: SortableCohort[] = [
        { start_date: '2024-01-01', id: 'B' },
        { start_date: '2024-01-01', id: 'A' },
      ];

      const sorted = sortCohorts(cohorts);

      expect(sorted[0].id).toBe('A');
      expect(sorted[1].id).toBe('B');
    });

    it('2024-06-01 + A sorts third', () => {
      const cohorts: SortableCohort[] = [
        { start_date: '2024-06-01', id: 'A' },
        { start_date: '2024-01-01', id: 'A' },
        { start_date: '2024-01-01', id: 'B' },
      ];

      const sorted = sortCohorts(cohorts);

      expect(sorted[0].start_date).toBe('2024-01-01');
      expect(sorted[2].start_date).toBe('2024-06-01');
    });

    it('empty start_date + Z sorts last', () => {
      const cohorts: SortableCohort[] = [
        { start_date: '', id: 'Z' },
        { start_date: '2024-01-01', id: 'A' },
      ];

      const sorted = sortCohorts(cohorts);

      expect(sorted[0].id).toBe('A');
      expect(sorted[1].id).toBe('Z');
    });

    it('null start_date + Y sorts last', () => {
      const cohorts: SortableCohort[] = [
        { start_date: null, id: 'Y' },
        { start_date: '2024-01-01', id: 'A' },
      ];

      const sorted = sortCohorts(cohorts);

      expect(sorted[0].id).toBe('A');
      expect(sorted[1].id).toBe('Y');
    });

    it('numeric id 0 works (coerced to string)', () => {
      const cohorts: SortableCohort[] = [
        { start_date: '2024-01-01', id: 0 },
        { start_date: '2024-01-01', id: 'A' },
      ];

      const sorted = sortCohorts(cohorts);

      // '0' < 'a' in ASCII, so numeric 0 sorts before 'A'
      expect(sorted[0].id).toBe(0);
      expect(sorted[1].id).toBe('A');
    });
  });

  describe('isCanonicalDate', () => {
    it('accepts valid YYYY-MM-DD dates', () => {
      expect(isCanonicalDate('2024-01-01')).toBe(true);
      expect(isCanonicalDate('2024-12-31')).toBe(true);
      expect(isCanonicalDate('1999-06-15')).toBe(true);
    });

    it('accepts null/undefined (will use FAR_FUTURE)', () => {
      expect(isCanonicalDate(null)).toBe(true);
      expect(isCanonicalDate(undefined)).toBe(true);
      expect(isCanonicalDate('')).toBe(true);
    });

    it('rejects non-zero-padded dates', () => {
      expect(isCanonicalDate('2024-1-1')).toBe(false);
      expect(isCanonicalDate('2024-01-1')).toBe(false);
      expect(isCanonicalDate('2024-1-01')).toBe(false);
    });

    it('rejects invalid date formats', () => {
      expect(isCanonicalDate('2024/01/01')).toBe(false);
      expect(isCanonicalDate('01-01-2024')).toBe(false);
      expect(isCanonicalDate('Jan 1, 2024')).toBe(false);
    });

    it('rejects invalid months/days', () => {
      expect(isCanonicalDate('2024-13-01')).toBe(false);
      expect(isCanonicalDate('2024-00-01')).toBe(false);
      expect(isCanonicalDate('2024-01-32')).toBe(false);
      expect(isCanonicalDate('2024-01-00')).toBe(false);
    });
  });

  describe('validateCohortDates', () => {
    it('passes for valid dates', () => {
      const cohorts = [
        { start_date: '2024-01-01', id: 'A' },
        { start_date: '2024-06-01', id: 'B' },
      ];

      expect(() => validateCohortDates(cohorts)).not.toThrow();
    });

    it('passes for null/empty dates', () => {
      const cohorts = [
        { start_date: null, id: 'A' },
        { start_date: '', id: 'B' },
        { id: 'C' }, // no start_date
      ];

      expect(() => validateCohortDates(cohorts)).not.toThrow();
    });

    it('throws for non-canonical dates', () => {
      const cohorts = [{ start_date: '2024-1-1', id: 'A' }];

      expect(() => validateCohortDates(cohorts)).toThrow('Non-canonical date format');
    });
  });

  describe('sortAndValidateCohorts', () => {
    it('sorts and validates in one call', () => {
      const cohorts = [
        { start_date: '2024-06-01', id: 'B' },
        { start_date: '2024-01-01', id: 'A' },
      ];

      const sorted = sortAndValidateCohorts(cohorts);

      expect(sorted[0].id).toBe('A');
      expect(sorted[1].id).toBe('B');
    });

    it('throws if validation fails', () => {
      const cohorts = [{ start_date: '2024-1-1', id: 'A' }];

      expect(() => sortAndValidateCohorts(cohorts)).toThrow('Non-canonical');
    });
  });

  describe('Determinism', () => {
    it('produces identical order for same input (10 runs)', () => {
      const cohorts: SortableCohort[] = [
        { start_date: '2024-06-01', id: 'C' },
        { start_date: '2024-01-01', id: 'B' },
        { start_date: '2024-01-01', id: 'A' },
        { start_date: null, id: 'D' },
        { start_date: '2024-03-15', id: 'E' },
      ];

      const results: SortableCohort[][] = [];
      for (let i = 0; i < 10; i++) {
        results.push(sortCohorts(cohorts));
      }

      // All results should be identical
      const first = results[0];
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(first);
      }
    });

    it('does not use localeCompare (verified by implementation)', () => {
      // This test documents that we use simple < > comparison
      // The cmp function uses a < b ? -1 : a > b ? 1 : 0
      // NOT localeCompare which is locale-sensitive

      // Verify behavior with non-ASCII would be different with localeCompare
      // For this test, we just verify our cmp is consistent
      const a = 'alpha';
      const b = 'beta';

      const result1 = cmp(a, b);
      const result2 = cmp(a, b);
      const result3 = cmp(a, b);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe(-1); // 'alpha' < 'beta'
    });
  });
});
