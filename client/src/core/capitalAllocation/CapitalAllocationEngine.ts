/**
 * Capital Allocation Engine
 *
 * Implements the Hybrid conservation model per CA-SEMANTIC-LOCK.md:
 * - Cash Ledger: ending_cash = starting_cash + contributions - distributions - deployed_cash
 * - Capacity: commitment = sum(allocations) + remaining_capacity
 *
 * @see docs/CA-SEMANTIC-LOCK.md
 */

import {
  type CAEngineOutput,
  type InternalCohort,
  type CashLedgerState,
  type CapacityState,
  type Violation,
  type ReserveBalancePoint,
  createEmptyOutput,
  createViolation,
  FAR_FUTURE,
} from './types';
import {
  type NormalizedInput,
  centsToOutputUnits,
  formatCohortOutput,
} from './adapter';
import { allocateLRM, WEIGHT_SCALE } from './allocateLRM';
import { roundPercentDerivedToCents } from './rounding';
import { cmp } from './sorting';

// =============================================================================
// Effective Buffer Calculation
// =============================================================================

/**
 * Calculate effective buffer per CA-SEMANTIC-LOCK.md Section 1.1.0.
 *
 * Formula (LOCKED):
 *   effective_buffer = max(min_cash_buffer ?? 0, commitment * target_reserve_pct ?? 0)
 *
 * This unifies the absolute floor (min_cash_buffer) and percentage reserve
 * (target_reserve_pct) into a single constraint.
 */
export function calculateEffectiveBuffer(
  commitmentCents: number,
  targetReservePct: number,
  minCashBufferCents: number
): number {
  const targetReserveCents = roundPercentDerivedToCents(commitmentCents * targetReservePct);
  return Math.max(minCashBufferCents, targetReserveCents);
}

/**
 * Calculate reserve balance per CA-SEMANTIC-LOCK.md Section 1.1.0.
 *
 * Formula (TRUTH-CASE VERIFIED against CA-001, CA-002, CA-003):
 *   reserve_balance = min(ending_cash, effective_buffer)
 *
 * Interpretation: reserve_balance is the held-back portion of cash,
 * NOT total cash on hand.
 */
export function calculateReserveBalance(
  endingCashCents: number,
  effectiveBufferCents: number
): number {
  return Math.min(endingCashCents, effectiveBufferCents);
}

// =============================================================================
// Cash Ledger
// =============================================================================

/**
 * Calculate cash ledger state.
 *
 * Per CA-SEMANTIC-LOCK.md Section 1.1.0:
 *   ending_cash = starting_cash + sum(contributions) - sum(distributions) - sum(deployed_cash)
 *
 * CRITICAL: Planned allocations do NOT appear in this equation.
 * Only actual cash movements affect cash position.
 */
export function calculateCashLedger(input: NormalizedInput): CashLedgerState {
  const startingCashCents = 0; // Assuming fund inception

  const contributionsCents = input.contributionsCents.reduce(
    (sum, flow) => sum + (flow.amountCents ?? 0),
    0
  );

  const distributionsCents = input.distributionsCents.reduce(
    (sum, flow) => sum + Math.abs(flow.amountCents ?? 0),
    0
  );

  // For Phase 1, deployed_cash = 0 (no actual deployments yet)
  // In Phase 2+, this would come from allocation tracking
  const deployedCashCents = 0;

  const endingCashCents = startingCashCents + contributionsCents - distributionsCents - deployedCashCents;

  return {
    startingCashCents,
    contributionsCents,
    distributionsCents,
    deployedCashCents,
    endingCashCents,
  };
}

// =============================================================================
// Capacity Allocation
// =============================================================================

/**
 * Allocate capacity to cohorts using Largest Remainder Method.
 *
 * Per CA-SEMANTIC-LOCK.md Section 4.2:
 * - Pro-rata by cohort weight (basis points)
 * - Remainder to largest remainder (integer arithmetic)
 * - Tie-break: first cohort in canonical sort order
 *
 * Returns the allocatable amount (ending_cash - reserve_balance).
 */
export function allocateCapacityToCohorts(
  input: NormalizedInput,
  endingCashCents: number,
  reserveBalanceCents: number
): InternalCohort[] {
  const cohorts = input.cohorts;

  if (cohorts.length === 0) {
    return [];
  }

  // Calculate allocable capacity
  // Per Section 1.1.1: allocable_cash = max(0, ending_cash - reserve_balance)
  const allocableCashCents = Math.max(0, endingCashCents - reserveBalanceCents);

  // If nothing to allocate, set all allocations to 0
  if (allocableCashCents === 0) {
    return cohorts.map((c) => ({ ...c, allocationCents: 0 }));
  }

  // Extract weights in basis points
  const weightsBps = cohorts.map((c) => c.weightBps);

  // Allocate using LRM
  const allocations = allocateLRM(allocableCashCents, weightsBps);

  // Apply per-cohort caps if specified (with spill-over)
  const { finalAllocations, spilloverCents } = applyCohortCaps(
    cohorts,
    allocations,
    allocableCashCents,
    input.maxAllocationPerCohortCents
  );

  // Update cohort allocations
  return cohorts.map((c, i) => ({
    ...c,
    allocationCents: finalAllocations[i],
  }));
}

