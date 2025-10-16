/**
 * Export Utilities for Excel Parity Testing
 *
 * Provides CSV export functionality matching Excel structure for comparison testing.
 */

import type { PeriodResult } from '@shared/schemas/fund-model';

export interface ExportOptions {
  includeMetadata?: boolean;
  scenarioName?: string;
  dateFormat?: 'iso' | 'excel';
  precision?: number;
}

export interface ExportMetadata {
  exportDate: string;
  scenarioName: string;
  fundSize?: number;
  fundTerm?: number;
  managementFeeRate?: number;
  carryRate?: number;
}

/**
 * Export period results to CSV format
 *
 * @param results - Array of period results
 * @param filename - Target filename (optional, for browser download)
 * @param options - Export options
 * @returns CSV string
 *
 * @example
 * const csv = exportToCSV(periodResults, 'fund-projection.csv', {
 *   includeMetadata: true,
 *   scenarioName: 'Base Case',
 *   precision: 2
 * });
 */
export function exportToCSV(
  results: PeriodResult[],
  filename?: string,
  options: ExportOptions = {}
): string {
  const {
    includeMetadata = true,
    scenarioName = 'Default Scenario',
    precision = 6,
  } = options;

  const lines: string[] = [];

  // Add metadata section (optional)
  if (includeMetadata) {
    lines.push('# Excel Parity Export');
    lines.push(`# Scenario: ${scenarioName}`);
    lines.push(`# Export Date: ${new Date().toISOString()}`);
    lines.push(`# Total Periods: ${results.length}`);
    lines.push('');
  }

  // Add CSV header
  lines.push([
    'periodIndex',
    'periodStart',
    'periodEnd',
    'contributions',
    'investments',
    'managementFees',
    'exitProceeds',
    'distributions',
    'unrealizedPnl',
    'nav',
    'tvpi',
    'dpi',
    'irrAnnualized',
  ].join(','));

  // Add data rows
  results.forEach(period => {
    const row = [
      period.periodIndex,
      period.periodStart,
      period.periodEnd,
      formatNumber(period.contributions, precision),
      formatNumber(period.investments, precision),
      formatNumber(period.managementFees, precision),
      formatNumber(period.exitProceeds, precision),
      formatNumber(period.distributions, precision),
      formatNumber(period.unrealizedPnl, precision),
      formatNumber(period.nav, precision),
      formatNumber(period.tvpi, precision),
      formatNumber(period.dpi, precision),
      formatNumber(period.irrAnnualized, precision),
    ].join(',');

    lines.push(row);
  });

  const csv = lines.join('\n') + '\n'; // Ensure trailing newline

  // Trigger browser download if filename provided (browser environment only)
  if (filename && typeof window !== 'undefined' && typeof document !== 'undefined') {
    downloadCSV(csv, filename);
  }

  return csv;
}

/**
 * Export KPI summary to CSV format
 *
 * @param kpis - KPI object with TVPI, DPI, IRR
 * @param metadata - Additional metadata
 * @param options - Export options
 * @returns CSV string
 *
 * @example
 * const csv = exportKPIsToCSV({
 *   tvpi: 2.5,
 *   dpi: 1.2,
 *   irrAnnualized: 18.5
 * }, {
 *   scenarioName: 'Base Case',
 *   fundSize: 100000000
 * });
 */
export function exportKPIsToCSV(
  kpis: { tvpi: number; dpi: number; irrAnnualized: number },
  metadata: Partial<ExportMetadata> = {},
  options: ExportOptions = {}
): string {
  const {
    includeMetadata = true,
    scenarioName = metadata.scenarioName || 'Default Scenario',
    precision = 6,
  } = options;

  const lines: string[] = [];

  // Add metadata section
  if (includeMetadata) {
    lines.push('# KPI Summary Export');
    lines.push(`# Scenario: ${scenarioName}`);
    lines.push(`# Export Date: ${metadata.exportDate || new Date().toISOString()}`);
    if (metadata.fundSize) {
      lines.push(`# Fund Size: ${formatNumber(metadata.fundSize, 2)}`);
    }
    if (metadata.fundTerm) {
      lines.push(`# Fund Term: ${metadata.fundTerm} years`);
    }
    lines.push('');
  }

  // Add CSV header and data
  lines.push('metric,value,unit');
  lines.push(`TVPI,${formatNumber(kpis.tvpi, precision)},ratio`);
  lines.push(`DPI,${formatNumber(kpis.dpi, precision)},ratio`);
  lines.push(`IRR,${formatNumber(kpis.irrAnnualized, precision)},percent`);

  return lines.join('\n') + '\n';
}

/**
 * Export scenario comparison to CSV format
 *
 * @param scenarios - Array of scenarios with results
 * @param options - Export options
 * @returns CSV string
 *
 * @example
 * const csv = exportScenarioComparison([
 *   { name: 'Base', tvpi: 2.5, dpi: 1.2, irr: 18.5 },
 *   { name: 'Optimistic', tvpi: 3.2, dpi: 1.8, irr: 24.3 }
 * ]);
 */
