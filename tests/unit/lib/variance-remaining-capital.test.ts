import { describe, expect, it } from 'vitest';

import { computeRemainingCapital } from '@/lib/variance-remaining-capital';

describe('computeRemainingCapital', () => {
  it('computes remaining capital when ahead of plan', () => {
    expect(
      computeRemainingCapital({
        actualCommitted: 100,
        actualDeployed: 40,
        targetDeployed: 60,
      })
    ).toEqual({
      remainingDeployableCapital: 60,
      plannedRemainingDeployableCapital: 40,
      remainingDeployableGap: 20,
    });
  });

  it('computes remaining capital when behind plan', () => {
    expect(
      computeRemainingCapital({
        actualCommitted: 100,
        actualDeployed: 80,
        targetDeployed: 50,
      })
    ).toEqual({
      remainingDeployableCapital: 20,
      plannedRemainingDeployableCapital: 50,
      remainingDeployableGap: -30,
    });
  });

  it('computes remaining capital when exactly on plan', () => {
    expect(
      computeRemainingCapital({
        actualCommitted: 100,
        actualDeployed: 50,
        targetDeployed: 50,
      })
    ).toEqual({
      remainingDeployableCapital: 50,
      plannedRemainingDeployableCapital: 50,
      remainingDeployableGap: 0,
    });
  });

  it('computes remaining capital when target deployed is zero', () => {
    expect(
      computeRemainingCapital({
        actualCommitted: 100,
        actualDeployed: 30,
        targetDeployed: 0,
      })
    ).toEqual({
      remainingDeployableCapital: 70,
      plannedRemainingDeployableCapital: 100,
      remainingDeployableGap: -30,
    });
  });

  it('clamps negative actual remaining capital when deployed exceeds committed', () => {
    expect(
      computeRemainingCapital({
        actualCommitted: 100,
        actualDeployed: 120,
        targetDeployed: 50,
      })
    ).toEqual({
      remainingDeployableCapital: 0,
      plannedRemainingDeployableCapital: 50,
      remainingDeployableGap: -50,
    });
  });

  it('returns null summaries when all inputs are null', () => {
    expect(
      computeRemainingCapital({
        actualCommitted: null,
        actualDeployed: null,
        targetDeployed: null,
      })
    ).toEqual({
      remainingDeployableCapital: null,
      plannedRemainingDeployableCapital: null,
      remainingDeployableGap: null,
    });
  });

  it('returns null summaries when actual committed is missing', () => {
    expect(
      computeRemainingCapital({
        actualCommitted: null,
        actualDeployed: 40,
        targetDeployed: 60,
      })
    ).toEqual({
      remainingDeployableCapital: null,
      plannedRemainingDeployableCapital: null,
      remainingDeployableGap: null,
    });
  });

  it('returns partial remaining capital when target deployed is missing', () => {
    expect(
      computeRemainingCapital({
        actualCommitted: 100,
        actualDeployed: 40,
        targetDeployed: null,
      })
    ).toEqual({
      remainingDeployableCapital: 60,
      plannedRemainingDeployableCapital: null,
      remainingDeployableGap: null,
    });
  });
});
