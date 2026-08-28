import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import {
  validateRecyclingBasis,
  computeRecyclingCapacity,
  classifyRecyclingTag,
  computeCalledCapitalPeriod,
  type RecyclingCapacityState,
  type ExitRecyclingPolicy,
} from '../../../../shared/lib/internal-economics/v2/fee-recycling-enforcer-v2';
import type { FeeProfile, FeeCalculationContext } from '../../../../shared/schemas/fee-profile';

function makeProfile(overrides?: Partial<FeeProfile>): FeeProfile {
  return {
    id: 'fp-1',
    name: 'Test Profile',
    tiers: [
      {
        basis: 'committed_capital' as const,
        annualRatePercent: new Decimal('0.02'),
        startYear: 1,
      },
    ],
    ...overrides,
  } as FeeProfile;
}

function makeContext(overrides?: Partial<FeeCalculationContext>): FeeCalculationContext {
  return {
    committedCapital: new Decimal('1000000'),
    calledCapitalPeriod: new Decimal('200000'),
    calledCapitalCumulative: new Decimal('500000'),
    calledCapitalNetOfReturns: new Decimal('400000'),
    investedCapital: new Decimal('300000'),
    fairMarketValue: new Decimal('350000'),
    unrealizedCost: new Decimal('280000'),
    currentMonth: 12,
    ...overrides,
  };
}

function zeroState(): RecyclingCapacityState {
  return {
    openingConsumedFeeRecycling: new Decimal(0),
    openingConsumedExitRecycling: new Decimal(0),
    currentRunConsumedFeeRecycling: new Decimal(0),
    currentRunConsumedExitRecycling: new Decimal(0),
  };
}

describe('validateRecyclingBasis', () => {
  it('passes when recycling disabled', () => {
    const profile = makeProfile({ recyclingPolicy: undefined });
    expect(validateRecyclingBasis(profile)).toBeNull();
  });

  it('passes for cumulative basis committed_capital', () => {
    const profile = makeProfile({
      recyclingPolicy: {
        enabled: true,
        recyclingCapPercent: new Decimal('0.10'),
        recyclingTermMonths: 60,
        basis: 'committed_capital',
        anticipatedRecycling: false,
      },
    });
    expect(validateRecyclingBasis(profile)).toBeNull();
  });

  it('passes for cumulative basis called_capital_cumulative', () => {
    const profile = makeProfile({
      recyclingPolicy: {
        enabled: true,
        recyclingCapPercent: new Decimal('0.10'),
        recyclingTermMonths: 60,
        basis: 'called_capital_cumulative',
        anticipatedRecycling: false,
      },
    });
    expect(validateRecyclingBasis(profile)).toBeNull();
  });

  it('refuses non-cumulative basis', () => {
    const profile = makeProfile({
      recyclingPolicy: {
        enabled: true,
        recyclingCapPercent: new Decimal('0.10'),
        recyclingTermMonths: 60,
        basis: 'invested_capital' as 'committed_capital',
        anticipatedRecycling: false,
      },
    });
    const result = validateRecyclingBasis(profile);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('UNSUPPORTED_V2_RECYCLING_BASIS');
  });
});

describe('computeRecyclingCapacity', () => {
  it('returns zero capacity when recycling disabled', () => {
    const profile = makeProfile({ recyclingPolicy: undefined });
    const result = computeRecyclingCapacity(
      profile,
      null,
      new Decimal('1000000'),
      makeContext(),
      zeroState()
    );
    expect('availableFeeCapacity' in result).toBe(true);
    if ('availableFeeCapacity' in result) {
      expect(result.availableFeeCapacity.toFixed(6)).toBe('0.000000');
    }
  });

  it('computes fee capacity correctly', () => {
    const profile = makeProfile({
      recyclingPolicy: {
        enabled: true,
        recyclingCapPercent: new Decimal('0.10'),
        recyclingTermMonths: 60,
        basis: 'committed_capital',
        anticipatedRecycling: false,
      },
    });
    const result = computeRecyclingCapacity(
      profile,
      null,
      new Decimal('1000000'),
      makeContext(),
      zeroState()
    );
    expect('availableFeeCapacity' in result).toBe(true);
    if ('availableFeeCapacity' in result) {
      expect(result.availableFeeCapacity.gt(0)).toBe(true);
    }
  });

  it('computes exit capacity correctly', () => {
    const profile = makeProfile({ recyclingPolicy: undefined });
    const exitPolicy: ExitRecyclingPolicy = {
      enabled: true,
      capPercentOfCommitted: new Decimal('0.05'),
    };
    const result = computeRecyclingCapacity(
      profile,
      exitPolicy,
      new Decimal('1000000'),
      makeContext(),
      zeroState()
    );
    expect('availableExitCapacity' in result).toBe(true);
    if ('availableExitCapacity' in result) {
      expect(result.availableExitCapacity.toFixed(6)).toBe('50000.000000');
    }
  });

  it('refuses when consumed exceeds cap', () => {
    const profile = makeProfile({
      recyclingPolicy: {
        enabled: true,
        recyclingCapPercent: new Decimal('0.10'),
        recyclingTermMonths: 60,
        basis: 'committed_capital',
        anticipatedRecycling: false,
      },
    });
    const state: RecyclingCapacityState = {
      openingConsumedFeeRecycling: new Decimal('200000'),
      openingConsumedExitRecycling: new Decimal(0),
      currentRunConsumedFeeRecycling: new Decimal(0),
      currentRunConsumedExitRecycling: new Decimal(0),
    };
    const result = computeRecyclingCapacity(
      profile,
      null,
      new Decimal('1000000'),
      makeContext(),
      state
    );
    expect('ok' in result && result.ok === false).toBe(true);
    if ('ok' in result && result.ok === false) {
      expect(result.refusal.code).toBe('RECYCLING_CAPACITY_EXCEEDED');
    }
  });
});

