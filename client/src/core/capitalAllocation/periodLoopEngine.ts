/**
 * Period Loop Engine for Capital Allocation
 *
 * Orchestrates period-by-period capital allocation processing.
 * This is the core engine for CA-007 through CA-020 truth cases.
 *
 * @see docs/CA-SEMANTIC-LOCK.md
 */

import type { NormalizedInput } from './adapter';
import type {
  CAEngineOutput,
  InternalCohort,
  Violation,
  ReserveBalancePoint,
  CashFlow,
} from './types';
import { createViolation } from './types';
import { centsToOutputUnits, formatCohortOutput } from './adapter';
import { generatePeriods, type Period, findPeriodForDate } from './periods';
import {
  calculateBasePacingTarget,
  type PacingConfig,
  type PacingTarget,
} from './pacing';
import { allocateToCohorts, accumulateAllocations } from './cohorts';
import { roundPercentDerivedToCents } from './rounding';

interface PeriodState {
  cashCents: number;
  deployedCents: number;
  pacingCarryoverCents: number;
  cohorts: InternalCohort[];
}

interface PeriodResult {
  period: Period;
  reserveBalanceCents: number;
  endingCashCents: number;
  pacingTarget: PacingTarget;
  allocatedCents: number;
  violations: Violation[];
}

export interface PacingTargetOutput {
  period: string;
  target: number;
}

export interface PeriodLoopOutput extends CAEngineOutput {
  pacing_targets_by_period: PacingTargetOutput[];
}

export function executePeriodLoop(input: NormalizedInput): PeriodLoopOutput {
  const periods = generatePeriods(
    input.startDate,
    input.endDate,
    input.rebalanceFrequency
  );

  if (periods.length === 0) {
    return createEmptyPeriodLoopOutput(input);
  }

  const flowsByPeriod = bucketFlowsIntoPeriods(
    input.contributionsCents,
    input.distributionsCents,
    periods
  );

  const pacingConfig: PacingConfig = {
    commitmentCents: input.commitmentCents,
    pacingWindowMonths: input.original.fund.pacing_window_months ?? 24,
    frequency: input.rebalanceFrequency,
  };

  let state: PeriodState = {
    cashCents: 0,
    deployedCents: 0,
    pacingCarryoverCents: 0,
    cohorts: input.cohorts.map((c) => ({ ...c, allocationCents: 0 })),
  };

  const periodResults: PeriodResult[] = [];
  const allViolations: Violation[] = [];

  for (const period of periods) {
    const result = processPeriod(
      period,
      state,
      flowsByPeriod.get(period.id) ?? { contributions: [], distributions: [] },
      input,
      pacingConfig
    );

    periodResults.push(result);
    allViolations.push(...result.violations);

    state = {
      cashCents: result.endingCashCents,
      deployedCents: state.deployedCents + result.allocatedCents,
      pacingCarryoverCents: Math.max(
        0,
        result.pacingTarget.effectiveTargetCents - result.allocatedCents
      ),
      cohorts: state.cohorts.map((c) => {
        const allocated = result.allocatedCents > 0
          ? (c.allocationCents + (result.allocatedCents * c.weightBps / 10_000_000))
          : c.allocationCents;
        return { ...c, allocationCents: Math.floor(allocated) };
      }),
    };
  }

  return buildOutput(input, state, periodResults, allViolations, pacingConfig);
}

function bucketFlowsIntoPeriods(
  contributions: CashFlow[],
  distributions: CashFlow[],
  periods: Period[]
): Map<string, { contributions: CashFlow[]; distributions: CashFlow[] }> {
  const buckets = new Map<string, { contributions: CashFlow[]; distributions: CashFlow[] }>();

  for (const period of periods) {
    buckets.set(period.id, { contributions: [], distributions: [] });
  }

  for (const flow of contributions) {
    const period = findPeriodForDate(flow.date, periods);
    if (period) {
      buckets.get(period.id)?.contributions.push(flow);
    }
  }

  for (const flow of distributions) {
    const period = findPeriodForDate(flow.date, periods);
    if (period) {
      buckets.get(period.id)?.distributions.push(flow);
    }
  }

  return buckets;
}

