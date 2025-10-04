import { readFile } from 'fs/promises';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

/**
 * Golden Dataset Testing Utilities
 *
 * Provides machine-checkable comparison infrastructure for deterministic
 * engine validation using CSV fixtures.
 */

export interface GoldenDatasetInputs {
  [key: string]: string | number;
}

export interface TimeSeriesRow {
  month: number;
  quarter: number;
  contributions: number;
  fees: number;
  distributions: number;
  nav: number;
  dpi: number;
  tvpi: number;
  gpCarry: number;
  lpProceeds: number;
}

export interface GoldenDatasetExpected {
  timeSeries: TimeSeriesRow[];
}

export interface GoldenDatasetMetadata {
  name: string;
  description: string;
  assumptions: string[];
  expectedOutcomes: {
    finalDPI: number;
    finalTVPI: number;
    finalIRR: number;
    [key: string]: number;
  };
  tolerances: {
    absolute: number;
    relative: number;
    description: string;
  };
  validation?: {
    checkpoints: number[];
    criticalMetrics: string[];
    monotonicIncreasing?: string[];
    bounds?: Record<string, { min: number; max: number }>;
  };
  version: string;
  author: string;
  createdDate: string;
  lastModified?: string;
}

export interface GoldenDataset {
  name: string;
  inputs: GoldenDatasetInputs;
  expected: GoldenDatasetExpected;
  metadata: GoldenDatasetMetadata;
}

export interface ComparisonResult {
  matches: boolean;
  differences: Array<{
    month: number;
    field: string;
    expected: number;
    actual: number;
    absoluteDiff: number;
    relativeDiff: number;
  }>;
  summary: {
    totalRows: number;
    totalComparisons: number;
    failedComparisons: number;
  };
}

export interface CSVComparisonResult {
  identical: boolean;
  differences?: Array<{
    line: number;
    expected: string;
    actual: string;
  }>;
  message: string;
}

const FIXTURES_BASE_PATH = join(process.cwd(), 'tests', 'fixtures', 'golden-datasets');

/**
 * Load a golden dataset by name
 */
export async function loadGoldenDataset(name: string): Promise<GoldenDataset> {
  const datasetPath = join(FIXTURES_BASE_PATH, name);

  try {
    // Load inputs
    const inputsCSV = await readFile(join(datasetPath, 'inputs.csv'), 'utf-8');
    const inputsData = parse(inputsCSV, { columns: true, skip_empty_lines: true });

    const inputs: GoldenDatasetInputs = {};
    for (const row of inputsData) {
      const value = row.value;
      // Parse as number if possible, otherwise keep as string
      inputs[row.field] = isNaN(Number(value)) ? value : Number(value);
    }

    // Load expected outputs
    const expectedCSV = await readFile(join(datasetPath, 'expected.csv'), 'utf-8');
    const expectedData = parse(expectedCSV, { columns: true, skip_empty_lines: true });

    const timeSeries: TimeSeriesRow[] = expectedData.map((row: any) => ({
      month: Number(row.month),
      quarter: Number(row.quarter),
      contributions: Number(row.contributions),
      fees: Number(row.fees),
      distributions: Number(row.distributions),
      nav: Number(row.nav),
      dpi: Number(row.dpi),
      tvpi: Number(row.tvpi),
      gpCarry: Number(row.gpCarry),
      lpProceeds: Number(row.lpProceeds),
    }));

    // Load metadata
    const metadataJSON = await readFile(join(datasetPath, 'metadata.json'), 'utf-8');
    const metadata: GoldenDatasetMetadata = JSON.parse(metadataJSON);

    return {
      name,
      inputs,
      expected: { timeSeries },
      metadata,
    };
  } catch (error) {
    throw new Error(`Failed to load golden dataset '${name}': ${error}`);
  }
}

/**
 * Compare actual results to expected with tolerance
 */
