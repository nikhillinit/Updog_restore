/**
 * Dynamic export utilities for reserves data
 * Uses lazy loading to keep bundle size small
 */

import { isEnabled } from '@/lib/feature-flags';
import { metrics } from '@/metrics/reserves-metrics';
import type { ReservesOutput, Company } from '@shared/types/reserves-v11';

export interface ExportOptions {
  format: 'csv' | 'excel' | 'json';
  filename?: string;
  includeMetadata?: boolean;
  includeSummary?: boolean;
}

export interface ExportData {
  output: ReservesOutput;
  companies: Company[];
  config?: {
    reserve_bps: number;
    remain_passes: number;
    cap_policy?: {
      kind: string;
      default_percent: number;
    };
    audit_level: string;
  };
  timestamp?: Date;
}

/**
 * Export reserves data to CSV format
 */
async function exportToCSV(data: ExportData, options: ExportOptions): Promise<void> {
  const timer = metrics.startTimer('export.csv');

  try {
    // Dynamic import of Papa Parse
    const Papa = await import('papaparse');

    // Prepare data for CSV
    const rows = data.output.allocations.map((allocation) => {
      const company = data.companies.find((c) => c.id === allocation.company_id);
      const rank = data.output.metadata.exit_moic_ranking.indexOf(allocation.company_id) + 1;

      return {
        Rank: rank,
        'Company ID': allocation.company_id,
        'Company Name': company?.name || 'Unknown',
        Stage: company?.stage || '',
        Sector: company?.sector || '',
        'Initial Investment': (company?.invested_cents || 0) / 100,
        'Exit MOIC': (company?.exit_moic_bps || 0) / 10000,
        'Reserve Allocation': allocation.planned_cents / 100,
        'Reserve %': company?.invested_cents
          ? `${((allocation.planned_cents / company.invested_cents) * 100).toFixed(2)}%`
          : '0%',
        'Cap Amount': allocation.cap_cents / 100,
        'Allocation Pass': allocation.iteration,
        Reason: allocation.reason,
      };
    });

    // Add summary rows if requested
    if (options.includeSummary) {
      rows.push({
        Rank: 0,
        'Company ID': 'SUMMARY',
        'Company Name': '',
        Stage: '',
        Sector: '',
        'Initial Investment': 0,
        'Exit MOIC': 0,
        'Reserve Allocation': 0,
        'Reserve %': '',
        'Cap Amount': 0,
        'Allocation Pass': 0,
        Reason: '',
      });

      rows.push({
        Rank: 0,
        'Company ID': 'Total Available',
        'Company Name': String(data.output.metadata.total_available_cents / 100),
        Stage: '',
        Sector: '',
        'Initial Investment': 0,
        'Exit MOIC': 0,
        'Reserve Allocation': 0,
        'Reserve %': '',
        'Cap Amount': 0,
        'Allocation Pass': 0,
        Reason: '',
      });

      rows.push({
        Rank: 0,
        'Company ID': 'Total Allocated',
        'Company Name': String(data.output.metadata.total_allocated_cents / 100),
        Stage: '',
        Sector: '',
        'Initial Investment': 0,
        'Exit MOIC': 0,
        'Reserve Allocation': 0,
        'Reserve %': '',
        'Cap Amount': 0,
        'Allocation Pass': 0,
        Reason: '',
      });

      rows.push({
        Rank: 0,
        'Company ID': 'Remaining',
        'Company Name': String(data.output.remaining_cents / 100),
        Stage: '',
        Sector: '',
        'Initial Investment': 0,
        'Exit MOIC': 0,
        'Reserve Allocation': 0,
        'Reserve %': '',
        'Cap Amount': 0,
        'Allocation Pass': 0,
        Reason: '',
      });
    }

    // Convert to CSV
    const csv = Papa.default.unparse(rows);

    // Download file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.filename || `reserves-allocation-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    metrics.recordDuration('export.csv.success', performance.now());
  } catch (error) {
    metrics.recordError(`CSV export failed: ${error}`);
    throw error;
  } finally {
    timer.end();
  }
}

/**
 * Export reserves data to Excel format
 */
