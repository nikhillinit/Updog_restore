import { describe, expect, it } from 'vitest';

import {
  RecordFinancingTrancheRequestSchema,
  SECURITY_TYPE_TERM_MATRIX,
  USD_FX_RATE_TO_USD,
} from '../../../../shared/contracts/investment-ledger/financing-event.contract';

const baseEquityTranche = {
  trancheKey: 'initial-close',
  closingDate: '2026-07-01',
  securityType: 'equity' as const,
  investmentAmount: '1000000.000000',
  originalAmount: '1000000.000000',
  currency: 'USD',
  fxRateToUsd: USD_FX_RATE_TO_USD,
  fxRateDate: '2026-07-01',
  pricePerShare: '10.000000',
};

describe('RecordFinancingTrancheRequestSchema', () => {
  it('exports and enforces the security-type term matrix', () => {
    expect(SECURITY_TYPE_TERM_MATRIX).toEqual({
      equity: {
        requiredAny: ['pricePerShare', 'postMoneyValuation'],
        forbidden: [],
      },
      safe: {
        requiredAny: ['valuationCap', 'conversionDiscountRate'],
        forbidden: ['liquidationPreferenceMultiple', 'participatingPreferred'],
      },
      convertible_note: {
        requiredAll: ['interestRate', 'maturityDate'],
        forbidden: [],
      },
      other: {
        requiredAny: [],
        forbidden: [],
      },
    });

    const invalidFixtures = [
      {
        ...baseEquityTranche,
        pricePerShare: undefined,
      },
      {
        ...baseEquityTranche,
        securityType: 'safe',
        pricePerShare: undefined,
        valuationCap: '12000000.000000',
        liquidationPreferenceMultiple: '1.00000000',
      },
      {
        ...baseEquityTranche,
        securityType: 'safe',
        pricePerShare: undefined,
        valuationCap: '12000000.000000',
        participatingPreferred: true,
      },
      {
        ...baseEquityTranche,
        securityType: 'safe',
        pricePerShare: undefined,
      },
      {
        ...baseEquityTranche,
        securityType: 'convertible_note',
        pricePerShare: undefined,
        maturityDate: '2028-07-01',
      },
      {
        ...baseEquityTranche,
        securityType: 'convertible_note',
        pricePerShare: undefined,
        interestRate: '0.08000000',
      },
    ];

    for (const fixture of invalidFixtures) {
      expect(() => RecordFinancingTrancheRequestSchema.parse(fixture)).toThrow();
    }

    expect(
      RecordFinancingTrancheRequestSchema.parse({
        ...baseEquityTranche,
        securityType: 'safe',
        pricePerShare: undefined,
        conversionDiscountRate: '0.20000000',
      }).securityType
    ).toBe('safe');
    expect(
      RecordFinancingTrancheRequestSchema.parse({
        ...baseEquityTranche,
        securityType: 'convertible_note',
        pricePerShare: undefined,
        interestRate: '0.08000000',
        maturityDate: '2028-07-01',
      }).securityType
    ).toBe('convertible_note');
  });

  it('normalizes warrant evidence into a calculation-ineligible other tranche', () => {
    const parsed = RecordFinancingTrancheRequestSchema.parse({
      ...baseEquityTranche,
      securityType: 'warrant',
      pricePerShare: '2.500000',
      descriptiveTerms: { coverage: '10 percent' },
    });

    expect(parsed).toMatchObject({
      securityType: 'other',
      calculationEligible: false,
      descriptiveTerms: {
        coverage: '10 percent',
        warrantTerms: {
          pricePerShare: '2.500000',
        },
      },
    });
    expect(parsed.pricePerShare).toBeUndefined();
  });

  it('requires explicit non-USD FX evidence and pins canonical USD FX', () => {
    const nonUsd = {
      ...baseEquityTranche,
      originalAmount: '920000.000000',
      currency: 'EUR',
      fxRateToUsd: '1.0869565217',
    };

    expect(() =>
      RecordFinancingTrancheRequestSchema.parse({
        ...nonUsd,
        fxRateToUsd: undefined,
      })
    ).toThrow();
    expect(() =>
      RecordFinancingTrancheRequestSchema.parse({
        ...nonUsd,
        fxRateDate: undefined,
      })
    ).toThrow();
    expect(RecordFinancingTrancheRequestSchema.parse(nonUsd).fxRateToUsd).toBe('1.0869565217');

    const usd = RecordFinancingTrancheRequestSchema.parse({
      ...baseEquityTranche,
      fxRateToUsd: undefined,
    });
    expect(usd.fxRateToUsd).toBe(USD_FX_RATE_TO_USD);
  });

  it('rejects money and rate values without their exact fixed decimal places', () => {
    expect(() =>
      RecordFinancingTrancheRequestSchema.parse({
        ...baseEquityTranche,
        investmentAmount: '1000000.00',
      })
    ).toThrow();
    expect(() =>
      RecordFinancingTrancheRequestSchema.parse({
        ...baseEquityTranche,
        securityType: 'safe',
        pricePerShare: undefined,
        conversionDiscountRate: '0.20',
      })
    ).toThrow();
  });
});
