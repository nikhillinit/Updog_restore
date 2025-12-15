/**
 * Period Loop Engine for Capital Allocation
 *
 * Implements period-based allocation for pacing model truth cases (CA-007+).
 * Processes flows period-by-period based on rebalance frequency.
 *
 * Key features:
 * - Category-aware allocation semantics:
 *   - pacing_engine: allocation capped at pacing target
 *   - cohort_engine: allocation = period's cash flow (no pacing cap)
 *   - reserve_engine: pacing with reserve-deducted target
 *   - integration: all constraints combined
 * - Prorated pacing targets for partial periods
 * - Active cohort filtering by date range
 * - Weight re-normalization for lifecycle cohorts
 *
 * @see docs/CA-SEMANTIC-LOCK.md
 */

import {
  type CAEngineOutput,
  type InternalCohort,
  type Violation,
  type ReserveBalancePoint,
} from './types';
import {
  type NormalizedInput,
  centsToOutputUnits,
} from './adapter';
import { allocateLRM, WEIGHT_SCALE } from './allocateLRM';
import { roundPercentDerivedToCents } from './rounding';

// =============================================================================
// Types
// =============================================================================

export interface Period {
  id: string; // e.g., "2025-01", "2025-Q1"
  startDate: string;
  endDate: string;
}

export interface PeriodResult {
  period: Period;
  cashInCents: number;
  cashOutCents: number;
  endingCashCents: number;
  pacingTargetCents: number;
  allocationCents: number;
  allocationsByCohort: Map<string, number>;
  reserveBalanceCents: number;
  // Distribution classification (CA-019, CA-020)
  cashImpactCents: number; // Recall inflows (from negative distributions)
  recyclingPoolDeltaCents: number; // From recycle_eligible distributions
}

export interface PeriodLoopOutput {
  periods: PeriodResult[];
  totalAllocationCents: number;
  allocationsByCohort: Map<string, number>;
  finalReserveBalanceCents: number;
  violations: Violation[];
  // Distribution classification totals (CA-019, CA-020)
  totalCashImpactCents: number;
  totalRecyclingPoolDeltaCents: number;
}

// =============================================================================
// Period Generation
// =============================================================================

/**
 * Generate periods based on rebalance frequency.
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
    const periodStart = formatDate(current);
    let periodEnd: Date;
    let periodId: string;

    switch (frequency) {
      case 'monthly':
        periodId = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        break;

      case 'quarterly':
        const quarter = Math.floor(current.getMonth() / 3) + 1;
        periodId = `${current.getFullYear()}-Q${quarter}`;
        const quarterEndMonth = quarter * 3;
        periodEnd = new Date(current.getFullYear(), quarterEndMonth, 0);
        break;

      case 'annual':
        periodId = String(current.getFullYear());
        periodEnd = new Date(current.getFullYear(), 11, 31);
        break;
    }

    // Cap period end at overall end date
    if (periodEnd > end) {
      periodEnd = new Date(end);
    }

    periods.push({
      id: periodId,
      startDate: periodStart,
      endDate: formatDate(periodEnd),
    });

    // Move to start of next period
    switch (frequency) {
      case 'monthly':
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        break;
      case 'quarterly':
        current = new Date(current.getFullYear(), current.getMonth() + 3, 1);
        break;
      case 'annual':
        current = new Date(current.getFullYear() + 1, 0, 1);
        break;
    }
  }

  return periods;
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// =============================================================================
// Pacing Calculation
// =============================================================================

/**
 * Calculate monthly pacing target.
 * Formula: (commitment - reserve_target) / pacing_window_months
 *
 * Per truth case analysis: pacing deploys net capital (after reserve)
 * over the pacing window, not gross commitment.
 */
export function calculateMonthlyPacingTarget(
  commitmentCents: number,
  reserveTargetCents: number,
  pacingWindowMonths: number
): number {
  if (pacingWindowMonths <= 0) {
    return 0;
  }
  const deployableCapital = commitmentCents - reserveTargetCents;
  return roundPercentDerivedToCents(deployableCapital / pacingWindowMonths);
}

/**
 * Calculate pacing target for a period based on frequency.
 * For partial periods (e.g., Oct-Dec for annual), prorate by actual months.
 */
export function calculatePeriodPacingTarget(
  monthlyTargetCents: number,
  frequency: 'monthly' | 'quarterly' | 'annual',
  periodStart?: string,
  periodEnd?: string
): number {
  // If period dates provided, calculate actual months in period
  if (periodStart && periodEnd) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    // Calculate months between dates (inclusive)
    const months = (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) + 1;
    return Math.round(monthlyTargetCents * months);
  }

  // Default behavior when no period dates provided
  switch (frequency) {
    case 'monthly':
      return monthlyTargetCents;
    case 'quarterly':
      return monthlyTargetCents * 3;
    case 'annual':
      return monthlyTargetCents * 12;
  }
}

