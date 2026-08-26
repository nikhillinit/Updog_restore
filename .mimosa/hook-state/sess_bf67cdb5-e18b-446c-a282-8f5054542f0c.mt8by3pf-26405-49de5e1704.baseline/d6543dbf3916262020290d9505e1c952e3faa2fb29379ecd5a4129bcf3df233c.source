import { describe, expect, it } from 'vitest';

import {
  toInvestmentRoundCreatePayload,
  type InvestmentRoundEditForm,
} from '@/lib/investment-round-edit-model';

function baseForm(overrides: Partial<InvestmentRoundEditForm> = {}): InvestmentRoundEditForm {
  return {
    roundName: 'Series A',
    securityType: 'Equity',
    roundDate: '2026-06-21',
    currency: 'United States Dollar ($)',
    investmentAmount: 2.5,
    roundSize: 1_000_000,
    preMoneyValuation: 5_000_000,
    ...overrides,
  };
}

describe('toInvestmentRoundCreatePayload', () => {
  it('maps the currency label to an ISO-4217 code', () => {
    const payload = toInvestmentRoundCreatePayload(baseForm(), 7);

    expect(payload.currency).toBe('USD');
  });

  it('serializes fractional money numbers to decimal strings without padded zeros', () => {
    const payload = toInvestmentRoundCreatePayload(baseForm({ investmentAmount: 2.5 }), 7);

    expect(payload.investmentAmount).toBe('2.5');
  });

  it('serializes integer money numbers to strings', () => {
    const payload = toInvestmentRoundCreatePayload(baseForm({ investmentAmount: 1_000_000 }), 7);

    expect(payload.investmentAmount).toBe('1000000');
  });

  it('preserves date-only roundDate verbatim', () => {
    const payload = toInvestmentRoundCreatePayload(baseForm({ roundDate: '2026-01-15' }), 7);

    expect(payload.roundDate).toBe('2026-01-15');
  });

  it('omits optional fields when absent', () => {
    const payload = toInvestmentRoundCreatePayload(
      baseForm({
        roundSize: undefined,
        preMoneyValuation: null,
        supersedesRoundId: undefined,
      }),
      7
    );

    expect(payload).not.toHaveProperty('roundSize');
    expect(payload).not.toHaveProperty('preMoneyValuation');
    expect(payload).not.toHaveProperty('supersedesRoundId');
  });
});