export function exportScenarioComparison(
  scenarios: Array<{
    name: string;
    tvpi: number;
    dpi: number;
    irrAnnualized: number;
  }>,
  options: ExportOptions = {}
): string {
  const {
    includeMetadata = true,
    precision = 6,
  } = options;

  const lines: string[] = [];

  // Add metadata section
  if (includeMetadata) {
    lines.push('# Scenario Comparison Export');
    lines.push(`# Export Date: ${new Date().toISOString()}`);
    lines.push(`# Total Scenarios: ${scenarios.length}`);
    lines.push('');
  }

  // Add CSV header
  lines.push('scenarioName,tvpi,dpi,irrAnnualized');

  // Add data rows
  scenarios.forEach(scenario => {
    const row = [
      scenario.name,
      formatNumber(scenario.tvpi, precision),
      formatNumber(scenario.dpi, precision),
      formatNumber(scenario.irrAnnualized, precision),
    ].join(',');

    lines.push(row);
  });

  return lines.join('\n') + '\n';
}

/**
 * Parse CSV file into structured data
 *
 * @param csvContent - CSV file content as string
 * @returns Array of objects representing rows
 *
 * @example
 * const data = parseCSV(csvContent);
 * // => [{ periodIndex: 0, contributions: 100000000, ... }, ...]
 */
export function parseCSV<T = Record<string, number>>(csvContent: string): T[] {
  const lines = csvContent
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#')); // Skip empty lines and metadata

  if (lines.length < 2) {
    throw new Error('CSV must have at least a header and one data row');
  }

  const headers = lines[0]!.split(',').map(h => h.trim());
  const dataLines = lines.slice(1);

  const rows: T[] = [];

  dataLines.forEach((line, lineIndex) => {
    const values = line.split(',').map(v => v.trim());

    if (values.length !== headers.length) {
      throw new Error(
        `Line ${lineIndex + 2}: Expected ${headers.length} columns, got ${values.length}`
      );
    }

    const row: Record<string, unknown> = {};

    headers.forEach((header, colIndex) => {
      const value = values[colIndex];

      // Parse numbers, keep strings as-is
      if (value && !isNaN(Number(value))) {
        row[header] = Number(value);
      } else {
        row[header] = value;
      }
    });

    rows.push(row as T);
  });

  return rows;
}

/**
 * Format number to fixed precision
 */
function formatNumber(value: number, precision: number): string {
  if (isNaN(value)) return 'NaN';
  if (!isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';

  return value.toFixed(precision);
}

/**
 * Download CSV in browser environment
 */
function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    // Create download link
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up URL
    URL.revokeObjectURL(url);
  }
}

/**
 * Import Excel reference data from CSV
 *
 * @param csvContent - CSV file content
 * @returns Parsed reference data
 *
 * @example
 * const refData = importExcelReference(csvContent);
 * // => { periods: [...], metadata: {...} }
 */
export function importExcelReference(csvContent: string): {
  periods: Array<{
    periodIndex: number;
    tvpi: number;
    dpi: number;
    irr: number;
    nav: number;
  }>;
  metadata: Record<string, string>;
} {
  const lines = csvContent.split('\n');

  // Extract metadata
  const metadata: Record<string, string> = {};
  const dataLines: string[] = [];

  lines.forEach(line => {
    if (line.startsWith('#')) {
      // Parse metadata line: "# Key: Value"
      const match = line.match(/^#\s*([^:]+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        metadata[key!.trim()] = value!.trim();
      }
    } else if (line.trim()) {
      dataLines.push(line);
    }
  });

  // Parse period data
  const periods = parseCSV<{
    periodIndex: number;
    tvpi: number;
    dpi: number;
    irr: number;
    nav: number;
  }>(dataLines.join('\n'));

  return { periods, metadata };
}

/**
 * Export to Excel-compatible format (TSV with Excel date format)
 *
 * @param results - Period results
 * @param options - Export options
 * @returns TSV string (tab-separated values)
 */
export function exportToExcelFormat(
  results: PeriodResult[],
  options: ExportOptions = {}
): string {
  const {
    precision = 6,
  } = options;

  const lines: string[] = [];

  // Add header (Excel-friendly column names)
  lines.push([
    'Period',
    'Start Date',
    'End Date',
    'Contributions',
    'Investments',
    'Management Fees',
    'Exit Proceeds',
    'Distributions',
    'Unrealized P&L',
    'NAV',
    'TVPI',
    'DPI',
    'IRR (%)',
  ].join('\t'));

  // Add data rows
  results.forEach(period => {
    const row = [
      period.periodIndex,
      formatExcelDate(period.periodStart),
      formatExcelDate(period.periodEnd),
      formatNumber(period.contributions, precision),
      formatNumber(period.investments, precision),
      formatNumber(period.managementFees, precision),
      formatNumber(period.exitProceeds, precision),
      formatNumber(period.distributions, precision),
      formatNumber(period.unrealizedPnl, precision),
      formatNumber(period.nav, precision),
      formatNumber(period.tvpi, precision),
      formatNumber(period.dpi, precision),
      formatNumber(period.irrAnnualized * 100, precision), // Convert to percentage
    ].join('\t');

    lines.push(row);
  });

  return lines.join('\n') + '\n';
}

/**
 * Format date for Excel (MM/DD/YYYY)
 */
function formatExcelDate(isoDate: string): string {
  const date = new Date(isoDate);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();

  return `${month}/${day}/${year}`;
}
