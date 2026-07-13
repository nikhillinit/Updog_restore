import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { FundCompanyActualsFactsResponse } from '../../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';
import {
  buildMarginalReserveMoicInputsFromSources,
  type MarginalReserveInputSources,
} from '../../../../server/services/moic/marginal-reserve-moic-input-service';

const HASH = canonicalSha256({ facts: 'fixture' });

function facts(
  overrides: Partial<FundCompanyActualsFactsResponse['facts'][number]> = {}
): FundCompanyActualsFactsResponse {
  return {
    fundId: 1,
    asOfDate: '2026-07-12',
    inputHash: HASH,
    generatedAt: '2026-07-12T00:00:00.000Z',
    facts: [
      {
        fundId: 1,
        companyId: 11,
        companyName: 'Fixture Company',
        investmentIds: [101],
        activeRoundIds: [201],
        approvedPlanningFmvMarkId: null,
        planningFmvStatus: 'none',
        initialInvestmentAmount: '1000000',
        followOnInvestmentAmount: '0',
        amountOnlyNonEquityAmount: '0',
        latestRoundDate: '2026-01-01',
        latestRoundValuation: '999999999999',
        latestPlanningFmvDate: null,
        latestPlanningFmvValue: null,
        currency: 'USD',
        currencyStatus: 'base_currency',
        supersedeLineage: [{ roundId: 201, supersedesRoundId: null }],
        warnings: [],
        provenance: {
          trustState: 'LIVE',
          sourceKind: 'db_actuals',
          sourceRecordIds: ['company:11'],
          asOf: '2026-07-12T00:00:00.000Z',
          lastReconciledAt: null,
          staleAfter: null,
          warnings: [],
        },
        inputHash: canonicalSha256({ companyId: 11 }),
        ...overrides,
      },
    ],
  };
}

