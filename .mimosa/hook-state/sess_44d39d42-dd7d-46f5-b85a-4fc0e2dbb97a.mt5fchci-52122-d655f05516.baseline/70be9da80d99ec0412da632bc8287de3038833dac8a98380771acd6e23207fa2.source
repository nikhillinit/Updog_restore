import { describe, expect, it } from 'vitest';

import {
  FundMoicFactsBasisV1Schema,
  FundMoicRankabilitySchema,
} from '../../../../shared/contracts/fund-moic-v1.contract';
import type { FundCompanyActualsFact } from '../../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { buildFundMoicFactsBasis } from '../../../../server/services/moic/fund-moic-facts-basis';

const FACTS_HASH = 'a'.repeat(64);
const ASSUMPTIONS_HASH = 'b'.repeat(64);

function company(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    fundId: 1,
    name: 'Alpha AI',
    investmentAmount: '1000',
    currentValuation: '3000',
    plannedReservesCents: 100_000,
    exitMoicBps: 250,
    exitProbability: '0.4',
    investmentDate: '2025-01-01',
    ...overrides,
  };
}

function fact(overrides: Partial<FundCompanyActualsFact> = {}): FundCompanyActualsFact {
  return {
    fundId: 1,
    companyId: 11,
    companyName: 'Alpha AI',
    investmentIds: [21],
    activeRoundIds: [31],
    approvedPlanningFmvMarkId: 41,
    planningFmvStatus: 'active',
    initialInvestmentAmount: '100.125',
    followOnInvestmentAmount: '25.875',
    amountOnlyNonEquityAmount: '0',
    latestRoundDate: '2026-06-30',
    latestRoundValuation: '9000',
    latestPlanningFmvDate: '2026-07-01',
    latestPlanningFmvValue: '5000.25',
    currency: 'USD',
    currencyStatus: 'base_currency',
    supersedeLineage: [{ roundId: 31, supersedesRoundId: null }],
    warnings: [],
    provenance: {
      trustState: 'LIVE',
      core: {
        sourceKind: 'computed',
        actionability: 'actionable',
        sourceEngine: 'rounds-to-model',
        engineVersion: 'rounds-to-model-v1',
        inputHash: FACTS_HASH,
        assumptionsHash: ASSUMPTIONS_HASH,
        generatedAt: '2026-07-13T00:00:00.000Z',
        isFinanciallyActionable: true,
        warnings: [],
      },
      structuredWarnings: [],
    },
    inputHash: FACTS_HASH,
    ...overrides,
  };
}