async function exportToExcel(data: ExportData, options: ExportOptions): Promise<void> {
  const timer = metrics.startTimer('export.excel');

  try {
    // Dynamic import of ExcelJS for compatibility
    const ExcelJS = await import('exceljs');

    // Create workbook
    const workbook = new ExcelJS.Workbook();

    // Main allocations sheet
    const allocationsData = data.output.allocations.map((allocation) => {
      const company = data.companies.find((c) => c.id === allocation.company_id);
      const rank = data.output.metadata.exit_moic_ranking.indexOf(allocation.company_id) + 1;

      return {
        Rank: rank,
        'Company ID': allocation.company_id,
        'Company Name': company?.name || 'Unknown',
        Stage: company?.stage || '',
        Sector: company?.sector || '',
        'Initial Investment ($)': (company?.invested_cents || 0) / 100,
        'Exit MOIC': (company?.exit_moic_bps || 0) / 10000,
        'Reserve Allocation ($)': allocation.planned_cents / 100,
        'Reserve %': company?.invested_cents
          ? (allocation.planned_cents / company.invested_cents) * 100
          : 0,
        'Cap Amount ($)': allocation.cap_cents / 100,
        'Allocation Pass': allocation.iteration,
        Reason: allocation.reason,
      };
    });

    const allocationsSheet = workbook.addWorksheet('Allocations');
    const firstAllocation = allocationsData[0];
    if (firstAllocation) {
      const headers = Object.keys(firstAllocation);
      allocationsSheet.columns = headers.map((header) => ({
        header,
        key: header,
      }));
      allocationsSheet.addRows(allocationsData);
    }

    // Auto-size columns
    const colWidths = [6, 15, 25, 10, 12, 18, 10, 20, 12, 15, 15, 40];
    colWidths.forEach((width, index) => {
      allocationsSheet.getColumn(index + 1).width = width;
    });

    // Summary sheet
    if (options.includeSummary) {
      const summaryData = [
        {
          Metric: 'Total Available Reserves',
          Value: data.output.metadata.total_available_cents / 100,
        },
        { Metric: 'Total Allocated', Value: data.output.metadata.total_allocated_cents / 100 },
        { Metric: 'Remaining Reserves', Value: data.output.remaining_cents / 100 },
        { Metric: 'Companies Funded', Value: data.output.metadata.companies_funded },
        {
          Metric: 'Utilization %',
          Value: `${((data.output.metadata.total_allocated_cents / data.output.metadata.total_available_cents) * 100).toFixed(2)}%`,
        },
        {
          Metric: 'Conservation Check',
          Value: data.output.metadata.conservation_check ? 'Passed' : 'Warning',
        },
        { Metric: 'Max Iterations', Value: data.output.metadata.max_iterations },
        { Metric: 'Export Date', Value: new Date().toISOString() },
      ];

      const summarySheet = workbook.addWorksheet('Summary');
      const firstSummaryRow = summaryData[0];
      if (firstSummaryRow) {
        const headers = Object.keys(firstSummaryRow);
        summarySheet.columns = headers.map((header) => ({
          header,
          key: header,
        }));
        summarySheet.addRows(summaryData);
      }
      [25, 20].forEach((width, index) => {
        summarySheet.getColumn(index + 1).width = width;
      });
    }

    // Metadata sheet
    if (options.includeMetadata && data.config) {
      const metadataData = [
        { Parameter: 'Reserve Percentage', Value: `${data.config.reserve_bps / 100}%` },
        { Parameter: 'Remain Passes', Value: data.config.remain_passes },
        { Parameter: 'Cap Policy', Value: data.config.cap_policy?.kind || 'fixed_percent' },
        {
          Parameter: 'Default Cap %',
          Value: `${(data.config.cap_policy?.default_percent ?? 0) * 100}%`,
        },
        { Parameter: 'Audit Level', Value: data.config.audit_level },
      ];

      const metadataSheet = workbook.addWorksheet('Configuration');
      const firstMetadataRow = metadataData[0];
      if (firstMetadataRow) {
        const headers = Object.keys(firstMetadataRow);
        metadataSheet.columns = headers.map((header) => ({
          header,
          key: header,
        }));
        metadataSheet.addRows(metadataData);
      }
      [20, 20].forEach((width, index) => {
        metadataSheet.getColumn(index + 1).width = width;
      });
    }

    const downloadBlob = (blob: Blob, filename: string): void => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    // Write file
    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      options.filename || `reserves-allocation-${Date.now()}.xlsx`
    );

    metrics.recordDuration('export.excel.success', performance.now());
  } catch (error) {
    metrics.recordError(`Excel export failed: ${error}`);
    throw error;
  } finally {
    timer.end();
  }
}

/**
 * Export reserves data to JSON format
 */
async function exportToJSON(data: ExportData, options: ExportOptions): Promise<void> {
  const timer = metrics.startTimer('export.json');

  try {
    const exportData = {
      timestamp: data.timestamp || new Date(),
      output: data.output,
      companies: options.includeMetadata ? data.companies : undefined,
      config: options.includeMetadata ? data.config : undefined,
      summary: options.includeSummary
        ? {
            totalAvailable: data.output.metadata.total_available_cents / 100,
            totalAllocated: data.output.metadata.total_allocated_cents / 100,
            remaining: data.output.remaining_cents / 100,
            companiesFunded: data.output.metadata.companies_funded,
            utilization:
              (data.output.metadata.total_allocated_cents /
                data.output.metadata.total_available_cents) *
              100,
          }
        : undefined,
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.filename || `reserves-allocation-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    metrics.recordDuration('export.json.success', performance.now());
  } finally {
    timer.end();
  }
}

/**
 * Main export function with format detection
 */
export async function exportReserves(data: ExportData, options: ExportOptions): Promise<void> {
  // Check if async export is enabled
  if (!isEnabled('export_async')) {
    throw new Error('Async export is not enabled');
  }

  const timer = metrics.startTimer('export.total');

  try {
    switch (options.format) {
      case 'csv':
        await exportToCSV(data, options);
        break;

      case 'excel':
        await exportToExcel(data, options);
        break;

      case 'json':
        await exportToJSON(data, options);
        break;

      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    // Record successful export
    metrics.recordDuration('export.success', performance.now());
  } catch (error) {
    metrics.recordError(`Export failed: ${error}`);
    throw error;
  } finally {
    timer.end();
  }
}

/**
 * Check if export format is supported
 */
export function isExportSupported(format: string): boolean {
  return ['csv', 'excel', 'json'].includes(format);
}

/**
 * Get suggested filename for export
 */
export function getSuggestedFilename(format: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const extension = format === 'excel' ? 'xlsx' : format;
  return `reserves-allocation-${timestamp}.${extension}`;
}
