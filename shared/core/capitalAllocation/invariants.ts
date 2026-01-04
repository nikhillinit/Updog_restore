/**
 * Conservation Invariant Validators
 *
 * Per CA-SEMANTIC-LOCK.md Section 1.2 (Hybrid Model):
 * - Cash conservation: ending_cash = starting_cash + contributions - distributions - deployed_cash
 * - Capacity conservation: commitment = sum(allocations) + remaining_capacity
 * - Buffer constraint: reserve_balance >= effective_buffer (soft, warning)
 * - Non-negativity: all values >= 0 (except CA-019 recalls)
 *
 * CRITICAL: Tests MUST be non-tautological - totals derived from independent outputs,
 * NOT from scalar fields emitted by the same function.
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 1.2, 1.3
 */

import { type CAEngineOutput } from './types';
import { type NormalizedInput } from './adapter';
import { dollarsToCents, roundPercentDerivedToCents } from './rounding';

// =============================================================================
// Types
// =============================================================================

export interface InvariantResult {
  name: string;
  passed: boolean;
  message: string;
  expected?: number;
  actual?: number;
  tolerance?: number;
}

export interface ConservationCheckResult {
  cashConservation: InvariantResult;
  capacityConservation: InvariantResult;
  bufferConstraint: InvariantResult;
  nonNegativity: InvariantResult[];
  allPassed: boolean;
}

/**
 * Options for invariant checking.
 *
 * Used to handle special cases like CA-019 (capital recalls) where
 * negative allocations are valid.
 */
export interface InvariantOptions {
  /**
   * Allow negative allocation amounts (for capital recalls).
   * Default: false (standard non-negativity constraint)
   *
   * Set to true for CA-019 and similar recall scenarios.
   */
  allowNegativeAllocations?: boolean;

