/**
 * Comparison Utilities for Excel Parity Testing
 *
 * Provides tolerance-based comparison for financial metrics (TVPI, IRR, NAV, DPI)
 * with detailed diff reporting.
 */

export interface ComparisonResult {
  matches: boolean;
  metric: string;
  actual: number;
  expected: number;
  absoluteDiff: number;
  relativeDiff: number;
  withinTolerance: boolean;
}

export interface ComparisonOptions {
  absoluteTolerance?: number;
  relativeTolerance?: number;
  label?: string;
}

export interface DiffReport {
  totalTests: number;
  passed: number;
  failed: number;
  mismatches: ComparisonResult[];
  summary: string;
}

/**
 * Compare actual vs expected value with tolerance
 *
 * @param actual - Actual calculated value
 * @param expected - Expected reference value
 * @param metric - Name of metric being compared
 * @param options - Comparison options with tolerances
 * @returns Comparison result with diff details
 *
 * @example
 * const result = compareWithTolerance(2.512, 2.500, 'TVPI', {
 *   absoluteTolerance: 0.01,
 *   relativeTolerance: 0.01
 * });
 * // => { matches: true, absoluteDiff: 0.012, relativeDiff: 0.0048, ... }
 */
export function compareWithTolerance(
  actual: number,
  expected: number,
  metric: string,
  options: ComparisonOptions = {}
): ComparisonResult {
  const {
    absoluteTolerance = 0.01,  // 1% default absolute tolerance
    relativeTolerance = 0.01,  // 1% default relative tolerance
  } = options;

  // Handle special cases
  if (isNaN(actual) || isNaN(expected)) {
    return {
      matches: false,
      metric,
      actual,
      expected,
      absoluteDiff: NaN,
      relativeDiff: NaN,
      withinTolerance: false,
    };
  }

  // Calculate absolute difference
  const absoluteDiff = Math.abs(actual - expected);

  // Calculate relative difference (as percentage of expected)
  // Handle division by zero: if expected is 0, use absolute tolerance only
  const relativeDiff = expected !== 0
    ? absoluteDiff / Math.abs(expected)
    : (absoluteDiff === 0 ? 0 : Infinity);

  // Check if within tolerance (must satisfy BOTH absolute AND relative)
  const withinAbsoluteTolerance = absoluteDiff <= absoluteTolerance;
  const withinRelativeTolerance = relativeDiff <= relativeTolerance;
  const withinTolerance = withinAbsoluteTolerance && withinRelativeTolerance;

  return {
    matches: withinTolerance,
    metric,
    actual,
    expected,
    absoluteDiff,
    relativeDiff,
    withinTolerance,
  };
}

/**
 * Generate detailed diff report from comparison results
 *
 * @param results - Array of comparison results
 * @param options - Report options
 * @returns Formatted diff report
 *
 * @example
 * const report = generateDiffReport(comparisonResults);
 * console.log(report.summary);
 * // => "Excel Parity: 3/4 tests passed (75.0%)"
 */
export function generateDiffReport(
  results: ComparisonResult[],
  options: { title?: string } = {}
): DiffReport {
  const { title = 'Excel Parity' } = options;

  const totalTests = results.length;
  const passed = results.filter(r => r.matches).length;
  const failed = totalTests - passed;
  const mismatches = results.filter(r => !r.matches);

  const passRate = totalTests > 0 ? (passed / totalTests) * 100 : 0;

  const summary = [
    `${title}: ${passed}/${totalTests} tests passed (${passRate.toFixed(1)}%)`,
    '',
    ...(mismatches.length > 0 ? [
      'Mismatches:',
      ...mismatches.map(m => formatMismatch(m)),
    ] : [
      'All tests passed!',
    ]),
  ].join('\n');

  return {
    totalTests,
    passed,
    failed,
    mismatches,
    summary,
  };
}

/**
 * Format a single mismatch for display
 */
