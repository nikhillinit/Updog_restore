import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildFundCompanyActualsFacts,
  buildRoundsToModelEvidence,
  dbToMOICInvestment,
  findMany,
  investmentRoundsFindMany,
} = vi.hoisted(() => ({
  buildFundCompanyActualsFacts: vi.fn(),
  buildRoundsToModelEvidence: vi.fn(),
  dbToMOICInvestment: vi.fn(),
  findMany: vi.fn(),
  investmentRoundsFindMany: vi.fn(),
}));

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      portfolioCompanies: { findMany },
      investmentRounds: { findMany: investmentRoundsFindMany },
    },
  },
}));

vi.mock('../../../server/lib/moic-mapper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/moic-mapper')>();

  dbToMOICInvestment.mockImplementation(actual.dbToMOICInvestment);

  return {
    ...actual,
    dbToMOICInvestment,
  };
});

vi.mock('../../../server/services/fund-actuals/fund-company-actuals-facts-service', () => ({
  buildFundCompanyActualsFacts,
}));

vi.mock('../../../server/services/rounds-to-model-evidence-service', () => ({
  buildRoundsToModelEvidence,
}));

import {
  buildMoicRankingSourcesFromCompanies,
  buildMoicRankingsFromInvestments,
  discloseFundMoicRankings,
  getFundMoicRankingSources,
  summarizeMoicActualsProvenance,
} from '../../../server/services/fund-moic-ranking-service';
import { recordMoicReconciliation } from '../../../server/services/fund-moic-reconciliation-service';
import { createMoicActionabilityResolver } from '../../../server/services/fund-calculation-mode-service';
import { FundMoicRankingsResponseV1Schema } from '../../../shared/contracts/fund-moic-v1.contract';
import type {
  FundCompanyActualsFact,
  FundCompanyActualsFactsResponse,
} from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { MOICCalculator, type Investment } from '../../../shared/core/moic/MOICCalculator';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';

const makeInvestment = (overrides: Partial<Investment> = {}): Investment => ({
  id: '1',
  name: 'Company A',
  initialInvestment: 500_000,
  followOnInvestment: 0,
  currentValuation: 1_500_000,
  projectedExitValue: 0,
  exitProbability: 0.7,
  plannedReserves: 300_000,
  reserveExitMultiple: 3.5,
  investmentDate: new Date('2022-01-01'),
  ...overrides,
});

const FACTS_HASH = 'a'.repeat(64);

