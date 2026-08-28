import { describe, it, expect } from 'vitest';
import { Decimal } from '../../../../shared/lib/decimal-config';
import {
  buildMonthlySchedule,
  computePeriodAccrual,
  computeAccrualPostingsForSchedule,
  computeEpochMonth,
  isPostable,
} from '../../../../shared/lib/internal-economics/v2/preferred-return-accrual-v2';

describe('buildMonthlySchedule', () => {
  it('builds schedule spanning multiple months', () => {
    const schedule = buildMonthlySchedule('2024-01-01T00:00:00Z', '2024-06-30T00:00:00Z');
    expect(schedule).toHaveLength(6);
    expect(schedule[0]!.monthIndex).toBe(0);
    expect(schedule[5]!.monthIndex).toBe(5);
  });

  it('marks establishment mid-month as stub', () => {
    const schedule = buildMonthlySchedule('2024-01-15T00:00:00Z', '2024-03-31T00:00:00Z');
    expect(schedule[0]!.isStub).toBe(true);
    expect(schedule[0]!.periodStart).toBe('2024-01-15T00:00:00Z');
  });

  it('marks calculation mid-month as stub', () => {
    const schedule = buildMonthlySchedule('2024-01-01T00:00:00Z', '2024-03-15T00:00:00Z');
    const last = schedule[schedule.length - 1]!;
    expect(last.isStub).toBe(true);
    expect(last.periodEnd).toBe('2024-03-15T00:00:00Z');
  });

  it('handles single month', () => {
    const schedule = buildMonthlySchedule('2024-01-01T00:00:00Z', '2024-01-31T00:00:00Z');
    expect(schedule).toHaveLength(1);
  });

  it('spans year boundary', () => {
    const schedule = buildMonthlySchedule('2024-11-01T00:00:00Z', '2025-02-28T00:00:00Z');
    expect(schedule).toHaveLength(4);
    expect(schedule[2]!.periodStart).toBe('2025-01-01T00:00:00Z');
  });
});

describe('computePeriodAccrual', () => {
  const rate8pct = new Decimal('0.08');

  it('computes simple accrual', () => {
    const accrual = computePeriodAccrual(new Decimal('1000000'), new Decimal(0), {
      annualRate: rate8pct,
      rateMode: 'simple',
    });
    const expected = new Decimal('1000000').mul(rate8pct).div(12);
    expect(accrual.toFixed(6)).toBe(expected.toFixed(6));
  });

  it('simple mode ignores prior accrued', () => {
    const withPrior = computePeriodAccrual(new Decimal('1000000'), new Decimal('50000'), {
      annualRate: rate8pct,
      rateMode: 'simple',
    });
    const withoutPrior = computePeriodAccrual(new Decimal('1000000'), new Decimal(0), {
      annualRate: rate8pct,
      rateMode: 'simple',
    });
    expect(withPrior.eq(withoutPrior)).toBe(true);
  });

  it('computes compounded accrual', () => {
    const base = new Decimal('1000000');
    const priorAccrued = new Decimal('10000');
    const accrual = computePeriodAccrual(base, priorAccrued, {
      annualRate: rate8pct,
      rateMode: 'effective_annual_compounded',
    });
    const monthlyRate = rate8pct.plus(1).pow(new Decimal(1).div(12)).minus(1);
    const expected = base.plus(priorAccrued).mul(monthlyRate);
    expect(accrual.toFixed(12)).toBe(expected.toFixed(12));
  });

  it('compounded mode includes prior accrued in base', () => {
    const base = new Decimal('1000000');
    const a1 = computePeriodAccrual(base, new Decimal(0), {
      annualRate: rate8pct,
      rateMode: 'effective_annual_compounded',
    });
    const a2 = computePeriodAccrual(base, new Decimal('50000'), {
      annualRate: rate8pct,
      rateMode: 'effective_annual_compounded',
    });
    expect(a2.gt(a1)).toBe(true);
  });

  it('returns zero for zero or negative base', () => {
    expect(
      computePeriodAccrual(new Decimal(0), new Decimal(0), {
        annualRate: rate8pct,
        rateMode: 'simple',
      }).isZero()
    ).toBe(true);

    expect(
      computePeriodAccrual(new Decimal('-100'), new Decimal(0), {
        annualRate: rate8pct,
        rateMode: 'simple',
      }).isZero()
    ).toBe(true);
  });
});