// =============================================================================
// Cohort Filtering
// =============================================================================

/**
 * Get cohorts active during a given date.
 */
export function getActiveCohorts(
  cohorts: InternalCohort[],
  date: string
): InternalCohort[] {
  return cohorts.filter((c) => {
    const start = c.startDate;
    const end = c.endDate || '9999-12-31';
    return date >= start && date <= end;
  });
}

// =============================================================================
// Distribution Classification (CA-019, CA-020)
// =============================================================================

interface DistributionClassification {
  /** Net cash delta from distributions (+ for inflows, - for outflows) */
  cashDeltaCents: number;
  /** Recycling pool increase (from recycle_eligible positive distributions) */
  recyclingPoolDeltaCents: number;
  /** Cash impact from recalls (from negative distributions) */
  cashImpactCents: number;
  /** LP payout outflow (from non-recyclable positive distributions) */
  lpPayoutOutflowCents: number;
}

/**
 * Classify distributions by type and compute cash effects.
 *
 * Rules (per CA-019, CA-020):
 * - Negative amount: Recall/clawback - cash IN, NOT recyclable
 * - Positive + recycle_eligible: Proceeds - cash IN, adds to recycling pool
 * - Positive + !recycle_eligible: LP payout - cash OUT
 */
function classifyDistributions(
  distributions: Array<{ amountCents?: number; recycle_eligible?: boolean }>
): DistributionClassification {
  let cashDeltaCents = 0;
  let recyclingPoolDeltaCents = 0;
  let cashImpactCents = 0;
  let lpPayoutOutflowCents = 0;

  for (const d of distributions) {
    const amt = d.amountCents ?? 0;

    if (amt < 0) {
      // Recall / clawback: cash inflow, NOT recyclable
      const inflow = Math.abs(amt);
      cashDeltaCents += inflow;
      cashImpactCents += inflow;
      continue;
    }

    if (d.recycle_eligible === true) {
      // Recyclable proceeds: cash inflow, increases recycling pool
      cashDeltaCents += amt;
      recyclingPoolDeltaCents += amt;
      continue;
    }

    // Default: LP payout (cash outflow)
    cashDeltaCents -= amt;
    lpPayoutOutflowCents += amt;
  }

  return { cashDeltaCents, recyclingPoolDeltaCents, cashImpactCents, lpPayoutOutflowCents };
}

// =============================================================================
// Cap + Spill Allocation (CA-015)
// =============================================================================

/**
 * Allocate with per-cohort caps and deterministic spill redistribution.
 *
 * When a cohort's pro-rata share exceeds the cap, the excess "spills" to
 * uncapped cohorts. This continues iteratively until no cohort exceeds cap.
 *
 * @param allocableCents - Total amount to allocate
 * @param cohorts - Active cohorts with IDs
 * @param weightsBps - Normalized weights in basis points
 * @param maxAllocationPct - Per-cohort cap as percentage of allocation pool (null = no cap)
 */
function allocateWithCaps(
  allocableCents: number,
  cohorts: InternalCohort[],
  weightsBps: number[],
  maxAllocationPct: number | null
): Map<string, number> {
  const result = new Map<string, number>();

  // No cap or no allocation: use simple LRM
  if (maxAllocationPct === null || allocableCents <= 0 || cohorts.length === 0) {
    const allocations = allocateLRM(allocableCents, weightsBps);
    for (let i = 0; i < cohorts.length; i++) {
      result.set(cohorts[i].id, allocations[i]);
    }
    return result;
  }

  // Cap in cents (percentage of allocation pool)
  const capCents = Math.round(allocableCents * maxAllocationPct);

  // Track allocation state for each cohort
  const cohortState = cohorts.map((c, i) => ({
    id: c.id,
    weightBps: weightsBps[i],
    allocated: 0,
    capped: false,
  }));

  // Iteratively allocate and spill excess
  let remaining = allocableCents;
  const maxIterations = cohorts.length + 1; // Safety bound

  for (let iter = 0; iter < maxIterations && remaining > 0; iter++) {
    const uncapped = cohortState.filter((cs) => !cs.capped);
    if (uncapped.length === 0) break;

    // Re-normalize weights for uncapped cohorts
    const uncappedWeightSum = uncapped.reduce((s, cs) => s + cs.weightBps, 0);
    if (uncappedWeightSum === 0) break;

    // Calculate pro-rata shares and check for caps
    let spill = 0;
    const shares: Array<{ cs: typeof cohortState[0]; share: number }> = [];

    for (const cs of uncapped) {
      const share = Math.round((remaining * cs.weightBps) / uncappedWeightSum);
      shares.push({ cs, share });
    }

    // Apply shares and detect caps
    for (const { cs, share } of shares) {
      const wouldBe = cs.allocated + share;
      if (wouldBe > capCents) {
        // Cap binds
        const excess = wouldBe - capCents;
        cs.allocated = capCents;
        cs.capped = true;
        spill += excess;
      } else {
        cs.allocated += share;
      }
    }

    // If no spill, allocation is complete
    if (spill === 0) break;

    // Continue with spill amount
    remaining = spill;
  }

  // Build result map
  for (const cs of cohortState) {
    result.set(cs.id, cs.allocated);
  }

  return result;
}

