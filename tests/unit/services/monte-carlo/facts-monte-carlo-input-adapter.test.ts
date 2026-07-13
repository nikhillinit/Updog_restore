import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { FundCompanyActualsFactsResponse } from '../../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';
import { buildFactsMonteCarloInput } from '../../../../server/services/monte-carlo/facts-monte-carlo-input-adapter';

type CompanyFact = FundCompanyActualsFactsResponse['facts'][number];
type TrustState = CompanyFact['provenance']['trustState'];

const SOURCE_FACTS_INPUT_HASH = 'a'.repeat(64);
const COMPANY_FACTS_INPUT_HASH = 'b'.repeat(64);
const ASSUMPTIONS_HASH = 'c'.repeat(64);
const AS_OF_DATE = '2026-07-13';

const partialWarning = {
  code: 'PLANNING_FMV_STALE' as const,
  severity: 'warning' as const,
  message: 'Planning FMV is stale.',
  source: 'company:11',
};

const currencyWarning = {
  code: 'CURRENCY_MISMATCH_BLOCK' as const,
  severity: 'blocking' as const,
  message: 'Company currency does not match the fund base currency.',
  source: 'company:11',
};

const failedWarning = {
  code: 'ROUND_ADAPTER_FAILED' as const,
  severity: 'blocking' as const,
  message: 'Round evidence could not be assembled.',
  source: 'company:11',
};

const infoWarning = {
  code: 'PLANNING_FMV_MISSING' as const,
  severity: 'info' as const,
  message: 'No planning FMV is available.',
  source: 'company:11',
};

function provenance(trustState: TrustState): CompanyFact['provenance'] {
  if (trustState === 'FAILED') {
    return {
      trustState,
      core: {
        sourceKind: 'prototype_blocked',
        actionability: 'non_actionable',
        generatedAt: '2026-07-13T00:00:00.000Z',
        isFinanciallyActionable: false,
        quarantineReason: 'round_adapter_failed',
        warnings: [],
      },
      structuredWarnings: [failedWarning],
    };
  }

  if (trustState === 'UNAVAILABLE') {
    return {
      trustState,
      core: {
        sourceKind: 'computed',
        actionability: 'quarantined',
        sourceEngine: 'fund-company-actuals-facts',
        engineVersion: 'fund-company-actuals-facts-v1',
        inputHash: COMPANY_FACTS_INPUT_HASH,
        assumptionsHash: ASSUMPTIONS_HASH,
        generatedAt: '2026-07-13T00:00:00.000Z',
        isFinanciallyActionable: false,
        quarantineReason: 'currency_mismatch',
        warnings: [],
      },
      structuredWarnings: [currencyWarning],
    };
  }

  if (trustState === 'PARTIAL') {
    return {
      trustState,
      core: {
        sourceKind: 'computed',
        actionability: 'input_only',
        sourceEngine: 'fund-company-actuals-facts',
        engineVersion: 'fund-company-actuals-facts-v1',
        inputHash: COMPANY_FACTS_INPUT_HASH,
        assumptionsHash: ASSUMPTIONS_HASH,
        generatedAt: '2026-07-13T00:00:00.000Z',
        isFinanciallyActionable: false,
        warnings: [],
      },
      structuredWarnings: [partialWarning],
    };
  }

  return {
    trustState,
    core: {
      sourceKind: 'computed',
      actionability: 'actionable',
      sourceEngine: 'fund-company-actuals-facts',
      engineVersion: 'fund-company-actuals-facts-v1',
      inputHash: COMPANY_FACTS_INPUT_HASH,
      assumptionsHash: ASSUMPTIONS_HASH,
      generatedAt: '2026-07-13T00:00:00.000Z',
      isFinanciallyActionable: true,
      warnings: [],
    },
    structuredWarnings: [],
  };
}

function companyFact(companyId: number, overrides: Partial<CompanyFact> = {}): CompanyFact {
  return {
    fundId: 7,
    companyId,
    companyName: `Company ${companyId}`,
    investmentIds: [100 + companyId],
    activeRoundIds: [200 + companyId],
    approvedPlanningFmvMarkId: 300 + companyId,
    planningFmvStatus: 'active',
    initialInvestmentAmount: '100.250000',
    followOnInvestmentAmount: '20.750000',
    amountOnlyNonEquityAmount: '0.000000',
    latestRoundDate: '2026-07-01',
    latestRoundValuation: '1000.000000',
    latestPlanningFmvDate: '2026-07-10',
    latestPlanningFmvValue: '500.000000',
    currency: 'USD',
    currencyStatus: 'base_currency',
    supersedeLineage: [{ roundId: 200 + companyId, supersedesRoundId: null }],
    warnings: [],
    provenance: provenance('LIVE'),
    inputHash: canonicalSha256({ companyId }),
    ...overrides,
  };
}

function factsResponse(facts: CompanyFact[]): FundCompanyActualsFactsResponse {
  return {
    fundId: 7,
    asOfDate: AS_OF_DATE,
    facts,
    inputHash: SOURCE_FACTS_INPUT_HASH,
    generatedAt: '2026-07-13T00:00:00.000Z',
  };
}

