/**
 * Verifies golden-dataset AND-logic tolerance check fix
 */
import { describe, it, expect } from 'vitest';
import {
  compareToExpected,
  type TimeSeriesRow,
  type GoldenDatasetExpected,
} from '../../utils/golden-dataset';

describe('Golden Dataset Tolerance Regression - Fix #2', () => {
  describe('AND logic (not OR) for tolerance checks', () => {
    it('should enforce AND logic - fail when absolute exceeds even if relative passes', () => {
      // Original bug: Used OR logic (absoluteDiff <= tol.absolute || relativeDiff <= tol.relative)
      // Fix: Changed to AND logic (absoluteDiff <= tol.absolute && relativeDiff <= tol.relative)

      const expected: GoldenDatasetExpected = {
        timeSeries: [
          {
            month: 0,
            quarter: 0,
            contributions: 1000000.0,
            fees: 0,
            distributions: 0,
            nav: 1000000.0,
            dpi: 0,
            tvpi: 1.0,
            gpCarry: 0,
            lpProceeds: 0,
          },
        ],
      };

      // Scenario: Large absolute error but tiny relative error
      // With OR logic: would PASS (relative < 0.000001)
      // With AND logic: should FAIL (absolute > 0.000001)
      const actual: TimeSeriesRow[] = [
        {
          month: 0,
          quarter: 0,
          contributions: 1000001.0, // 1.0 absolute diff
          fees: 0,
          distributions: 0,
          nav: 1000001.0, // 1.0 absolute diff
          dpi: 0,
          tvpi: 1.000001, // 0.000001 absolute diff (passes)
          gpCarry: 0,
          lpProceeds: 0,
        },
      ];

      const result = compareToExpected(actual, expected, {
        absolute: 0.000001, // Very tight absolute tolerance
        relative: 0.01, // Loose relative tolerance (1%)
      });

      // Should FAIL with AND logic (absolute diff is 1.0, way over 0.000001)
      // With OR logic, this would incorrectly PASS because relative diff is tiny
      expect(result.matches).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);

      // Verify the specific failures
      const contributionDiff = result.differences.find((d) => d.field === 'contributions');
      expect(contributionDiff).toBeDefined();
      expect(contributionDiff?.absoluteDiff).toBe(1.0);
    });

    it('should enforce AND logic - fail when relative exceeds even if absolute passes', () => {
      // Inverse scenario: small absolute error but large relative error

      const expected: GoldenDatasetExpected = {
        timeSeries: [
          {
            month: 0,
            quarter: 0,
            contributions: 10.0, // Small base value
            fees: 0,
            distributions: 0,
            nav: 10.0,
            dpi: 0,
            tvpi: 1.0,
            gpCarry: 0,
            lpProceeds: 0,
          },
        ],
      };

      // Small absolute diff but large relative diff
      const actual: TimeSeriesRow[] = [
        {
          month: 0,
          quarter: 0,
          contributions: 11.0, // 1.0 absolute diff, 10% relative diff
          fees: 0,
          distributions: 0,
          nav: 11.0, // 1.0 absolute diff, 10% relative diff
          dpi: 0,
          tvpi: 1.0,
          gpCarry: 0,
          lpProceeds: 0,
        },
      ];

      const result = compareToExpected(actual, expected, {
        absolute: 2.0, // Loose absolute tolerance
        relative: 0.01, // Tight relative tolerance (1%)
      });

      // Should FAIL with AND logic (relative diff is 10%, over 1% tolerance)
      // With OR logic, this would incorrectly PASS because absolute diff is under 2.0
      expect(result.matches).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);

      const contributionDiff = result.differences.find((d) => d.field === 'contributions');
      expect(contributionDiff).toBeDefined();
      expect(contributionDiff?.relativeDiff).toBeCloseTo(0.1, 5); // 10%
    });

    it('should pass when both absolute AND relative are within tolerance', () => {
      // Golden path: both tolerances satisfied

      const expected: GoldenDatasetExpected = {
        timeSeries: [
          {
            month: 0,
            quarter: 0,
            contributions: 1000000.0,
            fees: 500.0,
            distributions: 0,
            nav: 999500.0,
            dpi: 0,
            tvpi: 1.0,
            gpCarry: 0,
            lpProceeds: 0,
          },
        ],
      };

      // Tiny error comfortably within both tolerances
      // NOTE: avoid boundary-exact values — IEEE 754 subtraction of near-equal
      // large numbers produces rounding artefacts that can exceed the tolerance
      const actual: TimeSeriesRow[] = [
        {
          month: 0,
          quarter: 0,
          contributions: 1000000.0000005, // ~0.0000005 absolute, well under tolerance
          fees: 500.0000003, // ~0.0000003 absolute
          distributions: 0,
          nav: 999499.9999997, // ~0.0000003 absolute
          dpi: 0,
          tvpi: 1.0,
          gpCarry: 0,
          lpProceeds: 0,
        },
      ];

      const result = compareToExpected(actual, expected, {
        absolute: 0.000001,
        relative: 0.000001,
      });

      expect(result.matches).toBe(true);
      expect(result.differences.length).toBe(0);
    });

    it('should fail when absolute tolerance exceeded (boundary test)', () => {
      const expected: GoldenDatasetExpected = {
        timeSeries: [
          {
            month: 0,
            quarter: 0,
            contributions: 100.0,
            fees: 0,
            distributions: 0,
            nav: 100.0,
            dpi: 0,
            tvpi: 1.0,
            gpCarry: 0,
            lpProceeds: 0,
          },
        ],
      };

      // Exact boundary: 0.0000011 absolute diff (just over 0.000001)
      const actual: TimeSeriesRow[] = [
        {
          month: 0,
          quarter: 0,
          contributions: 100.0000011, // Just over tolerance
          fees: 0,
          distributions: 0,
          nav: 100.0,
          dpi: 0,
          tvpi: 1.0,
          gpCarry: 0,
          lpProceeds: 0,
        },
      ];

      const result = compareToExpected(actual, expected, {
        absolute: 0.000001,
        relative: 0.1, // Very loose relative
      });

      // Should fail absolute check (even though relative is tiny)
      expect(result.matches).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);

      const contributionDiff = result.differences.find((d) => d.field === 'contributions');
      expect(contributionDiff?.absoluteDiff).toBeCloseTo(0.0000011, 7);
    });

    it('should fail when relative tolerance exceeded (boundary test)', () => {
      const expected: GoldenDatasetExpected = {
        timeSeries: [
          {
            month: 0,
            quarter: 0,
            contributions: 1.0,
            fees: 0,
            distributions: 0,
            nav: 1.0,
            dpi: 0,
            tvpi: 1.0,
            gpCarry: 0,
            lpProceeds: 0,
          },
        ],
      };

      // 1.01% relative diff (just over 1% tolerance)
      const actual: TimeSeriesRow[] = [
        {
          month: 0,
          quarter: 0,
          contributions: 1.0101, // 0.0101 absolute, 1.01% relative
          fees: 0,
          distributions: 0,
          nav: 1.0,
          dpi: 0,
          tvpi: 1.0,
          gpCarry: 0,
          lpProceeds: 0,
        },
      ];

      const result = compareToExpected(actual, expected, {
        absolute: 100.0, // Very loose absolute
        relative: 0.01, // 1% relative tolerance
      });

      // Should fail relative check (even though absolute is tiny)
      expect(result.matches).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);

      const contributionDiff = result.differences.find((d) => d.field === 'contributions');
      expect(contributionDiff?.relativeDiff).toBeCloseTo(0.0101, 4);
    });
  });

  describe('Edge cases and validation', () => {
    it('should handle zero expected values correctly', () => {
      const expected: GoldenDatasetExpected = {
        timeSeries: [
          {
            month: 0,
            quarter: 0,
            contributions: 1000000.0,
            fees: 0, // Zero value
            distributions: 0,
            nav: 1000000.0,
            dpi: 0, // Zero value
            tvpi: 1.0,
            gpCarry: 0,
            lpProceeds: 0,
          },
        ],
      };

      const actual: TimeSeriesRow[] = [
        {
          month: 0,
          quarter: 0,
          contributions: 1000000.0,
          fees: 0.0001, // Small non-zero actual
          distributions: 0,
          nav: 1000000.0,
          dpi: 0.0001, // Small non-zero actual
          tvpi: 1.0,
          gpCarry: 0,
          lpProceeds: 0,
        },
      ];

      const result = compareToExpected(actual, expected, {
        absolute: 0.001,
        relative: 0.01,
      });

      // When expected is 0, relative diff equals absolute diff
      // Should use absolute tolerance only
      expect(result.matches).toBe(true);
    });

    it('should throw error on row count mismatch', () => {
      const expected: GoldenDatasetExpected = {
        timeSeries: [
          {
            month: 0,
            quarter: 0,
            contributions: 1000000.0,
            fees: 0,
            distributions: 0,
            nav: 1000000.0,
            dpi: 0,
            tvpi: 1.0,
            gpCarry: 0,
            lpProceeds: 0,
          },
        ],
      };

      const actual: TimeSeriesRow[] = []; // Empty array

      expect(() => {
        compareToExpected(actual, expected, {
          absolute: 0.01,
          relative: 0.01,
        });
      }).toThrow('Row count mismatch');
    });

    it('should throw error on month misalignment', () => {
      const expected: GoldenDatasetExpected = {
        timeSeries: [
          {
            month: 0,
            quarter: 0,
            contributions: 1000000.0,
            fees: 0,
            distributions: 0,
            nav: 1000000.0,
            dpi: 0,
            tvpi: 1.0,
            gpCarry: 0,
            lpProceeds: 0,
          },
        ],
      };

      const actual: TimeSeriesRow[] = [
        {
          month: 1, // Wrong month!
          quarter: 0,
          contributions: 1000000.0,
          fees: 0,
          distributions: 0,
          nav: 1000000.0,
          dpi: 0,
          tvpi: 1.0,
          gpCarry: 0,
          lpProceeds: 0,
        },
      ];

      expect(() => {
        compareToExpected(actual, expected, {
          absolute: 0.01,
          relative: 0.01,
        });
      }).toThrow('Month mismatch');
    });
  });

  describe('Regression verification: OR vs AND logic', () => {
    it('should fail the exact scenario that was broken with OR logic', () => {
      // This is the EXACT scenario from the bug report:
      // Large absolute errors on large numbers (DPI/TVPI) that would pass
      // with OR logic because relative error is small

      const expected: GoldenDatasetExpected = {
        timeSeries: [
          {
            month: 120, // 10 years in
            quarter: 40,
            contributions: 100000000.0,
            fees: 2000000.0,
            distributions: 150000000.0,
            nav: 50000000.0,
            dpi: 1.5, // Expected DPI
            tvpi: 2.0, // Expected TVPI
            gpCarry: 5000000.0,
            lpProceeds: 142500000.0,
          },
        ],
      };

      const actual: TimeSeriesRow[] = [
        {
          month: 120,
          quarter: 40,
          contributions: 100000000.0,
          fees: 2000000.0,
          distributions: 150000005.0, // +5 (0.0000033% relative, but 5.0 absolute)
          nav: 50000010.0, // +10 (0.00002% relative, but 10.0 absolute)
          dpi: 1.500001, // +0.000001 (0.000067% relative, 0.000001 absolute)
          tvpi: 2.000002, // +0.000002 (0.0001% relative, 0.000002 absolute)
          gpCarry: 5000000.0,
          lpProceeds: 142500000.0,
        },
      ];

      const result = compareToExpected(actual, expected, {
        absolute: 0.000001, // Very tight - 1 millionth
        relative: 0.001, // 0.1% - Loose
      });

      // With OR logic: would PASS (all relative diffs < 0.001)
      // With AND logic: should FAIL (distributions and nav exceed absolute tolerance)
      expect(result.matches).toBe(false);

      // Verify specific failures
      const distributionsDiff = result.differences.find((d) => d.field === 'distributions');
      expect(distributionsDiff).toBeDefined();
      expect(distributionsDiff?.absoluteDiff).toBe(5.0); // Way over 0.000001

      const navDiff = result.differences.find((d) => d.field === 'nav');
      expect(navDiff).toBeDefined();
      expect(navDiff?.absoluteDiff).toBe(10.0); // Way over 0.000001
    });
  });
});
