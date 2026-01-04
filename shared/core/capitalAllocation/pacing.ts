/**
 * Pacing Calculations for Capital Allocation
 *
 * Calculates pacing targets per period based on commitment and pacing window.
 * Handles carryover from under-deployed periods.
 *
 * @see docs/CA-SEMANTIC-LOCK.md
 */

import type { Period, RebalanceFrequency } from './periods';

export interface PacingTarget {
  periodId: string;
  targetCents: number;
  carryoverCents: number;
  effectiveTargetCents: number;
}

export interface PacingConfig {
  commitmentCents: number;
  pacingWindowMonths: number;
  frequency: RebalanceFrequency;
}

function periodsInWindow(pacingWindowMonths: number, frequency: RebalanceFrequency): number {
  switch (frequency) {
    case 'monthly':
      return pacingWindowMonths;
    case 'quarterly':
      return Math.ceil(pacingWindowMonths / 3);
    case 'annual':
      return Math.ceil(pacingWindowMonths / 12);
    default:
      return pacingWindowMonths;
  }
}

export function calculateBasePacingTarget(config: PacingConfig): number {
  const numPeriods = periodsInWindow(config.pacingWindowMonths, config.frequency);
  if (numPeriods <= 0) return 0;
  return Math.floor(config.commitmentCents / numPeriods);
}

export function calculatePacingTargets(
  periods: Period[],
  config: PacingConfig,
  deployedByPeriod: Map<string, number> = new Map()
): PacingTarget[] {
  const baseTarget = calculateBasePacingTarget(config);
  const targets: PacingTarget[] = [];
  let carryover = 0;

  for (const period of periods) {
    const effectiveTarget = baseTarget + carryover;

    targets.push({
      periodId: period.id,
      targetCents: baseTarget,
      carryoverCents: carryover,
      effectiveTargetCents: effectiveTarget,
    });

    const deployed = deployedByPeriod.get(period.id) ?? 0;
    const shortfall = Math.max(0, effectiveTarget - deployed);
    carryover = shortfall;
  }

  return targets;
}

export function getPacingTargetForPeriod(
  periodId: string,
  config: PacingConfig,
  priorCarryover: number = 0
): PacingTarget {
  const baseTarget = calculateBasePacingTarget(config);

  return {
    periodId,
    targetCents: baseTarget,
    carryoverCents: priorCarryover,
    effectiveTargetCents: baseTarget + priorCarryover,
  };
}

export function calculateDeployableAmount(
  pacingTarget: PacingTarget,
  availableCashCents: number,
  reserveRequiredCents: number
): number {
  const cashAfterReserve = Math.max(0, availableCashCents - reserveRequiredCents);
  return Math.min(pacingTarget.effectiveTargetCents, cashAfterReserve);
}