function buildInput(params?: {
  facts?: FundCompanyActualsFactsResponse;
  companyMetadata?: ReadonlyMap<number, { stage: string | null; sector: string | null }>;
  asOfDate?: string;
}) {
  return buildFactsMonteCarloInput({
    fundId: 7,
    asOfDate: params?.asOfDate ?? AS_OF_DATE,
    facts: params?.facts ?? factsResponse([companyFact(11)]),
    companyMetadata:
      params?.companyMetadata ?? new Map([[11, { stage: 'Series A', sector: 'SaaS' }]]),
  });
}

describe('buildFactsMonteCarloInput', () => {
  it('builds and hashes an empty portfolio without fabricating companies', () => {
    const result = buildInput({ facts: factsResponse([]), companyMetadata: new Map() });
    const normalized = {
      contractVersion: 'monte-carlo-facts-input-v1',
      fundId: 7,
      asOfDate: AS_OF_DATE,
      sourceFactsInputHash: SOURCE_FACTS_INPUT_HASH,
      companies: [],
    };

    expect(result).toEqual({
      ...normalized,
      factsInputHash: canonicalSha256(normalized),
    });
  });

  it('maps a full LIVE company from facts and explicit metadata', () => {
    const result = buildInput();
    const normalized = {
      contractVersion: 'monte-carlo-facts-input-v1' as const,
      fundId: 7,
      asOfDate: AS_OF_DATE,
      sourceFactsInputHash: SOURCE_FACTS_INPUT_HASH,
      companies: [
        {
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
        },
      ],
    };

    expect(result).toEqual({
      ...normalized,
      factsInputHash: canonicalSha256(normalized),
    });
  });

  it('preserves available PARTIAL fields while withholding an inactive planning FMV', () => {
    const partialFact = companyFact(11, {
      planningFmvStatus: 'stale',
      warnings: [partialWarning],
      provenance: provenance('PARTIAL'),
    });

    expect(buildInput({ facts: factsResponse([partialFact]) }).companies[0]).toEqual({
      companyId: 11,
      observedInitialInvestment: '100.250000',
      observedFollowOnInvestment: '20.750000',
      planningFmv: null,
      planningFmvStatus: 'stale',
      stage: 'Series A',
      sector: 'SaaS',
      trustState: 'PARTIAL',
      currencyStatus: 'base_currency',
      warnings: [partialWarning],
    });
  });

  it('nulls every monetary field when currency is blocked', () => {
    const blockedFact = companyFact(11, {
      currency: 'EUR',
      currencyStatus: 'mismatch_blocked',
      planningFmvStatus: 'blocked',
      warnings: [currencyWarning],
      provenance: provenance('UNAVAILABLE'),
    });

    expect(buildInput({ facts: factsResponse([blockedFact]) }).companies[0]).toMatchObject({
      observedInitialInvestment: null,
      observedFollowOnInvestment: null,
      planningFmv: null,
      planningFmvStatus: 'blocked',
      trustState: 'UNAVAILABLE',
      currencyStatus: 'mismatch_blocked',
    });
  });

  it('nulls every monetary field for FAILED facts even in the base currency', () => {
    const failedFact = companyFact(11, {
      warnings: [failedWarning],
      provenance: provenance('FAILED'),
    });

    expect(buildInput({ facts: factsResponse([failedFact]) }).companies[0]).toMatchObject({
      observedInitialInvestment: null,
      observedFollowOnInvestment: null,
      planningFmv: null,
      trustState: 'FAILED',
      currencyStatus: 'base_currency',
      warnings: [failedWarning],
    });
  });

  it('sorts mixed trust states, preserves unavailable companies, and never defaults metadata', () => {
    const failed = companyFact(13, {
      warnings: [failedWarning],
      provenance: provenance('FAILED'),
    });
    const live = companyFact(11);
    const unavailable = companyFact(12, {
      currency: 'EUR',
      currencyStatus: 'mismatch_blocked',
      planningFmvStatus: 'blocked',
      warnings: [currencyWarning],
      provenance: provenance('UNAVAILABLE'),
    });
    const metadata = new Map([
      [11, { stage: 'Series A', sector: 'SaaS' }],
      [12, { stage: '', sector: '   ' }],
    ]);

    const result = buildInput({
      facts: factsResponse([failed, live, unavailable]),
      companyMetadata: metadata,
    });

    expect(result.companies).toHaveLength(3);
    expect(result.companies.map((company) => company.companyId)).toEqual([11, 12, 13]);
    expect(result.companies[1]).toMatchObject({ stage: null, sector: null });
    expect(result.companies[2]).toMatchObject({ stage: null, sector: null });
    expect(JSON.stringify(result)).not.toMatch(/unknown|seed/i);
  });

  it('rejects source response and nested company scope mismatches', () => {
    expect(() =>
      buildInput({
        facts: { ...factsResponse([companyFact(11)]), fundId: 8 },
      })
    ).toThrow(/facts fundId 8 does not match requested fundId 7/i);

    expect(() =>
      buildInput({
        facts: { ...factsResponse([companyFact(11)]), asOfDate: '2026-07-12' },
      })
    ).toThrow(/facts asOfDate 2026-07-12 does not match requested asOfDate 2026-07-13/i);

    expect(() =>
      buildInput({
        facts: factsResponse([companyFact(11, { fundId: 8 })]),
      })
    ).toThrow(/company 11 facts fundId 8 does not match requested fundId 7/i);
  });

  it('produces a stable hash and changes it for every normalized field category', () => {
    const first = buildInput();
    const second = buildInput();
    expect(second.factsInputHash).toBe(first.factsInputHash);

    const changedFundFacts = factsResponse([companyFact(11, { fundId: 8 })]);
    const changedDateFacts = {
      ...factsResponse([companyFact(11)]),
      asOfDate: '2026-07-14',
    };
    const changedFund = buildFactsMonteCarloInput({
      fundId: 8,
      asOfDate: AS_OF_DATE,
      facts: { ...changedFundFacts, fundId: 8 },
      companyMetadata: new Map([[11, { stage: 'Series A', sector: 'SaaS' }]]),
    });
    const changedDate = buildInput({ facts: changedDateFacts, asOfDate: '2026-07-14' });
    const changedSourceHash = buildInput({
      facts: { ...factsResponse([companyFact(11)]), inputHash: 'd'.repeat(64) },
    });
    const changedCompanyId = buildInput({
      facts: factsResponse([companyFact(12)]),
      companyMetadata: new Map([[12, { stage: 'Series A', sector: 'SaaS' }]]),
    });
    const changedInitialInvestment = buildInput({
      facts: factsResponse([companyFact(11, { initialInvestmentAmount: '101.250000' })]),
    });
    const changedFollowOnInvestment = buildInput({
      facts: factsResponse([companyFact(11, { followOnInvestmentAmount: '21.750000' })]),
    });
    const changedPlanningFmv = buildInput({
      facts: factsResponse([companyFact(11, { latestPlanningFmvValue: '501.000000' })]),
    });
    const changedPlanningFmvStatus = buildInput({
      facts: factsResponse([
        companyFact(11, { planningFmvStatus: 'none', latestPlanningFmvValue: null }),
      ]),
    });
    const changedStage = buildInput({
      companyMetadata: new Map([[11, { stage: 'Series B', sector: 'SaaS' }]]),
    });
    const changedSector = buildInput({
      companyMetadata: new Map([[11, { stage: 'Series A', sector: 'Fintech' }]]),
    });
    const changedTrustState = buildInput({
      facts: factsResponse([companyFact(11, { provenance: provenance('PARTIAL') })]),
    });
    const changedCurrencyStatus = buildInput({
      facts: factsResponse([companyFact(11, { currencyStatus: 'unknown' })]),
    });
    const changedWarnings = buildInput({
      facts: factsResponse([
        companyFact(11, {
          warnings: [infoWarning],
          provenance: {
            ...provenance('LIVE'),
            structuredWarnings: [infoWarning],
          },
        }),
      ]),
    });

    const changedHashes = [
      changedFund,
      changedDate,
      changedSourceHash,
      changedCompanyId,
      changedInitialInvestment,
      changedFollowOnInvestment,
      changedPlanningFmv,
      changedPlanningFmvStatus,
      changedStage,
      changedSector,
      changedTrustState,
      changedCurrencyStatus,
      changedWarnings,
    ].map((result) => result.factsInputHash);

    expect(new Set([first.factsInputHash, ...changedHashes]).size).toBe(changedHashes.length + 1);
  });

  it('produces the same ordering and hash for equivalent source fact permutations', () => {
    const metadata = new Map([
      [11, { stage: 'Series A', sector: 'SaaS' }],
      [12, { stage: 'Series B', sector: 'Fintech' }],
    ]);
    const ascending = buildInput({
      facts: factsResponse([companyFact(11), companyFact(12)]),
      companyMetadata: metadata,
    });
    const descending = buildInput({
      facts: factsResponse([companyFact(12), companyFact(11)]),
      companyMetadata: metadata,
    });

    expect(descending.companies).toEqual(ascending.companies);
    expect(descending.factsInputHash).toBe(ascending.factsInputHash);
  });

  it('imports no database, schema, HTTP, PRNG, distribution, or simulation modules', async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const source = await readFile(
      path.join(repoRoot, 'server/services/monte-carlo/facts-monte-carlo-input-adapter.ts'),
      'utf8'
    );
    const fromImports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
      (match) => match[1] ?? ''
    );
    const sideEffectImports = [...source.matchAll(/import\s+['"]([^'"]+)['"]/g)].map(
      (match) => match[1] ?? ''
    );
    const forbiddenImport =
      /server\/db|(?:^|\/)db$|shared\/(?:schema|schemas)(?:\/|$)|drizzle|express|prng|distribution|simulation/i;

    expect(
      [...fromImports, ...sideEffectImports].filter((specifier) => forbiddenImport.test(specifier))
    ).toEqual([]);
  });
});
