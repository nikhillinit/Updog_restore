/**
 * Wizard Fee Preview Utilities
 *
 * Simple fee preview calculator for wizard forms.
 * Complements the tier-based system in fees.ts with a simpler
 * basis + step-down model suitable for quick previews.
 *
 * IMPORTANT: All monetary values in WHOLE DOLLARS (integers)
 */

export type FeeBasis = 'committed' | 'called' | 'nav';

export interface FeePreviewInput {
  committedCapitalUSD: number;
  fundLifeYears: number; // e.g., 10
  feeCutoverYear: number; // e.g., 6 means years 1..5 early, 6..life late
  mgmtFeeEarlyPct: number; // 0..100
  mgmtFeeLatePct: number; // 0..100

  // Optional schedules for Called/NAV bases
  // Year is 1-indexed, cumulative amounts
  calledByYearUSD?: Array<{ year: number; cumulativeCalledUSD: number }>;
  navByYearUSD?: Array<{ year: number; navUSD: number }>;

  // Optional: investment period for called fallback
  investmentPeriodYears?: number; // default 5 if omitted
}

export interface AnnualFeeRow {
  year: number;
  basisAmountUSD: number;
  feePct: number;
  feeUSD: number;
}

export interface FeePreview {
  rows: AnnualFeeRow[];
  totalUSD: number;
  pctOfFund: number; // totalUSD / committedCapitalUSD * 100
}

/**
 * Compute fee preview by basis type
 *
 * Generates year-by-year fee schedule with step-down support.
 * Supports committed capital, called capital, and NAV bases.
 *
 * @param basis - Fee calculation basis
 * @param input - Preview input parameters
 * @returns Fee preview with annual breakdown
 *
 * @example
 * const preview = computeFeePreview('committed', {
 *   committedCapitalUSD: 20_000_000,
 *   fundLifeYears: 10,
 *   feeCutoverYear: 6,
 *   mgmtFeeEarlyPct: 2.0,
 *   mgmtFeeLatePct: 1.5,
 * });
 * // preview.rows[0].feeUSD === 400,000 (2% of $20M for year 1)
 */
export function computeFeePreview(basis: FeeBasis, input: FeePreviewInput): FeePreview {
  const {
    committedCapitalUSD,
    fundLifeYears,
    feeCutoverYear,
    mgmtFeeEarlyPct,
    mgmtFeeLatePct,
    calledByYearUSD,
    navByYearUSD,
    investmentPeriodYears = 5,
  } = input;

  const rows: AnnualFeeRow[] = [];
  let total = 0;

  for (let y = 1; y <= fundLifeYears; y++) {
    const pct = y < feeCutoverYear ? mgmtFeeEarlyPct : mgmtFeeLatePct;

    let basisAmount = 0;
    if (basis === 'committed') {
      basisAmount = committedCapitalUSD;
    } else if (basis === 'called') {
      // Use provided schedule or fallback to linear call over investment period
      if (calledByYearUSD && calledByYearUSD.length) {
        const item =
          calledByYearUSD.find((r) => r.year === y) ?? calledByYearUSD[calledByYearUSD.length - 1];
        basisAmount = item?.cumulativeCalledUSD ?? committedCapitalUSD;
      } else {
        const perYear = Math.floor(committedCapitalUSD / investmentPeriodYears);
        const calledCum = Math.min(y, investmentPeriodYears) * perYear;
        basisAmount = y <= investmentPeriodYears ? calledCum : investmentPeriodYears * perYear; // plateau after invest period
      }
    } else {
      // NAV basis
      if (navByYearUSD && navByYearUSD.length) {
        const item = navByYearUSD.find((r) => r.year === y) ?? navByYearUSD[navByYearUSD.length - 1];
        basisAmount = item?.navUSD ?? 0;
      } else {
        // Conservative fallback: NAV equals called (same as above)
        const perYear = Math.floor(committedCapitalUSD / investmentPeriodYears);
        const calledCum = Math.min(y, investmentPeriodYears) * perYear;
        basisAmount = y <= investmentPeriodYears ? calledCum : investmentPeriodYears * perYear;
      }
    }

    const feeUSD = Math.round(basisAmount * (pct / 100));
    rows.push({ year: y, basisAmountUSD: basisAmount, feePct: pct, feeUSD });
    total += feeUSD;
  }

  return {
    rows,
    totalUSD: total,
    pctOfFund: committedCapitalUSD > 0 ? (total / committedCapitalUSD) * 100 : 0,
  };
}

/**
 * Get fee basis display name
 *
 * @param basis - Fee basis type
 * @returns Human-readable display name
 */
export function getFeeBasisDisplayName(basis: FeeBasis): string {
  const displayNames: Record<FeeBasis, string> = {
    committed: 'Committed Capital',
    called: 'Called Capital',
    nav: 'Net Asset Value (NAV)',
  };

  return displayNames[basis] || basis;
}
