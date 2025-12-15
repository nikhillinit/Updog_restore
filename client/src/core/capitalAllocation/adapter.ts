/**
 * Capital Allocation Input Adapter
 *
 * Normalizes truth case inputs to engine inputs:
 * - Unit inference (detect $M vs raw dollars)
 * - Conversion to integer cents
 * - Cohort normalization (weights, sorting)
 * - Effective buffer calculation
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 3
 */

import {
  type CAEngineInput,
  type CohortInput,
  type InternalCohort,
  type CashFlow,
  FAR_FUTURE,
  WEIGHT_SCALE,
  WEIGHT_SUM_TOLERANCE,
} from './types';
import {
  inferUnitScale,
  detectUnitMismatch,
  toCentsWithInference,
  validateSanityCap,
  type ExplicitUnits,
} from './units';
import { dollarsToCents, roundPercentDerivedToCents } from './rounding';
import { normalizeWeightsToBps, normalizeWeightsLenient, WEIGHT_SCALE as LRM_WEIGHT_SCALE } from './allocateLRM';
import { sortAndValidateCohorts, isCanonicalDate } from './sorting';

// =============================================================================
// Truth Case Input Types
// =============================================================================

/**
 * Raw truth case input structure.
 * This matches the JSON format in truth case files.
 */
export interface TruthCaseInput {
  fund: {
    commitment: number;
    vintage_year?: number;
    target_reserve_pct?: number | null;
    reserve_policy?: 'static_pct' | 'dynamic_ratio';
    /** Pacing window in months (default 24) */
    pacing_window_months?: number;
    /** Explicit unit configuration (preferred over inference) */
    units?: 'millions' | 'raw';
  };
  constraints?: {
    min_cash_buffer?: number | null;
    /** Max allocation per cohort as percentage of commitment (e.g., 0.6 = 60%) */
    max_allocation_per_cohort?: number | null;
    max_deployment_rate?: number | null;
    /** Rebalance frequency (can be here or in timeline) */
    rebalance_frequency?: 'quarterly' | 'monthly' | 'annual';
  };
  timeline?: {
    start_date?: string;
    end_date?: string;
    rebalance_frequency?: 'quarterly' | 'monthly' | 'annual';
  };
  flows?: {
    contributions?: Array<{ date: string; amount: number }>;
    distributions?: Array<{ date: string; amount: number }>;
  };
  cohorts?: Array<{
    id?: string | number;
    name?: string;
    start_date?: string | null;
    startDate?: string | null;  // camelCase variant for flexibility
    end_date?: string | null;
    endDate?: string | null;    // camelCase variant for flexibility
    weight?: number;
    max_allocation?: number;
  }>;
}

/**
 * Normalized engine input with all monetary values in cents.
 */
export interface NormalizedInput {
  // Original values preserved for reference
  original: TruthCaseInput;

  // Unit scale applied (1 for dollars, 1_000_000 for $M)
  unitScale: number;

  // Monetary values in cents
  commitmentCents: number;
  minCashBufferCents: number;
  effectiveBufferCents: number;
  /** Max allocation per cohort as percentage (e.g., 0.6 = 60% of commitment) */
  maxAllocationPerCohortPct: number | null;

  // Flows in cents
  contributionsCents: CashFlow[];
  distributionsCents: CashFlow[];

  // Normalized cohorts
  cohorts: InternalCohort[];

  // Timeline
  startDate: string;
  endDate: string;
  rebalanceFrequency: 'quarterly' | 'monthly' | 'annual';

  // Pacing
  pacingWindowMonths: number;

  // Policy
  reservePolicy: 'static_pct' | 'dynamic_ratio';
  targetReservePct: number;
}

// =============================================================================
// Adapter Functions
// =============================================================================

/**
 * Adapt a truth case input to normalized engine input.
 *
 * Per CA-SEMANTIC-LOCK.md Section 3:
 * - Infer unit scale from commitment magnitude
 * - Apply same scale to ALL monetary fields
 * - Detect million-scale mismatches
 */
