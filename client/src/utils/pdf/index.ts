/**
 * PDF Export Utilities - Press On Ventures
 * Phase 3B: PDF generation with @react-pdf/renderer
 *
 * This module provides PDF generation capabilities for LP-facing reports.
 *
 * Implementation Status:
 * - [x] Types and interfaces defined
 * - [x] Theme tokens exported
 * - [x] @react-pdf/renderer integration
 * - [x] PdfDocument component
 * - [x] PdfHeader component
 * - [x] PdfFooter component
 * - [x] PdfTable component
 * - [x] PdfMetricCard component
 *
 * Usage:
 * ```tsx
 * import { generatePdf, PdfDocument, pdfTheme, downloadBlob } from '@/utils/pdf';
 *
 * const blob = await generatePdf(<TearSheetTemplate data={fundData} />);
 * downloadBlob(blob, 'tear-sheet.pdf');
 * ```
 */

import { pdf } from '@react-pdf/renderer';
import { brandTokens, colors, typography } from '@/lib/brand-tokens';
import { registerFonts } from './fonts';

// =============================================================================
// Types
// =============================================================================

export interface PdfMetadata {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  createdAt?: Date;
}

// PdfHeaderProps, PdfFooterProps, and PdfDocumentProps are re-exported from './components'

export interface TearSheetData {
  companyName: string;
  fundName: string;
  investmentDate: string;
  metrics: {
    totalInvested: number;
    currentValue: number;
    moic: number;
    irr: number;
  };
  timeline?: Array<{
    date: string;
    event: string;
    amount?: number;
  }>;
  notes?: string;
}

export interface QuarterlyReportData {
  fundName: string;
  quarter: string;
  year: number;
  summary: {
    nav: number;
    tvpi: number;
    dpi: number;
    irr: number;
  };
  portfolioCompanies: Array<{
    name: string;
    invested: number;
    value: number;
    moic: number;
  }>;
  cashFlows?: Array<{
    date: string;
    type: 'contribution' | 'distribution';
    amount: number;
  }>;
  commentary?: string;
}

// =============================================================================
// PDF Theme (re-exported from ./theme to avoid circular imports with components)
// =============================================================================

export { pdfTheme, pdfStylesDefinition } from './theme';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format currency for PDF display
 */
export function formatCurrency(
  value: number,
  options: { compact?: boolean; decimals?: number } = {}
): string {
  const { compact = false, decimals = 0 } = options;

  if (compact && Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format percentage for PDF display
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format multiple (e.g., MOIC) for PDF display
 */
export function formatMultiple(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}x`;
}

/**
 * Format date for PDF display (uses UTC for deterministic output)
 */
export function formatDate(
  date: Date | string,
  format: 'short' | 'medium' | 'long' = 'medium'
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  switch (format) {
    case 'short':
      return d.toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        timeZone: 'UTC',
      });
    case 'long':
      return d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
    case 'medium':
    default:
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
  }
}

/**
 * Get timestamp for PDF footer. Pass asOfDate for deterministic output.
 */
export function getGeneratedTimestamp(asOfDate?: Date): string {
  const d = asOfDate ?? new Date();
  return `Generated ${formatDate(d, 'medium')} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}`;
}

/**
 * Copyright notice text. Pass year for deterministic output.
 */
export function getCopyrightText(year?: number): string {
  const y = year ?? new Date().getUTCFullYear();
  return `${y} Press On Ventures. Confidential.`;
}

// =============================================================================
// PDF Generation
// =============================================================================

/**
 * Generate PDF blob from React PDF document
 *
 * @param document - React element using @react-pdf/renderer components
 * @returns Promise<Blob> - PDF file as blob
 *
 * @example
 * ```tsx
 * import { generatePdf, downloadBlob } from '@/utils/pdf';
 * import { TearSheetTemplate } from '@/utils/pdf/templates/TearSheetTemplate';
 *
 * const handleExport = async () => {
 *   const blob = await generatePdf(<TearSheetTemplate data={tearSheetData} />);
 *   downloadBlob(blob, 'tear-sheet.pdf');
 * };
 * ```
 */
export async function generatePdf(document: React.ReactElement): Promise<Blob> {
  // Ensure fonts are registered before generating PDF
  registerFonts();

  // Generate PDF blob
  const blob = await pdf(document).toBlob();
  return blob;
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Re-export brand tokens for convenience
export { brandTokens, colors, typography };

// Re-export PDF components
export {
  PdfDocument,
  PdfHeader,
  PdfFooter,
  PdfTable,
  PdfMetricCard,
  type PdfDocumentProps,
  type PdfHeaderProps,
  type PdfFooterProps,
  type PdfTableProps,
  type PdfMetricCardProps,
  type TableColumn,
} from './components';

// Re-export font utilities
export { registerFonts, areFontsRegistered, PDF_FONTS } from './fonts';

// Re-export chart export utilities
export {
  exportChartToImage,
  exportChartsToImages,
  useChartExport,
  createChartPlaceholder,
  type ChartExportOptions,
  type ChartExportResult,
} from './chart-export';
