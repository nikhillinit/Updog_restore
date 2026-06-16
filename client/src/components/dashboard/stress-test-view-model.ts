import type { StressTestScenario } from '@/core/LiquidityEngine';
import type { ImpactDirection, ImpactSeverity } from '@/lib/display/impact-semantics';
import { dollarsToCents, formatCents } from '@/lib/units';

export type StressScenarioViewModel = {
  name: string;
  description: string;
  /** Ending cash in dollars. */
  endingCash: number;
  /** Signed change vs the current position, in dollars. */
  liquidityImpact: number;
  impactDirection: ImpactDirection;
  impactSeverity: ImpactSeverity;
  probability: number;
};

/**
 * Derive display semantics for a stress scenario. Impact direction is computed
 * from the change vs the baseline (current) cash position, not from whether
 * ending cash is positive.
 */
export function toStressScenarioViewModel(
  scenario: StressTestScenario,
  baselineCash: number
): StressScenarioViewModel {
  const liquidityImpact = scenario.endingCash - baselineCash;
  const impactDirection: ImpactDirection =
    liquidityImpact < 0 ? 'unfavorable' : liquidityImpact > 0 ? 'favorable' : 'neutral';

  return {
    name: scenario.name,
    description: scenario.description,
    endingCash: scenario.endingCash,
    liquidityImpact,
    impactDirection,
    impactSeverity: scenario.impactRating,
    probability: scenario.probability,
  };
}

export interface StressScenarioProofRow {
  key: 'baseline' | 'ending' | 'impact' | 'probability';
  label: string;
  value: string;
}

function formatProofMoney(value: number): string {
  return formatCents(dollarsToCents(value), { compact: true });
}

/**
 * Read-only "proof" rows for a stress scenario: the derivation that justifies the
 * displayed impact (baseline -> ending -> signed delta -> probability). Severity is
 * surfaced as a badge by the panel, not as a row, to avoid duplication.
 */
export function toStressScenarioProofRows(
  vm: StressScenarioViewModel,
  baselineCash: number
): StressScenarioProofRow[] {
  const signedImpact = `${vm.liquidityImpact >= 0 ? '+' : '-'}${formatProofMoney(
    Math.abs(vm.liquidityImpact)
  )}`;
  return [
    { key: 'baseline', label: 'Baseline cash position', value: formatProofMoney(baselineCash) },
    { key: 'ending', label: 'Projected ending cash', value: formatProofMoney(vm.endingCash) },
    { key: 'impact', label: 'Liquidity impact vs baseline', value: signedImpact },
    {
      key: 'probability',
      label: 'Scenario probability',
      value: `${Math.round(vm.probability * 100)}%`,
    },
  ];
}
