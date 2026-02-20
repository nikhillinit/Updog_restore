import { describe, it } from 'vitest';
import {
  adaptTruthCaseInput,
  type TruthCaseInput,
} from '../../client/src/core/capitalAllocation/adapter';
import {
  executePeriodLoop,
  convertPeriodLoopOutput,
} from '../../client/src/core/capitalAllocation/periodLoop';

describe('Debug CA-020', () => {
  it('should handle integration case correctly', () => {
    const input: TruthCaseInput = {
      fund: {
        commitment: 40000000,
        target_reserve_pct: 0.2,
        reserve_policy: 'static_pct',
        pacing_window_months: 24,
        vintage_year: 2024,
      },
      timeline: {
        start_date: '2025-01-01',
        end_date: '2026-12-31',
        rebalance_frequency: 'monthly',
      },
      flows: {
        contributions: [{ date: '2025-04-01', amount: 5000000 }],
        distributions: [{ date: '2025-05-01', amount: 2000000 }],
      },
      constraints: {
        min_cash_buffer: 4000000,
        max_allocation_per_cohort: 0.5,
        rebalance_frequency: 'monthly',
      },
      cohorts: [
        { name: 'A', start_date: '2025-01-01', end_date: '2026-12-31', weight: 0.6 },
        { name: 'B', start_date: '2025-01-01', end_date: '2026-12-31', weight: 0.4 },
      ],
    };

    (input as any).category = 'integration';
    if (input.flows?.distributions) {
      (input.flows.distributions[0] as any).recycle_eligible = true;
    }

    const normalizedInput = adaptTruthCaseInput(input);
    const periodLoopResult = executePeriodLoop(normalizedInput);
    const result = convertPeriodLoopOutput(normalizedInput, periodLoopResult);

    const apr = periodLoopResult.periods.find((p) => p.period.id === '2025-04');
    const may = periodLoopResult.periods.find((p) => p.period.id === '2025-05');

    console.warn(
      'April alloc:',
      apr?.allocationCents,
      'cohorts:',
      apr ? Object.fromEntries(apr.allocationsByCohort) : {}
    );
    console.warn(
      'May alloc:',
      may?.allocationCents,
      'cohorts:',
      may ? Object.fromEntries(may.allocationsByCohort) : {}
    );
    console.warn('Total:', result.allocations_by_cohort);
    console.warn('Expected: A: 2500000, B: 2500000');
  });
});
