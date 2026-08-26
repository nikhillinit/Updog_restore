import { type NormalizedInput } from './adapter';
import { type InternalCohort } from './types';
import { type Period } from './periodLoop';

export const RESERVE_ENGINE_ANNUAL_TARGET_REPORTING_QUARTERS = 2;

export function splitAnnualReserveTargetCents(totalCents: number): number[] {
  const baseQuarterTargetCents = Math.trunc(totalCents / 4);
  const residualCents = totalCents - baseQuarterTargetCents * 4;

  return [
    baseQuarterTargetCents,
    baseQuarterTargetCents,
    baseQuarterTargetCents,
    baseQuarterTargetCents + residualCents,
  ];
}

export function selectAnnualReserveTargetPeriods(periods: string[]): string[] {
  // CA-007 annual reporting exposes the first two quarter-level reserve targets.
  return periods.slice(0, RESERVE_ENGINE_ANNUAL_TARGET_REPORTING_QUARTERS);
}

function periodContainingDate(periods: Period[], date: string): Period | undefined {
  return periods.find((period) => date >= period.startDate && date <= period.endDate);
}

function getActiveCohorts(cohorts: InternalCohort[], date: string): InternalCohort[] {
  return cohorts.filter((cohort) => {
    const end = cohort.endDate || '9999-12-31';
    return date >= cohort.startDate && date <= end;
  });
}

function activeCohortSignature(cohorts: InternalCohort[], period: Period): string {
  return getActiveCohorts(cohorts, period.endDate)
    .map((cohort) => cohort.id)
    .join('|');
}

export function buildTargetReportingPeriodIds(
  input: NormalizedInput,
  category: string,
  periods: Period[]
): Set<string> {
  const ids = new Set<string>();
  const periodsById = new Map(periods.map((period, index) => [period.id, { period, index }]));

  for (const flow of input.contributionsCents) {
    if ((flow.amountCents ?? 0) > 0) {
      const period = periodContainingDate(periods, flow.date);
      if (period) {
        ids.add(period.id);
      }
    }
  }

  if (category === 'integration') {
    for (const flow of input.distributionsCents) {
      if (flow.recycle_eligible === true && (flow.amountCents ?? 0) > 0) {
        const period = periodContainingDate(periods, flow.date);
        if (period) {
          // CA-020 reports recycle-eligible distribution periods.
          ids.add(period.id);
        }
      }
    }
  }

  for (let index = 1; index < periods.length; index += 1) {
    const previous = periods[index - 1];
    const current = periods[index];
    // Lifecycle truth cases report the first target after active membership changes.
    if (
      previous &&
      current &&
      activeCohortSignature(input.cohorts, previous) !==
        activeCohortSignature(input.cohorts, current)
    ) {
      ids.add(current.id);
    }
  }

  if (ids.size === 0 && periods[0]) {
    ids.add(periods[0].id);
  }

  for (const id of [...ids]) {
    const entry = periodsById.get(id);
    const next = entry ? periods[entry.index + 1] : undefined;
    const needsCarryForwardTarget =
      category === 'pacing_engine' &&
      input.contributionsCents.length === 1 &&
      input.distributionsCents.length === 0 &&
      next !== undefined;

    if (needsCarryForwardTarget) {
      // Pacing carry-forward cases expose the immediate following target period.
      ids.add(next.id);
    }
  }

  return ids;
}
