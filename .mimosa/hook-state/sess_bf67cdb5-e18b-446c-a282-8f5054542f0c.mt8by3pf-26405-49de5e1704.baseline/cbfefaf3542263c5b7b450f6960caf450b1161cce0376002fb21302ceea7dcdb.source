/**
 * Cohort Lifecycle and Allocation for Capital Allocation
 *
 * Handles:
 * - Determining which cohorts are active in a period
 * - Normalizing weights for active cohorts
 * - Allocating amounts to cohorts using LRM
 * - Per-cohort caps with spill-over
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 4.2, 4.3
 */

import type { InternalCohort } from './types';
import type { Period } from './periods';
import { allocateLRM, WEIGHT_SCALE } from './allocateLRM';

export function isCohortActiveOnDate(cohort: InternalCohort, date: string): boolean {
  if (cohort.startDate && date < cohort.startDate) {
    return false;
  }
  if (cohort.endDate && date > cohort.endDate) {
    return false;
  }
  return true;
}

export function isCohortActiveInPeriod(cohort: InternalCohort, period: Period): boolean {
  return isCohortActiveOnDate(cohort, period.endDate);
}

export function getActiveCohorts(cohorts: InternalCohort[], period: Period): InternalCohort[] {
  return cohorts.filter((c) => isCohortActiveInPeriod(c, period));
}

export function normalizeActiveWeights(activeCohorts: InternalCohort[]): number[] {
  if (activeCohorts.length === 0) {
    return [];
  }

  if (activeCohorts.length === 1) {
    return [WEIGHT_SCALE];
  }

  const totalWeight = activeCohorts.reduce((sum, c) => sum + c.weightBps, 0);

  if (totalWeight === 0) {
    const equalWeight = Math.floor(WEIGHT_SCALE / activeCohorts.length);
    const remainder = WEIGHT_SCALE - equalWeight * activeCohorts.length;
    return activeCohorts.map((_, i) => equalWeight + (i < remainder ? 1 : 0));
  }

  const normalized = activeCohorts.map((c) =>
    Math.floor((c.weightBps * WEIGHT_SCALE) / totalWeight)
  );

  const currentSum = normalized.reduce((a, b) => a + b, 0);
  if (currentSum !== WEIGHT_SCALE) {
    const firstValue = normalized[0];
    if (firstValue === undefined) {
      throw new Error('First element in normalized is undefined');
    }
    normalized[0] = firstValue + (WEIGHT_SCALE - currentSum);
  }

  return normalized;
}

export interface CohortAllocation {
  cohort: InternalCohort;
  allocationCents: number;
  capped: boolean;
}

export function allocateToCohorts(
  cohorts: InternalCohort[],
  period: Period,
  totalCents: number,
  globalCapPct: number | null = null,
  commitmentCents: number = 0
): { allocations: CohortAllocation[]; unallocatedCents: number } {
  const activeCohorts = getActiveCohorts(cohorts, period);

  if (activeCohorts.length === 0 || totalCents <= 0) {
    return {
      allocations: cohorts.map((c) => ({
        cohort: c,
        allocationCents: 0,
        capped: false,
      })),
      unallocatedCents: totalCents,
    };
  }

  const normalizedWeights = normalizeActiveWeights(activeCohorts);
  const lrmAllocations = allocateLRM(totalCents, normalizedWeights);

  const globalCapCents =
    globalCapPct != null && commitmentCents > 0 ? Math.floor(commitmentCents * globalCapPct) : null;

  const cappedAllocations = applyCohortsCapWithSpill(activeCohorts, lrmAllocations, globalCapCents);

  const allocationMap = new Map<string, { allocationCents: number; capped: boolean }>();

  for (let i = 0; i < activeCohorts.length; i++) {
    const cohort = activeCohorts[i];
    const allocationCents = cappedAllocations.allocations[i];
    const capped = cappedAllocations.capped[i];
    if (cohort === undefined) {
      throw new Error(`Cohort at index ${i} is undefined`);
    }
    if (allocationCents === undefined || capped === undefined) {
      throw new Error(`Allocation or capped status at index ${i} is undefined`);
    }
    allocationMap.set(cohort.id, {
      allocationCents,
      capped,
    });
  }

  const allocations = cohorts.map((c) => {
    const alloc = allocationMap.get(c.id);
    return {
      cohort: c,
      allocationCents: alloc?.allocationCents ?? 0,
      capped: alloc?.capped ?? false,
    };
  });

  return {
    allocations,
    unallocatedCents: cappedAllocations.unallocatedCents,
  };
}

function applyCohortsCapWithSpill(
  cohorts: InternalCohort[],
  initialAllocations: number[],
  globalCapCents: number | null
): { allocations: number[]; capped: boolean[]; unallocatedCents: number } {
  const allocations = [...initialAllocations];
  const capped = cohorts.map(() => false);
  let carryForward = 0;

  for (let i = 0; i < cohorts.length; i++) {
    const currentAllocation = allocations[i];
    if (currentAllocation === undefined) {
      throw new Error(`Allocation at index ${i} is undefined`);
    }
    allocations[i] = currentAllocation + carryForward;
    carryForward = 0;

    const cohort = cohorts[i];
    if (cohort === undefined) {
      throw new Error(`Cohort at index ${i} is undefined`);
    }
    const cohortCap = cohort.maxAllocationCents ?? globalCapCents ?? Infinity;

    const updatedAllocation = allocations[i];
    if (updatedAllocation === undefined) {
      throw new Error(`Updated allocation at index ${i} is undefined`);
    }
    if (updatedAllocation > cohortCap) {
      carryForward = updatedAllocation - cohortCap;
      allocations[i] = cohortCap;
      capped[i] = true;
    }
  }

  return {
    allocations,
    capped,
    unallocatedCents: carryForward,
  };
}

export function accumulateAllocations(
  cohorts: InternalCohort[],
  periodAllocations: CohortAllocation[]
): InternalCohort[] {
  const allocationMap = new Map(periodAllocations.map((a) => [a.cohort.id, a.allocationCents]));

  return cohorts.map((c) => ({
    ...c,
    allocationCents: c.allocationCents + (allocationMap.get(c.id) ?? 0),
  }));
}
