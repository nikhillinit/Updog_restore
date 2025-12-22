/**
 * Export Utilities - Centralized exports for data export functionality
 *
 * Provides Excel and CSV export capabilities with security protections
 * against formula injection attacks.
 */

import { exportXlsx, exportCsv } from '../exporters';
import { exportReserves as exportReserveData, type ExportData, type ExportOptions } from '../export-reserves';

/**
 * Export reserve data to Excel or CSV format
 * @param data - Reserve data to export
 * @param options - Export configuration options
 * @returns Promise that resolves when export completes
 */
export async function exportReserves(data: ExportData, options?: Partial<ExportOptions>): Promise<void> {
  const defaultOptions: ExportOptions = {
    format: 'excel',
    includeMetadata: true,
    includeSummary: true,
    ...options,
  };
  return exportReserveData(data, defaultOptions);
}

/**
 * Generic Excel export function
 * @param data - Array of data to export
 * @param filename - Target filename
 * @returns Promise that resolves when export completes
 */
export async function exportToExcel(data: unknown[], filename = 'export.xlsx'): Promise<void> {
  return exportXlsx(data, filename);
}

/**
 * Generic CSV export function
 * @param data - Array of data to export
 * @param filename - Target filename
 * @returns Promise that resolves when export completes
 */
export async function exportToCsv(data: unknown[], filename = 'export.csv'): Promise<void> {
  return exportCsv(data, filename);
}

/**
 * Export portfolio data to Excel
 * @param portfolioData - Portfolio companies data
 * @param filename - Target filename
 */
export async function exportPortfolio(
  portfolioData: Array<{
    name: string;
    sector?: string;
    stage?: string;
    investmentAmount?: number;
    currentValuation?: number;
    [key: string]: unknown;
  }>,
  filename = 'portfolio-export.xlsx'
): Promise<void> {
  // Transform portfolio data for export
  const exportRows = portfolioData.map((company) => ({
    'Company Name': company.name,
    'Sector': company.sector || 'N/A',
    'Stage': company.stage || 'N/A',
    'Investment Amount': company.investmentAmount || 0,
    'Current Valuation': company.currentValuation || 0,
    ...Object.fromEntries(
      Object.entries(company)
        .filter(([key]) => !['name', 'sector', 'stage', 'investmentAmount', 'currentValuation'].includes(key))
    ),
  }));

  return exportXlsx(exportRows, filename);
}

// Re-export types for consumers
export type { ExportData, ExportOptions } from '../export-reserves';
