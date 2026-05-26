import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionMock, queryMock, runEconomicsModelMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  queryMock: vi.fn(),
  runEconomicsModelMock: vi.fn(),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

vi.mock('@shared/lib/economics/economics-engine', async () => {
  const actual = await vi.importActual<typeof import('@shared/lib/economics/economics-engine')>(
    '@shared/lib/economics/economics-engine'
  );
  return {
    ...actual,
    runEconomicsModel: runEconomicsModelMock,
  };
});

import {
  calculateFundScenarioSet,
  getScenarioResults,
} from '../../../server/services/fund-scenario-calculation-service';
import type { FundScenarioCalculationPayloadV1 } from '../../../shared/contracts/fund-scenario-sets-v1.contract';

const scenarioSetId = '00000000-0000-0000-0000-000000000111';
const variantId = '00000000-0000-0000-0000-000000000112';
const correlationId = '00000000-0000-0000-0000-000000000123';

const feeProfileOverride = {
  overrideType: 'fee_profile',
  payload: {
    feeProfiles: [
      {
        id: 'fee-profile-downside',
        name: 'Lower fees',
        feeTiers: [
          {
            id: 'tier-1',
            name: 'Management fee',
            percentage: 1.5,
            feeBasis: 'committed_capital',
            startMonth: 0,
          },
        ],
      },
    ],
  },
} as const;

const baseConfig = {
  fundName: 'Test Fund',
  fundSize: 100_000_000,
  vintageYear: 2026,
  managementFeeRate: 2,
  carriedInterest: 20,
  feeProfiles: [
    {
      id: 'fee-profile-base',
      name: 'Base fees',
      feeTiers: [
        {
          id: 'base-tier',
          name: 'Base management fee',
          percentage: 2,
          feeBasis: 'committed_capital',
          startMonth: 0,
        },
      ],
    },
  ],
  economicsAssumptions: {
    version: 'v1',
  },
} as const;

const economicsResult = {
  version: 'v1',
  annual: [
    {
      year: 1,
      lpCapitalCalls: 1,
      gpCommitmentCalls: 0,
      grossExitProceeds: 0,
      beginningCash: 0,
      investments: 0,
      feesPaidToManager: 1,
      expensesPaid: 0,
      recycledProceeds: 0,
      endingCash: 0,
      lpDistributions: 0,
      gpInvestmentDistributions: 0,
      gpCarryDistributed: 0,
      gpCarryEscrowed: 0,
      gpCarryReleasedFromEscrow: 0,
      clawbackPaid: 0,
      grossNav: 0,
      lpNetNav: 0,
      dpi: 0,
      rvpi: 0,
      tvpi: 0,
      conservationDelta: 0,
    },
  ],
  summary: {
    grossIrr: null,
    lpNetIrr: null,
    gpNetIrr: null,
    totalLpPaidIn: 1,
    totalGpCommitmentCalled: 0,
    totalManagementFees: 1,
    totalExpenses: 0,
    totalRecycled: 0,
    totalLpDistributions: 0,
    totalGpInvestmentDistributions: 0,
    totalGpCarryDistributed: 0,
    totalGpFeeIncome: 1,
    finalDpi: 0,
    finalRvpi: 0,
    finalTvpi: 0,
    finalClawbackDue: 0,
    maxEscrowAvailable: 0,
    netGpCarryAfterClawback: 0,
  },
  checks: {
    passed: true,
    tolerance: 0.01,
    errors: [],
  },
} as const;

function scenarioSetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: scenarioSetId,
    fund_id: 1,
    name: 'Fee sensitivity',
    description: null,
    source_config_id: 12,
    source_config_version: 4,
    created_by_user_id: 17,
    created_by_label: 'analyst@example.com',
    updated_by_user_id: 17,
    updated_by_label: 'analyst@example.com',
    archived_at: null,
    archived_by_user_id: null,
    archived_by_label: null,
    created_at: new Date('2026-05-26T12:00:00.000Z'),
    updated_at: new Date('2026-05-26T12:00:00.000Z'),
    variant_count: '1',
    ...overrides,
  };
}

function variantRow() {
  return {
    id: variantId,
    scenario_set_id: scenarioSetId,
    name: 'Lower fee',
    description: null,
    sort_order: 0,
    override_type: 'fee_profile',
    override_payload: feeProfileOverride.payload,
    created_at: new Date('2026-05-26T12:00:00.000Z'),
    updated_at: new Date('2026-05-26T12:00:00.000Z'),
  };
}

function snapshotPayload(): FundScenarioCalculationPayloadV1 {
  return {
    version: 'fund-scenarios-v1',
    calculationMode: 'sync_fee_profile',
    fundId: 1,
    scenarioSetId,
    sourceConfigId: 12,
    sourceConfigVersion: 4,
    staleness: {
      state: 'CURRENT',
      sourceConfigVersion: 4,
      currentPublishedConfigVersion: 4,
    },
    calculatedAt: '2026-05-26T12:05:00.000Z',
    variants: [
      {
        variantId,
        scenarioSetId,
        name: 'Lower fee',
        overrideType: 'fee_profile',
        economics: economicsResult,
      },
    ],
  };
}