describe('FundMoicFactsBasisV1 contract', () => {
  it('pins rankability and every reason while rejecting unknown fields', () => {
    expect(FundMoicRankabilitySchema.options).toEqual([
      'actionable',
      'indicative',
      'not_actionable',
    ]);

    const valid = {
      rankability: 'actionable',
      reasons: [
        'planning_fmv_active',
        'planning_fmv_stale',
        'legacy_current_valuation_fallback',
        'valuation_unavailable',
        'currency_blocked',
        'planned_reserves_zero',
        'exit_probability_missing',
        'reserve_exit_multiple_missing',
      ],
      observedInitialInvestment: '100.25',
      observedFollowOnInvestment: '25.75',
      observedTotalInvestment: '126',
      valuationAnchor: {
        kind: 'planning_fmv',
        value: '500',
        asOfDate: '2026-07-13',
      },
      planningFmvStatus: 'active',
      currencyStatus: 'base_currency',
      factsInputHash: 'a'.repeat(64),
      warnings: [],
    } as const;

    expect(FundMoicFactsBasisV1Schema.parse(valid)).toEqual(valid);
    expect(FundMoicFactsBasisV1Schema.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(
      FundMoicFactsBasisV1Schema.safeParse({
        ...valid,
        valuationAnchor: { ...valid.valuationAnchor, extra: true },
      }).success
    ).toBe(false);
    expect(
      FundMoicFactsBasisV1Schema.safeParse({ ...valid, observedInitialInvestment: 100.25 }).success
    ).toBe(false);
    expect(
      FundMoicFactsBasisV1Schema.safeParse({
        ...valid,
        valuationAnchor: { ...valid.valuationAnchor, value: 500 },
      }).success
    ).toBe(false);
  });
});

describe('buildFundMoicFactsBasis', () => {
  it('uses an active base-currency Planning FMV as the actionable anchor', () => {
    expect(buildFundMoicFactsBasis({ company: company(), fact: fact() })).toEqual({
      rankability: 'actionable',
      reasons: ['planning_fmv_active'],
      observedInitialInvestment: '100.125',
      observedFollowOnInvestment: '25.875',
      observedTotalInvestment: '126',
      valuationAnchor: {
        kind: 'planning_fmv',
        value: '5000.25',
        asOfDate: '2026-07-01',
      },
      planningFmvStatus: 'active',
      currencyStatus: 'base_currency',
      factsInputHash: FACTS_HASH,
      warnings: [],
    });
  });

  it('keeps a stale Planning FMV visible but only indicative', () => {
    expect(
      buildFundMoicFactsBasis({
        company: company(),
        fact: fact({ planningFmvStatus: 'stale' }),
      })
    ).toMatchObject({
      rankability: 'indicative',
      reasons: ['planning_fmv_stale'],
      valuationAnchor: {
        kind: 'planning_fmv',
        value: '5000.25',
        asOfDate: '2026-07-01',
      },
    });
  });

  it.each(['none', 'superseded', 'blocked'] as const)(
    'falls back from %s Planning FMV status to legacy current valuation',
    (planningFmvStatus) => {
      expect(
        buildFundMoicFactsBasis({ company: company(), fact: fact({ planningFmvStatus }) })
      ).toMatchObject({
        rankability: 'indicative',
        reasons: ['legacy_current_valuation_fallback'],
        valuationAnchor: {
          kind: 'legacy_current_valuation',
          value: '3000',
          asOfDate: null,
        },
      });
    }
  );

  it('is not actionable when neither Planning FMV nor legacy valuation is available', () => {
    expect(
      buildFundMoicFactsBasis({
        company: company({ currentValuation: null }),
        fact: fact({
          planningFmvStatus: 'none',
          latestPlanningFmvValue: null,
          latestPlanningFmvDate: null,
        }),
      })
    ).toMatchObject({
      rankability: 'not_actionable',
      reasons: ['valuation_unavailable'],
      valuationAnchor: { kind: 'none', value: null, asOfDate: null },
    });
  });

  it('blocks currency mismatches without exposing a valuation anchor', () => {
    expect(
      buildFundMoicFactsBasis({
        company: company(),
        fact: fact({ currency: 'EUR', currencyStatus: 'mismatch_blocked' }),
      })
    ).toMatchObject({
      rankability: 'not_actionable',
      reasons: ['currency_blocked'],
      valuationAnchor: { kind: 'none', value: null, asOfDate: null },
      currencyStatus: 'mismatch_blocked',
    });
  });

  it.each([null, 0] as const)(
    'keeps %s planned reserves visible but not actionable',
    (plannedReservesCents) => {
      expect(
        buildFundMoicFactsBasis({ company: company({ plannedReservesCents }), fact: fact() })
      ).toMatchObject({
        rankability: 'not_actionable',
        reasons: ['planning_fmv_active', 'planned_reserves_zero'],
      });
    }
  );

  it.each([
    ['exitProbability', 'exit_probability_missing'],
    ['exitMoicBps', 'reserve_exit_multiple_missing'],
  ] as const)('downgrades an active anchor when %s is missing', (field, reason) => {
    expect(
      buildFundMoicFactsBasis({ company: company({ [field]: null }), fact: fact() })
    ).toMatchObject({
      rankability: 'indicative',
      reasons: ['planning_fmv_active', reason],
    });
  });

  it('uses zero observed amounts plus FACTS_MISSING disclosure when the fact is absent', () => {
    expect(buildFundMoicFactsBasis({ company: company(), fact: null })).toEqual({
      rankability: 'indicative',
      reasons: ['legacy_current_valuation_fallback'],
      observedInitialInvestment: '0',
      observedFollowOnInvestment: '0',
      observedTotalInvestment: '0',
      valuationAnchor: {
        kind: 'legacy_current_valuation',
        value: '3000',
        asOfDate: null,
      },
      planningFmvStatus: 'none',
      currencyStatus: 'unknown',
      factsInputHash: null,
      warnings: [
        {
          code: 'FACTS_MISSING',
          severity: 'warning',
          message: 'Company actuals facts are unavailable; observed investment amounts are zero',
          source: 'fund-company-actuals-facts',
        },
      ],
    });
  });

  it('emits all applicable reasons in declaration order', () => {
    const result = buildFundMoicFactsBasis({
      company: company({
        plannedReservesCents: 0,
        exitProbability: null,
        exitMoicBps: null,
      }),
      fact: fact(),
    });

    expect(result.reasons).toEqual([
      'planning_fmv_active',
      'planned_reserves_zero',
      'exit_probability_missing',
      'reserve_exit_multiple_missing',
    ]);
    expect(result.rankability).toBe('not_actionable');
  });

  it('treats invalid explicit inputs as missing just like candidate defaulting', () => {
    expect(
      buildFundMoicFactsBasis({
        company: company({ exitProbability: '1.1', exitMoicBps: 0 }),
        fact: fact(),
      }).reasons
    ).toEqual(['planning_fmv_active', 'exit_probability_missing', 'reserve_exit_multiple_missing']);
  });
});