function formatMismatch(result: ComparisonResult): string {
  const absError = result.absoluteDiff.toFixed(6);
  const relError = (result.relativeDiff * 100).toFixed(2);

  return [
    `  ${result.metric}:`,
    `    Expected: ${result.expected.toFixed(6)}`,
    `    Actual:   ${result.actual.toFixed(6)}`,
    `    Absolute Error: ${absError}`,
    `    Relative Error: ${relError}%`,
  ].join('\n');
}

/**
 * Visual diff output with color coding (for terminal)
 *
 * @param results - Comparison results
 * @returns Formatted string with visual indicators
 */
export function visualDiff(results: ComparisonResult[]): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('                    EXCEL PARITY REPORT                     ');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');

  results.forEach(result => {
    const status = result.matches ? '✓' : '✗';
    const statusPadding = result.matches ? ' ' : '';

    lines.push(`${status} ${result.metric}${statusPadding}`);
    lines.push(`  Expected: ${formatValue(result.expected)}`);
    lines.push(`  Actual:   ${formatValue(result.actual)}`);

    if (!result.matches) {
      lines.push(`  Abs Diff: ${formatValue(result.absoluteDiff)} (${(result.relativeDiff * 100).toFixed(2)}%)`);
    }

    lines.push('');
  });

  const passed = results.filter(r => r.matches).length;
  const total = results.length;
  const passRate = (passed / total) * 100;

  lines.push('───────────────────────────────────────────────────────────');
  lines.push(`Summary: ${passed}/${total} passed (${passRate.toFixed(1)}%)`);
  lines.push('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Format value for display
 */
function formatValue(value: number): string {
  if (isNaN(value)) return 'NaN';
  if (!isFinite(value)) return value > 0 ? '+Infinity' : '-Infinity';

  // Use scientific notation for very small/large values
  if (Math.abs(value) < 0.0001 || Math.abs(value) > 1000000) {
    return value.toExponential(4);
  }

  return value.toFixed(6);
}

/**
 * Compare arrays of metrics with tolerance
 *
 * @param actual - Actual calculated metrics
 * @param expected - Expected reference metrics
 * @param metricName - Base name for metrics
 * @param options - Comparison options
 * @returns Array of comparison results
 *
 * @example
 * const results = compareArrays(
 *   [2.5, 1.2, 18.5],
 *   [2.5, 1.2, 18.3],
 *   'Quarterly TVPI',
 *   { absoluteTolerance: 0.01 }
 * );
 */
export function compareArrays(
  actual: number[],
  expected: number[],
  metricName: string,
  options: ComparisonOptions = {}
): ComparisonResult[] {
  const maxLength = Math.max(actual.length, expected.length);
  const results: ComparisonResult[] = [];

  for (let i = 0; i < maxLength; i++) {
    const actualValue = actual[i] ?? NaN;
    const expectedValue = expected[i] ?? NaN;
    const metric = `${metricName}[${i}]`;

    results.push(compareWithTolerance(actualValue, expectedValue, metric, options));
  }

  return results;
}

/**
 * Compare time series data
 *
 * @param actual - Actual time series
 * @param expected - Expected time series
 * @param metrics - Metrics to compare
 * @param options - Comparison options
 * @returns Comparison results grouped by metric
 */
export function compareTimeSeries(
  actual: Array<Record<string, number>>,
  expected: Array<Record<string, number>>,
  metrics: string[],
  options: ComparisonOptions = {}
): Record<string, ComparisonResult[]> {
  const results: Record<string, ComparisonResult[]> = {};

  metrics.forEach(metric => {
    const actualValues = actual.map(row => row[metric] ?? NaN);
    const expectedValues = expected.map(row => row[metric] ?? NaN);

    results[metric] = compareArrays(actualValues, expectedValues, metric, options);
  });

  return results;
}

/**
 * Assert comparison results (for test assertions)
 *
 * @param results - Comparison results
 * @param throwOnFailure - Whether to throw error on failure
 * @returns True if all tests passed
 * @throws Error with diff report if any tests failed and throwOnFailure is true
 */
export function assertComparison(
  results: ComparisonResult[],
  throwOnFailure = true
): boolean {
  const report = generateDiffReport(results);

  if (report.failed > 0 && throwOnFailure) {
    throw new Error(report.summary);
  }

  return report.failed === 0;
}