function publishedConfig(overrides: Record<string, unknown> = {}) {
  return {
    fundName: 'Fixture Fund',
    stages: [
      { id: 'seed', name: 'Seed', graduate: 40, exit: 10, months: 12 },
      { id: 'series-a', name: 'Series A', graduate: 30, exit: 20, months: 18 },
    ],
    sectorProfiles: [{ id: 'saas', name: 'SaaS', targetPercentage: 100 }],
    capitalPlanAllocations: [
      {
        id: 'saas-seed',
        name: 'SaaS Seed',
        sectorProfileId: 'saas',
        entryRound: 'Seed',
        capitalAllocationPct: 100,
        initialCheckStrategy: 'amount',
        initialCheckAmount: 500000,
        followOnStrategy: 'amount',
        followOnAmount: 1000000,
        followOnParticipationPct: 100,
        investmentHorizonMonths: 60,
      },
    ],
    pipelineProfiles: [
      {
        id: 'default',
        name: 'Default',
        stages: [
          {
            id: 'seed',
            name: 'Seed',
            roundSize: 2000000,
            valuation: 8000000,
            valuationType: 'pre',
            esopPct: 10,
            graduationRate: 40,
            exitRate: 10,
            exitValuation: 30000000,
            monthsToGraduate: 12,
            monthsToExit: 48,
          },
          {
            id: 'series-a',
            name: 'Series A',
            roundSize: 5000000,
            valuation: 20000000,
            valuationType: 'pre',
            esopPct: 10,
            graduationRate: 30,
            exitRate: 20,
            exitValuation: 75000000,
            monthsToGraduate: 18,
            monthsToExit: 48,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function sources(
  overrides: Partial<MarginalReserveInputSources> = {}
): MarginalReserveInputSources {
  return {
    baseCurrency: 'USD',
    facts: facts(),
    companies: [
      {
        companyId: 11,
        stage: 'Seed',
        currentStage: 'Seed',
        sector: 'SaaS',
        currentOwnership: '0.125',
        plannedReservesCents: 100_000_000,
      },
    ],
    publishedAssumptions: {
      configId: 7,
      version: 3,
      publishedAt: new Date('2026-07-01T00:00:00.000Z'),
      config: publishedConfig(),
    },
    ...overrides,
  };
}

function assemble(sourceOverrides: Partial<MarginalReserveInputSources> = {}) {
  return buildMarginalReserveMoicInputsFromSources({
    fundId: 1,
    asOfDate: '2026-07-12',
    sources: sources(sourceOverrides),
  });
}

describe('marginal reserve MOIC input assembly', () => {
  it('assembles from facts plus explicit ownership and published assumptions', () => {
    const result = assemble();

    expect(result.unavailable).toEqual([]);
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0]).toMatchObject({
      companyId: 11,
      currentOwnership: '0.125',
      factsInputHash: HASH,
      readiness: { status: 'actionable', reasons: [] },
      stages: [
        {
          stage: 'series_a',
          preMoneyValuation: '20000000',
          roundSize: '5000000',
          exitValuation: '75000000',
          withDecision: { participate: true, checkAmount: '1000000' },
          withoutDecision: { participate: false, checkAmount: '0' },
        },
      ],
    });
  });

  it('never reuses the latest actual round valuation as future exit value', () => {
    const result = assemble({ facts: facts({ latestRoundValuation: '123456789012345' }) });

    expect(result.ready[0]?.stages[0]?.exitValuation).toBe('75000000');
  });

  it('does not default missing approved probabilities or multiples', () => {
    const invalidConfig = publishedConfig({
      pipelineProfiles: [
        {
          id: 'default',
          name: 'Default',
          stages: [
            {
              id: 'series-a',
              name: 'Series A',
              roundSize: 5000000,
              valuation: 20000000,
              valuationType: 'pre',
              esopPct: 10,
              graduationRate: 30,
              exitRate: 20,
              monthsToGraduate: 18,
              monthsToExit: 48,
            },
          ],
        },
      ],
    });
    const result = assemble({
      publishedAssumptions: {
        configId: 7,
        version: 3,
        publishedAt: new Date('2026-07-01T00:00:00.000Z'),
        config: invalidConfig,
      },
    });

    expect(result.ready).toEqual([]);
    expect(result.unavailable[0]?.reasons).toContain('MISSING_PUBLISHED_ASSUMPTIONS');
  });

  it('returns every applicable readiness reason for unavailable companies', () => {
    const result = assemble({
      baseCurrency: 'EUR',
      facts: facts({ currency: 'EUR', currencyStatus: 'mismatch_blocked' }),
      companies: [
        {
          companyId: 11,
          stage: 'Seed',
          currentStage: 'Seed',
          sector: 'SaaS',
          currentOwnership: null,
          plannedReservesCents: 0,
        },
      ],
      publishedAssumptions: null,
    });

    expect(result.ready).toEqual([]);
    expect(result.unavailable).toEqual([
      {
        companyId: 11,
        reasons: expect.arrayContaining([
          'BLOCKED_CURRENCY',
          'MISSING_CURRENT_OWNERSHIP',
          'MISSING_FOLLOW_ON_POLICY',
          'MISSING_PLANNED_CHECK',
          'MISSING_PUBLISHED_ASSUMPTIONS',
          'MISSING_STAGE_ASSUMPTION',
        ]),
      },
    ]);
  });

  it('hashes facts and assumptions separately and deterministically', () => {
    const first = assemble();
    const same = assemble();
    const changed = assemble({
      companies: [
        {
          companyId: 11,
          stage: 'Seed',
          currentStage: 'Seed',
          sector: 'SaaS',
          currentOwnership: '0.125',
          plannedReservesCents: 200_000_000,
        },
      ],
    });

    expect(first.factsInputHash).toBe(same.factsInputHash);
    expect(first.assumptionsHash).toBe(same.assumptionsHash);
    expect(changed.factsInputHash).toBe(first.factsInputHash);
    expect(changed.assumptionsHash).not.toBe(first.assumptionsHash);
  });

  it('marks ready inputs indicative when the published assumptions are stale', () => {
    const result = assemble({
      publishedAssumptions: {
        configId: 7,
        version: 3,
        publishedAt: new Date('2025-01-01T00:00:00.000Z'),
        config: publishedConfig(),
      },
    });

    expect(result.ready[0]?.readiness).toEqual({
      status: 'indicative',
      reasons: ['STALE_ASSUMPTION'],
    });
  });

  it('blocks currency mismatches instead of converting them', () => {
    const result = assemble({
      facts: facts({ currency: 'EUR', currencyStatus: 'mismatch_blocked' }),
    });

    expect(result.ready).toEqual([]);
    expect(result.unavailable[0]?.reasons).toContain('BLOCKED_CURRENCY');
  });

  it('rejects a planned check that exceeds the approved prospective round size', () => {
    const result = assemble({
      companies: [
        {
          companyId: 11,
          stage: 'Seed',
          currentStage: 'Seed',
          sector: 'SaaS',
          currentOwnership: '0.125',
          plannedReservesCents: 600_000_000,
        },
      ],
    });

    expect(result.ready).toEqual([]);
    expect(result.unavailable[0]?.reasons).toContain('PLANNED_CHECK_EXCEEDS_ROUND_SIZE');
  });

  it('does not import or query raw rounds or valuation marks', async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const source = await readFile(
      path.join(repoRoot, 'server/services/moic/marginal-reserve-moic-input-service.ts'),
      'utf8'
    );

    expect(source).not.toContain('investmentRounds');
    expect(source).not.toContain('valuationMarks');
    expect(source).not.toContain('latestRoundValuation');
    expect(source).toContain('buildFundCompanyActualsFacts');
  });
});
