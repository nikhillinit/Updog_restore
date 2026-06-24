import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbToMOICInvestment, findMany, investmentRoundsFindMany } = vi.hoisted(() => ({
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

vi.mock('../../../server/routes/moic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/routes/moic')>();

  dbToMOICInvestment.mockImplementation(actual.dbToMOICInvestment);

  return {
    ...actual,
    dbToMOICInvestment,
  };
});

import { buildMoicRankingsFromInvestments } from '../../../server/services/fund-moic-ranking-service';
import { FundMoicRankingsResponseV1Schema } from '../../../shared/contracts/fund-moic-v1.contract';
import type { Investment } from '../../../shared/core/moic/MOICCalculator';

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

describe('fund MOIC ranking service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
