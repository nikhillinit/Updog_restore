/**
 * Report data completeness model.
 *
 * Discriminated union for fields that may be missing or not applicable.
 * Pre-render validation rejects reports with missing required fields.
 *
 * @module server/services/pdf-generation/completeness
 */

import type { ReportMetrics } from './types.js';

/** A field that may or may not be available from upstream data. */
export type ReportField<T> =
  | { status: 'present'; value: T }
  | { status: 'missing'; source: string }
  | { status: 'not_applicable' };

export interface ReportCompletenessResult {
  complete: boolean;
  missingFields: Array<{ field: string; source: string }>;
}

const METRIC_SOURCE = 'getFundPerformance or calculateFundMetrics';
const PORTFOLIO_SOURCE = 'storage.getPortfolioCompanies';

/**
 * Validate that required metrics are available before building a quarterly report.
 * Checks both object presence and individual field validity (finite numbers).
 * Returns structured error info when data is incomplete.
 */
export function validateQuarterlyMetrics(
  metrics: ReportMetrics | null | undefined
): ReportCompletenessResult {
  if (!metrics) {
    return {
      complete: false,
      missingFields: [
        { field: 'irr', source: METRIC_SOURCE },
        { field: 'tvpi', source: METRIC_SOURCE },
        { field: 'dpi', source: METRIC_SOURCE },
        { field: 'portfolioCompanies', source: PORTFOLIO_SOURCE },
      ],
    };
  }

  const missing: ReportCompletenessResult['missingFields'] = [];

  if (!Number.isFinite(metrics.irr)) missing.push({ field: 'irr', source: METRIC_SOURCE });
  if (!Number.isFinite(metrics.tvpi)) missing.push({ field: 'tvpi', source: METRIC_SOURCE });
  if (!Number.isFinite(metrics.dpi)) missing.push({ field: 'dpi', source: METRIC_SOURCE });
  if (!Array.isArray(metrics.portfolioCompanies)) {
    missing.push({ field: 'portfolioCompanies', source: PORTFOLIO_SOURCE });
  }

  return { complete: missing.length === 0, missingFields: missing };
}

/** Error code returned when report generation cannot proceed due to missing data. */
export const REPORT_DATA_INCOMPLETE = 'REPORT_DATA_INCOMPLETE' as const;

export class ReportDataIncompleteError extends Error {
  readonly code = REPORT_DATA_INCOMPLETE;
  readonly missingFields: ReportCompletenessResult['missingFields'];

  constructor(result: ReportCompletenessResult) {
    const fieldNames = result.missingFields.map((f) => f.field).join(', ');
    super(`Report data incomplete. Missing: ${fieldNames}`);
    this.name = 'ReportDataIncompleteError';
    this.missingFields = result.missingFields;
  }
}