// =============================================================================
// Period Loop Engine
// =============================================================================

/**
 * Execute period-by-period capital allocation.
 *
 * This is the main entry point for pacing model cases.
 */
export function executePeriodLoop(input: NormalizedInput): PeriodLoopOutput {
  // Extract pacing window and category from original input
  const pacingWindowMonths =
    (input.original as any).fund?.pacing_window_months ?? input.pacingWindowMonths ?? 24;
  const category = (input.original as any).category || 'reserve_engine';

  // Calculate monthly pacing target
  // - reserve_engine: (commitment - reserve) / window (CA-007)
  // - pacing_engine/cohort_engine: commitment / window (CA-008+)
  const reserveDeduction = category === 'reserve_engine' ? input.effectiveBufferCents : 0;
  const monthlyPacingTargetCents = calculateMonthlyPacingTarget(
    input.commitmentCents,
    reserveDeduction,
    pacingWindowMonths
  );

  // Generate periods
  const periods = generatePeriods(
    input.startDate,
    input.endDate,
    input.rebalanceFrequency
  );

  // Track cumulative state
  let cumulativeCashCents = 0;
  let totalCashImpactCents = 0;
  let totalRecyclingPoolDeltaCents = 0;
  const cumulativeAllocationsByCohort = new Map<string, number>();
  const violations: Violation[] = [];

  // Initialize cohort allocations
  for (const cohort of input.cohorts) {
    cumulativeAllocationsByCohort.set(cohort.id, 0);
  }

  // Process each period
  const periodResults: PeriodResult[] = [];

  for (const period of periods) {
    // Get flows for this period
    const periodContributions = input.contributionsCents.filter(
      (f) => f.date >= period.startDate && f.date <= period.endDate
    );
    const periodDistributions = input.distributionsCents.filter(
      (f) => f.date >= period.startDate && f.date <= period.endDate
    );

    // Calculate cash from contributions
    const cashInCents = periodContributions.reduce(
      (sum, f) => sum + (f.amountCents ?? 0),
      0
    );

    // Classify distributions (CA-019, CA-020)
    const distClass = classifyDistributions(periodDistributions);

    // For reporting: track gross outflow (positive distributions only)
    const cashOutCents = distClass.lpPayoutOutflowCents;

    // Update cumulative cash: contributions + distribution effects
    // distClass.cashDeltaCents already accounts for recalls, recycling, and LP payouts
    cumulativeCashCents += cashInCents + distClass.cashDeltaCents;

    // Accumulate totals
    totalCashImpactCents += distClass.cashImpactCents;
    totalRecyclingPoolDeltaCents += distClass.recyclingPoolDeltaCents;

    // Calculate period pacing target (prorated for partial periods)
    const periodPacingTargetCents = calculatePeriodPacingTarget(
      monthlyPacingTargetCents,
      input.rebalanceFrequency,
      period.startDate,
      period.endDate
    );

    // Get active cohorts for this period
    const activeCohorts = getActiveCohorts(input.cohorts, period.endDate);

    // Calculate reserve target (for reporting, not constraining allocation in most categories)
    const reserveTargetCents = input.effectiveBufferCents;

    // Calculate available cash after reserve (only used for integration)
    const cashAfterReserveCents = Math.max(0, cumulativeCashCents - reserveTargetCents);

    // Period's net cash flow (contributions + distribution effects)
    const periodNetCashCents = cashInCents + distClass.cashDeltaCents;

    // Calculate allocation based on category
    // CAPACITY PLANNING MODEL: reserve is a planning target, not a cash constraint
    let allocableCents = 0;

    if (category === 'cohort_engine') {
      // Cohort engine: allocate contributions only (CAPACITY PLANNING MODEL)
      // Recalls (cashImpact) add to cash but NOT to allocatable pool
      // Per CA-019: when timeline has distributions, apply floor holdback
      // Per CA-014/CA-016: without any distributions, allocate full contributions
      const hasAnyDistributions = input.distributionsCents.length > 0;

      if (hasAnyDistributions) {
        // Has distributions in timeline: apply reserve floor holdback (CA-019)
        const reserveFloorCents = input.minCashBufferCents;
        const cashAboveFloorCents = Math.max(0, cumulativeCashCents - reserveFloorCents);
        allocableCents = Math.min(Math.max(0, cashInCents), cashAboveFloorCents);
      } else {
        // No distributions (CA-014, CA-016): allocate full contributions
        allocableCents = Math.max(0, cashInCents);
      }
    } else if (category === 'pacing_engine') {
      // Pacing engine: allocation capped by pacing target (CAPACITY PLANNING MODEL)
      // Use period's cash or pacing target, whichever is smaller
      allocableCents = Math.min(periodPacingTargetCents, Math.max(0, periodNetCashCents));
    } else if (category === 'reserve_engine') {
      // Reserve engine: floor and pacing interact based on presence of distributions
      // Per CA-013: without distributions, floor takes precedence over pacing
      // Per CA-007: with distributions, apply both constraints
      const reserveFloorCents = input.minCashBufferCents;
      const cashAboveFloorCents = Math.max(0, cumulativeCashCents - reserveFloorCents);
      const cashConstrainedCents = Math.min(cashAboveFloorCents, Math.max(0, periodNetCashCents));
      const hasAnyDistributions = input.distributionsCents.length > 0;

      if (hasAnyDistributions) {
        // With distributions (CA-007): pacing caps allocation
        allocableCents = Math.min(periodPacingTargetCents, cashConstrainedCents);
      } else {
        // Without distributions (CA-013): floor overrides pacing
        allocableCents = cashConstrainedCents;
      }
    } else {
      // Integration: all constraints apply (pacing + cash + reserve)
      // Use minimum of pacing target and available cash after reserve
      allocableCents = Math.min(periodPacingTargetCents, cashAfterReserveCents);
    }

    // Allocate to active cohorts using LRM with cap+spill (CA-015)
    let periodAllocationsByCohort = new Map<string, number>();

    if (allocableCents > 0 && activeCohorts.length > 0) {
      // Re-normalize weights for active cohorts only
      // (lifecycle cohorts may have weights > 1.0 total, but active subset sums to ~1.0)
      const activeWeights = activeCohorts.map((c) => c.weightBps);
      const activeWeightSum = activeWeights.reduce((a, b) => a + b, 0);

      // Normalize to WEIGHT_SCALE if not already
      const normalizedWeights = activeWeightSum === WEIGHT_SCALE
        ? activeWeights
        : activeWeights.map((w) => Math.round((w / activeWeightSum) * WEIGHT_SCALE));

      // Ensure exact sum (adjust last element for rounding)
      const normalizedSum = normalizedWeights.reduce((a, b) => a + b, 0);
      if (normalizedSum !== WEIGHT_SCALE && normalizedWeights.length > 0) {
        normalizedWeights[normalizedWeights.length - 1] += WEIGHT_SCALE - normalizedSum;
      }

      // Use cap+spill allocation (CA-015)
      // For cohort_engine: apply max_allocation_per_cohort cap with spill redistribution
      const capPct = category === 'cohort_engine' ? input.maxAllocationPerCohortPct : null;
      periodAllocationsByCohort = allocateWithCaps(
        allocableCents,
        activeCohorts,
        normalizedWeights,
        capPct
      );

      // Update cumulative allocations
      for (const cohort of activeCohorts) {
        const cohortAllocation = periodAllocationsByCohort.get(cohort.id) ?? 0;
        const prev = cumulativeAllocationsByCohort.get(cohort.id) ?? 0;
        cumulativeAllocationsByCohort.set(cohort.id, prev + cohortAllocation);
      }
    }

    // Total period allocation
    const periodAllocationTotal = Array.from(periodAllocationsByCohort.values()).reduce(
      (sum, v) => sum + v,
      0
    );

    // Calculate reserve balance
    // For CAPACITY PLANNING models (cohort_engine, pacing_engine): reserve = TARGET
    // For CASH CONSTRAINED models (reserve_engine, integration): reserve = min(cash - allocated, target)
    let reserveBalanceCents: number;
    if (category === 'cohort_engine' || category === 'pacing_engine') {
      // Capacity planning: reserve is the planning target
      reserveBalanceCents = reserveTargetCents;
    } else {
      // Cash constrained: reserve is what remains after allocation
      reserveBalanceCents = Math.min(
        Math.max(0, cumulativeCashCents - periodAllocationTotal),
        reserveTargetCents
      );
    }

    // Store period result
    periodResults.push({
      period,
      cashInCents,
      cashOutCents,
      endingCashCents: cumulativeCashCents,
      pacingTargetCents: periodPacingTargetCents,
      allocationCents: periodAllocationTotal,
      allocationsByCohort: periodAllocationsByCohort,
      reserveBalanceCents,
      // Distribution classification (CA-019, CA-020)
      cashImpactCents: distClass.cashImpactCents,
      recyclingPoolDeltaCents: distClass.recyclingPoolDeltaCents,
    });
  }

  // Calculate totals
  const totalAllocationCents = Array.from(cumulativeAllocationsByCohort.values()).reduce(
    (sum, v) => sum + v,
    0
  );

  const finalReserveBalanceCents =
    periodResults.length > 0
      ? periodResults[periodResults.length - 1].reserveBalanceCents
      : 0;

  return {
    periods: periodResults,
    totalAllocationCents,
    allocationsByCohort: cumulativeAllocationsByCohort,
    finalReserveBalanceCents,
    violations,
    // Distribution classification totals (CA-019, CA-020)
    totalCashImpactCents,
    totalRecyclingPoolDeltaCents,
  };
}