/**
 * Apply per-cohort caps with spill-over to next cohort.
 *
 * Per CA-SEMANTIC-LOCK.md Section 4.3:
 * - If cohort hits cap, excess spills to next cohort in sort order
 * - Continue until all capacity allocated or all cohorts at cap
 * - Termination: remaining unallocated stays as remaining_capacity
 */
function applyCohortCaps(
  cohorts: InternalCohort[],
  initialAllocations: number[],
  totalAvailable: number,
  globalCapCents: number | null
): { finalAllocations: number[]; spilloverCents: number } {
  const finalAllocations = [...initialAllocations];
  let spillover = 0;

  // First pass: apply caps and collect spillover
  for (let i = 0; i < cohorts.length; i++) {
    // Determine effective cap for this cohort
    const cohortCap = cohorts[i].maxAllocationCents ?? globalCapCents ?? Infinity;

    if (finalAllocations[i] > cohortCap) {
      spillover += finalAllocations[i] - cohortCap;
      finalAllocations[i] = cohortCap;
    }
  }

  // Second pass: distribute spillover to uncapped cohorts
  if (spillover > 0) {
    for (let i = 0; i < cohorts.length && spillover > 0; i++) {
      const cohortCap = cohorts[i].maxAllocationCents ?? globalCapCents ?? Infinity;
      const headroom = cohortCap - finalAllocations[i];

      if (headroom > 0) {
        const addition = Math.min(headroom, spillover);
        finalAllocations[i] += addition;
        spillover -= addition;
      }
    }
  }

  return { finalAllocations, spilloverCents: spillover };
}

// =============================================================================
// Main Engine
// =============================================================================

/**
 * Execute capital allocation calculation.
 *
 * This is the main entry point that:
 * 1. Calculates cash ledger state
 * 2. Calculates effective buffer and reserve balance
 * 3. Allocates capacity to cohorts
 * 4. Verifies conservation invariants
 * 5. Returns formatted output
 */
export function executeCapitalAllocation(input: NormalizedInput): CAEngineOutput {
  // Step 1: Calculate cash ledger
  const cashLedger = calculateCashLedger(input);

  // Step 2: Calculate effective buffer
  const effectiveBufferCents = input.effectiveBufferCents;

  // Step 3: Calculate reserve balance
  // Per CA-SEMANTIC-LOCK.md: reserve_balance = min(ending_cash, effective_buffer)
  const reserveBalanceCents = calculateReserveBalance(
    cashLedger.endingCashCents,
    effectiveBufferCents
  );

  // Step 4: Allocate capacity to cohorts
  const allocatedCohorts = allocateCapacityToCohorts(
    input,
    cashLedger.endingCashCents,
    reserveBalanceCents
  );

  // Step 5: Calculate capacity state
  const totalAllocatedCents = allocatedCohorts.reduce(
    (sum, c) => sum + c.allocationCents,
    0
  );
  const remainingCapacityCents = input.commitmentCents - totalAllocatedCents;

  // Step 6: Verify conservation invariants
  const violations = verifyInvariants(input, cashLedger, allocatedCohorts, reserveBalanceCents);

  // Step 7: Build time series (single point for now)
  const reserveBalanceOverTime = buildTimeSeries(
    input,
    cashLedger,
    reserveBalanceCents,
    effectiveBufferCents
  );

  // Step 8: Format output
  return formatOutput(
    input,
    cashLedger,
    reserveBalanceCents,
    effectiveBufferCents,
    allocatedCohorts,
    remainingCapacityCents,
    reserveBalanceOverTime,
    violations
  );
}

// =============================================================================
// Invariant Verification
// =============================================================================

/**
 * Verify conservation invariants.
 *
 * Per CA-SEMANTIC-LOCK.md Section 1.2:
 * - Cash conservation (Hybrid model)
 * - Capacity conservation
 * - Buffer constraint
 * - Non-negativity
 */
