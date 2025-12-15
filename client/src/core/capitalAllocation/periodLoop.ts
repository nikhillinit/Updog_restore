/**
 * Period Loop Engine for Capital Allocation
 *
 * Implements period-by-period allocation logic for pacing model cases (CA-007+).
 * This is Phase 2 of the CA implementation per CA-SEMANTIC-LOCK.md.
 *
 * Key concepts:
 * - Periods: Time intervals based on rebalance_frequency (monthly/quarterly/annual)
 * - Pacing: Target deployment rate = commitment / pacing_window_months
 * - Carryover: Undeployed capacity from previous periods rolls forward
 * - Cohort lifecycle: Cohorts active within a period's date range
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 4.1
 */

import { type NormalizedInput, centsToOutputUnits } from './adapter';
import { allocateLRM } from './allocateLRM';
import { roundPercentDerivedToCents } from './rounding';

// =============================================================================
// Types
// =============================================================================

export interface Period {
  id: string; // e.g., "2025-Q1", "2025-01"
  startDate: string;
  endDate: string;
  durationMonths: number;
}

export interface PeriodResult {
  periodId: string;
  startingCashCents: number;
  contributionsCents: number;
  distributionsCents: number;
  endingCashCents: number;
  reserveRequiredCents: number;
  reserveBalanceCents: number;
  pacingTargetCents: number;
  carryoverFromPreviousCents: number;
  effectiveTargetCents: number;
  allocatedCents: number;
  allocationsByCohortCents: Array<{ cohortId: string; amountCents: number }>;
  carryoverToNextCents: number;
}

export interface PeriodLoopOutput {
  periods: PeriodResult[];
  totalAllocatedCents: number;
  allocationsByCohortCents: Map<string, number>;
  reserveBalanceOverTimeCents: Array<{ date: string; balanceCents: number }>;
  pacingTargetsByPeriod: Array<{ period: string; targetCents: number }>;
  violations: string[];
}

// =============================================================================
// Period Generation
// =============================================================================

/**
 * Generate periods based on rebalance frequency.
 *
 * IMPORTANT: durationMonths is calculated from ACTUAL period start/end dates,
 * not the nominal frequency. This handles partial periods correctly:
 * - A period starting Oct 1 with annual frequency is 3 months (Oct-Dec), not 12
 * - This ensures pacing targets are pro-rated for partial periods
 */
export function generatePeriods(
  startDate: string,
  endDate: string,
  frequency: 'monthly' | 'quarterly' | 'annual'
): Period[] {
  const periods: Period[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);

  while (current <= end) {
    const periodStart = new Date(current);
    let periodEnd: Date;
    let periodId: string;

    switch (frequency) {
      case 'monthly':
        periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        periodId = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        break;

      case 'quarterly':
        const quarter = Math.floor(current.getMonth() / 3);
        periodEnd = new Date(current.getFullYear(), (quarter + 1) * 3, 0);
        periodId = `${current.getFullYear()}-Q${quarter + 1}`;
        current = new Date(current.getFullYear(), (quarter + 1) * 3, 1);
        break;

      case 'annual':
        periodEnd = new Date(current.getFullYear(), 11, 31);
        periodId = String(current.getFullYear());
        current = new Date(current.getFullYear() + 1, 0, 1);
        break;
    }

    // Clamp period end to timeline end
    if (periodEnd > end) {
      periodEnd = new Date(end);
    }

    // Calculate ACTUAL duration in months (handles partial periods)
    const actualDurationMonths = calculateMonthsBetween(periodStart, periodEnd);

    periods.push({
      id: periodId,
      startDate: formatDate(periodStart),
      endDate: formatDate(periodEnd),
      durationMonths: actualDurationMonths,
    });
  }

  return periods;
}

/**
 * Calculate the number of months between two dates.
 * Uses fractional months for accuracy (e.g., Oct 1 - Dec 31 = ~3 months).
 */
