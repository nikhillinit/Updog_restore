import { describe, it, expect } from 'vitest';
import {
  loadGoldenDataset,
  compareToExpected,
  exportToGoldenFormat,
  compareCSVBytes,
  canonicalizeTimeSeries,
  type TimeSeriesRow,
} from '../utils/golden-dataset';

describe('Golden Dataset Infrastructure', () => {
  describe('loadGoldenDataset', () => {
    // TODO: Fix fixture data structure to match expected format
    it.skip('should load simple dataset with all components', async () => {
      const dataset = await loadGoldenDataset('simple');

      expect(dataset.name).toBe('simple');
      expect(dataset.inputs).toBeDefined();
      expect(dataset.expected).toBeDefined();
      expect(dataset.metadata).toBeDefined();

      // Verify inputs structure
      expect(dataset.inputs.fundSize).toBe(100000000);
      expect(dataset.inputs.carryPct).toBe(0.2);
      expect(dataset.inputs.managementFeePct).toBe(0.02);

      // Verify expected outputs structure
      expect(dataset.expected.timeSeries).toHaveLength(10);
      expect(dataset.expected.timeSeries[0].month).toBe(0);

      // Verify metadata
      expect(dataset.metadata.tolerances.absolute).toBe(0.000001);
      expect(dataset.metadata.expectedOutcomes.finalDPI).toBe(2.5);
    });

    it('should throw error for non-existent dataset', async () => {
      await expect(loadGoldenDataset('non-existent')).rejects.toThrow();
    });
  });

  describe('compareToExpected', () => {
    // TODO: Fix comparison logic alignment with fixture structure
    it.skip('should match simple golden dataset with numeric tolerance', async () => {
      const dataset = await loadGoldenDataset('simple');

      // Use the expected data as actual (perfect match)
      const actual = dataset.expected.timeSeries;

      const comparison = compareToExpected(actual, dataset.expected, dataset.metadata.tolerances);

      expect(comparison.matches).toBe(true);
      expect(comparison.differences).toHaveLength(0);
      expect(comparison.summary.totalRows).toBe(10);
      expect(comparison.summary.failedComparisons).toBe(0);
    });

    // TODO: Fix fixture field ordering expectations
    it.skip('should detect differences outside tolerance', async () => {
      const dataset = await loadGoldenDataset('simple');

      // Create actual data with one value outside tolerance
      const actual = dataset.expected.timeSeries.map((row, idx) => {
        if (idx === 5) {
          // Introduce significant error in row 5
          return { ...row, dpi: row.dpi + 0.01 }; // 1% error
        }
        return { ...row };
      });

      const comparison = compareToExpected(actual, dataset.expected, dataset.metadata.tolerances);

      expect(comparison.matches).toBe(false);
      expect(comparison.differences.length).toBeGreaterThan(0);

      const diff = comparison.differences[0];
      expect(diff.field).toBe('dpi');
      expect(diff.month).toBe(24); // Row 5 is month 24
    });

    // TODO: Fix fixture data alignment with expected tolerances
    it.skip('should accept differences within tolerance', async () => {
      const dataset = await loadGoldenDataset('simple');

      // Create actual data with tiny differences within tolerance
      const actual = dataset.expected.timeSeries.map((row) => ({
        ...row,
        dpi: row.dpi + 0.0000001, // Within 1e-6 absolute tolerance
      }));

      const comparison = compareToExpected(actual, dataset.expected, dataset.metadata.tolerances);

      expect(comparison.matches).toBe(true);
      expect(comparison.differences).toHaveLength(0);
    });

    it('should throw error on row count mismatch', async () => {
      const dataset = await loadGoldenDataset('simple');

      // Remove one row from actual
      const actual = dataset.expected.timeSeries.slice(0, -1);

      expect(() => {
        compareToExpected(actual, dataset.expected, dataset.metadata.tolerances);
      }).toThrow(/Row count mismatch/);
    });

    it('should throw error on month alignment mismatch', async () => {
      const dataset = await loadGoldenDataset('simple');

      // Change month in one row
      const actual = dataset.expected.timeSeries.map((row, idx) => {
        if (idx === 3) {
          return { ...row, month: 999 };
        }
        return { ...row };
      });

      expect(() => {
        compareToExpected(actual, dataset.expected, dataset.metadata.tolerances);
      }).toThrow(/Month mismatch/);
    });
  });

  describe('exportToGoldenFormat', () => {
    // TODO: Fix CSV serialization format alignment
    it.skip('should produce byte-level identical CSV for expected data', async () => {
      const dataset = await loadGoldenDataset('simple');

      // Export expected data to CSV
      const actualCSV = exportToGoldenFormat(dataset.expected.timeSeries);

      // Load original expected.csv
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      const expectedCSV = await readFile(
        join(process.cwd(), 'tests', 'fixtures', 'golden-datasets', 'simple', 'expected.csv'),
        'utf-8'
      );

      // Compare byte-for-byte
      const result = compareCSVBytes(expectedCSV, actualCSV);

      if (!result.identical) {
        console.log('CSV Differences:', result.differences);
      }

      expect(result.identical).toBe(true);
    });

    it('should handle unsorted time series by canonicalizing', () => {
      const unsorted: TimeSeriesRow[] = [
        {
          month: 12,
          quarter: 4,
          contributions: 1000,
          fees: 10,
          distributions: 0,
          nav: 990,
          dpi: 0,
          tvpi: 0.99,
          gpCarry: 0,
          lpProceeds: 0,
        },
        {
          month: 0,
          quarter: 0,
          contributions: 0,
          fees: 0,
          distributions: 0,
          nav: 0,
          dpi: 0,
          tvpi: 0,
          gpCarry: 0,
          lpProceeds: 0,
        },
        {
          month: 6,
          quarter: 2,
          contributions: 500,
          fees: 5,
          distributions: 0,
          nav: 495,
          dpi: 0,
          tvpi: 0.495,
          gpCarry: 0,
          lpProceeds: 0,
        },
      ];

      const csv = exportToGoldenFormat(unsorted);
      const lines = csv.split('\n');

      // Should be sorted by month: 0, 6, 12
      expect(lines[1]).toMatch(/^0,0,/);
      expect(lines[2]).toMatch(/^6,2,/);
      expect(lines[3]).toMatch(/^12,4,/);
    });

    it('should format all numbers with 6-decimal precision', () => {
      const data: TimeSeriesRow[] = [
        {
          month: 0,
          quarter: 0,
          contributions: 100.123456789, // Should round to 6 decimals
          fees: 1.1,
          distributions: 0,
          nav: 99.023456789,
          dpi: 0.333333333,
          tvpi: 1.111111111,
          gpCarry: 5.555555555,
          lpProceeds: 94.444444444,
        },
      ];

      const csv = exportToGoldenFormat(data);
      const lines = csv.split('\n');

      // Check data row (line 1)
      const values = lines[1].split(',');

      expect(values[2]).toBe('100.123457'); // contributions
      expect(values[3]).toBe('1.100000'); // fees
      expect(values[6]).toBe('0.333333'); // dpi
      expect(values[7]).toBe('1.111111'); // tvpi
    });
  });

  describe('compareCSVBytes', () => {
    it('should detect identical CSV content', () => {
      const csv1 = 'month,value\n0,1.000000\n1,2.000000\n';
      const csv2 = 'month,value\n0,1.000000\n1,2.000000\n';

      const result = compareCSVBytes(csv1, csv2);

      expect(result.identical).toBe(true);
      expect(result.message).toContain('identical');
    });

    it('should detect CSV differences and report line numbers', () => {
      const csv1 = 'month,value\n0,1.000000\n1,2.000000\n';
      const csv2 = 'month,value\n0,1.000000\n1,2.999999\n'; // Different value

      const result = compareCSVBytes(csv1, csv2);

      expect(result.identical).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences![0].line).toBe(3); // Third line differs
      expect(result.differences![0].expected).toBe('1,2.000000');
      expect(result.differences![0].actual).toBe('1,2.999999');
    });

    it('should normalize line endings before comparison', () => {
      const csv1 = 'month,value\n0,1.000000\n'; // LF
      const csv2 = 'month,value\r\n0,1.000000\r\n'; // CRLF

      const result = compareCSVBytes(csv1, csv2);

      expect(result.identical).toBe(true);
    });

    it('should detect missing trailing newline', () => {
      const csv1 = 'month,value\n0,1.000000\n';
      const csv2 = 'month,value\n0,1.000000'; // No trailing newline

      const result = compareCSVBytes(csv1, csv2);

      expect(result.identical).toBe(false);
    });
  });

  describe('canonicalizeTimeSeries', () => {
    it('should sort by month ascending', () => {
      const unsorted: TimeSeriesRow[] = [
        {
          month: 12,
          quarter: 4,
          contributions: 0,
          fees: 0,
          distributions: 0,
          nav: 0,
          dpi: 0,
          tvpi: 0,
          gpCarry: 0,
          lpProceeds: 0,
        },
        {
          month: 0,
          quarter: 0,
          contributions: 0,
          fees: 0,
          distributions: 0,
          nav: 0,
          dpi: 0,
          tvpi: 0,
          gpCarry: 0,
          lpProceeds: 0,
        },
        {
          month: 6,
          quarter: 2,
          contributions: 0,
          fees: 0,
          distributions: 0,
          nav: 0,
          dpi: 0,
          tvpi: 0,
          gpCarry: 0,
          lpProceeds: 0,
        },
      ];

      const sorted = canonicalizeTimeSeries(unsorted);

      expect(sorted.map((r) => r.month)).toEqual([0, 6, 12]);
    });

    it('should round all values to 6 decimals', () => {
      const data: TimeSeriesRow[] = [
        {
          month: 0,
          quarter: 0,
          contributions: 100.123456789,
          fees: 1.111111111,
          distributions: 0.999999999,
          nav: 99.0234567,
          dpi: 0.3333333333,
          tvpi: 1.1111111111,
          gpCarry: 5.5555555555,
          lpProceeds: 94.4444444444,
        },
      ];

      const canonical = canonicalizeTimeSeries(data);

      expect(canonical[0].contributions).toBe(100.123457);
      expect(canonical[0].fees).toBe(1.111111);
      expect(canonical[0].distributions).toBe(1.0);
      expect(canonical[0].dpi).toBe(0.333333);
      expect(canonical[0].tvpi).toBe(1.111111);
    });

    it('should not modify original array', () => {
      const original: TimeSeriesRow[] = [
        {
          month: 12,
          quarter: 4,
          contributions: 100.123456789,
          fees: 0,
          distributions: 0,
          nav: 0,
          dpi: 0,
          tvpi: 0,
          gpCarry: 0,
          lpProceeds: 0,
        },
        {
          month: 0,
          quarter: 0,
          contributions: 0,
          fees: 0,
          distributions: 0,
          nav: 0,
          dpi: 0,
          tvpi: 0,
          gpCarry: 0,
          lpProceeds: 0,
        },
      ];

      const originalCopy = JSON.parse(JSON.stringify(original));

      canonicalizeTimeSeries(original);

      // Original should be unchanged
      expect(original).toEqual(originalCopy);
    });
  });

  describe('Export Format Stability', () => {
    it('should produce consistent output across multiple exports', async () => {
      const dataset = await loadGoldenDataset('simple');

      // Export multiple times
      const export1 = exportToGoldenFormat(dataset.expected.timeSeries);
      const export2 = exportToGoldenFormat(dataset.expected.timeSeries);
      const export3 = exportToGoldenFormat(dataset.expected.timeSeries);

      // All exports should be identical
      expect(export1).toBe(export2);
      expect(export2).toBe(export3);
    });

    it('should produce consistent output regardless of input order', () => {
      const data: TimeSeriesRow[] = [
        {
          month: 0,
          quarter: 0,
          contributions: 100,
          fees: 1,
          distributions: 0,
          nav: 99,
          dpi: 0,
          tvpi: 0.99,
          gpCarry: 0,
          lpProceeds: 0,
        },
        {
          month: 6,
          quarter: 2,
          contributions: 200,
          fees: 2,
          distributions: 50,
          nav: 148,
          dpi: 0.25,
          tvpi: 0.99,
          gpCarry: 10,
          lpProceeds: 40,
        },
      ];

      const reversed = [...data].reverse();

      const csv1 = exportToGoldenFormat(data);
      const csv2 = exportToGoldenFormat(reversed);

      // Should produce identical output due to canonicalization
      expect(csv1).toBe(csv2);
    });
  });
});
