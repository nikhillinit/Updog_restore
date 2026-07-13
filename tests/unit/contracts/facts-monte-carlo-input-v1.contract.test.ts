import { describe, expect, it } from 'vitest';

import {
  FactsMonteCarloCompanyV1Schema,
  FactsMonteCarloInputV1Schema,
} from '../../../shared/contracts/monte-carlo/facts-input-v1.contract';

const FACTS_INPUT_HASH = 'a'.repeat(64);
const SOURCE_FACTS_INPUT_HASH = 'b'.repeat(64);

const validCompany = {
  companyId: 11,
  observedInitialInvestment: '100.250000',
  observedFollowOnInvestment: '20.750000',
  planningFmv: '500.000000',
  planningFmvStatus: 'active' as const,
  stage: 'Series A',
  sector: 'SaaS',
  trustState: 'LIVE' as const,
  currencyStatus: 'base_currency' as const,
  warnings: [],
};

const validInput = {
  contractVersion: 'monte-carlo-facts-input-v1' as const,
  fundId: 7,
  asOfDate: '2026-07-13',
  factsInputHash: FACTS_INPUT_HASH,
  sourceFactsInputHash: SOURCE_FACTS_INPUT_HASH,
  companies: [validCompany],
};

describe('FactsMonteCarloCompanyV1Schema', () => {
  it('accepts normalized company facts and nullable unavailable values', () => {
    expect(FactsMonteCarloCompanyV1Schema.parse(validCompany)).toEqual(validCompany);

    expect(
      FactsMonteCarloCompanyV1Schema.parse({
        ...validCompany,
        observedInitialInvestment: null,
        observedFollowOnInvestment: null,
        planningFmv: null,
        stage: null,
        sector: null,
        trustState: 'UNAVAILABLE',
        currencyStatus: 'mismatch_blocked',
      })
    ).toMatchObject({
      observedInitialInvestment: null,
      observedFollowOnInvestment: null,
      planningFmv: null,
      stage: null,
      sector: null,
    });
  });

  it('rejects unknown keys', () => {
    expect(
      FactsMonteCarloCompanyV1Schema.safeParse({ ...validCompany, distribution: 'power_law' })
        .success
    ).toBe(false);
  });

  it.each([
    ['trustState', 'STALE'],
    ['planningFmvStatus', 'pending'],
    ['currencyStatus', 'converted'],
  ])('rejects unsupported %s enum values', (field, value) => {
    expect(
      FactsMonteCarloCompanyV1Schema.safeParse({ ...validCompany, [field]: value }).success
    ).toBe(false);
  });
});

describe('FactsMonteCarloInputV1Schema', () => {
  it('accepts the versioned strict input contract', () => {
    expect(FactsMonteCarloInputV1Schema.parse(validInput)).toEqual(validInput);
  });

  it('rejects unknown top-level keys and invalid contract identity fields', () => {
    expect(FactsMonteCarloInputV1Schema.safeParse({ ...validInput, assumptions: {} }).success).toBe(
      false
    );
    expect(
      FactsMonteCarloInputV1Schema.safeParse({
        ...validInput,
        contractVersion: 'monte-carlo-facts-input-v2',
      }).success
    ).toBe(false);
    expect(
      FactsMonteCarloInputV1Schema.safeParse({
        ...validInput,
        sourceFactsInputHash: 'not-a-sha256',
      }).success
    ).toBe(false);
  });
});