export function adaptTruthCaseInput(input: TruthCaseInput): NormalizedInput {
  // Step 1: Infer unit scale from commitment with explicit config support
  // Explicit units take precedence over inference (hybrid approach)
  const explicitUnits = input.fund.units as ExplicitUnits | undefined;
  const unitScale = inferUnitScale(input.fund.commitment, explicitUnits);

  // Step 2: Validate unit consistency (ratio-based mismatch detection)
  validateUnitConsistency(input, unitScale);

  // Step 3: Convert monetary values to cents with sanity check
  const commitmentCents = toCentsWithInference(input.fund.commitment, unitScale);
  validateSanityCap(commitmentCents, 'commitment', input.fund.commitment, unitScale);
  const targetReservePct = input.fund.target_reserve_pct ?? 0;
  const minCashBufferCents = input.constraints?.min_cash_buffer != null
    ? toCentsWithInference(input.constraints.min_cash_buffer, unitScale)
    : 0;

  // Step 4: Calculate effective buffer
  // Per Section 1.2: effective_buffer = max(min_cash_buffer, commitment * target_reserve_pct)
  const targetReserveCents = roundPercentDerivedToCents(commitmentCents * targetReservePct);
  const effectiveBufferCents = Math.max(minCashBufferCents, targetReserveCents);

  // Step 5: Convert flows to cents
  const contributionsCents = (input.flows?.contributions ?? []).map((flow) => ({
    date: flow.date,
    amount: flow.amount,
    amountCents: toCentsWithInference(flow.amount, unitScale),
    type: 'contribution' as const,
  }));

  const distributionsCents = (input.flows?.distributions ?? []).map((flow) => ({
    date: flow.date,
    amount: flow.amount,
    amountCents: toCentsWithInference(flow.amount, unitScale),
    type: 'distribution' as const,
  }));

  // Step 6: Normalize cohorts
  const cohorts = normalizeCohorts(input, unitScale, commitmentCents);

  // Step 7: Extract timeline
  const startDate = input.timeline?.start_date ?? deriveStartDate(input);
  const endDate = input.timeline?.end_date ?? deriveEndDate(input);
  // Check both locations for rebalance_frequency (constraints takes precedence)
  const rebalanceFrequency = input.constraints?.rebalance_frequency
    ?? input.timeline?.rebalance_frequency
    ?? 'quarterly';

  // Step 8: Pacing window
  const pacingWindowMonths = input.fund.pacing_window_months ?? 24;

  // Step 9: Max allocation per cohort (percentage, NOT converted to cents)
  // Truth cases use this as a percentage of commitment (e.g., 0.6 = 60%)
  const maxAllocationPerCohortPct = input.constraints?.max_allocation_per_cohort ?? null;

  return {
    original: input,
    unitScale,
    commitmentCents,
    minCashBufferCents,
    effectiveBufferCents,
    maxAllocationPerCohortPct,
    contributionsCents,
    distributionsCents,
    cohorts,
    startDate,
    endDate,
    rebalanceFrequency,
    pacingWindowMonths,
    reservePolicy: input.fund.reserve_policy ?? 'static_pct',
    targetReservePct,
  };
}

/**
 * Validate unit consistency across all monetary fields.
 * Per CA-SEMANTIC-LOCK.md Section 3.4: Detect million-scale mismatches.
 */
function validateUnitConsistency(input: TruthCaseInput, unitScale: number): void {
  const commitment = input.fund.commitment;
  if (commitment === 0) return; // Can't validate ratios

  const fields: Array<{ name: string; value: number }> = [];

  // Collect non-zero monetary fields
  if (input.constraints?.min_cash_buffer != null && input.constraints.min_cash_buffer !== 0) {
    fields.push({ name: 'min_cash_buffer', value: input.constraints.min_cash_buffer });
  }

  input.flows?.contributions?.forEach((c, i) => {
    if (c.amount !== 0) {
      fields.push({ name: `contributions[${i}]`, value: c.amount });
    }
  });

  input.flows?.distributions?.forEach((d, i) => {
    if (d.amount !== 0) {
      fields.push({ name: `distributions[${i}]`, value: d.amount });
    }
  });

  // Check for mismatches
  for (const field of fields) {
    if (detectUnitMismatch(commitment, field.value)) {
      throw new Error(
        `Million-scale mismatch detected:\n` +
        `  commitment=${commitment}\n` +
        `  ${field.name}=${field.value}\n` +
        `  Ratio: ${(field.value / commitment).toExponential(2)}\n` +
        `Fix: Ensure all monetary fields use the same unit scale (either $M or raw dollars).`
      );
    }
  }
}

/**
 * Detect if cohorts have lifecycle variation (non-overlapping date ranges).
 * Returns true if cohorts have different active periods, indicating that
 * global weight sum > 1.0 is acceptable (per-period normalization applies).
 */
function detectLifecycleVariation(cohorts: Array<{ start_date?: string; end_date?: string; startDate?: string; endDate?: string }>): boolean {
  if (cohorts.length <= 1) return false;

  // Check if all cohorts have the same date range
  const dateRanges = cohorts.map((c) => ({
    start: c.start_date ?? c.startDate ?? '0000-01-01',
    end: c.end_date ?? c.endDate ?? '9999-12-31',
  }));

  const firstRange = dateRanges[0];
  const allSame = dateRanges.every(
    (r) => r.start === firstRange.start && r.end === firstRange.end
  );

  // If any cohort has a different date range, there's lifecycle variation
  return !allSame;
}

/**
 * Normalize cohorts: validate weights, sort, create implicit if needed.
 */
