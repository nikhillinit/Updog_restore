/**
 * Capital Allocation Types and Zod Schemas
 *
 * Per CA-SEMANTIC-LOCK.md:
 * - Hybrid conservation model (cash + capacity)
 * - Integer cents for all monetary values
 * - Basis points (1e7 scale) for weights
 *
 * @see docs/CA-SEMANTIC-LOCK.md
 */

import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

/** Far future date for sorting null/empty dates last */
export const FAR_FUTURE = '9999-12-31';

/** Scale for weight normalization (1e7 for 7-decimal precision) */
export const WEIGHT_SCALE = 10_000_000;

/** Tolerance for weight sum validation (0.1%) */
export const WEIGHT_SUM_TOLERANCE = 0.001;

// =============================================================================
// Primitive Schemas
// =============================================================================

/** Canonical date format: YYYY-MM-DD (zero-padded) */
export const CanonicalDateSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Date must be YYYY-MM-DD format')
  .or(z.literal(''))
  .or(z.null())
  .optional();

/** Non-negative integer for cents */
export const CentsSchema = z.number().int().nonnegative();

/** Integer that can be negative (for recalls) */
export const SignedCentsSchema = z.number().int();

/** Percentage as decimal (0-1 range, can exceed for edge cases) */
export const PercentageSchema = z.number().min(0).max(1);

/** Percentage that can exceed 1.0 (for truth case flexibility) */
export const FlexiblePercentageSchema = z.number().min(0);

// =============================================================================
// Flow Schemas
// =============================================================================

export const CashFlowSchema = z.object({
  date: z.string(), // Canonical YYYY-MM-DD
  amount: z.number(), // In input units (dollars or $M)
  amountCents: z.number().int().optional(), // Normalized to cents
  type: z.enum(['contribution', 'distribution', 'deployment']).optional(),
});

export type CashFlow = z.infer<typeof CashFlowSchema>;

export const FlowsInputSchema = z.object({
  contributions: z.array(CashFlowSchema).optional().default([]),
  distributions: z.array(CashFlowSchema).optional().default([]),
});

export type FlowsInput = z.infer<typeof FlowsInputSchema>;

// =============================================================================
// Cohort Schemas
// =============================================================================

export const CohortInputSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  start_date: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(), // Alternative casing
  end_date: z.string().optional().nullable(),
  weight: z.number().optional(),
  max_allocation: z.number().optional(), // Per-cohort cap
});

export type CohortInput = z.infer<typeof CohortInputSchema>;

export const CohortOutputSchema = z.object({
  cohort: z.string(), // Display name (e.g., "2024")
  amount: z.number(), // In output units (same as input)
  amountCents: z.number().int().optional(), // Internal cents representation
  type: z.enum(['planned', 'deployed']).optional().default('planned'),
});

export type CohortOutput = z.infer<typeof CohortOutputSchema>;

// =============================================================================
// Fund and Constraints Schemas
// =============================================================================

export const FundInputSchema = z.object({
  commitment: z.number(), // Total fund commitment
  vintage_year: z.number().optional(),
  target_reserve_pct: FlexiblePercentageSchema.optional().nullable(),
  reserve_policy: z.enum(['static_pct', 'dynamic_ratio']).optional(),
  // Explicit unit configuration (preferred over inference)
  units: z.enum(['millions', 'raw']).optional(),
});

export type FundInput = z.infer<typeof FundInputSchema>;

export const ConstraintsInputSchema = z.object({
  min_cash_buffer: z.number().optional().nullable(),
  max_allocation_per_cohort: z.number().optional().nullable(),
  max_deployment_rate: z.number().optional().nullable(),
});

export type ConstraintsInput = z.infer<typeof ConstraintsInputSchema>;

export const TimelineInputSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  rebalance_frequency: z.enum(['quarterly', 'monthly', 'annual']).optional().default('quarterly'),
});

export type TimelineInput = z.infer<typeof TimelineInputSchema>;

// =============================================================================
// Engine Input Schema (Normalized)
// =============================================================================

export const CAEngineInputSchema = z.object({
  fund: FundInputSchema,
  constraints: ConstraintsInputSchema.optional().default({}),
  timeline: TimelineInputSchema.optional().default({}),
  flows: FlowsInputSchema.optional().default({ contributions: [], distributions: [] }),
  cohorts: z.array(CohortInputSchema).optional().default([]),

  // Normalized fields (populated by adapter)
  commitmentCents: z.number().int().optional(),
  minCashBufferCents: z.number().int().optional(),
  effectiveBufferCents: z.number().int().optional(),
  unitScale: z.number().optional(), // 1 for dollars, 1_000_000 for $M
});

export type CAEngineInput = z.infer<typeof CAEngineInputSchema>;

// =============================================================================
// Violation Schemas
// =============================================================================

