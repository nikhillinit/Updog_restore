/**
 * Fee Truth Case Adapter
 *
 * Adapts fee truth case JSON structure to production function signatures.
 * Handles unit conversions ($M -> whole $) and field mapping.
 *
 * @see docs/fees.truth-cases.json - Truth case definitions
 * @see client/src/lib/fees-wizard.ts - Production fee calculation
 */

import type { FeePreviewInput, FeeBasis } from '@/lib/fees-wizard';

/**
 * Fee truth case structure (from JSON)
 */
export interface FeeTruthCase {
  id: string;
  category: string;
  description: string;
  input: {
    fundSize: number; // $M
    feeRate: number; // % (0-100 scale)
    basis: 'committed' | 'called' | 'fmv';
    fundTerm: number;
    stepDown?: {
      afterYear: number;
      newRate: number;
    };
    calledCapitalSchedule?: number[]; // $M cumulative by year
    portfolioFmvSchedule?: number[]; // $M by year
  };
  expectedOutput: {
    totalFees: number; // $M
    yearlyFees: number[]; // $M per year
    averageAnnualFee: number; // $M
  };
  tolerance: number;
  notes: string;
  tags: string[];
}

/**
 * Scale factor: truth cases use $M, production uses whole $
 */
const MILLION = 1_000_000;

/**
 * Adapt fee truth case to production function input
 *
 * Handles:
 * - Scaling $M to whole dollars
 * - Mapping 'fmv' basis to 'nav'
 * - Converting stepDown.afterYear to feeCutoverYear
 * - Reshaping capital schedules
 *
 * @param tc - Fee truth case from JSON
 * @returns Adapted input for computeFeePreview()
 */
export function adaptFeeTruthCase(tc: FeeTruthCase): { basis: FeeBasis; input: FeePreviewInput } {
  const { input } = tc;

  // Map basis: 'fmv' in truth cases -> 'nav' in production
  const basis: FeeBasis = input.basis === 'fmv' ? 'nav' : input.basis;

  // Build preview input with proper scaling
  const previewInput: FeePreviewInput = {
    // Scale $M to whole $
    committedCapitalUSD: input.fundSize * MILLION,
    fundLifeYears: input.fundTerm,

    // Step-down: afterYear=5 means years 1-5 early rate, year 6+ late rate
    // So feeCutoverYear = afterYear + 1
    feeCutoverYear: input.stepDown?.afterYear ? input.stepDown.afterYear + 1 : input.fundTerm + 1, // No step-down = late rate never applies

    mgmtFeeEarlyPct: input.feeRate,
    mgmtFeeLatePct: input.stepDown?.newRate ?? input.feeRate,

    // Called capital schedule: reshape array to expected format
    calledByYearUSD: input.calledCapitalSchedule?.map((cum, i) => ({
      year: i + 1,
      cumulativeCalledUSD: cum * MILLION,
    })),

    // FMV/NAV schedule: reshape array to expected format
    navByYearUSD: input.portfolioFmvSchedule?.map((fmv, i) => ({
      year: i + 1,
      navUSD: fmv * MILLION,
    })),
  };

  return { basis, input: previewInput };
}

/**
 * Scale expected output from $M to whole $
 *
 * @param expectedOutput - Expected output from truth case
 * @returns Scaled values in whole dollars
 */
export function scaleExpectedOutput(expectedOutput: FeeTruthCase['expectedOutput']): {
  totalFeesUSD: number;
  yearlyFeesUSD: number[];
  averageAnnualFeeUSD: number;
} {
  return {
    totalFeesUSD: expectedOutput.totalFees * MILLION,
    yearlyFeesUSD: expectedOutput.yearlyFees.map((f) => f * MILLION),
    averageAnnualFeeUSD: expectedOutput.averageAnnualFee * MILLION,
  };
}
