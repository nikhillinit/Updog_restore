/**
 * Coverage Calculation Helper
 *
 * Calculates data coverage percentages for cohort analysis.
 * Coverage is used for V2 gating and quality indicators.
 */

/**
 * Coverage summary for cohort analysis
 */
export interface CoverageSummary {
  /** Percentage of lots with valid paid-in data (0-1) */
  paidInPct: number;
  /** Percentage of lots with valid distribution data (0-1) */
  distributionsPct: number;
  /** Percentage of investments with valid vintage data (0-1) */
  vintagePct: number;
  /** Percentage of investments with marks data (0-1), optional */
  marksPct?: number;
  /** Overall coverage (minimum of relevant percentages, 0-1) */
  overallPct: number;
}

/**
 * Data counts for coverage calculation
 */
export interface CoverageData {
  /** Total number of lots */
  totalLots: number;
  /** Lots with valid acquisition date and cost basis */
  lotsWithPaidIn: number;
  /** Lots with valid disposal date and proceeds */
  lotsWithDistributions: number;
  /** Total number of investments */
  totalInvestments: number;
  /** Investments with valid investment date or vintage override */
  investmentsWithVintage: number;
  /** Investments with marks data (optional) */
  investmentsWithMarks?: number;
}

/**
 * Calculates coverage percentage safely
 *
 * @param count - Number of items with data
 * @param total - Total number of items
 * @returns Percentage as decimal (0-1), 1.0 if total is 0
 */
export function calculatePercentage(count: number, total: number): number {
  if (total === 0) {
    // No items means 100% coverage (nothing to cover)
    return 1.0;
  }
  return Math.min(1.0, Math.max(0.0, count / total));
}

/**
 * Calculates coverage summary from data counts
 *
 * @param data - Coverage data counts
 * @returns Coverage summary with percentages
 */
export function calculateCoverage(data: CoverageData): CoverageSummary {
  const paidInPct = calculatePercentage(data.lotsWithPaidIn, data.totalLots);
  const distributionsPct = calculatePercentage(data.lotsWithDistributions, data.totalLots);
  const vintagePct = calculatePercentage(data.investmentsWithVintage, data.totalInvestments);

  // Overall is the minimum of relevant coverages
  // For V1: paid-in, distributions, vintage
  // For V2 with marks: include marks
  const relevantCoverages = [paidInPct, distributionsPct, vintagePct];

  // Calculate marks coverage if data is provided
  if (data.investmentsWithMarks !== undefined) {
    const marksPct = calculatePercentage(data.investmentsWithMarks, data.totalInvestments);
    relevantCoverages.push(marksPct);

    return {
      paidInPct,
      distributionsPct,
      vintagePct,
      marksPct,
      overallPct: Math.min(...relevantCoverages),
    };
  }

  return {
    paidInPct,
    distributionsPct,
    vintagePct,
    overallPct: Math.min(...relevantCoverages),
  };
}

/**
 * Coverage threshold for V2 investment-level performance metrics
 */
export const V2_COVERAGE_THRESHOLD = 0.9;

/**
 * Checks if coverage meets V2 gating threshold
 *
 * @param coverage - Coverage summary
 * @returns true if coverage meets V2 threshold
 */
export function meetsV2CoverageThreshold(coverage: CoverageSummary): boolean {
  return coverage.overallPct >= V2_COVERAGE_THRESHOLD;
}

/**
 * Gets a human-readable coverage status
 *
 * @param coverage - Coverage summary
 * @returns Status string with percentage
 */
export function getCoverageStatus(coverage: CoverageSummary): {
  status: 'good' | 'acceptable' | 'poor';
  message: string;
} {
  const pct = Math.round(coverage.overallPct * 100);

  if (coverage.overallPct >= 0.9) {
    return {
      status: 'good',
      message: `Data coverage: ${pct}%`,
    };
  }

  if (coverage.overallPct >= 0.7) {
    return {
      status: 'acceptable',
      message: `Data coverage: ${pct}% (some metrics may be limited)`,
    };
  }

  return {
    status: 'poor',
    message: `Data coverage: ${pct}% (improve data quality for accurate metrics)`,
  };
}

/**
 * Generates coverage warnings based on individual metrics
 *
 * @param coverage - Coverage summary
 * @returns Array of warning messages
 */
export function getCoverageWarnings(coverage: CoverageSummary): string[] {
  const warnings: string[] = [];

  if (coverage.paidInPct < 0.9) {
    const pct = Math.round(coverage.paidInPct * 100);
    warnings.push(`Only ${pct}% of lots have valid cost basis data`);
  }

  if (coverage.distributionsPct < 0.9) {
    const pct = Math.round(coverage.distributionsPct * 100);
    warnings.push(`Only ${pct}% of lots have distribution data`);
  }

  if (coverage.vintagePct < 0.9) {
    const pct = Math.round(coverage.vintagePct * 100);
    warnings.push(`Only ${pct}% of investments have vintage dates`);
  }

  if (coverage.marksPct !== undefined && coverage.marksPct < 0.9) {
    const pct = Math.round(coverage.marksPct * 100);
    warnings.push(`Only ${pct}% of investments have marks (TVPI unavailable)`);
  }

  return warnings;
}

/**
 * Creates an empty coverage summary (100% coverage with no data)
 *
 * @returns Coverage summary with 100% for all metrics
 */
export function createEmptyCoverage(): CoverageSummary {
  return {
    paidInPct: 1.0,
    distributionsPct: 1.0,
    vintagePct: 1.0,
    overallPct: 1.0,
  };
}
