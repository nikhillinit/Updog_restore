import { describe, expect, it } from 'vitest';

import {
  ReserveEnvelopeV1Schema,
  type ReserveEnvelopeV1,
} from '../../../../shared/contracts/reserve-envelope-v1.contract';
import {
  buildReserveEnvelopeFromSources,
  DEFAULT_FUND_LIFE_YEARS,
  type ReserveEnvelopeSources,
} from '../../../../server/services/reserves/reserve-envelope-service';

const FUND_ID = 1;
const AS_OF = '2026-07-19';

function baseSources(overrides: Partial<ReserveEnvelopeSources> = {}): ReserveEnvelopeSources {
  return {
    fund: {
      sizeDollars: '100000000', // $100M committed
      deployedCapitalDollars: '0',
      managementFeeRate: '0.0200', // 2% (fraction)
      baseCurrency: 'USD',
    },
    investments: [{ amountDollars: '40000000' }, { amountDollars: '20000000' }], // $60M deployed
    config: {
      fundLifeYears: 10,
      expenses: [{ monthlyAmountDollars: 50000, startMonth: 0, endMonth: 120 }], // $50k * 120 = $6M
      recyclingEnabled: true,
      recyclingCapDollars: 5000000, // $5M
    },
    ...overrides,
  };
}

function build(sources: ReserveEnvelopeSources): ReserveEnvelopeV1 {
  return buildReserveEnvelopeFromSources({ fundId: FUND_ID, asOfDate: AS_OF, sources });
}

describe('buildReserveEnvelopeFromSources', () => {
  it('computes a fully-sourced envelope with cents-exact conservation and trust', () => {
    const envelope = build(baseSources());
    // committed 100M - deployed 60M - fees (100M*0.02*10=20M) - expenses 6M + recycling 5M = 19M
    expect(envelope.availableReservesCents).toBe(19_000_000_00);
    expect(envelope.components.committedCapital.amountCents).toBe(100_000_000_00);
    expect(envelope.components.deployedCapital.amountCents).toBe(-60_000_000_00);
    expect(envelope.components.managementFees.amountCents).toBe(-20_000_000_00);
    expect(envelope.components.fundExpenses.amountCents).toBe(-6_000_000_00);
    expect(envelope.components.exitRecycling.amountCents).toBe(5_000_000_00);
    expect(envelope.components.deployedCapital.status).toBe('derived');
    expect(envelope.components.managementFees.status).toBe('derived');
    expect(envelope.trustedForActivation).toBe(true);
    expect(envelope.blocked).toBe(false);
    expect(() => ReserveEnvelopeV1Schema.parse(envelope)).not.toThrow();
  });

  it('discloses defaulted fees and unavailable expenses/recycling when config is absent', () => {
    const envelope = build(baseSources({ config: null }));
    expect(envelope.components.managementFees.status).toBe('defaulted');
    expect(envelope.components.fundExpenses.status).toBe('unavailable');
    expect(envelope.components.fundExpenses.amountCents).toBe(0);
    expect(envelope.components.exitRecycling.status).toBe('unavailable');
    expect(envelope.components.exitRecycling.amountCents).toBe(0);
    // fees default to DEFAULT_FUND_LIFE_YEARS: 100M * 0.02 * 10 = 20M
    expect(envelope.components.managementFees.amountCents).toBe(-20_000_000_00);
    expect(DEFAULT_FUND_LIFE_YEARS).toBe(10);
    // committed 100M - deployed 60M - fees 20M - 0 + 0 = 20M
    expect(envelope.availableReservesCents).toBe(20_000_000_00);
    expect(envelope.trustedForActivation).toBe(false);
  });

  it('reads deployed capital from funds.deployed_capital when no investment rows exist', () => {
    const envelope = build(
      baseSources({
        investments: [],
        fund: {
          sizeDollars: '100000000',
          deployedCapitalDollars: '30000000',
          managementFeeRate: '0.0200',
          baseCurrency: 'USD',
        },
      })
    );
    expect(envelope.components.deployedCapital.status).toBe('observed');
    expect(envelope.components.deployedCapital.amountCents).toBe(-30_000_000_00);
  });

  it('defaults deployed capital to 0 when neither investments nor deployed_capital exist', () => {
    const envelope = build(
      baseSources({
        investments: [],
        fund: {
          sizeDollars: '100000000',
          deployedCapitalDollars: null,
          managementFeeRate: '0.0200',
          baseCurrency: 'USD',
        },
      })
    );
    expect(envelope.components.deployedCapital.status).toBe('defaulted');
    expect(envelope.components.deployedCapital.amountCents).toBe(0);
    expect(envelope.trustedForActivation).toBe(false);
  });

  it('blocks non-USD base currency', () => {
    const envelope = build(
      baseSources({
        fund: {
          sizeDollars: '100000000',
          deployedCapitalDollars: '0',
          managementFeeRate: '0.0200',
          baseCurrency: 'EUR',
        },
      })
    );
    expect(envelope.blocked).toBe(true);
    expect(envelope.blockReason).toContain('EUR');
    expect(envelope.availableReservesCents).toBe(0);
    expect(envelope.trustedForActivation).toBe(false);
    expect(() => ReserveEnvelopeV1Schema.parse(envelope)).not.toThrow();
  });

  it('blocks non-positive committed capital', () => {
    const envelope = build(
      baseSources({
        fund: {
          sizeDollars: '0',
          deployedCapitalDollars: '0',
          managementFeeRate: '0.0200',
          baseCurrency: 'USD',
        },
      })
    );
    expect(envelope.blocked).toBe(true);
    expect(envelope.availableReservesCents).toBe(0);
  });

  it('produces a stable inputHash for identical sources and a different hash when committed changes', () => {
    const a = build(baseSources());
    const b = build(baseSources());
    expect(a.inputHash).toBe(b.inputHash);
    const c = build(
      baseSources({
        fund: {
          sizeDollars: '120000000',
          deployedCapitalDollars: '0',
          managementFeeRate: '0.0200',
          baseCurrency: 'USD',
        },
      })
    );
    expect(c.inputHash).not.toBe(a.inputHash);
  });

  it('clamps availableReserves to zero when outflows exceed inflows', () => {
    const envelope = build(
      baseSources({
        investments: [{ amountDollars: '95000000' }],
        config: {
          fundLifeYears: 10,
          expenses: null,
          recyclingEnabled: false,
          recyclingCapDollars: null,
        },
      })
    );
    // 100M - 95M - 20M fees = -15M -> clamped 0
    expect(envelope.availableReservesCents).toBe(0);
  });
});
