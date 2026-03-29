import { describe, expect, it } from 'vitest';

import {
  adaptTruthCaseInput as adaptClientTruthCase,
  type TruthCaseInput as ClientTruthCaseInput,
} from '@/core/capitalAllocation/adapter';
import { executeCapitalAllocation as executeClientCapitalAllocation } from '@/core/capitalAllocation/CapitalAllocationEngine';
import { adaptTruthCaseInput as adaptSharedTruthCase } from '@shared/core/capitalAllocation/adapter';
import { executeCapitalAllocation as executeSharedCapitalAllocation } from '@shared/core/capitalAllocation/CapitalAllocationEngine';

function createTruthCaseInput(
  reservePolicy: 'static_pct' | 'dynamic_ratio'
): ClientTruthCaseInput {
  return {
    fund: {
      commitment: 100,
      target_reserve_pct: 0.2,
      reserve_policy: reservePolicy,
      vintage_year: 2024,
    },
    constraints: {
      min_cash_buffer: 1,
    },
    flows: {
      contributions: [{ date: '2024-01-15', amount: 30 }],
      distributions: [{ date: '2024-06-30', amount: 10 }],
    },
    cohorts: [
      { id: 'A', start_date: '2024-01-01', weight: 0.4 },
      { id: 'B', start_date: '2024-06-01', weight: 0.6 },
    ],
  };
}

describe('CapitalAllocationEngine parity', () => {
  it('normalizes static_pct truth-case input identically', () => {
    const input = createTruthCaseInput('static_pct');

    const clientNormalized = adaptClientTruthCase(input);
    const sharedNormalized = adaptSharedTruthCase(input);

    expect(sharedNormalized).toEqual(clientNormalized);
  });

  it('normalizes dynamic_ratio truth-case input identically', () => {
    const input = createTruthCaseInput('dynamic_ratio');

    const clientNormalized = adaptClientTruthCase(input);
    const sharedNormalized = adaptSharedTruthCase(input);

    expect(sharedNormalized).toEqual(clientNormalized);
  });

  it('produces matching static_pct outputs', () => {
    const input = createTruthCaseInput('static_pct');
    const clientNormalized = adaptClientTruthCase(input);
    const sharedNormalized = adaptSharedTruthCase(input);

    const clientResult = executeClientCapitalAllocation(clientNormalized);
    const sharedResult = executeSharedCapitalAllocation(sharedNormalized);

    expect(sharedResult).toEqual(clientResult);
    expect(sharedResult.reserve_balance).toBe(20);
  });

  it('produces matching dynamic_ratio outputs', () => {
    const input = createTruthCaseInput('dynamic_ratio');
    const clientNormalized = adaptClientTruthCase(input);
    const sharedNormalized = adaptSharedTruthCase(input);

    const clientResult = executeClientCapitalAllocation(clientNormalized);
    const sharedResult = executeSharedCapitalAllocation(sharedNormalized);

    expect(sharedResult).toEqual(clientResult);
    expect(sharedResult.reserve_balance).toBe(4);
  });
});