export const ViolationTypeSchema = z.enum([
  'buffer_breach',
  'over_allocation',
  'cap_exceeded',
  'negative_balance',
  'negative_capacity',
]);

export type ViolationType = z.infer<typeof ViolationTypeSchema>;

export const ViolationSeveritySchema = z.enum(['warning', 'error']);

export type ViolationSeverity = z.infer<typeof ViolationSeveritySchema>;

export const ViolationSchema = z.object({
  type: ViolationTypeSchema,
  severity: ViolationSeveritySchema,
  period: z.string().optional().nullable(),
  cohort: z.string().optional().nullable(),
  message: z.string(),
  expected: z.number().optional(),
  actual: z.number().optional(),
});

export type Violation = z.infer<typeof ViolationSchema>;

// =============================================================================
// Time Series Schemas
// =============================================================================

export const ReserveBalancePointSchema = z.object({
  date: z.string(),
  reserve_balance: z.number(),
  reserveBalanceCents: z.number().int().optional(),
  ending_cash: z.number().optional(),
  endingCashCents: z.number().int().optional(),
  effective_buffer: z.number().optional(),
  effectiveBufferCents: z.number().int().optional(),
});

export type ReserveBalancePoint = z.infer<typeof ReserveBalancePointSchema>;

// =============================================================================
// Engine Output Schema
// =============================================================================

export const CAEngineOutputSchema = z.object({
  // Primary outputs
  reserve_balance: z.number(),
  reserveBalanceCents: z.number().int().optional(),

  // Allocations (always present, even if empty)
  allocations_by_cohort: z.array(CohortOutputSchema).default([]),

  // Time series (always present, even if empty)
  reserve_balance_over_time: z.array(ReserveBalancePointSchema).default([]),

  // Capacity tracking
  remaining_capacity: z.number().optional(),
  remainingCapacityCents: z.number().int().optional(),
  cumulative_deployed: z.number().optional(),
  cumulativeDeployedCents: z.number().int().optional(),

  // Violations (always present, even if empty)
  violations: z.array(ViolationSchema).default([]),

  // Metadata
  ending_cash: z.number().optional(),
  endingCashCents: z.number().int().optional(),
  effective_buffer: z.number().optional(),
  effectiveBufferCents: z.number().int().optional(),
});

export type CAEngineOutput = z.infer<typeof CAEngineOutputSchema>;

// =============================================================================
// Internal Types (not for external use)
// =============================================================================

/** Internal cohort representation with all computed fields */
export interface InternalCohort {
  id: string; // Internal ID (may be prefixed for implicit cohorts)
  name: string; // Display name
  startDate: string; // Canonical YYYY-MM-DD
  endDate: string | null;
  weightBps: number; // Weight in basis points (1e7 scale)
  maxAllocationCents: number | null; // Per-cohort cap in cents
  allocationCents: number; // Computed allocation
  type: 'planned' | 'deployed';
}

/** Internal cash ledger state */
export interface CashLedgerState {
  startingCashCents: number;
  contributionsCents: number;
  distributionsCents: number;
  deployedCashCents: number;
  endingCashCents: number;
}

/** Internal capacity state */
export interface CapacityState {
  commitmentCents: number;
  plannedCapacityCents: number;
  remainingCapacityCents: number;
}

// =============================================================================
// Type Guards
// =============================================================================

export function isImplicitCohort(cohort: InternalCohort): boolean {
  return cohort.id.startsWith('_implicit_');
}

export function isValidCanonicalDate(date: string | null | undefined): boolean {
  if (date === null || date === undefined || date === '') {
    return true; // Empty/null dates are valid (use FAR_FUTURE)
  }
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date);
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an empty engine output with all arrays present.
 * Per CA-SEMANTIC-LOCK.md Section 4.4: Arrays MUST be present (even if empty).
 */
export function createEmptyOutput(): CAEngineOutput {
  return {
    reserve_balance: 0,
    reserveBalanceCents: 0,
    allocations_by_cohort: [],
    reserve_balance_over_time: [],
    violations: [],
    remaining_capacity: 0,
    remainingCapacityCents: 0,
    cumulative_deployed: 0,
    cumulativeDeployedCents: 0,
  };
}

/**
 * Create a violation with proper structure.
 */
export function createViolation(
  type: ViolationType,
  message: string,
  options: {
    severity?: ViolationSeverity;
    period?: string;
    cohort?: string;
    expected?: number;
    actual?: number;
  } = {}
): Violation {
  return {
    type,
    severity: options.severity ?? (type === 'negative_balance' || type === 'negative_capacity' ? 'error' : 'warning'),
    period: options.period ?? null,
    cohort: options.cohort ?? null,
    message,
    expected: options.expected,
    actual: options.actual,
  };
}
