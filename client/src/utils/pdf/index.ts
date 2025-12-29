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
import { brandTokens, colors, typography, pdf as pdfTokens } from '@/lib/brand-tokens';
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
// PDF Theme (for @react-pdf/renderer)
// =============================================================================

/**
 * PDF-compatible theme tokens
 * Use with @react-pdf/renderer StyleSheet.create()
 */
export const pdfTheme = {
  colors: {
    primary: colors.dark,
    accent: colors.beige,
    background: colors.white,
    backgroundSubtle: colors.light,
    textPrimary: colors.dark,
    textMuted: colors.darkMuted,
    border: colors.beige,
  },

  fonts: {
    heading: typography.fontFamily.heading,
    body: typography.fontFamily.body,
  },

  fontSizes: {
    h1: pdfTokens.content.lineHeight * 22,
    h2: pdfTokens.content.lineHeight * 16,
    h3: pdfTokens.content.lineHeight * 13,
    h4: pdfTokens.content.lineHeight * 11,
    body: 11,
    caption: 9,
    footer: 8,
  },

  spacing: {
    page: {
      marginTop: pdfTokens.page.marginTop,
      marginBottom: pdfTokens.page.marginBottom,
      marginLeft: pdfTokens.page.marginLeft,
      marginRight: pdfTokens.page.marginRight,
    },
    section: pdfTokens.content.sectionSpacing,
    paragraph: pdfTokens.content.paragraphSpacing,
    gutter: 12,
  },

  page: {
    width: pdfTokens.page.width,
    height: pdfTokens.page.height,
  },

  header: {
    height: pdfTokens.header.height,
    logoWidth: pdfTokens.header.logoWidth,
  },

  footer: {
    height: pdfTokens.footer.height,
  },
} as const;

// =============================================================================
// Style Presets (for StyleSheet.create())
// =============================================================================

/**
 * Common PDF styles to use with @react-pdf/renderer
 *
 * Usage:
 * ```tsx
 * import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
 * import { pdfStyles } from '@/utils/pdf';
 *
 * const MyDocument = () => (
 *   <Document>
 *     <Page style={pdfStyles.page}>
 *       <Text style={pdfStyles.h1}>Title</Text>
 *     </Page>
 *   </Document>
 * );
 * ```
 */
export const pdfStylesDefinition = {
  // Page
  page: {
    paddingTop: pdfTheme.spacing.page.marginTop,
    paddingBottom: pdfTheme.spacing.page.marginBottom,
    paddingLeft: pdfTheme.spacing.page.marginLeft,
    paddingRight: pdfTheme.spacing.page.marginRight,
    fontFamily: 'Helvetica', // Default until custom fonts registered
    fontSize: pdfTheme.fontSizes.body,
    color: pdfTheme.colors.textPrimary,
    backgroundColor: pdfTheme.colors.background,
  },

  // Typography
  h1: {
    fontSize: pdfTheme.fontSizes.h1,
    fontWeight: 700,
    marginBottom: pdfTheme.spacing.paragraph,
    color: pdfTheme.colors.primary,
  },

  h2: {
    fontSize: pdfTheme.fontSizes.h2,
    fontWeight: 700,
    marginBottom: pdfTheme.spacing.paragraph * 0.75,
    color: pdfTheme.colors.primary,
  },

  h3: {
    fontSize: pdfTheme.fontSizes.h3,
    fontWeight: 600,
    marginBottom: pdfTheme.spacing.paragraph * 0.5,
    color: pdfTheme.colors.primary,
  },

  body: {
    fontSize: pdfTheme.fontSizes.body,
    lineHeight: 1.5,
    color: pdfTheme.colors.textPrimary,
  },

  caption: {
    fontSize: pdfTheme.fontSizes.caption,
    color: pdfTheme.colors.textMuted,
  },

  // Layout
  section: {
    marginBottom: pdfTheme.spacing.section,
  },

  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },

  spaceBetween: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },

  // Header
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.colors.border,
    marginBottom: pdfTheme.spacing.section,
  },

  // Footer
  footer: {
    position: 'absolute' as const,
    bottom: pdfTheme.spacing.page.marginBottom,
    left: pdfTheme.spacing.page.marginLeft,
    right: pdfTheme.spacing.page.marginRight,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    fontSize: pdfTheme.fontSizes.footer,
    color: pdfTheme.colors.textMuted,
    borderTopWidth: 1,
    borderTopColor: pdfTheme.colors.border,
    paddingTop: 8,
  },

  // Table
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: pdfTheme.colors.border,
  },

  tableHeader: {
    flexDirection: 'row' as const,
    backgroundColor: pdfTheme.colors.backgroundSubtle,
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.colors.border,
  },

  tableRow: {
    flexDirection: 'row' as const,
    borderBottomWidth: 1,
    borderBottomColor: pdfTheme.colors.backgroundSubtle,
  },

  tableCell: {
    padding: 6,
    fontSize: pdfTheme.fontSizes.body,
  },

  tableCellHeader: {
    padding: 8,
    fontSize: pdfTheme.fontSizes.body,
    fontWeight: 600,
  },

  // Cards
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: pdfTheme.colors.border,
    borderRadius: 4,
    marginBottom: pdfTheme.spacing.paragraph,
  },

  cardHighlight: {
    padding: 12,
    backgroundColor: pdfTheme.colors.backgroundSubtle,
    borderRadius: 4,
    marginBottom: pdfTheme.spacing.paragraph,
  },
} as const;

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
 * Format date for PDF display
 */
export function formatDate(
  date: Date | string,
  format: 'short' | 'medium' | 'long' = 'medium'
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  switch (format) {
    case 'short':
      return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
    case 'long':
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    case 'medium':
    default:
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

/**
 * Get current timestamp for PDF footer
 */
export function getGeneratedTimestamp(): string {
  return `Generated ${formatDate(new Date(), 'medium')} at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * Copyright notice text
 */
export function getCopyrightText(year = new Date().getFullYear()): string {
  return `${year} Press On Ventures. Confidential.`;
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
