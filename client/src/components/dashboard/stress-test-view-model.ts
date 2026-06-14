import type { StressTestScenario } from '@/core/LiquidityEngine';
import type { ImpactDirection, ImpactSeverity } from '@/lib/display/impact-semantics';

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