// =============================================================================
// Output Conversion
// =============================================================================

/**
 * Convert period loop output to standard CA engine output format.
 */
export function convertPeriodLoopOutput(
  input: NormalizedInput,
  loopOutput: PeriodLoopOutput
): CAEngineOutput {
  // Build allocations_by_cohort from cumulative map
  const allocationsByCohort = input.cohorts.map((cohort) => {
    const allocationCents = loopOutput.allocationsByCohort.get(cohort.id) ?? 0;
    return {
      cohort: cohort.name,
      amount: centsToOutputUnits(allocationCents, input.unitScale),
      type: 'planned' as const,
    };
  });

  // Build reserve_balance_over_time from period results
  const reserveBalanceOverTime: ReserveBalancePoint[] = loopOutput.periods
    .filter((p) => p.cashInCents > 0 || p.cashOutCents > 0 || p.allocationCents > 0)
    .map((p) => ({
      date: p.period.endDate,
      reserve_balance: centsToOutputUnits(p.reserveBalanceCents, input.unitScale),
      reserveBalanceCents: p.reserveBalanceCents,
      ending_cash: centsToOutputUnits(p.endingCashCents, input.unitScale),
      endingCashCents: p.endingCashCents,
      effective_buffer: centsToOutputUnits(input.effectiveBufferCents, input.unitScale),
      effectiveBufferCents: input.effectiveBufferCents,
    }));

  // Calculate final values
  const finalPeriod = loopOutput.periods[loopOutput.periods.length - 1];
  const endingCashCents = finalPeriod?.endingCashCents ?? 0;
  const reserveBalanceCents = loopOutput.finalReserveBalanceCents;
  const remainingCapacityCents = input.commitmentCents - loopOutput.totalAllocationCents;

  return {
    reserve_balance: centsToOutputUnits(reserveBalanceCents, input.unitScale),
    reserveBalanceCents,
    allocations_by_cohort: allocationsByCohort,
    reserve_balance_over_time: reserveBalanceOverTime,
    remaining_capacity: centsToOutputUnits(remainingCapacityCents, input.unitScale),
    remainingCapacityCents,
    cumulative_deployed: 0,
    cumulativeDeployedCents: 0,
    violations: loopOutput.violations,
    ending_cash: centsToOutputUnits(endingCashCents, input.unitScale),
    endingCashCents,
    effective_buffer: centsToOutputUnits(input.effectiveBufferCents, input.unitScale),
    effectiveBufferCents: input.effectiveBufferCents,
    // Distribution classification (CA-019, CA-020)
    cash_impact: centsToOutputUnits(loopOutput.totalCashImpactCents, input.unitScale),
    cashImpactCents: loopOutput.totalCashImpactCents,
    recycling_pool_delta: centsToOutputUnits(loopOutput.totalRecyclingPoolDeltaCents, input.unitScale),
    recyclingPoolDeltaCents: loopOutput.totalRecyclingPoolDeltaCents,
  };
}