function normalizeCohorts(
  input: TruthCaseInput,
  unitScale: number,
  commitmentCents: number
): InternalCohort[] {
  const rawCohorts = input.cohorts ?? [];

  // If no cohorts, create implicit cohort by vintage year
  if (rawCohorts.length === 0) {
    return [createImplicitCohort(input, commitmentCents)];
  }

  // Validate and normalize weights
  // For lifecycle cohorts (varying date ranges), use lenient normalization
  // to allow weights that don't sum to 1.0 globally
  const weights = rawCohorts.map((c) => c.weight ?? 0);
  const hasLifecycleVariation = detectLifecycleVariation(rawCohorts);
  const normalizedWeightsBps = hasLifecycleVariation
    ? normalizeWeightsLenient(weights)
    : normalizeWeightsToBps(weights);

  // Validate dates and sort
  const sortableCohorts = rawCohorts.map((c, index) => ({
    ...c,
    weightBps: normalizedWeightsBps[index],
    originalIndex: index,
  }));

  // Sort cohorts
  const sortedCohorts = sortAndValidateCohorts(sortableCohorts);

  // Convert to internal representation
  return sortedCohorts.map((c, sortedIndex) => {
    const id = String(c.id ?? c.name ?? `cohort_${sortedIndex}`);
    const maxAllocation = c.max_allocation != null
      ? toCentsWithInference(c.max_allocation, unitScale)
      : null;

    // Handle both snake_case (start_date) and camelCase (startDate) variants
    const rawStartDate = c.start_date ?? c.startDate;
    const rawEndDate = c.end_date ?? c.endDate;

    return {
      id,
      name: c.name ?? id,
      startDate: rawStartDate || FAR_FUTURE,
      endDate: rawEndDate ?? null,
      weightBps: c.weightBps,
      maxAllocationCents: maxAllocation,
      allocationCents: 0, // Computed later
      type: 'planned' as const,
    };
  });
}

/**
 * Create an implicit cohort based on vintage year.
 * Per CA-SEMANTIC-LOCK.md Section 5.3.
 */
function createImplicitCohort(input: TruthCaseInput, commitmentCents: number): InternalCohort {
  const year = deriveVintageYear(input);
  return {
    id: `_implicit_${year}`,
    name: String(year),
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    weightBps: WEIGHT_SCALE, // 100%
    maxAllocationCents: null,
    allocationCents: 0,
    type: 'planned',
  };
}

/**
 * Derive vintage year from input.
 * Priority: explicit vintage_year > timeline start_date > current year
 */
function deriveVintageYear(input: TruthCaseInput): number {
  if (input.fund.vintage_year != null) {
    return input.fund.vintage_year;
  }
  if (input.timeline?.start_date) {
    return parseInt(input.timeline.start_date.substring(0, 4), 10);
  }
  // Last resort: current year (UTC to avoid timezone issues)
  return new Date().getUTCFullYear();
}

/**
 * Derive start date from flows or default.
 */
function deriveStartDate(input: TruthCaseInput): string {
  const allDates: string[] = [];

  input.flows?.contributions?.forEach((c) => {
    if (c.date) allDates.push(c.date);
  });
  input.flows?.distributions?.forEach((d) => {
    if (d.date) allDates.push(d.date);
  });

  if (allDates.length > 0) {
    return allDates.sort()[0]; // Earliest date
  }

  const year = deriveVintageYear(input);
  return `${year}-01-01`;
}

/**
 * Derive end date from flows or default.
 */
function deriveEndDate(input: TruthCaseInput): string {
  const allDates: string[] = [];

  input.flows?.contributions?.forEach((c) => {
    if (c.date) allDates.push(c.date);
  });
  input.flows?.distributions?.forEach((d) => {
    if (d.date) allDates.push(d.date);
  });

  if (allDates.length > 0) {
    return allDates.sort().pop()!; // Latest date
  }

  const year = deriveVintageYear(input);
  return `${year}-12-31`;
}

// =============================================================================
// CA-005 Skip Gate
// =============================================================================

/**
 * Check if a truth case should be skipped.
 * Per CA-SEMANTIC-LOCK.md Section 6: CA-005 (dynamic_ratio) is deferred.
 */
export function shouldSkipTruthCase(
  caseId: string,
  reservePolicy?: string
): { skip: boolean; reason?: string } {
  // CA-005 uses dynamic_ratio which requires NAV calculation
  if (caseId === 'CA-005' || reservePolicy === 'dynamic_ratio') {
    return {
      skip: true,
      reason: 'CA-005 (dynamic_ratio) deferred to Phase 2 per CA-SEMANTIC-LOCK.md Section 6. ' +
        'Requires NAV calculation formula which is not yet specified.',
    };
  }

  return { skip: false };
}

// =============================================================================
// Output Adapter
// =============================================================================

/**
 * Convert internal cents back to output units.
 */
export function centsToOutputUnits(cents: number, unitScale: number): number {
  // Convert cents to dollars, then apply inverse scale
  const dollars = cents / 100;
  return dollars / unitScale;
}

/**
 * Format cohort output from internal representation.
 * Maps internal ID back to display name.
 */
export function formatCohortOutput(
  cohort: InternalCohort,
  unitScale: number
): { cohort: string; amount: number; type: 'planned' | 'deployed' } {
  return {
    cohort: cohort.name, // Use display name, not internal ID
    amount: centsToOutputUnits(cohort.allocationCents, unitScale),
    type: cohort.type,
  };
}
