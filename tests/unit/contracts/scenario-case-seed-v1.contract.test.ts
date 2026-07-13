import { describe, expect, it } from 'vitest';

import {
  ScenarioCaseSeedV1Schema,
  SeededFieldSchema,
  SeededNullableFieldSchema,
  UserRequiredFieldSchema,
} from '../../../shared/contracts/scenarios/scenario-case-seed-v1.contract';

function makeSeed() {
  return {
    contractVersion: 'scenario-case-seed-v1',
    fundId: 10,
    companyId: 101,
    asOfDate: '2026-07-13',
    factsInputHash: 'a'.repeat(64),
    trustState: 'LIVE',
    currencyStatus: 'base_currency',
    fields: {
      investment: {
        status: 'seeded',
        value: '500000.000000',
        source: 'facts.initialInvestmentAmount',
      },
      followOns: {
        status: 'seeded',
        value: '250000.000000',
        source: 'facts.followOnInvestmentAmount',
      },
      fmv: {
        status: 'seeded',
        value: '14000000.000000',
        source: 'facts.latestPlanningFmvValue',
      },
      exitValuation: {
        value: null,
        status: 'user_required',
        marketReference: '12000000.000000',
      },
      probability: { value: null, status: 'user_required' },
      ownershipAtExit: { value: null, status: 'user_required' },
    },
    warnings: [],
  };
}

function withoutSeededMoney(seed = makeSeed()) {
  return {
    ...seed,
    fields: {
      ...seed.fields,
      investment: { status: 'unavailable', value: null, reason: 'facts_unavailable' },
      followOns: { status: 'unavailable', value: null, reason: 'facts_unavailable' },
      fmv: { status: 'unavailable', value: null, reason: 'facts_unavailable' },
    },
  };
}

function withCurrencyBlockedMoney(seed = makeSeed()) {
  return {
    ...seed,
    fields: {
      ...seed.fields,
      investment: { status: 'unavailable', value: null, reason: 'currency_blocked' },
      followOns: { status: 'unavailable', value: null, reason: 'currency_blocked' },
      fmv: { status: 'unavailable', value: null, reason: 'currency_blocked' },
    },
  };
}

describe('ScenarioCaseSeedV1Schema', () => {
  it('accepts an actuals-backed seed with user-required forecast inputs', () => {
    const seed = makeSeed();

    expect(ScenarioCaseSeedV1Schema.parse(seed)).toEqual(seed);
  });

  it.each(['LIVE', 'PARTIAL', 'UNAVAILABLE', 'FAILED'] as const)(
    'accepts the %s trust state',
    (trustState) => {
      const seed =
        trustState === 'UNAVAILABLE' || trustState === 'FAILED' ? withoutSeededMoney() : makeSeed();
      if (trustState === 'FAILED') {
        seed.fields.exitValuation.marketReference = null;
      }

      expect(ScenarioCaseSeedV1Schema.safeParse({ ...seed, trustState }).success).toBe(true);
    }
  );

  it.each(['base_currency', 'mismatch_blocked', 'unknown'] as const)(
    'accepts the %s currency state',
    (currencyStatus) => {
      const seed = currencyStatus === 'base_currency' ? makeSeed() : withCurrencyBlockedMoney();

      expect(ScenarioCaseSeedV1Schema.safeParse({ ...seed, currencyStatus }).success).toBe(true);
    }
  );

  it('rejects seeded money for unavailable trust or blocked currency', () => {
    expect(
      ScenarioCaseSeedV1Schema.safeParse({ ...makeSeed(), trustState: 'UNAVAILABLE' }).success
    ).toBe(false);
    expect(
      ScenarioCaseSeedV1Schema.safeParse({ ...makeSeed(), currencyStatus: 'mismatch_blocked' })
        .success
    ).toBe(false);
  });

  it('rejects a facts-derived market reference on a failed seed', () => {
    expect(
      ScenarioCaseSeedV1Schema.safeParse({
        ...withoutSeededMoney(),
        trustState: 'FAILED',
      }).success
    ).toBe(false);
  });

  it.each(['currency_blocked', 'facts_unavailable', 'source_missing'] as const)(
    'accepts the %s required-money unavailability reason',
    (reason) => {
      expect(
        SeededFieldSchema.safeParse({ status: 'unavailable', value: null, reason }).success
      ).toBe(true);
    }
  );

  it.each(['currency_blocked', 'facts_unavailable', 'no_active_fmv', 'fmv_stale'] as const)(
    'accepts the %s nullable-money unavailability reason',
    (reason) => {
      expect(
        SeededNullableFieldSchema.safeParse({ status: 'unavailable', value: null, reason }).success
      ).toBe(true);
    }
  );

  it('rejects unknown keys at every reusable object boundary', () => {
    expect(ScenarioCaseSeedV1Schema.safeParse({ ...makeSeed(), extra: true }).success).toBe(false);
    expect(
      SeededFieldSchema.safeParse({
        status: 'seeded',
        value: '1.000000',
        source: 'facts.initialInvestmentAmount',
        extra: true,
      }).success
    ).toBe(false);
    expect(
      SeededNullableFieldSchema.safeParse({
        status: 'unavailable',
        value: null,
        reason: 'no_active_fmv',
        extra: true,
      }).success
    ).toBe(false);
    expect(
      UserRequiredFieldSchema.safeParse({
        value: null,
        status: 'user_required',
        extra: true,
      }).success
    ).toBe(false);
  });

  it('rejects numeric money and invalid enum values', () => {
    expect(
      SeededFieldSchema.safeParse({
        status: 'seeded',
        value: 500000,
        source: 'facts.initialInvestmentAmount',
      }).success
    ).toBe(false);
    expect(ScenarioCaseSeedV1Schema.safeParse({ ...makeSeed(), trustState: 'STALE' }).success).toBe(
      false
    );
    expect(
      ScenarioCaseSeedV1Schema.safeParse({ ...makeSeed(), currencyStatus: 'converted' }).success
    ).toBe(false);
  });
});