export function compareToExpected(
  actual: TimeSeriesRow[],
  expected: GoldenDatasetExpected,
  tolerances: { absolute: number; relative: number }
): ComparisonResult {
  const differences: ComparisonResult['differences'] = [];
  let totalComparisons = 0;

  const expectedRows = expected.timeSeries;

  if (actual.length !== expectedRows.length) {
    throw new Error(
      `Row count mismatch: expected ${expectedRows.length}, got ${actual.length}`
    );
  }

  const numericFields: (keyof TimeSeriesRow)[] = [
    'contributions',
    'fees',
    'distributions',
    'nav',
    'dpi',
    'tvpi',
    'gpCarry',
    'lpProceeds',
  ];

  for (let i = 0; i < expectedRows.length; i++) {
    const expectedRow = expectedRows[i];
    const actualRow = actual[i];

    // Verify month alignment
    if (actualRow.month !== expectedRow.month) {
      throw new Error(
        `Month mismatch at row ${i}: expected ${expectedRow.month}, got ${actualRow.month}`
      );
    }

    // Compare numeric fields
    for (const field of numericFields) {
      totalComparisons++;

      const expectedVal = expectedRow[field];
      const actualVal = actualRow[field];

      const absoluteDiff = Math.abs(actualVal - expectedVal);
      const relativeDiff =
        expectedVal !== 0 ? absoluteDiff / Math.abs(expectedVal) : absoluteDiff;

      const withinTolerance =
        absoluteDiff <= tolerances.absolute || relativeDiff <= tolerances.relative;

      if (!withinTolerance) {
        differences.push({
          month: actualRow.month,
          field,
          expected: expectedVal,
          actual: actualVal,
          absoluteDiff,
          relativeDiff,
        });
      }
    }
  }

  return {
    matches: differences.length === 0,
    differences,
    summary: {
      totalRows: actual.length,
      totalComparisons,
      failedComparisons: differences.length,
    },
  };
}

/**
 * Export time series to canonical golden format (CSV)
 */
export function exportToGoldenFormat(timeSeries: TimeSeriesRow[]): string {
  // Canonical CSV header
  const header =
    'month,quarter,contributions,fees,distributions,nav,dpi,tvpi,gpCarry,lpProceeds';

  // Canonicalize time series (sort by month, format to 6 decimals)
  const canonicalRows = canonicalizeTimeSeries(timeSeries);

  const rows = canonicalRows.map((row) => {
    return [
      row.month.toString(),
      row.quarter.toString(),
      row.contributions.toFixed(6),
      row.fees.toFixed(6),
      row.distributions.toFixed(6),
      row.nav.toFixed(6),
      row.dpi.toFixed(6),
      row.tvpi.toFixed(6),
      row.gpCarry.toFixed(6),
      row.lpProceeds.toFixed(6),
    ].join(',');
  });

  return header + '\n' + rows.join('\n') + '\n';
}

/**
 * Canonicalize time series for comparison
 * - Sort by month (ascending)
 * - Round to 6 decimal places
 */
export function canonicalizeTimeSeries(timeSeries: TimeSeriesRow[]): TimeSeriesRow[] {
  const sorted = [...timeSeries].sort((a, b) => a.month - b.month);

  return sorted.map((row) => ({
    month: row.month,
    quarter: row.quarter,
    contributions: roundTo6Decimals(row.contributions),
    fees: roundTo6Decimals(row.fees),
    distributions: roundTo6Decimals(row.distributions),
    nav: roundTo6Decimals(row.nav),
    dpi: roundTo6Decimals(row.dpi),
    tvpi: roundTo6Decimals(row.tvpi),
    gpCarry: roundTo6Decimals(row.gpCarry),
    lpProceeds: roundTo6Decimals(row.lpProceeds),
  }));
}

/**
 * Compare two CSV strings byte-for-byte
 */
export function compareCSVBytes(expected: string, actual: string): CSVComparisonResult {
  // Normalize line endings to LF
  const normalizedExpected = expected.replace(/\r\n/g, '\n');
  const normalizedActual = actual.replace(/\r\n/g, '\n');

  if (normalizedExpected === normalizedActual) {
    return {
      identical: true,
      message: 'CSV files are byte-for-byte identical',
    };
  }

  // Find line differences
  const expectedLines = normalizedExpected.split('\n');
  const actualLines = normalizedActual.split('\n');

  const differences: CSVComparisonResult['differences'] = [];
  const maxLines = Math.max(expectedLines.length, actualLines.length);

  for (let i = 0; i < maxLines; i++) {
    const expLine = expectedLines[i] || '';
    const actLine = actualLines[i] || '';

    if (expLine !== actLine) {
      differences.push({
        line: i + 1,
        expected: expLine,
        actual: actLine,
      });
    }
  }

  return {
    identical: false,
    differences,
    message: `CSV files differ at ${differences.length} line(s)`,
  };
}

/**
 * Round a number to 6 decimal places
 */
function roundTo6Decimals(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