  /**
   * Treat buffer constraint as warning-only (exclude from allPassed).
   * Default: false (buffer breach with curable cash fails allPassed)
   *
   * Set to true if buffer is purely advisory.
   */
  bufferIsWarningOnly?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Tolerance for conservation checks (1 cent) */
export const CONSERVATION_TOLERANCE_CENTS = 1;

// =============================================================================
// Cash Conservation (Invariant 1C-i)
// =============================================================================

/**
 * Verify cash conservation identity.
 *
 * Formula: ending_cash = starting_cash + contributions - distributions - deployed_cash
 *
 * SIGN CONVENTION (per CA-SEMANTIC-LOCK.md):
 * - contributions: POSITIVE values = cash inflows (capital calls)
 * - distributions: POSITIVE values = cash outflows (returns to LPs)
 * - Recalls (CA-019): represented as NEGATIVE distributions (cash inflow)
 *
 * CRITICAL: Planned allocations do NOT affect this equation.
 */
export function verifyCashConservation(
  input: NormalizedInput,
  output: CAEngineOutput
): InvariantResult {
  // Calculate expected ending cash from inputs
  const startingCashCents = 0; // Fund inception

  // Contributions are positive inflows
  const contributionsCents = input.contributionsCents.reduce(
    (sum, flow) => sum + (flow.amountCents ?? 0),
    0
  );

  // Distributions are positive outflows (negative = recall/inflow)
  // DO NOT use Math.abs - this would break recall semantics (CA-019)
  const distributionsCents = input.distributionsCents.reduce(
    (sum, flow) => sum + (flow.amountCents ?? 0),
    0
  );

  // For Phase 1, deployed_cash = 0
  const deployedCashCents = output.cumulativeDeployedCents ?? 0;

  const expectedEndingCashCents = startingCashCents + contributionsCents - distributionsCents - deployedCashCents;
  const actualEndingCashCents = output.endingCashCents ?? 0;

  const diff = Math.abs(expectedEndingCashCents - actualEndingCashCents);
  const passed = diff <= CONSERVATION_TOLERANCE_CENTS;

  return {
    name: 'Cash Conservation (Hybrid 1C-i)',
    passed,
    message: passed
      ? 'Cash ledger balances correctly'
      : `Cash conservation violation: expected ${expectedEndingCashCents}, got ${actualEndingCashCents} (diff: ${diff} cents)`,
    expected: expectedEndingCashCents,
    actual: actualEndingCashCents,
    tolerance: CONSERVATION_TOLERANCE_CENTS,
  };
}

// =============================================================================
// Capacity Conservation (Invariant 1C-ii)
// =============================================================================

/**
 * Verify capacity conservation identity.
 *
 * Formula: commitment = sum(allocations_by_cohort) + remaining_capacity
 *
 * CRITICAL: Sum allocations from the array output, NOT from a total scalar field.
 */
export function verifyCapacityConservation(
  input: NormalizedInput,
  output: CAEngineOutput
): InvariantResult {
  // Calculate expected: commitment
  const commitmentCents = input.commitmentCents;

  // Calculate actual: sum allocations from array (non-tautological)
  // CRITICAL: Use banker's rounding for cents conversion per semantic lock Section 4.1
  const totalAllocatedCents = output.allocations_by_cohort.reduce((sum, cohort) => {
    // Convert back to cents from output units using banker's rounding
    const amountCents = dollarsToCents(cohort.amount * input.unitScale);
    return sum + amountCents;
  }, 0);

  const remainingCapacityCents = output.remainingCapacityCents ?? 0;

  const actualTotalCents = totalAllocatedCents + remainingCapacityCents;
  const diff = Math.abs(commitmentCents - actualTotalCents);
  const passed = diff <= CONSERVATION_TOLERANCE_CENTS;

  return {
    name: 'Capacity Conservation (Hybrid 1C-ii)',
    passed,
    message: passed
      ? 'Capacity allocation is conserved'
      : `Capacity conservation violation: commitment=${commitmentCents}, ` +
        `allocated=${totalAllocatedCents}, remaining=${remainingCapacityCents}, ` +
        `sum=${actualTotalCents} (diff: ${diff} cents)`,
    expected: commitmentCents,
    actual: actualTotalCents,
    tolerance: CONSERVATION_TOLERANCE_CENTS,
  };
}

// =============================================================================
// Buffer Constraint (Invariant 2)
// =============================================================================

/**
 * Verify buffer constraint.
 *
 * Constraint: reserve_balance >= effective_buffer (when sufficient cash exists)
 *
 * This is a soft constraint - violation is a warning, not an error.
 */
export function verifyBufferConstraint(
  input: NormalizedInput,
  output: CAEngineOutput
): InvariantResult {
  const reserveBalanceCents = output.reserveBalanceCents ?? 0;
  const effectiveBufferCents = input.effectiveBufferCents;
  const endingCashCents = output.endingCashCents ?? 0;

  // Buffer breach only occurs if:
  // 1. reserve_balance < effective_buffer, AND
  // 2. There was enough cash to meet the buffer (uncured breach)
  const isBreach = reserveBalanceCents < effectiveBufferCents;
  const isCurable = endingCashCents >= effectiveBufferCents;

  // If breached but curable, this is a warning (allocations should have been clipped)
  // If breached and uncurable, this is expected (not enough cash)
  const passed = !isBreach || !isCurable;

  return {
    name: 'Buffer Constraint (Invariant 2)',
    passed,
    message: passed
      ? isBreach
        ? 'Buffer constraint soft-breached (insufficient cash, expected)'
        : 'Buffer constraint satisfied'
      : `Buffer constraint violated: reserve=${reserveBalanceCents}, ` +
        `buffer=${effectiveBufferCents}, cash=${endingCashCents} ` +
        `(should have clipped allocations)`,
    expected: effectiveBufferCents,
    actual: reserveBalanceCents,
  };
}

// =============================================================================
// Non-Negativity (Invariant 4)
// =============================================================================

/**
 * Verify non-negativity constraints.
 *
 * All values must be >= 0, except when allowNegativeAllocations is true
 * (for CA-019 capital recalls and similar scenarios).
 *
 * @param output - Engine output to validate
 * @param options - Optional settings (allowNegativeAllocations for recalls)
 */
export function verifyNonNegativity(
  output: CAEngineOutput,
  options: InvariantOptions = {}
): InvariantResult[] {
  const { allowNegativeAllocations = false } = options;
  const results: InvariantResult[] = [];

  // Check reserve_balance (always must be non-negative)
  const reserveBalanceCents = output.reserveBalanceCents ?? 0;
  results.push({
    name: 'Non-Negativity: reserve_balance',
    passed: reserveBalanceCents >= 0,
    message: reserveBalanceCents >= 0
      ? 'Reserve balance is non-negative'
      : `Negative reserve balance: ${reserveBalanceCents}`,
    actual: reserveBalanceCents,
  });

  // Check each allocation
  // Note: For CA-019 recalls, negative allocations are valid
  output.allocations_by_cohort.forEach((cohort, index) => {
    const isNonNegative = cohort.amount >= 0;
    const passed = isNonNegative || allowNegativeAllocations;
    const suffix = !isNonNegative && allowNegativeAllocations ? ' (allowed for recalls)' : '';

    results.push({
      name: `Non-Negativity: allocation[${index}] (${cohort.cohort})`,
      passed,
      message: passed
        ? `Allocation for ${cohort.cohort} is ${isNonNegative ? 'non-negative' : `negative${  suffix}`}`
        : `Negative allocation for ${cohort.cohort}: ${cohort.amount}`,
      actual: cohort.amount,
    });
  });

  // Check remaining_capacity (always must be non-negative)
  const remainingCapacityCents = output.remainingCapacityCents ?? 0;
  results.push({
    name: 'Non-Negativity: remaining_capacity',
    passed: remainingCapacityCents >= 0,
    message: remainingCapacityCents >= 0
      ? 'Remaining capacity is non-negative'
      : `Negative remaining capacity: ${remainingCapacityCents}`,
    actual: remainingCapacityCents,
  });

  return results;
}

// =============================================================================
// Full Conservation Check
// =============================================================================

/**
 * Run all conservation invariant checks.
 *
 * Per CA-SEMANTIC-LOCK.md Section 1.3:
 * Tests MUST compute totals from independent outputs, NOT from scalar fields.
 *
 * @param input - Normalized engine input
 * @param output - Engine output to validate
 * @param options - Optional settings for special cases (CA-019 recalls, etc.)
 */
export function checkAllInvariants(
  input: NormalizedInput,
  output: CAEngineOutput,
  options: InvariantOptions = {}
): ConservationCheckResult {
  const { bufferIsWarningOnly = false } = options;

  const cashConservation = verifyCashConservation(input, output);
  const capacityConservation = verifyCapacityConservation(input, output);
  const bufferConstraint = verifyBufferConstraint(input, output);
  const nonNegativity = verifyNonNegativity(output, options);

  // Buffer constraint may be warning-only (excluded from allPassed)
  const bufferPassed = bufferIsWarningOnly || bufferConstraint.passed;

  const allPassed =
    cashConservation.passed &&
    capacityConservation.passed &&
    bufferPassed &&
    nonNegativity.every((r) => r.passed);

  return {
    cashConservation,
    capacityConservation,
    bufferConstraint,
    nonNegativity,
    allPassed,
  };
}

// =============================================================================
// Independently Derivable Test Helpers
// =============================================================================

/**
 * Calculate expected reserve balance independently (for non-tautological tests).
 *
 * This allows tests to verify engine output against hand-calculated values.
 *
 * Formula:
 *   ending_cash = sum(contributions) - sum(distributions)
 *   effective_buffer = max(min_cash_buffer, commitment * target_reserve_pct)
 *   reserve_balance = min(ending_cash, effective_buffer)
 */
export function calculateExpectedReserveIndependently(
  contributionsCents: number[],
  distributionsCents: number[],
  commitmentCents: number,
  targetReservePct: number,
  minCashBufferCents: number
): {
  endingCashCents: number;
  effectiveBufferCents: number;
  reserveBalanceCents: number;
} {
  const endingCashCents = contributionsCents.reduce((a, b) => a + b, 0) -
    distributionsCents.reduce((a, b) => a + b, 0);

  // CRITICAL: Use banker's rounding for percent-derived values per semantic lock Section 4.1
  const targetReserveCents = roundPercentDerivedToCents(commitmentCents * targetReservePct);
  const effectiveBufferCents = Math.max(minCashBufferCents, targetReserveCents);

  const reserveBalanceCents = Math.min(endingCashCents, effectiveBufferCents);

  return {
    endingCashCents,
    effectiveBufferCents,
    reserveBalanceCents,
  };
}

/**
 * Calculate expected allocation independently (for non-tautological tests).
 *
 * For a single cohort (100% weight), allocation = ending_cash - reserve_balance.
 */
export function calculateExpectedAllocationIndependently(
  endingCashCents: number,
  reserveBalanceCents: number
): number {
  return Math.max(0, endingCashCents - reserveBalanceCents);
}