function verifyInvariants(
  input: NormalizedInput,
  cashLedger: CashLedgerState,
  cohorts: InternalCohort[],
  reserveBalanceCents: number
): Violation[] {
  const violations: Violation[] = [];

  // Invariant 1: Non-negativity (CRITICAL - throw immediately)
  if (reserveBalanceCents < 0) {
    throw new Error(
      `Negative reserve balance: ${reserveBalanceCents} cents. ` +
      `This indicates invalid input or calculation bug.`
    );
  }

  // Invariant 2: Capacity conservation
  const totalAllocatedCents = cohorts.reduce((sum, c) => sum + c.allocationCents, 0);
  const remainingCapacityCents = input.commitmentCents - totalAllocatedCents;

  if (remainingCapacityCents < 0) {
    throw new Error(
      `Negative remaining capacity: ${remainingCapacityCents} cents. ` +
      `Total allocated (${totalAllocatedCents}) exceeds commitment (${input.commitmentCents}).`
    );
  }

  // Invariant 3: Buffer breach check (soft constraint)
  // Only emit violation if reserve_balance < effective_buffer AND
  // this is uncurable (would require negative allocation)
  if (reserveBalanceCents < input.effectiveBufferCents) {
    // Check if this is a true breach (not enough cash to meet buffer)
    if (cashLedger.endingCashCents < input.effectiveBufferCents) {
      violations.push(
        createViolation(
          'buffer_breach',
          `Reserve balance (${reserveBalanceCents}) is below effective buffer ` +
          `(${input.effectiveBufferCents}). Insufficient cash to meet reserve requirement.`,
          {
            severity: 'warning',
            expected: input.effectiveBufferCents,
            actual: reserveBalanceCents,
          }
        )
      );
    }
  }

  return violations;
}

// =============================================================================
// Time Series
// =============================================================================

/**
 * Build reserve balance time series.
 * For Phase 1, single point at end of period.
 */
function buildTimeSeries(
  input: NormalizedInput,
  cashLedger: CashLedgerState,
  reserveBalanceCents: number,
  effectiveBufferCents: number
): ReserveBalancePoint[] {
  // Find the latest date from flows
  const allDates = [
    ...input.contributionsCents.map((c) => c.date),
    ...input.distributionsCents.map((d) => d.date),
  ].filter(Boolean);

  const latestDate = allDates.length > 0
    ? allDates.sort().pop()!
    : input.endDate;

  return [
    {
      date: latestDate,
      reserve_balance: centsToOutputUnits(reserveBalanceCents, input.unitScale),
      reserveBalanceCents,
      ending_cash: centsToOutputUnits(cashLedger.endingCashCents, input.unitScale),
      endingCashCents: cashLedger.endingCashCents,
      effective_buffer: centsToOutputUnits(effectiveBufferCents, input.unitScale),
      effectiveBufferCents,
    },
  ];
}

// =============================================================================
// Output Formatting
// =============================================================================

/**
 * Format engine output.
 *
 * Per CA-SEMANTIC-LOCK.md Section 4.4:
 * - Arrays MUST be present (even if empty)
 * - Arrays MUST be sorted deterministically
 */
function formatOutput(
  input: NormalizedInput,
  cashLedger: CashLedgerState,
  reserveBalanceCents: number,
  effectiveBufferCents: number,
  cohorts: InternalCohort[],
  remainingCapacityCents: number,
  timeSeries: ReserveBalancePoint[],
  violations: Violation[]
): CAEngineOutput {
  // Format allocations (sorted by cohort name)
  const allocationsByCohort = cohorts
    .map((c) => formatCohortOutput(c, input.unitScale))
    .sort((a, b) => cmp(a.cohort, b.cohort));

  // Sort time series by date
  const sortedTimeSeries = [...timeSeries].sort((a, b) => cmp(a.date, b.date));

  // Sort violations by period → type → cohort (nulls last)
  const sortedViolations = [...violations].sort((a, b) => {
    const periodA = a.period ?? 'zzz';
    const periodB = b.period ?? 'zzz';
    const cohortA = a.cohort ?? 'zzz';
    const cohortB = b.cohort ?? 'zzz';

    return cmp(periodA, periodB) || cmp(a.type, b.type) || cmp(cohortA, cohortB);
  });

  return {
    reserve_balance: centsToOutputUnits(reserveBalanceCents, input.unitScale),
    reserveBalanceCents,

    allocations_by_cohort: allocationsByCohort,

    reserve_balance_over_time: sortedTimeSeries,

    remaining_capacity: centsToOutputUnits(remainingCapacityCents, input.unitScale),
    remainingCapacityCents,

    cumulative_deployed: 0, // Phase 1: no actual deployments
    cumulativeDeployedCents: 0,

    violations: sortedViolations,

    ending_cash: centsToOutputUnits(cashLedger.endingCashCents, input.unitScale),
    endingCashCents: cashLedger.endingCashCents,

    effective_buffer: centsToOutputUnits(effectiveBufferCents, input.unitScale),
    effectiveBufferCents,
  };
}

// =============================================================================
// High-Level API
// =============================================================================

/**
 * Main API: Calculate capital allocation from truth case input.
 *
 * Usage:
 *   const result = calculateCapitalAllocation(adaptTruthCaseInput(rawInput));
 *
 * Or with raw input:
 *   import { adaptTruthCaseInput } from './adapter';
 *   const normalized = adaptTruthCaseInput(rawInput);
 *   const result = calculateCapitalAllocation(normalized);
 */
export const calculateCapitalAllocation = executeCapitalAllocation;