describe('fund scenario calculation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(
      async (callback: (client: { query: typeof queryMock }) => unknown) =>
        callback({ query: queryMock })
    );
    runEconomicsModelMock.mockReturnValue(economicsResult);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('applies fee-profile overrides, persists a scenario snapshot, and records an audit event', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: baseConfig }] })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockImplementationOnce((_sql: string, params: unknown[]) => ({
        rows: [
          {
            id: 42,
            payload: params[1],
            correlation_id: params[3],
            created_at: new Date('2026-05-26T12:05:00.000Z'),
            snapshot_time: new Date('2026-05-26T12:05:00.000Z'),
          },
        ],
      }))
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000124' }] });

    const result = await calculateFundScenarioSet(1, scenarioSetId, {
      userId: 17,
      label: 'analyst@example.com',
    });

    expect(result.snapshotId).toBe(42);
    expect(result.source).toBe('fund_snapshots');
    expect(result.payload.variants[0]?.economics.summary.totalManagementFees).toBe(1);
    expect(runEconomicsModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fundName: 'Test Fund',
        feeProfiles: feeProfileOverride.payload.feeProfiles,
      })
    );
    expect(queryMock.mock.calls[6]?.[0]).toContain("VALUES ($1, 'SCENARIOS'");
    expect(queryMock.mock.calls[6]?.[0]).toContain('scenario_set_id');
    expect(queryMock.mock.calls[6]?.[1]?.[7]).toBe(scenarioSetId);
    expect(queryMock.mock.calls[7]?.[0]).toContain('INSERT INTO fund_scenario_set_events');
    expect(queryMock.mock.calls[7]?.[1]).toEqual([
      scenarioSetId,
      1,
      'calculated',
      17,
      'analyst@example.com',
      expect.objectContaining({
        headline: 'Calculated fee-profile scenario set',
        snapshot_id: 42,
        variant_count: 1,
      }),
    ]);
  });

  it('returns an existing matching scenario snapshot without recalculating', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: baseConfig }] })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 42,
            payload: snapshotPayload(),
            correlation_id: correlationId,
            created_at: new Date('2026-05-26T12:05:00.000Z'),
            snapshot_time: new Date('2026-05-26T12:05:00.000Z'),
          },
        ],
      });

    const result = await calculateFundScenarioSet(1, scenarioSetId);

    expect(result.snapshotId).toBe(42);
    expect(result.correlationId).toBe(correlationId);
    expect(runEconomicsModelMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(6);
  });

  it('rejects calculation when the scenario set is archived', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow({ archived_at: '2026-05-26T13:00:00Z' })] })
      .mockResolvedValueOnce({ rows: [variantRow()] });

    await expect(calculateFundScenarioSet(1, scenarioSetId)).rejects.toThrow(/archived/i);
  });

  it('rejects calculation when the source config is missing', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(calculateFundScenarioSet(1, scenarioSetId)).rejects.toThrow(
      /source config.*could not be loaded/i
    );
  });

  it('computes STALE_PUBLISH staleness when published version exceeds source', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: baseConfig }] })
      .mockResolvedValueOnce({ rows: [{ version: 7 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockImplementationOnce((_sql: string, params: unknown[]) => ({
        rows: [
          {
            id: 55,
            payload: params[1],
            correlation_id: params[3],
            created_at: new Date('2026-05-26T12:05:00.000Z'),
            snapshot_time: new Date('2026-05-26T12:05:00.000Z'),
          },
        ],
      }))
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000125' }] });

    const result = await calculateFundScenarioSet(1, scenarioSetId);

    expect(result.payload.staleness.state).toBe('STALE_PUBLISH');
    expect(result.payload.staleness.currentPublishedConfigVersion).toBe(7);
    expect(result.payload.staleness.sourceConfigVersion).toBe(4);
  });

  it('getScenarioResults returns the latest snapshot for a set', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 42,
            payload: snapshotPayload(),
            correlation_id: correlationId,
            created_at: new Date('2026-05-26T12:05:00.000Z'),
            snapshot_time: new Date('2026-05-26T12:05:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] });

    const result = await getScenarioResults(1, scenarioSetId);

    expect(result).not.toBeNull();
    expect(result!.snapshotId).toBe(42);
    expect(result!.payload.staleness.state).toBe('CURRENT');
  });

  it('getScenarioResults returns null when no snapshot exists', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getScenarioResults(1, scenarioSetId);

    expect(result).toBeNull();
  });

  it('getScenarioResults patches staleness to STALE_PUBLISH at read time', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 42,
            payload: snapshotPayload(),
            correlation_id: correlationId,
            created_at: new Date('2026-05-26T12:05:00.000Z'),
            snapshot_time: new Date('2026-05-26T12:05:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ version: 9 }] });

    const result = await getScenarioResults(1, scenarioSetId);

    expect(result).not.toBeNull();
    expect(result!.payload.staleness.state).toBe('STALE_PUBLISH');
    expect(result!.payload.staleness.currentPublishedConfigVersion).toBe(9);
  });
});
