import { describe, expect, it } from 'vitest';

import {
  FundCompanyActualsFactSchema,
  FundCompanyActualsFactsResponseSchema,
} from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const GENERATED_AT = '2026-06-24T00:00:00.000Z';
const AS_OF_DATE = '2026-06-24';

const liveInfoWarning = {
  code: 'ROUND_MODEL_OVERRIDE_APPLIED',
  severity: 'info',
  message: 'Round role override was applied before fact generation.',
  source: 'round:21',
} as const;

const planningFmvMissingWarning = {
  code: 'PLANNING_FMV_MISSING',
  severity: 'warning',
  message: 'No approved planning FMV mark is available for this company.',
  source: 'company:101',
} as const;

const planningFmvStaleWarning = {
  code: 'PLANNING_FMV_STALE',
  severity: 'warning',
  message: 'The approved planning FMV mark is stale for the requested as-of date.',
  source: 'company:101',
} as const;

const currencyMismatchWarning = {
  code: 'CURRENCY_MISMATCH_BLOCK',
  severity: 'blocking',
  message: 'Round currency does not match fund base currency after overrides.',
  source: 'company:101',
} as const;

const liveProvenance = {
  trustState: 'LIVE',
  core: {
    sourceKind: 'computed',
    actionability: 'actionable',
    sourceEngine: 'fund-company-actuals-facts',
    engineVersion: 'fund-company-actuals-facts-v1',
    inputHash: HASH_A,
    assumptionsHash: HASH_B,
    generatedAt: GENERATED_AT,
    isFinanciallyActionable: true,
    warnings: [],
  },
  structuredWarnings: [liveInfoWarning],
  sourceAsOf: GENERATED_AT,
  staleAfterSeconds: 3600,
} as const;

const partialMissingProvenance = {
  trustState: 'PARTIAL',
  core: {
    sourceKind: 'computed',
    actionability: 'input_only',
    sourceEngine: 'fund-company-actuals-facts',
    engineVersion: 'fund-company-actuals-facts-v1',
    inputHash: HASH_A,
    assumptionsHash: HASH_B,
    generatedAt: GENERATED_AT,
    isFinanciallyActionable: false,
    warnings: [],
  },
  structuredWarnings: [planningFmvMissingWarning],
} as const;

const partialStaleProvenance = {
  ...partialMissingProvenance,
  structuredWarnings: [planningFmvStaleWarning],
} as const;

const unavailableProvenance = {
  trustState: 'UNAVAILABLE',
  core: {
    sourceKind: 'computed',
    actionability: 'quarantined',
    sourceEngine: 'fund-company-actuals-facts',
    engineVersion: 'fund-company-actuals-facts-v1',
    inputHash: HASH_A,
    assumptionsHash: HASH_B,
    generatedAt: GENERATED_AT,
    isFinanciallyActionable: false,
    quarantineReason: 'currency_mismatch',
    warnings: [],
  },
  structuredWarnings: [currencyMismatchWarning],
} as const;

const validLiveFact = {
  fundId: 10,
  companyId: 101,
  companyName: 'Acme Robotics',
  investmentIds: [201, 202],
  activeRoundIds: [21, 22],
  approvedPlanningFmvMarkId: 301,
  planningFmvStatus: 'active',
  initialInvestmentAmount: '500000.000000',
  followOnInvestmentAmount: '250000.000000',
  amountOnlyNonEquityAmount: '125000.000000',
  latestRoundDate: '2025-02-01',
  latestRoundValuation: '12000000.000000',
  latestPlanningFmvDate: '2026-06-01',
  latestPlanningFmvValue: '14000000.000000',
  currency: 'USD',
  currencyStatus: 'base_currency',
  supersedeLineage: [
    {
      roundId: 21,
      supersedesRoundId: null,
    },
    {
      roundId: 22,
      supersedesRoundId: 21,
    },
  ],
  warnings: [liveInfoWarning],
  provenance: liveProvenance,
  inputHash: HASH_C,
} as const;

describe('FundCompanyActualsFactSchema', () => {
  it('parses a valid LIVE fact with base currency and info-only warnings', () => {
    const parsed = FundCompanyActualsFactSchema.parse(validLiveFact);

    expect(parsed).toEqual(validLiveFact);
  });

  it('parses valid PARTIAL facts for missing and stale planning FMV', () => {
    const missingFact = {
      ...validLiveFact,
      approvedPlanningFmvMarkId: null,
      planningFmvStatus: 'none',
      latestPlanningFmvDate: null,
      latestPlanningFmvValue: null,
      warnings: [planningFmvMissingWarning],
      provenance: partialMissingProvenance,
    } as const;

    const staleFact = {
      ...validLiveFact,
      planningFmvStatus: 'stale',
      warnings: [planningFmvStaleWarning],
      provenance: partialStaleProvenance,
    } as const;

    expect(FundCompanyActualsFactSchema.parse(missingFact)).toEqual(missingFact);
    expect(FundCompanyActualsFactSchema.parse(staleFact)).toEqual(staleFact);
  });

  it('parses a valid UNAVAILABLE fact for currency mismatch quarantine', () => {
    const unavailableFact = {
      ...validLiveFact,
      approvedPlanningFmvMarkId: null,
      planningFmvStatus: 'blocked',
      latestPlanningFmvDate: null,
      latestPlanningFmvValue: null,
      currency: 'EUR',
      currencyStatus: 'mismatch_blocked',
      warnings: [currencyMismatchWarning],
      provenance: unavailableProvenance,
    } as const;

    expect(FundCompanyActualsFactSchema.parse(unavailableFact)).toEqual(unavailableFact);
  });

  it('rejects numeric money fields', () => {
    const numericInitialAmount = FundCompanyActualsFactSchema.safeParse({
      ...validLiveFact,
      initialInvestmentAmount: 100,
    });

    const numericLatestRoundValuation = FundCompanyActualsFactSchema.safeParse({
      ...validLiveFact,
      latestRoundValuation: 100,
    });

    expect(numericInitialAmount.success).toBe(false);
    expect(numericLatestRoundValuation.success).toBe(false);
  });

  it('rejects malformed input hashes', () => {
    const shortHash = FundCompanyActualsFactSchema.safeParse({
      ...validLiveFact,
      inputHash: 'a'.repeat(63),
    });

    const uppercaseHash = FundCompanyActualsFactSchema.safeParse({
      ...validLiveFact,
      inputHash: 'A'.repeat(64),
    });

    expect(shortHash.success).toBe(false);
    expect(uppercaseHash.success).toBe(false);
  });
});

describe('FundCompanyActualsFactsResponseSchema', () => {
  const validResponse = {
    fundId: 10,
    asOfDate: AS_OF_DATE,
    facts: [validLiveFact],
    inputHash: HASH_A,
    generatedAt: GENERATED_AT,
  } as const;

  it('parses a valid response', () => {
    expect(FundCompanyActualsFactsResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it('rejects unknown response keys', () => {
    const result = FundCompanyActualsFactsResponseSchema.safeParse({
      ...validResponse,
      shadowDiff: {},
    });

    expect(result.success).toBe(false);
  });

  it('rejects malformed response input hashes', () => {
    const result = FundCompanyActualsFactsResponseSchema.safeParse({
      ...validResponse,
      inputHash: 'f'.repeat(63),
    });

    expect(result.success).toBe(false);
  });
});
