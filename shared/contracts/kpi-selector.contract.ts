/**
 * KPI SELECTOR CONTRACT (FROZEN v1.0)
 *
 * This contract is FROZEN and serves as the single source of truth for all KPI calculations.
 * Any changes require version increment and migration strategy.
 *
 * Design Principles:
 * - Pure, memoized selectors for deterministic outputs
 * - Support all fee basis variants (committed/called/NAV/invested)
 * - Handle recycling mechanics correctly
 * - Waterfall-aware calculations
 */

import { z } from 'zod';
import { WaterfallTypeSchema } from '../types/forbidden-features';

export { WaterfallTypeSchema };

// ============================================================================
// CORE DATA TYPES
// ============================================================================

export const FeeBasisSchema = z.enum([
  'committed', // Fee on total committed capital
  'called', // Fee on capital called to date
  'cumulative_called', // Fee on cumulative called capital
  'invested', // Fee on net invested capital (cost basis)
  'nav', // Fee on current Net Asset Value
  'fmv', // Fee on Fair Market Value
]);

export type FeeBasis = z.infer<typeof FeeBasisSchema>;

export const RecyclingConfigSchema = z.object({
  enabled: z.boolean(),
  maxRecyclePercent: z.number().min(0).max(200), // e.g., 120% = can recycle up to 120% of committed
  recycleOnlyProfits: z.boolean(), // If true, only recycle gains, not RoC
});

// ============================================================================
// KPI RESPONSE CONTRACT (Primary Output)
// ============================================================================

export const KPIResponseSchema = z.object({
  // Metadata
  fundId: z.string().uuid(),
  asOf: z.string().datetime(), // ISO 8601 timestamp
  currency: z.string().length(3), // ISO 4217 currency code

  // Capital Structure
  committed: z.number().nonnegative(),
  called: z.number().nonnegative(),
  uncalled: z.number().nonnegative(),
  invested: z.number().nonnegative(), // Net invested capital (called - recycled RoC)

  // Valuation & Returns
  nav: z.number(), // Can be negative in rare cases
  distributions: z.number().nonnegative(),
  realizedValue: z.number(), // Total cash returned to LPs
  unrealizedValue: z.number(), // Current portfolio value

  // Performance Metrics
  dpi: z.number().nonnegative(), // Distributions / Paid-In Capital
  rvpi: z.number().nonnegative(), // Residual Value / Paid-In Capital
  tvpi: z.number().nonnegative(), // Total Value / Paid-In Capital
  irr: z.number(), // Can be negative
  moic: z.number().nonnegative(), // Multiple on Invested Capital

  // Fee Calculations
  managementFees: z.object({
    basis: FeeBasisSchema,
    totalAccrued: z.number().nonnegative(),
    totalPaid: z.number().nonnegative(),
    currentPeriodFee: z.number().nonnegative(),
    effectiveRate: z.number().nonnegative(), // Actual rate after step-downs
  }),

  // Recycling Impact (critical for correct KPI calculation)
  recycling: z
    .object({
      totalRecycled: z.number().nonnegative(),
      availableCapacity: z.number().nonnegative(),
      recycledCount: z.number().int().nonnegative(), // Number of recycling events
    })
    .optional(),

  // Waterfall Preview (if distributions occurred)
  waterfall: z
    .object({
      type: WaterfallTypeSchema,
      lpShare: z.number().nonnegative(),
      gpShare: z.number().nonnegative(),
      preferredReturnAccrued: z.number().nonnegative(),
      carryEarned: z.number().nonnegative(),
      clawbackObligation: z.number().nonnegative().optional(), // If GP owes back carry
    })
    .optional(),
});

export type KPIResponse = z.infer<typeof KPIResponseSchema>;

// ============================================================================
// KPI CALCULATION INPUT (What selectors need)
// ============================================================================

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    'capital_call',
    'distribution',
    'valuation_update',
    'fee_payment',
    'investment',
    'exit',
  ]),
  date: z.string().datetime(),
  amount: z.number(),
  companyId: z.string().uuid().optional(),
  isRecycled: z.boolean().default(false),
});

export const FundLedgerSchema = z.object({
  fundId: z.string().uuid(),
  committedCapital: z.number().nonnegative(),
  transactions: z.array(TransactionSchema),
  recyclingConfig: RecyclingConfigSchema,

  // Fee structure
  managementFeeRate: z.number().nonnegative(),
  feeBasis: FeeBasisSchema,
  feeBasisTransitions: z
    .array(
      z.object({
        effectiveDate: z.string().datetime(),
        newBasis: FeeBasisSchema,
        newRate: z.number().nonnegative().optional(),
      })
    )
    .optional(),

  // Carry structure
  carryRate: z.number().nonnegative(),
  waterfallType: WaterfallTypeSchema,
  catchupProvision: z.number().min(0).max(100).optional(), // e.g., 100 = 100% GP catch-up
});

export type FundLedger = z.infer<typeof FundLedgerSchema>;

// ============================================================================
// SELECTOR FUNCTION SIGNATURES (Pure functions)
// ============================================================================

export interface KPISelectors {
  /**
   * Master selector - computes all KPIs from ledger
   * MUST be pure and memoized
   */
  calculateAllKPIs(ledger: FundLedger, asOf: Date): KPIResponse;

  /**
   * Individual metric selectors (for granular testing)
   */
  calculateDPI(distributions: number, paidInCapital: number): number;
  calculateRVPI(nav: number, paidInCapital: number): number;
  calculateTVPI(distributions: number, nav: number, paidInCapital: number): number;
  calculateIRR(cashFlows: Array<{ date: Date; amount: number }>): number;

  /**
   * Fee calculation with basis transitions
   */
  calculateManagementFees(
    ledger: FundLedger,
    asOf: Date,
    currentNAV: number
  ): KPIResponse['managementFees'];

  /**
   * Recycling impact on paid-in capital (CRITICAL)
   */
  calculateNetPaidInCapital(totalCalled: number, recycledRoC: number): number;

  /**
   * Waterfall distribution split
   */
  calculateWaterfall(
    totalDistributions: number,
    paidInCapital: number,
    carryRate: number,
    waterfallType: 'american',
    catchupPercent?: number
  ): KPIResponse['waterfall'];
}

// ============================================================================
// API ENDPOINT CONTRACT
// ============================================================================

export const KPIRequestSchema = z.object({
  fundId: z.string().uuid(),
  asOf: z.string().datetime().optional(), // Defaults to now
  includeWaterfall: z.boolean().default(false),
  includeRecycling: z.boolean().default(true),
});

export type KPIRequest = z.infer<typeof KPIRequestSchema>;

/**
 * API Endpoint: GET /api/funds/:fundId/kpis
 * Query params: asOf, includeWaterfall, includeRecycling
 * Response: KPIResponse (200) | ErrorResponse (4xx/5xx)
 */
export const KPI_ENDPOINT = '/api/funds/:fundId/kpis' as const;

// ============================================================================
// ERROR CODES
// ============================================================================

export const KPIErrorSchema = z.object({
  code: z.enum([
    'FUND_NOT_FOUND',
    'INVALID_DATE_RANGE',
    'INSUFFICIENT_DATA',
    'CALCULATION_ERROR',
    'FEE_BASIS_TRANSITION_CONFLICT',
    'RECYCLING_LIMIT_EXCEEDED',
  ]),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type KPIError = z.infer<typeof KPIErrorSchema>;
