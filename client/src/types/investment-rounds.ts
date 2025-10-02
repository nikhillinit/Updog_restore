/**
 * Investment Rounds Type Definitions
 * Based on Q2 2025 US VC Benchmarks (PitchBook, Crunchbase, Carta)
 *
 * Combines:
 * - Valuation modeling (Pre/Post-money)
 * - Portfolio progression (Graduation/Exit/Failure rates)
 * - Timing expectations (Months to graduate/exit)
 * - Exit modeling (Exit valuations)
 */

export type ValuationType = 'Pre-Money' | 'Post-Money';

export type StageName =
  | 'Pre-Seed'
  | 'Seed'
  | 'Series A'
  | 'Series B'
  | 'Series C'
  | 'Series D+';

/**
 * Core Investment Round Model
 * All monetary values in USD millions
 * All rates in percentages (0-100)
 * All durations in months
 */
export interface InvestmentRound {
  // Identity
  id: string;
  name: StageName;

  // Deal Structure & Valuation
  roundSize: number;              // Median round size ($M)
  valuationType: ValuationType;    // User selects Pre or Post
  valuation: number;               // User input (pre OR post based on type)
  preMoney: number;                // Computed if Post-Money selected
  postMoney: number;               // Computed if Pre-Money selected
  esopPct: number;                 // ESOP pool % (post-round diluted %)

  // Portfolio Progression Rates (must sum to 100%)
  graduationRate: number;          // % advancing to next round
  exitRate: number;                // % exiting at this stage
  failureRate: number;             // Auto-calculated: 100 - grad - exit (read-only)

  // Timing & Duration
  monthsToGraduate: number;        // Time spent in stage before advancing
  monthsToExit: number;            // Time from financing to exit (for exiting cohort)

  // Exit Modeling
  exitValuation: number;           // Median exit value ($M) for companies exiting here

  // Metadata
  benchmarkSource?: string;        // e.g., "PitchBook Q2 2025"
  notes?: string;                  // e.g., "Down rounds peaked ~24% in 2023"
  isCustom?: boolean;              // User modified from benchmark defaults
}

/**
 * Validation result for tri-rate model
 */
export interface RateValidation {
  isValid: boolean;
  totalRate: number;
  error?: string;
}

/**
 * Computed metrics for summary display
 */
export interface RoundSummary {
  // Valuation summary
  totalRoundSize: number;          // Sum of all round sizes
  averagePreMoney: number;         // Weighted avg pre-money
  averagePostMoney: number;        // Weighted avg post-money

  // ESOP summary
  averageEsop: number;             // Weighted avg ESOP %
  esopRange: { min: number; max: number };

  // Progression summary
  averageGraduationRate: number;   // Weighted avg graduation
  averageExitRate: number;         // Weighted avg exit
  averageFailureRate: number;      // Weighted avg failure

  // Timing summary
  averageTimeToGraduate: number;   // Weighted avg months to graduate
  averageTimeToExit: number;       // Weighted avg months to exit
  totalFundLifeMonths: number;     // Sum of all stage durations

  // Exit summary
  weightedExitValuation: number;   // Exit rate weighted avg exit value
  expectedExitCount: number;       // Expected # of exits based on rates
}

/**
 * Form state for the Investment Rounds step
 */
export interface InvestmentRoundsState {
  rounds: InvestmentRound[];
  summary?: RoundSummary;
  validationErrors: Record<string, string[]>;
  isDirty: boolean;
  lastModified?: Date;
}

/**
 * Helper type for round updates
 */
export type RoundUpdate = Partial<Omit<InvestmentRound, 'id' | 'failureRate' | 'preMoney' | 'postMoney'>>;