function processPeriod(
  period: Period,
  state: PeriodState,
  flows: { contributions: CashFlow[]; distributions: CashFlow[] },
  input: NormalizedInput,
  pacingConfig: PacingConfig
): PeriodResult {
  const violations: Violation[] = [];

  const contributionsCents = flows.contributions.reduce(
    (sum, f) => sum + (f.amountCents ?? 0),
    0
  );
  const distributionsCents = flows.distributions.reduce(
    (sum, f) => sum + Math.abs(f.amountCents ?? 0),
    0
  );

  const endingCashCents =
    state.cashCents + contributionsCents - distributionsCents;

  const reserveRequiredCents = calculateReserveForPeriod(input, endingCashCents);
  const reserveBalanceCents = Math.min(endingCashCents, reserveRequiredCents);

  if (endingCashCents < reserveRequiredCents) {
    const isMinBufferViolation =
      input.minCashBufferCents > 0 && reserveBalanceCents < input.minCashBufferCents;

    violations.push(
      createViolation(
        isMinBufferViolation ? 'reserve_below_minimum' : 'buffer_breach',
        `Reserve balance (${reserveBalanceCents}) below required (${reserveRequiredCents}) in ${period.id}`,
        {
          severity: 'warning',
          period: period.id,
          expected: reserveRequiredCents,
          actual: reserveBalanceCents,
        }
      )
    );
  }

  const baseTarget = calculateBasePacingTarget(pacingConfig);
  const pacingTarget: PacingTarget = {
    periodId: period.id,
    targetCents: baseTarget,
    carryoverCents: state.pacingCarryoverCents,
    effectiveTargetCents: baseTarget + state.pacingCarryoverCents,
  };

  const availableForDeployment = Math.max(0, endingCashCents - reserveRequiredCents);
  const deployableFromPacing = pacingTarget.effectiveTargetCents;
  const deployableCents = Math.min(availableForDeployment, deployableFromPacing);

  const { allocations, unallocatedCents } = allocateToCohorts(
    state.cohorts,
    period,
    deployableCents,
    input.original.constraints?.max_allocation_per_cohort ?? null,
    input.commitmentCents
  );

  const allocatedCents = deployableCents - unallocatedCents;

  state.cohorts = accumulateAllocations(state.cohorts, allocations);

  const finalEndingCashCents = endingCashCents - allocatedCents;

  return {
    period,
    reserveBalanceCents: Math.min(finalEndingCashCents, reserveRequiredCents),
    endingCashCents: finalEndingCashCents,
    pacingTarget,
    allocatedCents,
    violations,
  };
}

function calculateReserveForPeriod(
  input: NormalizedInput,
  endingCashCents: number
): number {
  const targetReserveCents = roundPercentDerivedToCents(
    input.commitmentCents * input.targetReservePct
  );
  return Math.max(input.minCashBufferCents, targetReserveCents);
}

function buildOutput(
  input: NormalizedInput,
  finalState: PeriodState,
  periodResults: PeriodResult[],
  violations: Violation[],
  pacingConfig: PacingConfig
): PeriodLoopOutput {
  const reserveBalanceOverTime: ReserveBalancePoint[] = periodResults.map((r) => ({
    date: r.period.endDate,
    reserve_balance: centsToOutputUnits(r.reserveBalanceCents, input.unitScale),
    reserveBalanceCents: r.reserveBalanceCents,
    ending_cash: centsToOutputUnits(r.endingCashCents, input.unitScale),
    endingCashCents: r.endingCashCents,
  }));

  const pacingTargetsByPeriod: PacingTargetOutput[] = periodResults.map((r) => ({
    period: r.period.id,
    target: centsToOutputUnits(r.pacingTarget.targetCents, input.unitScale),
  }));

  const lastResult = periodResults[periodResults.length - 1];
  const finalReserveBalanceCents = lastResult?.reserveBalanceCents ?? 0;
  const finalEndingCashCents = lastResult?.endingCashCents ?? 0;

  const totalAllocatedCents = finalState.cohorts.reduce(
    (sum, c) => sum + c.allocationCents,
    0
  );
  const remainingCapacityCents = input.commitmentCents - totalAllocatedCents;

  return {
    reserve_balance: centsToOutputUnits(finalReserveBalanceCents, input.unitScale),
    reserveBalanceCents: finalReserveBalanceCents,

    allocations_by_cohort: finalState.cohorts.map((c) =>
      formatCohortOutput(c, input.unitScale)
    ),

    reserve_balance_over_time: reserveBalanceOverTime,

    pacing_targets_by_period: pacingTargetsByPeriod,

    remaining_capacity: centsToOutputUnits(remainingCapacityCents, input.unitScale),
    remainingCapacityCents,

    cumulative_deployed: centsToOutputUnits(finalState.deployedCents, input.unitScale),
    cumulativeDeployedCents: finalState.deployedCents,

    violations,

    ending_cash: centsToOutputUnits(finalEndingCashCents, input.unitScale),
    endingCashCents: finalEndingCashCents,

    effective_buffer: centsToOutputUnits(input.effectiveBufferCents, input.unitScale),
    effectiveBufferCents: input.effectiveBufferCents,
  };
}

function createEmptyPeriodLoopOutput(input: NormalizedInput): PeriodLoopOutput {
  return {
    reserve_balance: 0,
    reserveBalanceCents: 0,
    allocations_by_cohort: [],
    reserve_balance_over_time: [],
    pacing_targets_by_period: [],
    remaining_capacity: centsToOutputUnits(input.commitmentCents, input.unitScale),
    remainingCapacityCents: input.commitmentCents,
    cumulative_deployed: 0,
    cumulativeDeployedCents: 0,
    violations: [],
    ending_cash: 0,
    endingCashCents: 0,
    effective_buffer: centsToOutputUnits(input.effectiveBufferCents, input.unitScale),
    effectiveBufferCents: input.effectiveBufferCents,
  };
}

export function requiresPeriodLoop(input: NormalizedInput): boolean {
  if (input.cohorts.length > 1) {
    return true;
  }

  const startYear = parseInt(input.startDate.substring(0, 4), 10);
  const endYear = parseInt(input.endDate.substring(0, 4), 10);
  const startMonth = parseInt(input.startDate.substring(5, 7), 10);
  const endMonth = parseInt(input.endDate.substring(5, 7), 10);

  const monthSpan = (endYear - startYear) * 12 + (endMonth - startMonth);

  if (monthSpan > 3) {
    return true;
  }

  return false;
}