function actualsFact(overrides: Partial<FundCompanyActualsFact> = {}): FundCompanyActualsFact {
  return {
    fundId: 10,
    companyId: 1,
    companyName: 'Acme',
    investmentIds: [101],
    activeRoundIds: [201],
    approvedPlanningFmvMarkId: 301,
    planningFmvStatus: 'active',
    initialInvestmentAmount: '500000',
    followOnInvestmentAmount: '125000',
    amountOnlyNonEquityAmount: '0',
    latestRoundDate: '2026-06-30',
    latestRoundValuation: '9000000',
    latestPlanningFmvDate: '2026-07-01',
    latestPlanningFmvValue: '1500000',
    currency: 'USD',
    currencyStatus: 'base_currency',
    supersedeLineage: [{ roundId: 201, supersedesRoundId: null }],
    warnings: [],
    provenance: {
      trustState: 'LIVE',
      core: {
        sourceKind: 'computed',
        actionability: 'actionable',
        sourceEngine: 'rounds-to-model',
        engineVersion: 'rounds-to-model-v1',
        inputHash: FACTS_HASH,
        assumptionsHash: 'b'.repeat(64),
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

function actualsFactsResponse(
  facts: FundCompanyActualsFact[] = [actualsFact()]
): FundCompanyActualsFactsResponse {
  return {
    fundId: 10,
    asOfDate: '2026-07-13',
    facts,
    inputHash: 'c'.repeat(64),
    generatedAt: '2026-07-13T00:00:00.000Z',
  };
}

function availableFacts(facts: FundCompanyActualsFact[] = [actualsFact()]) {
  return { status: 'available' as const, response: actualsFactsResponse(facts) };
}

describe('fund MOIC ranking service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildFundCompanyActualsFacts.mockResolvedValue(actualsFactsResponse());
    buildRoundsToModelEvidence.mockResolvedValue({
      coverage: {
        activeRoundCount: 1,
        activeOverrideCount: 0,
        warningsByCode: {},
      },
    });
  });

  it('ranks investments by reserves MOIC descending', () => {
    const investments: Investment[] = [
      makeInvestment({ id: '1', name: 'Low', reserveExitMultiple: 1.5 }),
      makeInvestment({ id: '2', name: 'High', reserveExitMultiple: 4.0 }),
      makeInvestment({ id: '3', name: 'Mid', reserveExitMultiple: 2.5 }),
    ];

    const result = buildMoicRankingsFromInvestments(10, investments);

    expect(result.fundId).toBe(10);
    expect(result.provenance).toEqual({
      source: 'portfolio_companies',
      calculation: 'reserves_moic_rankings',
      metricBasis: 'planned_reserves',
      sourceRecordCount: 3,
    });
    expect(result.rankings).toHaveLength(3);
    expect(result.rankings[0]?.rank).toBe(1);
    expect(result.rankings[0]?.investmentName).toBe('High');
    expect(result.rankings[1]?.investmentName).toBe('Mid');
    expect(result.rankings[2]?.investmentName).toBe('Low');
  });

  it('preserves the string investmentId from the MOICCalculator', () => {
    const investments: Investment[] = [makeInvestment({ id: '42', name: 'Acme' })];

    const result = buildMoicRankingsFromInvestments(5, investments);

    expect(result.rankings[0]?.investmentId).toBe('42');
  });

  it('returns an empty rankings array for a fund with no investments', () => {
    const result = buildMoicRankingsFromInvestments(99, []);

    expect(result.fundId).toBe(99);
    expect(result.provenance.sourceRecordCount).toBe(0);
    expect(result.rankings).toHaveLength(0);
  });

  it('includes a generatedAt ISO timestamp', () => {
    const result = buildMoicRankingsFromInvestments(1, []);

    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes reservesMoic with value, description, formula fields', () => {
    const investments: Investment[] = [makeInvestment({ id: '1', name: 'Test' })];

    const result = buildMoicRankingsFromInvestments(1, investments);

    const item = result.rankings[0];
    expect(item).toBeDefined();
    expect(item?.reservesMoic).toMatchObject({
      value: expect.anything(),
      description: expect.any(String),
      formula: expect.any(String),
    });
  });

  it('parses the full service response through the shared schema', () => {
    const investments: Investment[] = [makeInvestment({ id: '1', name: 'Test' })];

    const result = buildMoicRankingsFromInvestments(1, investments);
    const parsed = FundMoicRankingsResponseV1Schema.safeParse(result);

    expect(parsed.success).toBe(true);
  });

  it('keeps live rankings sourced from portfolioCompanies and ignores investment_rounds', async () => {
    findMany.mockResolvedValue([
      {
        id: 101,
        name: 'Acme',
        investmentAmount: 500_000,
        currentValuation: 1_500_000,
        plannedReservesCents: 300_000_00,
        exitMoicBps: 35000,
        investmentDate: new Date('2022-01-01T00:00:00.000Z'),
      },
    ]);

    const { getFundMoicRankings } =
      await import('../../../server/services/fund-moic-ranking-service');
    const result = await getFundMoicRankings(10);

    expect(findMany).toHaveBeenCalledOnce();
    expect(investmentRoundsFindMany).not.toHaveBeenCalled();
    expect(dbToMOICInvestment).toHaveBeenCalledWith(
      expect.objectContaining({ followOnAmount: null })
    );
    expect(result.provenance.source).toBe('portfolio_companies');
    expect(result.provenance.metricBasis).toBe('planned_reserves');
    expect(result.rankings).toHaveLength(1);
  });

  it('persists a facts-backed reconciliation hash that a later v2 read makes actionable', async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        fundId: 10,
        name: 'Acme',
        plannedReservesCents: 300_000_00,
        exitMoicBps: 35000,
        exitProbability: 0.8,
      },
    ]);
    const now = new Date('2026-07-13T12:00:00.000Z');
    let acceptedRow: Record<string, unknown> | null = null;
    const findAccepted = vi.fn(async () => acceptedRow);
    const database = {
      query: {
        portfolioCompanies: { findMany },
        reconciliationRuns: { findFirst: findAccepted },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((values: unknown) => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => {
              acceptedRow = {
                ...(values as Record<string, unknown>),
                id: 123,
                requestedAt: now,
              };
              return [acceptedRow];
            }),
          })),
        })),
      })),
    };

    const firstV2Sources = await getFundMoicRankingSources(10, database as never, undefined, now);
    await recordMoicReconciliation({
      fundId: 10,
      idempotencyKey: 'facts-round-trip',
      requestedBy: 42,
      database: database as never,
    });
    const laterV2Sources = await getFundMoicRankingSources(10, database as never, undefined, now);
    const actionability = await createMoicActionabilityResolver({ database, now }).resolve({
      fundId: 10,
      sources: laterV2Sources,
    });

    expect(acceptedRow).toMatchObject({
      candidateInputHash: firstV2Sources.moicSourceInputHash,
      evidenceInputHash: canonicalSha256({
        activeRoundCount: 1,
        activeOverrideCount: 0,
        warningsByCode: {},
      }),
      status: 'completed',
    });
    expect(laterV2Sources.moicSourceInputHash).toBe(firstV2Sources.moicSourceInputHash);
    expect(laterV2Sources.factsSource.status).toBe('available');
    expect(actionability).toMatchObject({
      sourceFingerprintMatches: true,
      actionability: 'actionable',
    });
    expect(buildFundCompanyActualsFacts).toHaveBeenCalledTimes(3);
    expect(database.insert).toHaveBeenCalledOnce();
    expect(findAccepted).toHaveBeenCalledOnce();
  });

  it('fails a rejected shared facts load closed for candidate actionability', async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        fundId: 10,
        name: 'Acme',
        plannedReservesCents: 300_000_00,
        exitMoicBps: 35000,
        exitProbability: 0.8,
      },
    ]);
    buildFundCompanyActualsFacts.mockRejectedValueOnce(new Error('facts backend unavailable'));
    const now = new Date('2026-07-13T12:00:00.000Z');
    const evidenceInputHash = canonicalSha256({
      activeRoundCount: 1,
      activeOverrideCount: 0,
      warningsByCode: {},
    });
    const database = {
      query: {
        portfolioCompanies: { findMany },
        reconciliationRuns: {
          findFirst: vi.fn(async () => ({
            id: 456,
            candidateInputHash: '',
            evidenceInputHash,
          })),
        },
      },
    };

    const sources = await getFundMoicRankingSources(10, database as never, undefined, now);
    database.query.reconciliationRuns.findFirst.mockResolvedValue({
      id: 456,
      candidateInputHash: sources.moicSourceInputHash,
      evidenceInputHash,
    });
    const actionability = await createMoicActionabilityResolver({ database, now }).resolve({
      fundId: 10,
      sources,
    });

    expect(sources.factsSource).toEqual({ status: 'absent' });
    expect(actionability).toMatchObject({
      sourceFingerprintMatches: false,
      actionability: 'non_actionable',
    });
  });

  it('keeps legacy/off rankings on the existing null-coerced probability path', async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Acme',
        investmentAmount: 500_000,
        currentValuation: 1_500_000,
        plannedReservesCents: 300_000_00, // non-zero planned reserves
        exitMoicBps: 35000, // non-zero reserve exit multiple (350x)
        exitProbability: 0.8, // real, non-null probability in the source row
        investmentDate: new Date('2022-01-01T00:00:00.000Z'),
      },
    ]);

    const { getFundMoicRankings } =
      await import('../../../server/services/fund-moic-ranking-service');
    const result = await getFundMoicRankings(10);

    expect(result.rankings[0]?.reservesMoic.value).toBe(0);
  });

  it('builds a positive source-backed candidate from explicit exit probability', () => {
    const result = buildMoicRankingSourcesFromCompanies(10, [
      {
        id: 1,
        fundId: 10,
        name: 'Acme',
        investmentAmount: 500_000,
        currentValuation: 1_500_000,
        plannedReservesCents: 300_000_00,
        exitMoicBps: 35000,
        exitProbability: 0.8,
        investmentDate: new Date('2022-01-01T00:00:00.000Z'),
      },
    ]);

    expect(result.legacy.rankings[0]?.reservesMoic.value).toBe(0);
    expect(result.candidate.rankings[0]?.reservesMoic.value).toBe(280);
    expect(result.moicInputSummary).toMatchObject({
      explicitExitProbabilityCount: 1,
      defaultedExitProbabilityCount: 0,
      activationBlockingDefaultedExitProbabilityCount: 0,
      explicitReserveExitMultipleCount: 1,
      defaultedReserveExitMultipleCount: 0,
      activationBlockingDefaultedReserveExitMultipleCount: 0,
    });
  });

  it('falls missing candidate probability back to 1.0 and counts activation blocking rows', () => {
    const result = buildMoicRankingSourcesFromCompanies(10, [
      {
        id: 1,
        fundId: 10,
        name: 'Acme',
        investmentAmount: 500_000,
        currentValuation: 1_500_000,
        plannedReservesCents: 300_000_00,
        exitMoicBps: 25000,
        exitProbability: null,
        investmentDate: new Date('2022-01-01T00:00:00.000Z'),
      },
    ]);

    expect(result.candidate.rankings[0]?.reservesMoic.value).toBe(250);
    expect(result.moicInputSummary.defaultedExitProbabilityCount).toBe(1);
    expect(result.moicInputSummary.activationBlockingDefaultedExitProbabilityCount).toBe(1);
    expect(result.moicInputSummary.activationBlockingDefaultedReserveExitMultipleCount).toBe(0);
  });

  it('keeps the legacy candidate default only for an explicit absent-facts state', () => {
    const result = buildMoicRankingSourcesFromCompanies(
      10,
      [
        {
          id: 1,
          fundId: 10,
          name: 'Acme',
          currentValuation: 1_500_000,
          plannedReservesCents: 300_000_00,
          exitMoicBps: 25000,
          exitProbability: null,
        },
      ],
      { status: 'absent' }
    );

    expect(result.candidate.rankings[0]?.reservesMoic.value).toBe(250);
    expect(result.factsBasisByInvestmentId).toBeUndefined();
  });

  it('keeps candidate rankings on facts/provenance integration and does not claim marginal next-dollar MOIC', () => {
    const result = buildMoicRankingSourcesFromCompanies(10, [
      {
        id: 1,
        fundId: 10,
        name: 'Acme',
        investmentAmount: 500_000,
        currentValuation: 1_500_000,
        plannedReservesCents: 300_000_00,
        exitMoicBps: 25000,
        exitProbability: null,
        investmentDate: new Date('2022-01-01T00:00:00.000Z'),
      },
    ]);

    expect(result.moicInputSummary.defaultedExitProbabilityCount).toBe(1);
    expect(result.legacy.provenance.calculation).toBe('reserves_moic_rankings');
    expect(result.legacy.provenance.metricBasis).toBe('planned_reserves');
    expect(JSON.stringify(result)).not.toMatch(/marginal|next-dollar|incremental ownership/i);
  });

  it('falls missing reserve multiples back to 1x and blocks activation without double-counting probability', () => {
    const result = buildMoicRankingSourcesFromCompanies(10, [
      {
        id: 1,
        fundId: 10,
        name: 'Acme',
        investmentAmount: 500_000,
        currentValuation: 1_500_000,
        plannedReservesCents: 300_000_00,
        exitMoicBps: 0,
        exitProbability: null,
        investmentDate: new Date('2022-01-01T00:00:00.000Z'),
      },
    ]);

    expect(result.candidate.rankings[0]?.reservesMoic.value).toBe(1);
    expect(result.moicInputSummary.defaultedExitProbabilityCount).toBe(1);
    expect(result.moicInputSummary.activationBlockingDefaultedExitProbabilityCount).toBe(0);
    expect(result.moicInputSummary.defaultedReserveExitMultipleCount).toBe(1);
    expect(result.moicInputSummary.activationBlockingDefaultedReserveExitMultipleCount).toBe(1);
  });

  it('parses numeric-string exit probabilities before candidate MOIC math', () => {
    const result = buildMoicRankingSourcesFromCompanies(10, [
      {
        id: 1,
        fundId: 10,
        name: 'Acme',
        investmentAmount: '500000',
        currentValuation: '1500000',
        plannedReservesCents: 300_000_00,
        exitMoicBps: '12500',
        exitProbability: '0.500000',
        investmentDate: new Date('2022-01-01T00:00:00.000Z'),
      },
    ]);

    expect(result.candidate.rankings[0]?.reservesMoic.value).toBe(62.5);
    expect(result.moicInputSummary.explicitExitProbabilityCount).toBe(1);
  });

  it('hashes candidate inputs deterministically by company ID and changes on source edits', () => {
    const companyA = {
      id: 2,
      fundId: 10,
      name: 'Beta',
      investmentAmount: 500_000,
      currentValuation: 1_500_000,
      plannedReservesCents: 200_000_00,
      exitMoicBps: 20000,
      exitProbability: 0.4,
      investmentDate: new Date('2022-01-01T00:00:00.000Z'),
    };
    const companyB = {
      id: 1,
      fundId: 10,
      name: 'Acme',
      investmentAmount: 500_000,
      currentValuation: 1_500_000,
      plannedReservesCents: 300_000_00,
      exitMoicBps: 35000,
      exitProbability: 0.8,
      investmentDate: new Date('2022-01-01T00:00:00.000Z'),
    };

    const forward = buildMoicRankingSourcesFromCompanies(10, [companyA, companyB]);
    const reverse = buildMoicRankingSourcesFromCompanies(10, [companyB, companyA]);
    const edited = buildMoicRankingSourcesFromCompanies(10, [
      companyA,
      { ...companyB, exitProbability: 0.7 },
    ]);

    expect(forward.moicSourceInputHash).toBe(reverse.moicSourceInputHash);
    expect(edited.moicSourceInputHash).not.toBe(forward.moicSourceInputHash);
  });

  it('starts a new facts-backed source-hash regime without changing legacy rankings', () => {
    const companies = [
      {
        id: 1,
        fundId: 10,
        name: 'Acme',
        investmentAmount: 500_000,
        currentValuation: 1_500_000,
        plannedReservesCents: 300_000_00,
        exitMoicBps: 35000,
        exitProbability: 0.8,
        investmentDate: new Date('2022-01-01T00:00:00.000Z'),
      },
    ];
    const before = buildMoicRankingSourcesFromCompanies(10, companies);
    const legacyRegimeHash = canonicalSha256({
      kind: 'fund_moic_candidate_source',
      fundId: 10,
      rows: [
        {
          companyId: 1,
          fundId: 10,
          plannedReservesCents: 300_000_00,
          exitProbability: 0.8,
          exitProbabilitySource: 'explicit',
          exitMoicBps: 35000,
          reserveExitMultipleSource: 'explicit',
          sourceVersion: 'moic-exit-probability-v1',
        },
      ],
      sourceVersion: 'moic-exit-probability-v1',
    });
    const after = buildMoicRankingSourcesFromCompanies(10, companies, availableFacts());
    const disclosed = discloseFundMoicRankings(after.legacy, after.factsBasisByInvestmentId);

    expect(after.legacy.rankings).toEqual(before.legacy.rankings);
    expect(after.moicInputSummary.sourceVersion).toBe('moic-round-fmv-facts-v2');
    expect(after.moicSourceInputHash).not.toBe(legacyRegimeHash);
    expect(canonicalSha256(after.legacy.rankings)).toBe(canonicalSha256(before.legacy.rankings));
    expect(disclosed.rankings.map(({ factsBasis: _factsBasis, ...ranking }) => ranking)).toEqual(
      before.legacy.rankings
    );
    expect(disclosed.rankings.some((ranking) => ranking.factsBasis !== null)).toBe(true);
  });

  it('changes the source hash when the selected valuation anchor changes', () => {
    const companies = [
      {
        id: 1,
        fundId: 10,
        name: 'Acme',
        currentValuation: 1_500_000,
        plannedReservesCents: 300_000_00,
        exitMoicBps: 35000,
        exitProbability: 0.8,
      },
    ];

    const before = buildMoicRankingSourcesFromCompanies(10, companies, availableFacts());
    const after = buildMoicRankingSourcesFromCompanies(
      10,
      companies,
      availableFacts([actualsFact({ latestPlanningFmvValue: '1750000' })])
    );

    expect(after.moicSourceInputHash).not.toBe(before.moicSourceInputHash);
  });

  it('changes the source hash when only the investment name changes', () => {
    const company = {
      id: 1,
      fundId: 10,
      name: 'Acme',
      plannedReservesCents: 300_000_00,
      exitMoicBps: 35000,
      exitProbability: 0.8,
    };

    const before = buildMoicRankingSourcesFromCompanies(10, [company], availableFacts());
    const after = buildMoicRankingSourcesFromCompanies(
      10,
      [{ ...company, name: 'Acme Renamed' }],
      availableFacts()
    );

    expect(after.moicSourceInputHash).not.toBe(before.moicSourceInputHash);
  });

  it('changes the source hash when only the per-company facts input hash changes', () => {
    const companies = [
      {
        id: 1,
        fundId: 10,
        name: 'Acme',
        currentValuation: 1_500_000,
        plannedReservesCents: 300_000_00,
        exitMoicBps: 35000,
        exitProbability: 0.8,
      },
    ];

    const before = buildMoicRankingSourcesFromCompanies(10, companies, availableFacts());
    const after = buildMoicRankingSourcesFromCompanies(
      10,
      companies,
      availableFacts([actualsFact({ inputHash: 'd'.repeat(64) })])
    );

    expect(after.moicSourceInputHash).not.toBe(before.moicSourceInputHash);
  });

  it('feeds observed investments and the selected valuation anchor to MOICCalculator', () => {
    const calculateReservesMoic = vi.spyOn(MOICCalculator, 'calculateReservesMOIC');

    try {
      buildMoicRankingSourcesFromCompanies(
        10,
        [
          {
            id: 1,
            fundId: 10,
            name: 'Acme',
            investmentAmount: 999,
            currentValuation: 888,
            plannedReservesCents: 300_000_00,
            exitMoicBps: 35000,
            exitProbability: 0.8,
          },
        ],
        availableFacts()
      );

      expect(calculateReservesMoic).toHaveBeenCalledWith(
        expect.objectContaining({
          initialInvestment: 500_000,
          followOnInvestment: 125_000,
          currentValuation: 1_500_000,
          plannedReserves: 300_000,
          exitProbability: 0.8,
          reserveExitMultiple: 350,
        }),
        true
      );
    } finally {
      calculateReservesMoic.mockRestore();
    }
  });

  it('hashes the complete facts row with decimal-string money and the v2 source version', () => {
    const result = buildMoicRankingSourcesFromCompanies(
      10,
      [
        {
          id: 1,
          fundId: 10,
          name: 'Acme',
          plannedReservesCents: 300_000_00,
          exitMoicBps: 35000,
          exitProbability: 0.8,
        },
      ],
      availableFacts()
    );

    expect(result.moicSourceInputHash).toBe(
      canonicalSha256({
        kind: 'fund_moic_candidate_source',
        fundId: 10,
        rows: [
          {
            companyId: 1,
            fundId: 10,
            investmentName: 'Acme',
            plannedReservesCents: '30000000',
            exitProbability: 0.8,
            exitProbabilitySource: 'explicit',
            exitMoicBps: 35000,
            reserveExitMultipleSource: 'explicit',
            factsInputHash: FACTS_HASH,
            observedInitialInvestment: '500000',
            observedFollowOnInvestment: '125000',
            valuationAnchorKind: 'planning_fmv',
            valuationAnchorValue: '1500000',
            valuationAnchorAsOfDate: '2026-07-01',
            planningFmvStatus: 'active',
            currencyStatus: 'base_currency',
            rankability: 'actionable',
            sourceVersion: 'moic-round-fmv-facts-v2',
          },
        ],
        sourceVersion: 'moic-round-fmv-facts-v2',
      })
    );
  });

  it('orders facts candidates by rankability and retains non-actionable rows without a number', () => {
    const companies = [
      {
        id: 6,
        fundId: 10,
        name: 'No anchor',
        currentValuation: null,
        plannedReservesCents: 100_000,
        exitMoicBps: 1000,
        exitProbability: 1,
      },
      {
        id: 5,
        fundId: 10,
        name: 'Missing multiple',
        plannedReservesCents: 100_000,
        exitMoicBps: null,
        exitProbability: 1,
      },
      {
        id: 4,
        fundId: 10,
        name: 'Currency blocked',
        plannedReservesCents: 100_000,
        exitMoicBps: 1000,
        exitProbability: 1,
      },
      {
        id: 3,
        fundId: 10,
        name: 'Missing probability',
        plannedReservesCents: 100_000,
        exitMoicBps: 1000,
        exitProbability: null,
      },
      {
        id: 2,
        fundId: 10,
        name: 'Indicative',
        plannedReservesCents: 100_000,
        exitMoicBps: 400,
        exitProbability: 0.5,
      },
      {
        id: 1,
        fundId: 10,
        name: 'Actionable',
        plannedReservesCents: 100_000,
        exitMoicBps: 200,
        exitProbability: 0.5,
      },
    ];
    const facts = availableFacts([
      actualsFact({ companyId: 1, companyName: 'Actionable' }),
      actualsFact({
        companyId: 2,
        companyName: 'Indicative',
        planningFmvStatus: 'stale',
      }),
      actualsFact({ companyId: 3, companyName: 'Missing probability' }),
      actualsFact({
        companyId: 4,
        companyName: 'Currency blocked',
        currency: 'EUR',
        currencyStatus: 'mismatch_blocked',
      }),
      actualsFact({ companyId: 5, companyName: 'Missing multiple' }),
      actualsFact({
        companyId: 6,
        companyName: 'No anchor',
        planningFmvStatus: 'none',
        latestPlanningFmvDate: null,
        latestPlanningFmvValue: null,
      }),
    ]);

    const result = buildMoicRankingSourcesFromCompanies(10, companies, facts);

    expect(result.candidate.rankings.map((ranking) => ranking.investmentId)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(result.candidate.rankings.map((ranking) => ranking.reservesMoic.value)).toEqual([
      1,
      2,
      null,
      null,
      null,
      null,
    ]);
    expect(result.factsBasisByInvestmentId?.get('3')?.rankability).toBe('indicative');
    expect(result.candidateFactsBasisByInvestmentId?.get('3')?.rankability).toBe('not_actionable');
    expect(result.factsBasisByInvestmentId?.get('4')?.rankability).toBe('not_actionable');
    expect(result.factsBasisByInvestmentId?.get('5')?.rankability).toBe('indicative');
    expect(result.candidateFactsBasisByInvestmentId?.get('5')?.rankability).toBe('not_actionable');
    expect(result.factsBasisByInvestmentId?.get('6')?.rankability).toBe('not_actionable');
    expect(result.moicInputSummary.activationBlockingDefaultedExitProbabilityCount).toBe(1);
    expect(result.moicInputSummary.activationBlockingDefaultedReserveExitMultipleCount).toBe(1);
  });

  it('hashes missing explicit economics as non-actionable in the facts candidate regime', () => {
    const result = buildMoicRankingSourcesFromCompanies(
      10,
      [
        {
          id: 1,
          fundId: 10,
          name: 'Missing probability',
          plannedReservesCents: 100_000,
          exitMoicBps: 1000,
          exitProbability: null,
        },
      ],
      availableFacts()
    );

    expect(result.moicSourceInputHash).toBe(
      canonicalSha256({
        kind: 'fund_moic_candidate_source',
        fundId: 10,
        rows: [
          {
            companyId: 1,
            fundId: 10,
            investmentName: 'Missing probability',
            plannedReservesCents: '100000',
            exitProbability: null,
            exitProbabilitySource: 'defaulted',
            exitMoicBps: 1000,
            reserveExitMultipleSource: 'explicit',
            factsInputHash: FACTS_HASH,
            observedInitialInvestment: '500000',
            observedFollowOnInvestment: '125000',
            valuationAnchorKind: 'planning_fmv',
            valuationAnchorValue: '1500000',
            valuationAnchorAsOfDate: '2026-07-01',
            planningFmvStatus: 'active',
            currencyStatus: 'base_currency',
            rankability: 'not_actionable',
            sourceVersion: 'moic-round-fmv-facts-v2',
          },
        ],
        sourceVersion: 'moic-round-fmv-facts-v2',
      })
    );
  });

  it('discloses FACTS_MISSING when a successful facts response omits a company', () => {
    const sources = buildMoicRankingSourcesFromCompanies(
      10,
      [
        {
          id: 1,
          fundId: 10,
          name: 'Acme',
          currentValuation: '1500000',
          plannedReservesCents: 300_000_00,
          exitMoicBps: 35000,
          exitProbability: 0.8,
        },
      ],
      availableFacts([])
    );

    expect(sources.factsBasisByInvestmentId?.get('1')).toMatchObject({
      rankability: 'indicative',
      factsInputHash: null,
      warnings: [{ code: 'FACTS_MISSING' }],
    });
  });

  it('characterizes follow-on/initial-only changes as no-ops for reserves MOIC value and rank', () => {
    const base: Investment[] = [
      makeInvestment({ id: '1', name: 'A', reserveExitMultiple: 3.0 }),
      makeInvestment({ id: '2', name: 'B', reserveExitMultiple: 2.0 }),
    ];
    const followOnAndInitialChanged: Investment[] = [
      makeInvestment({
        id: '1',
        name: 'A',
        reserveExitMultiple: 3.0,
        followOnInvestment: 999_999,
        initialInvestment: 12_345,
      }),
      makeInvestment({
        id: '2',
        name: 'B',
        reserveExitMultiple: 2.0,
        followOnInvestment: 5,
        initialInvestment: 1,
      }),
    ];

    const before = buildMoicRankingsFromInvestments(1, base);
    const after = buildMoicRankingsFromInvestments(1, followOnAndInitialChanged);

    const project = (r: typeof before) =>
      r.rankings.map((x) => [x.investmentId, x.rank, x.reservesMoic.value]);

    expect(project(after)).toEqual(project(before));
  });

  it('counts trust states and preserves warnings', () => {
    const summary = summarizeMoicActualsProvenance({
      factsStatus: 'available',
      factsInputHash: 'h',
      trustStates: ['LIVE', 'LIVE', 'PARTIAL', 'UNAVAILABLE'],
      defaultedEconomicInputCount: 3,
    });
    expect(summary.companyCount).toBe(4);
    expect(summary.trustStateCounts).toEqual({
      LIVE: 2,
      PARTIAL: 1,
      UNAVAILABLE: 1,
      FAILED: 0,
    });
    expect(summary.warnings).toEqual([]);
  });
});
