import { describe, expect, it } from 'vitest';

import {
  toStressScenarioProofRows,
  toStressScenarioViewModel,
} from '@/components/dashboard/stress-test-view-model';
import type { StressTestScenario } from '@/core/LiquidityEngine';
import { getImpactTextClass } from '@/lib/display/impact-semantics';

function makeScenario(overrides: Partial<StressTestScenario> = {}): StressTestScenario {
  return {
    name: 'Distribution delay',
    description: 'LP distributions arrive later than expected',
    endingCash: 3_000_000,
    impactRating: 'medium',
    probability: 0.35,
    ...overrides,
  } as StressTestScenario;
}

describe('toStressScenarioViewModel', () => {
  it('maps ending cash below baseline to unfavorable impact', () => {
    const vm = toStressScenarioViewModel(makeScenario({ endingCash: 3_000_000 }), 5_000_000);

    expect(vm.impactDirection).toBe('unfavorable');
    expect(vm.liquidityImpact).toBe(-2_000_000);
  });

  it('maps ending cash above baseline to favorable impact', () => {
    const vm = toStressScenarioViewModel(makeScenario({ endingCash: 7_000_000 }), 5_000_000);

    expect(vm.impactDirection).toBe('favorable');
  });

  it('maps ending cash equal to baseline to neutral impact', () => {
    const vm = toStressScenarioViewModel(makeScenario({ endingCash: 5_000_000 }), 5_000_000);

    expect(vm.impactDirection).toBe('neutral');
  });

  it('copies impact severity from the scenario impact rating', () => {
    const vm = toStressScenarioViewModel(makeScenario({ impactRating: 'high' }), 5_000_000);

    expect(vm.impactSeverity).toBe('high');
  });

  it('keeps cash-positive but below-baseline scenarios unfavorable', () => {
    const vm = toStressScenarioViewModel(
      makeScenario({ endingCash: 1_000_000, impactRating: 'high' }),
      5_000_000
    );

    expect(vm.impactDirection).toBe('unfavorable');
    expect(getImpactTextClass({ direction: vm.impactDirection, severity: vm.impactSeverity })).toBe(
      'text-presson-negative'
    );
    expect(
      getImpactTextClass({ direction: vm.impactDirection, severity: vm.impactSeverity })
    ).not.toBe('text-presson-positive');
  });
});

describe('toStressScenarioProofRows', () => {
  it('produces labeled proof rows with a signed impact for an unfavorable scenario', () => {
    const vm = toStressScenarioViewModel(
      makeScenario({ endingCash: 3_000_000, impactRating: 'medium', probability: 0.35 }),
      5_000_000
    );
    const rows = toStressScenarioProofRows(vm, 5_000_000);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    expect(byKey.baseline).toBe('$5.0M');
    expect(byKey.ending).toBe('$3.0M');
    expect(byKey.impact).toBe('-$2.0M');
    expect(byKey.probability).toBe('35%');
  });

  it('shows a positive signed impact for a favorable scenario', () => {
    const vm = toStressScenarioViewModel(makeScenario({ endingCash: 7_000_000 }), 5_000_000);
    const rows = toStressScenarioProofRows(vm, 5_000_000);

    expect(rows.find((r) => r.key === 'impact')?.value).toBe('+$2.0M');
  });
});
