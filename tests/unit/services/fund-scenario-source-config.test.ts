import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionMock, queryMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

import { getFundScenarioSourceConfig } from '../../../server/services/fund-scenario-set-service';

const fullDraftConfig = {
  fundName: 'Fund I',
  fundSize: 100000000,
  waterfallType: 'american',
  allocations: [
    { id: 'alloc-a', category: 'Seed', percentage: 60 },
    { id: 'alloc-b', category: 'Series A', percentage: 40 },
  ],
  capitalPlanAllocations: [
    {
      id: 'cpa-1',
      name: 'Seed checks',
      sectorProfileId: 'sp-1',
      entryRound: 'Seed',
      capitalAllocationPct: 60,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 2000000,
      followOnStrategy: 'amount',
      followOnAmount: 4000000,
      followOnParticipationPct: 0.5,
      investmentHorizonMonths: 84,
    },
  ],
};

describe('getFundScenarioSourceConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(
      async (callback: (client: { query: typeof queryMock }) => unknown) =>
        callback({ query: queryMock })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns only the narrowed six-field payload', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // verifyFundExists
      .mockResolvedValueOnce({
        rows: [
          {
            id: 12,
            version: 4,
            published_at: new Date('2026-05-26T12:00:00.000Z'),
            config: fullDraftConfig,
          },
        ],
      });

    const result = await getFundScenarioSourceConfig(1);

    expect(result).toEqual({
      contractVersion: 'fund-scenario-source-config/1.0.0',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      publishedAt: '2026-05-26T12:00:00.000Z',
      allocations: fullDraftConfig.allocations,
      capitalPlanAllocations: fullDraftConfig.capitalPlanAllocations,
    });
    // Never leaks the full draft surface.
    expect(Object.keys(result).sort()).toEqual([
      'allocations',
      'capitalPlanAllocations',
      'contractVersion',
      'publishedAt',
      'sourceConfigId',
      'sourceConfigVersion',
    ]);
  });

  it('serializes absent arrays as null', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 12,
          version: 4,
          published_at: '2026-05-26T12:00:00.000Z',
          config: { fundName: 'Fund I' },
        },
      ],
    });

    const result = await getFundScenarioSourceConfig(1);
    expect(result.allocations).toBeNull();
    expect(result.capitalPlanAllocations).toBeNull();
  });

  it('rejects with 409 when no published config exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({ rows: [] });

    await expect(getFundScenarioSourceConfig(1)).rejects.toMatchObject({
      statusCode: 409,
      code: 'no_published_config',
    });
  });

  it('rejects with 404 for an unknown fund before reading configs', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(getFundScenarioSourceConfig(999)).rejects.toMatchObject({
      statusCode: 404,
      code: 'fund_not_found',
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed with 409 when the stored config does not parse', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 12,
          version: 4,
          published_at: new Date('2026-05-26T12:00:00.000Z'),
          config: { fundName: 'Fund I', allocations: [{ id: 'a', percentage: 'not-a-number' }] },
        },
      ],
    });

    await expect(getFundScenarioSourceConfig(1)).rejects.toMatchObject({
      statusCode: 409,
      code: 'scenario_source_config_invalid',
    });
  });
});