describe('computeAccrualPostingsForSchedule', () => {
  it('excludes GP when treatment is excluded', () => {
    const schedule = buildMonthlySchedule('2024-01-01T00:00:00Z', '2024-03-31T00:00:00Z');
    const config = {
      annualRate: new Decimal('0.08'),
      rateMode: 'simple' as const,
    };
    const partners = [
      {
        partnerId: 'lp-1',
        isGp: false,
        unreturnedSettledCashCapital: new Decimal('1000000'),
        accruedPreference: new Decimal(0),
      },
      {
        partnerId: 'gp-1',
        isGp: true,
        unreturnedSettledCashCapital: new Decimal('100000'),
        accruedPreference: new Decimal(0),
      },
    ];

    const postings = computeAccrualPostingsForSchedule(schedule, config, partners, 'excluded');
    expect(postings).toHaveLength(3);
    for (const posting of postings) {
      const gpEntry = posting.entries.find((e) => e.partnerId === 'gp-1');
      expect(gpEntry!.periodAccrual.isZero()).toBe(true);
    }
  });

  it('includes GP when treatment is pari_passu', () => {
    const schedule = buildMonthlySchedule('2024-01-01T00:00:00Z', '2024-02-29T00:00:00Z');
    const config = {
      annualRate: new Decimal('0.08'),
      rateMode: 'simple' as const,
    };
    const partners = [
      {
        partnerId: 'gp-1',
        isGp: true,
        unreturnedSettledCashCapital: new Decimal('100000'),
        accruedPreference: new Decimal(0),
      },
    ];

    const postings = computeAccrualPostingsForSchedule(schedule, config, partners, 'pari_passu');
    expect(postings[0]!.entries[0]!.periodAccrual.gt(0)).toBe(true);
  });

  it('accumulates accrued preference across periods for compounded mode', () => {
    const schedule = buildMonthlySchedule('2024-01-01T00:00:00Z', '2024-03-31T00:00:00Z');
    const config = {
      annualRate: new Decimal('0.08'),
      rateMode: 'effective_annual_compounded' as const,
    };
    const partners = [
      {
        partnerId: 'lp-1',
        isGp: false,
        unreturnedSettledCashCapital: new Decimal('1000000'),
        accruedPreference: new Decimal(0),
      },
    ];

    const postings = computeAccrualPostingsForSchedule(schedule, config, partners, 'pari_passu');

    const accruals = postings.map((p) => p.entries[0]!.periodAccrual);
    expect(accruals[1]!.gt(accruals[0]!)).toBe(true);
    expect(accruals[2]!.gt(accruals[1]!)).toBe(true);
  });
});

describe('isPostable', () => {
  it('returns true when periodEnd <= distributionInstant', () => {
    const period = {
      periodStart: '2024-01-01T00:00:00Z',
      periodEnd: '2024-01-31T23:59:59Z',
      monthIndex: 0,
      isStub: false,
    };
    expect(isPostable(period, '2024-01-31T23:59:59Z')).toBe(true);
    expect(isPostable(period, '2024-02-15T00:00:00Z')).toBe(true);
  });

  it('returns false when periodEnd > distributionInstant', () => {
    const period = {
      periodStart: '2024-01-01T00:00:00Z',
      periodEnd: '2024-01-31T23:59:59Z',
      monthIndex: 0,
      isStub: false,
    };
    expect(isPostable(period, '2024-01-15T00:00:00Z')).toBe(false);
  });
});

describe('computeEpochMonth', () => {
  it('returns 0 for same month', () => {
    expect(computeEpochMonth('2024-01-01T00:00:00Z', '2024-01-15T00:00:00Z')).toBe(0);
  });

  it('counts months across year boundary', () => {
    expect(computeEpochMonth('2024-11-01T00:00:00Z', '2025-02-15T00:00:00Z')).toBe(3);
  });

  it('counts 12 months in same month next year', () => {
    expect(computeEpochMonth('2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z')).toBe(12);
  });
});
