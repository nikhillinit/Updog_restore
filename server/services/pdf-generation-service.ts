/**
 * Server-Side PDF Generation Service
 *
 * Public facade — re-exports types, data helpers, and PDF generators.
 * Internal modules live in ./pdf-generation/.
 *
 * @module server/services/pdf-generation-service
 */

// Types
export type {
  LPReportData,
  K1ReportData,
  QuarterlyReportData,
  ReportMetrics,
  CapitalAccountReportData,
} from './pdf-generation/types.js';

// Data fetchers (async)
export { fetchLPReportData, prefetchReportMetrics } from './pdf-generation/data-fetchers.js';

// Data builders (sync/pure — stable signatures, 63+ tests)
export {
  buildK1ReportData,
  buildQuarterlyReportData,
  buildCapitalAccountReportData,
} from './pdf-generation/data-builders.js';

// PDF generators
import { renderPdfToBuffer } from './pdf-generation/renderer.js';
import { K1TaxSummaryPDF } from './pdf-generation/k1-document.js';
import { QuarterlyReportPDF } from './pdf-generation/quarterly-document.js';
import { CapitalAccountStatementPDF } from './pdf-generation/capital-account-document.js';
import type {
  K1ReportData,
  QuarterlyReportData,
  CapitalAccountReportData,
} from './pdf-generation/types.js';

/** Generate K-1 Tax Summary PDF */
export async function generateK1PDF(data: K1ReportData): Promise<Buffer> {
  return renderPdfToBuffer(K1TaxSummaryPDF({ data }));
}

/** Generate Quarterly Report PDF */
export async function generateQuarterlyPDF(data: QuarterlyReportData): Promise<Buffer> {
  return renderPdfToBuffer(QuarterlyReportPDF({ data }));
}

/** Generate Capital Account Statement PDF */
export async function generateCapitalAccountPDF(data: CapitalAccountReportData): Promise<Buffer> {
  return renderPdfToBuffer(CapitalAccountStatementPDF({ data }));
}