describe('classifyRecyclingTag', () => {
  it('returns zero for none tag', () => {
    const result = classifyRecyclingTag(
      'none',
      new Decimal('100000'),
      makeProfile(),
      null,
      new Decimal('50000'),
      new Decimal('50000')
    );
    expect('recyclableAmount' in result).toBe(true);
    if ('recyclableAmount' in result) {
      expect(result.recyclableAmount.isZero()).toBe(true);
      expect(result.tag).toBe('none');
    }
  });

  it('refuses fee tag when recycling disabled', () => {
    const profile = makeProfile({ recyclingPolicy: undefined });
    const result = classifyRecyclingTag(
      'fee',
      new Decimal('100000'),
      profile,
      null,
      new Decimal('50000'),
      new Decimal('50000')
    );
    expect('ok' in result && result.ok === false).toBe(true);
    if ('ok' in result && result.ok === false) {
      expect(result.refusal.code).toBe('FEE_RECYCLING_DISABLED');
    }
  });

  it('clamps fee recyclable to available capacity', () => {
    const profile = makeProfile({
      recyclingPolicy: {
        enabled: true,
        recyclingCapPercent: new Decimal('0.10'),
        recyclingTermMonths: 60,
        basis: 'committed_capital',
        anticipatedRecycling: false,
      },
    });
    const result = classifyRecyclingTag(
      'fee',
      new Decimal('100000'),
      profile,
      null,
      new Decimal('30000'),
      new Decimal('50000')
    );
    expect('recyclableAmount' in result).toBe(true);
    if ('recyclableAmount' in result) {
      expect(result.recyclableAmount.toFixed(6)).toBe('30000.000000');
    }
  });

  it('refuses exit tag when exit recycling disabled', () => {
    const result = classifyRecyclingTag(
      'exit',
      new Decimal('100000'),
      makeProfile(),
      null,
      new Decimal('50000'),
      new Decimal('50000')
    );
    expect('ok' in result && result.ok === false).toBe(true);
    if ('ok' in result && result.ok === false) {
      expect(result.refusal.code).toBe('FEE_RECYCLING_DISABLED');
    }
  });

  it('clamps exit recyclable to available exit capacity', () => {
    const exitPolicy: ExitRecyclingPolicy = {
      enabled: true,
      capPercentOfCommitted: new Decimal('0.05'),
    };
    const result = classifyRecyclingTag(
      'exit',
      new Decimal('100000'),
      makeProfile(),
      exitPolicy,
      new Decimal('50000'),
      new Decimal('20000')
    );
    expect('recyclableAmount' in result).toBe(true);
    if ('recyclableAmount' in result) {
      expect(result.recyclableAmount.toFixed(6)).toBe('20000.000000');
    }
  });
});

describe('computeCalledCapitalPeriod', () => {
  it('sums contributions', () => {
    const result = computeCalledCapitalPeriod(
      [
        { amount: new Decimal('100000'), partnerId: 'lp-1' },
        { amount: new Decimal('50000'), partnerId: 'lp-2' },
      ],
      []
    );
    expect(result instanceof Decimal).toBe(true);
    if (result instanceof Decimal) {
      expect(result.toFixed(6)).toBe('150000.000000');
    }
  });

  it('subtracts corrections', () => {
    const result = computeCalledCapitalPeriod(
      [{ amount: new Decimal('100000'), partnerId: 'lp-1' }],
      [{ amount: new Decimal('20000'), partnerId: 'lp-1' }]
    );
    expect(result instanceof Decimal).toBe(true);
    if (result instanceof Decimal) {
      expect(result.toFixed(6)).toBe('80000.000000');
    }
  });

  it('refuses negative net', () => {
    const result = computeCalledCapitalPeriod(
      [{ amount: new Decimal('10000'), partnerId: 'lp-1' }],
      [{ amount: new Decimal('50000'), partnerId: 'lp-1' }]
    );
    expect(!(result instanceof Decimal)).toBe(true);
    if (!(result instanceof Decimal)) {
      expect(result.refusal.code).toBe('NEGATIVE_PERIOD_BASIS');
    }
  });

  it('returns zero for empty inputs', () => {
    const result = computeCalledCapitalPeriod([], []);
    expect(result instanceof Decimal).toBe(true);
    if (result instanceof Decimal) {
      expect(result.isZero()).toBe(true);
    }
  });
});