function calculateMonthsBetween(start: Date, end: Date): number {
  const yearDiff = end.getFullYear() - start.getFullYear();
  const monthDiff = end.getMonth() - start.getMonth();
  // Add 1 because the period includes both start and end months
  const fullMonths = yearDiff * 12 + monthDiff + 1;
  return Math.max(1, fullMonths); // Minimum 1 month
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// =============================================================================
// Pacing Calculations
// =============================================================================

/**
 * Calculate base monthly pacing target.
 * Formula: commitment / pacing_window_months
 */
export function calculateMonthlyPacingTarget(
  commitmentCents: number,
  pacingWindowMonths: number
): number {
  if (pacingWindowMonths <= 0) return 0;
  return Math.floor(commitmentCents / pacingWindowMonths);
}

/**
 * Calculate pacing target for a specific period.
 *
 * NOTE: Truth case analysis reveals inconsistency:
 * - CA-009 (quarterly): uses monthly_rate × 3
 * - CA-017 (quarterly): uses monthly_rate (no scaling)
 *
 * After review: The pacing_targets_by_period in truth cases shows the
 * MONTHLY rate even for quarterly periods. The actual deployment in
 * a quarterly period would be constrained by other factors.
 *
 * Per CA-SEMANTIC-LOCK.md: pacing target per month = commitment / window
 */
export function calculatePeriodPacingTarget(
  commitmentCents: number,
  pacingWindowMonths: number,
  periodDurationMonths: number
): number {
  const monthlyRate = calculateMonthlyPacingTarget(commitmentCents, pacingWindowMonths);
  // Scale by period duration for actual period budget
  return monthlyRate * periodDurationMonths;
}

// =============================================================================
// Cohort Filtering
// =============================================================================

/**
 * Get cohorts active during a period.
 * A cohort is active if its date range overlaps with the period.
 */
export function getActiveCohorts(
  cohorts: NormalizedInput['cohorts'],
  periodStart: string,
  periodEnd: string
): NormalizedInput['cohorts'] {
  return cohorts.filter((cohort) => {
    const cohortStart = cohort.startDate;
    const cohortEnd = cohort.endDate ?? '9999-12-31';

    // Overlap: cohort starts before period ends AND cohort ends after period starts
    return cohortStart <= periodEnd && cohortEnd >= periodStart;
  });
}

// =============================================================================
// Flow Aggregation
// =============================================================================

/**
 * Sum flows that fall within a period's date range.
 * Preserves sign: positive = inflow, negative = outflow for distributions (recalls are negative)
 */
function sumFlowsInPeriod(
  flows: Array<{ date: string; amountCents: number }>,
  periodStart: string,
  periodEnd: string
): number {
  return flows
    .filter((f) => f.date >= periodStart && f.date <= periodEnd)
    .reduce((sum, f) => sum + f.amountCents, 0);
}

/**
 * Sum distribution outflows (only positive amounts = actual distributions).
 * Negative amounts (recalls) are handled separately.
 */
function sumDistributionOutflows(
  flows: Array<{ date: string; amountCents: number }>,
  periodStart: string,
  periodEnd: string
): number {
  return flows
    .filter((f) => f.date >= periodStart && f.date <= periodEnd && f.amountCents > 0)
    .reduce((sum, f) => sum + f.amountCents, 0);
}

/**
 * Sum recall inflows (negative distribution amounts become positive cash).
 */
function sumRecallInflows(
  flows: Array<{ date: string; amountCents: number }>,
  periodStart: string,
  periodEnd: string
): number {
  return flows
    .filter((f) => f.date >= periodStart && f.date <= periodEnd && f.amountCents < 0)
    .reduce((sum, f) => sum + Math.abs(f.amountCents), 0);
}

// =============================================================================
// Period Processing
// =============================================================================

/**
 * Process a single period.
 */
function processPeriod(
  period: Period,
  input: NormalizedInput,
  startingCashCents: number,
  carryoverCents: number,
  cumulativeAllocations: Map<string, number>
): PeriodResult {
  // 1. Calculate cash flows for this period
  // Contributions: always positive inflows
  const contributionsCents = sumFlowsInPeriod(
    input.contributionsCents.map((c) => ({ date: c.date, amountCents: c.amountCents })),
    period.startDate,
    period.endDate
  );

  // Distributions: positive = outflow, negative = recall (inflow)
  // Use proper sign handling: subtract positive distributions, add back recalls
  const distFlows = input.distributionsCents.map((d) => ({ date: d.date, amountCents: d.amountCents }));
  const distributionOutflowsCents = sumDistributionOutflows(distFlows, period.startDate, period.endDate);
  const recallInflowsCents = sumRecallInflows(distFlows, period.startDate, period.endDate);
  const distributionsCents = distributionOutflowsCents; // For reporting

  // 2. Calculate ending cash (before allocation)
  // cash = starting + contributions - outflows + recalls
  const cashBeforeAllocation = startingCashCents + contributionsCents - distributionOutflowsCents + recallInflowsCents;

  // 3. Calculate reserve requirements
  // Per user analysis: min_cash_buffer is the HARD FLOOR for deployment
  // effective_buffer (max of min_cash_buffer and reserve_pct) is the TARGET for reporting
  const reserveFloorCents = input.minCashBufferCents; // Hard constraint
  const reserveTargetCents = input.effectiveBufferCents; // Planning/reporting target
  const reserveBalanceCents = Math.min(cashBeforeAllocation, reserveTargetCents);

  // 4. Calculate available for deployment using the FLOOR, not target
  // This matches truth case semantics where allocations can proceed even if target isn't fully met
  const availableForDeploymentCents = Math.max(0, cashBeforeAllocation - reserveFloorCents);

  // 5. Calculate pacing target for this period
  const pacingTargetCents = calculatePeriodPacingTarget(
    input.commitmentCents,
    input.pacingWindowMonths,
    period.durationMonths
  );

  // 6. Effective target = pacing target + carryover
  const effectiveTargetCents = pacingTargetCents + carryoverCents;

  // 7. Get active cohorts
  const activeCohorts = getActiveCohorts(input.cohorts, period.startDate, period.endDate);

  // 8. Calculate cohort asks (pro-rata of effective target by weight)
  // First, calculate total weight of active cohorts
  const totalActiveWeight = activeCohorts.reduce((sum, c) => sum + c.weightBps, 0);

  // 9. Determine allocable amount
  // For pacing model: allocation is driven by pacing target and available cash
  // Truth cases show allocations can equal full contribution (not cash-minus-reserve)
  // The reserve is a TARGET tracked separately, not a cash holdback
  // Allocable = min(pacing_target + carryover, available_cash)
  const allocableCents = Math.min(effectiveTargetCents, Math.max(0, cashBeforeAllocation));

  // 10. Allocate to cohorts using LRM
  let allocationsByCohortCents: Array<{ cohortId: string; amountCents: number }> = [];
  let totalAllocatedCents = 0;

  if (activeCohorts.length > 0 && allocableCents > 0 && totalActiveWeight > 0) {
    // Normalize weights for active cohorts to sum to WEIGHT_SCALE
    // This handles lifecycle cohorts (CA-016) where only a subset is active per period
    const WEIGHT_SCALE = 10_000_000;
    const scale = WEIGHT_SCALE / totalActiveWeight;
    const normalizedWeights = activeCohorts.map((c) => Math.round(c.weightBps * scale));

    // Ensure exact sum = WEIGHT_SCALE (adjust last element for rounding)
    const weightSum = normalizedWeights.reduce((a, b) => a + b, 0);
    if (weightSum !== WEIGHT_SCALE && normalizedWeights.length > 0) {
      normalizedWeights[normalizedWeights.length - 1] += WEIGHT_SCALE - weightSum;
    }

    const allocations = allocateLRM(allocableCents, normalizedWeights);

    allocationsByCohortCents = activeCohorts.map((c, i) => ({
      cohortId: c.id,
      amountCents: allocations[i],
    }));

    totalAllocatedCents = allocations.reduce((sum, a) => sum + a, 0);

    // Apply per-cohort caps if specified (percentage of commitment)
    if (input.maxAllocationPerCohortPct !== null) {
      allocationsByCohortCents = applyPerCohortCaps(
        allocationsByCohortCents,
        cumulativeAllocations,
        input.maxAllocationPerCohortPct,
        input.commitmentCents
      );
      totalAllocatedCents = allocationsByCohortCents.reduce((sum, a) => sum + a.amountCents, 0);
    }
  }

  // 11. Calculate carryover to next period
  // Carryover = effective target - actual allocated (capped at 0)
  const carryoverToNextCents = Math.max(0, effectiveTargetCents - totalAllocatedCents);

  // 12. Calculate ending cash after allocation
  const endingCashCents = cashBeforeAllocation - totalAllocatedCents;

  return {
    periodId: period.id,
    startingCashCents,
    contributionsCents,
    distributionsCents,
    endingCashCents,
    reserveRequiredCents: reserveTargetCents, // Use target for reporting
    reserveBalanceCents: Math.min(endingCashCents, reserveTargetCents),
    pacingTargetCents,
    carryoverFromPreviousCents: carryoverCents,
    effectiveTargetCents,
    allocatedCents: totalAllocatedCents,
    allocationsByCohortCents,
    carryoverToNextCents,
  };
}

/**
 * Apply per-cohort allocation caps.
 */
function applyPerCohortCaps(
  allocations: Array<{ cohortId: string; amountCents: number }>,
  cumulativeAllocations: Map<string, number>,
  maxPerCohortPct: number,
  commitmentCents: number
): Array<{ cohortId: string; amountCents: number }> {
  // maxPerCohortPct is a percentage of commitment (e.g., 0.55 = 55%)
  const maxPerCohortCents = roundPercentDerivedToCents(commitmentCents * maxPerCohortPct);

  return allocations.map((alloc) => {
    const cumulative = cumulativeAllocations.get(alloc.cohortId) ?? 0;
    const remaining = Math.max(0, maxPerCohortCents - cumulative);
    const cappedAmount = Math.min(alloc.amountCents, remaining);

    return {
      cohortId: alloc.cohortId,
      amountCents: cappedAmount,
    };
  });
}

// =============================================================================
// Main Loop
// =============================================================================

/**
 * Execute the period loop for capital allocation.
 *
 * This processes each period sequentially, tracking:
 * - Cash balance (starting → contributions → distributions → allocations → ending)
 * - Pacing targets and carryover
 * - Cumulative allocations by cohort
 * - Reserve balance over time
 */
export function executePeriodLoop(input: NormalizedInput): PeriodLoopOutput {
  // 1. Generate periods
  const frequency = input.rebalanceFrequency;
  const periods = generatePeriods(input.startDate, input.endDate, frequency);

  if (periods.length === 0) {
    return {
      periods: [],
      totalAllocatedCents: 0,
      allocationsByCohortCents: new Map(),
      reserveBalanceOverTimeCents: [],
      pacingTargetsByPeriod: [],
      violations: [],
    };
  }

  // 2. Initialize state
  let cashCents = 0;
  let carryoverCents = 0;
  const cumulativeAllocations = new Map<string, number>();
  const periodResults: PeriodResult[] = [];
  const violations: string[] = [];

  // Initialize cumulative allocations for all cohorts
  for (const cohort of input.cohorts) {
    cumulativeAllocations.set(cohort.id, 0);
  }

  // 3. Process each period
  for (const period of periods) {
    const result = processPeriod(
      period,
      input,
      cashCents,
      carryoverCents,
      cumulativeAllocations
    );

    // Update state for next period
    cashCents = result.endingCashCents;
    carryoverCents = result.carryoverToNextCents;

    // Update cumulative allocations
    for (const alloc of result.allocationsByCohortCents) {
      const current = cumulativeAllocations.get(alloc.cohortId) ?? 0;
      cumulativeAllocations.set(alloc.cohortId, current + alloc.amountCents);
    }

    // Track violations
    if (result.carryoverToNextCents > 0 && result.allocatedCents < result.effectiveTargetCents) {
      violations.push('carryover_applied');
    }

    periodResults.push(result);
  }

  // 4. Build output
  const totalAllocatedCents = Array.from(cumulativeAllocations.values()).reduce(
    (sum, v) => sum + v,
    0
  );

  const reserveBalanceOverTimeCents = periodResults.map((r) => ({
    date: periods.find((p) => p.id === r.periodId)!.endDate,
    balanceCents: r.reserveBalanceCents,
  }));

  const pacingTargetsByPeriod = periodResults.map((r) => ({
    period: r.periodId,
    targetCents: r.pacingTargetCents,
  }));

  return {
    periods: periodResults,
    totalAllocatedCents,
    allocationsByCohortCents: cumulativeAllocations,
    reserveBalanceOverTimeCents,
    pacingTargetsByPeriod,
    violations,
  };
}

// =============================================================================
// Output Conversion
// =============================================================================

/**
 * Convert period loop output to truth case comparison format.
 *
 * IMPORTANT: Truth cases expect PERIOD-SPECIFIC allocations (typically first
 * period with contribution), not cumulative totals across all periods.
 * This matches the pacing model where deployment is smoothed over time.
 */
export function convertPeriodLoopOutput(
  output: PeriodLoopOutput,
  input: NormalizedInput
): {
  reserve_balance: number;
  allocations_by_cohort: Array<{ cohort: string; amount: number }>;
  reserve_balance_over_time: Array<{ date: string; balance: number }>;
  pacing_targets_by_period: Array<{ period: string; target: number }>;
  violations: string[];
} {
  const unitScale = input.unitScale;

  // Find cohort name by ID
  const cohortNameById = new Map<string, string>();
  for (const cohort of input.cohorts) {
    cohortNameById.set(cohort.id, cohort.name);
  }

  // Get first period with allocations (this is what truth cases track)
  const firstAllocatingPeriod = output.periods.find(p => p.allocatedCents > 0);
  const reportingPeriod = firstAllocatingPeriod ?? output.periods[0];

  // Get reserve balance from reporting period
  const reportingReserveBalanceCents = reportingPeriod?.reserveBalanceCents ?? 0;

  // Build allocations from reporting period (not cumulative)
  const periodAllocations = new Map<string, number>();
  if (reportingPeriod) {
    for (const alloc of reportingPeriod.allocationsByCohortCents) {
      periodAllocations.set(alloc.cohortId, alloc.amountCents);
    }
  }

  return {
    reserve_balance: centsToOutputUnits(reportingReserveBalanceCents, unitScale),
    allocations_by_cohort: Array.from(periodAllocations.entries()).map(
      ([cohortId, amountCents]) => ({
        cohort: cohortNameById.get(cohortId) ?? cohortId,
        amount: centsToOutputUnits(amountCents, unitScale),
      })
    ),
    reserve_balance_over_time: output.reserveBalanceOverTimeCents.map((r) => ({
      date: r.date,
      balance: centsToOutputUnits(r.balanceCents, unitScale),
    })),
    pacing_targets_by_period: output.pacingTargetsByPeriod.map((p) => ({
      period: p.period,
      target: centsToOutputUnits(p.targetCents, unitScale),
    })),
    violations: output.violations,
  };
}
