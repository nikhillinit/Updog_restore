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
  getAllScenarioResultsForFund,
  getScenarioResults,
} from '../../../server/services/fund-scenario-calculation-service';
import { createScenarioInputHash } from '../../../server/lib/scenarios/scenario-input-hash';
import type { FundScenarioCalculationPayloadV1 } from '../../../shared/contracts/fund-scenario-sets-v1.contract';
import {
  FUND_SCENARIOS_CONTRACT_VERSION,
  SCENARIO_INPUT_HASH_VERSION,
} from '../../../shared/lib/scenarios/scenario-input-envelope';

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

const allocationOverride = {
  overrideType: 'allocation',
  payload: {
    allocations: [{ id: 'seed-stage', category: 'Seed', percentage: 60 }],
    capitalPlanAllocations: [
      {
        id: 'seed-plan',
        name: 'Seed plan',
        entryRound: 'Seed',
        capitalAllocationPct: 60,
        initialCheckStrategy: 'amount',
        initialCheckAmount: 1_000_000,
        followOnStrategy: 'amount',
        followOnAmount: 500_000,
        followOnParticipationPct: 25,
        investmentHorizonMonths: 48,
      },
    ],
  },
} as const;

const sectorProfileOverride = {
  overrideType: 'sector_profile',
  payload: {
    sectorProfiles: [
      {
        id: 'ai-infra',
        name: 'AI Infrastructure',
        targetPercentage: 35,
        description: 'Infrastructure software and tooling',
      },
    ],
  },
} as const;

const methodologyOverride = {
  overrideType: 'methodology',
  payload: {
    waterfallType: 'hybrid',
    managementFeeRate: 3,
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

const explicitFeeTierEconomicsAssumptions = {
  version: 'v1',
  timeline: {
    fundLifeYears: 10,
    period: 'annual',
    vintageYear: 2026,
  },
  feeModel: {
    source: 'economics_override',
    tiers: [
      {
        id: 'base-fee-tier',
        name: 'Base explicit fee',
        rate: 0.02,
        basis: 'committed_capital',
        startYear: 1,
      },
    ],
  },
  exitModel: {
    mode: 'cohort',
    cohort: {
      exitDistributionByYear: [0, 0, 0, 0, 0.2, 0.2, 0.2, 0.2, 0.1, 0.1],
      grossMultiple: 2.5,
      lossRatio: 0,
    },
  },
  recyclingModel: {
    enabled: false,
    sources: ['exit_proceeds'],
    capPctOfCommitments: 0,
    timing: 'before_waterfall',
  },
  waterfallModel: {
    type: 'american',
    carryPct: 0.2,
    hurdleRate: 0.08,
    prefType: 'compounded',
    prefCompounding: 'annual',
    prefCatchUp: true,
    catchUpRate: 1,
    catchUpTargetCarryPct: 0.2,
    clawbackEnabled: true,
    clawbackTrigger: 'final_liquidation',
    escrowPct: 0,
    feeOffsetTreatment: 'none',
  },
  gpCommitmentModel: {
    commitmentAmount: 10_000_000,
    participatesInInvestmentReturns: true,
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

function variantRow(override = feeProfileOverride) {
  return {
    id: variantId,
    scenario_set_id: scenarioSetId,
    name: 'Scenario variant',
    description: null,
    sort_order: 0,
    override_type: override.overrideType,
    override_payload: override.payload,
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

function calculationRunRow(
  status: 'queued' | 'running' | 'completed',
  snapshotId: number | null = null,
  options: {
    calculationMode?:
      | 'sync_fee_profile'
      | 'sync_allocation'
      | 'sync_sector_profile'
      | 'sync_methodology';
    overrideType?: 'fee_profile' | 'allocation' | 'sector_profile' | 'methodology';
    inputHash?: string;
  } = {}
) {
  const calculationMode = options.calculationMode ?? 'sync_fee_profile';
  const overrideType = options.overrideType ?? 'fee_profile';
  return {
    id: '00000000-0000-0000-0000-000000000777',
    fund_id: 1,
    scenario_set_id: scenarioSetId,
    source_config_id: 12,
    source_config_version: 4,
    calculation_mode: calculationMode,
    override_type: overrideType,
    input_hash: options.inputHash ?? expectedInputHash(),
    job_id: null,
    correlation_id: correlationId,
    status,
    snapshot_id: snapshotId,
  };
}

function expectedInputHash(): string {
  return expectedInputHashFor(feeProfileOverride, 'sync_fee_profile', 'fee_profile');
}

function expectedInputHashFor(
  override:
    | typeof feeProfileOverride
    | typeof allocationOverride
    | typeof sectorProfileOverride
    | typeof methodologyOverride,
  calculationMode:
    | 'sync_fee_profile'
    | 'sync_allocation'
    | 'sync_sector_profile'
    | 'sync_methodology',
  overrideType: 'fee_profile' | 'allocation' | 'sector_profile' | 'methodology'
): string {
  return createScenarioInputHash({
    version: SCENARIO_INPUT_HASH_VERSION,
    contractVersion: FUND_SCENARIOS_CONTRACT_VERSION,
    scenarioSetId,
    sourceConfigId: 12,
    sourceConfigVersion: 4,
    calculationMode,
    overrideType,
    engineVersion: 'fund-scenarios-v1',
    variants: [
      {
        variantId,
        sortOrder: 0,
        override,
      },
    ],
  });
}

describe('fund scenario calculation service', () => {
  beforeEach(() => {
    queryMock.mockReset();
    transactionMock.mockReset();
    runEconomicsModelMock.mockReset();
    transactionMock.mockImplementation(
      async (callback: (client: { query: typeof queryMock }) => unknown) =>
        callback({ query: queryMock })
    );
    runEconomicsModelMock.mockReturnValue(economicsResult);
  });

  afterEach(() => {
    queryMock.mockReset();
    transactionMock.mockReset();
    runEconomicsModelMock.mockReset();
  });

  it('applies fee-profile overrides, persists a scenario snapshot, and records an audit event', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: baseConfig }] })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [calculationRunRow('queued')] })
      .mockResolvedValueOnce({ rows: [calculationRunRow('running')] })
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
      .mockResolvedValueOnce({ rows: [calculationRunRow('completed', 42)] })
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
        economicsAssumptions: expect.objectContaining({
          feeModel: { source: 'legacy_fee_profiles' },
        }),
      })
    );
    expect(queryMock.mock.calls[1]?.[0]).toContain('FOR UPDATE OF s');
    const snapshotInsertCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO fund_snapshots')
    );
    const snapshotInsertSql = String(snapshotInsertCall?.[0] ?? '');
    const snapshotInsertParams = snapshotInsertCall?.[1] as unknown[] | undefined;
    const snapshotMetadata = snapshotInsertParams?.[4];

    expect(snapshotInsertSql).toContain("VALUES ($1, 'SCENARIOS'");
    expect(snapshotInsertSql).toContain('state_hash');
    expect(snapshotInsertSql).toContain('scenario_set_id');
    expect(snapshotInsertSql).toContain('fund_snapshots_scenarios_dedup_idx');
    expect(snapshotInsertSql).toContain(
      'ON CONFLICT (fund_id, scenario_set_id, config_id, config_version, state_hash)'
    );
    expect(snapshotInsertSql).not.toContain('ON CONFLICT (fund_id, scenario_set_id)');
    expect(snapshotMetadata).toMatchObject({
      input_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      calculation_mode: 'sync_fee_profile',
      override_type: 'fee_profile',
    });
    expect(snapshotInsertParams?.[7]).toBe(expectedInputHash());
    expect(snapshotInsertParams?.[8]).toBe(scenarioSetId);
    const eventInsertCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO fund_scenario_set_events')
    );
    expect(eventInsertCall?.[1]).toEqual([
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

  it('applies methodology overrides to nested economics assumptions before calculation', async () => {
    const methodologyHash = expectedInputHashFor(
      methodologyOverride,
      'sync_methodology',
      'methodology'
    );
    const methodologyRunOptions = {
      calculationMode: 'sync_methodology' as const,
      overrideType: 'methodology' as const,
      inputHash: methodologyHash,
    };

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow({ name: 'Methodology sensitivity' })] })
      .mockResolvedValueOnce({ rows: [variantRow(methodologyOverride)] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 12,
            version: 4,
            config: {
              ...baseConfig,
              economicsAssumptions: explicitFeeTierEconomicsAssumptions,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [calculationRunRow('queued', null, methodologyRunOptions)] })
      .mockResolvedValueOnce({ rows: [calculationRunRow('running', null, methodologyRunOptions)] })
      .mockImplementationOnce((_sql: string, params: unknown[]) => ({
        rows: [
          {
            id: 43,
            payload: params[1],
            correlation_id: params[3],
            created_at: new Date('2026-05-26T12:05:00.000Z'),
            snapshot_time: new Date('2026-05-26T12:05:00.000Z'),
          },
        ],
      }))
      .mockResolvedValueOnce({ rows: [calculationRunRow('completed', 43, methodologyRunOptions)] })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000127' }] });

    const result = await calculateFundScenarioSet(1, scenarioSetId, {
      userId: 17,
      label: 'analyst@example.com',
    });

    expect(result.payload.calculationMode).toBe('sync_methodology');
    expect(runEconomicsModelMock).toHaveBeenCalledTimes(1);

    const calledConfig = runEconomicsModelMock.mock.calls[0]?.[0] as {
      managementFeeRate?: number;
      waterfallType?: string;
      feeProfiles?: unknown;
      economicsAssumptions?: {
        feeModel?: unknown;
        waterfallModel?: unknown;
      };
    };
    expect(calledConfig.managementFeeRate).toBe(3);
    expect(calledConfig.waterfallType).toBe('hybrid');
    expect(calledConfig.feeProfiles).toBeUndefined();
    expect(calledConfig.economicsAssumptions?.feeModel).toEqual({
      source: 'economics_override',
      defaultRate: 0.03,
    });
    expect(calledConfig.economicsAssumptions).not.toHaveProperty('waterfallModel');
  });

  it('applies allocation overrides through the sync scenario calculation path', async () => {
    const allocationHash = expectedInputHashFor(
      allocationOverride,
      'sync_allocation',
      'allocation'
    );
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow({ name: 'Allocation sensitivity' })] })
      .mockResolvedValueOnce({ rows: [variantRow(allocationOverride)] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: baseConfig }] })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          calculationRunRow('queued', null, {
            calculationMode: 'sync_allocation',
            overrideType: 'allocation',
            inputHash: allocationHash,
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          calculationRunRow('running', null, {
            calculationMode: 'sync_allocation',
            overrideType: 'allocation',
            inputHash: allocationHash,
          }),
        ],
      })
      .mockImplementationOnce((_sql: string, params: unknown[]) => ({
        rows: [
          {
            id: 58,
            payload: params[1],
            correlation_id: params[3],
            created_at: new Date('2026-05-26T12:05:00.000Z'),
            snapshot_time: new Date('2026-05-26T12:05:00.000Z'),
          },
        ],
      }))
      .mockResolvedValueOnce({
        rows: [
          calculationRunRow('completed', 58, {
            calculationMode: 'sync_allocation',
            overrideType: 'allocation',
            inputHash: allocationHash,
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000127' }] });

    const result = await calculateFundScenarioSet(1, scenarioSetId);
    const snapshotInsertCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO fund_snapshots')
    );
    const snapshotInsertParams = snapshotInsertCall?.[1] as unknown[] | undefined;

    expect(result.payload.calculationMode).toBe('sync_allocation');
    expect(result.payload.variants[0]?.overrideType).toBe('allocation');
    expect(runEconomicsModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allocations: allocationOverride.payload.allocations,
        capitalPlanAllocations: allocationOverride.payload.capitalPlanAllocations,
      })
    );
    expect(snapshotInsertParams?.[4]).toMatchObject({
      input_hash: allocationHash,
      calculation_mode: 'sync_allocation',
      override_type: 'allocation',
    });
    expect(snapshotInsertParams?.[7]).toBe(allocationHash);
  });

  it('applies sector-profile overrides through the sync scenario calculation path', async () => {
    const sectorHash = expectedInputHashFor(
      sectorProfileOverride,
      'sync_sector_profile',
      'sector_profile'
    );
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow({ name: 'Sector sensitivity' })] })
      .mockResolvedValueOnce({ rows: [variantRow(sectorProfileOverride)] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: baseConfig }] })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          calculationRunRow('queued', null, {
            calculationMode: 'sync_sector_profile',
            overrideType: 'sector_profile',
            inputHash: sectorHash,
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          calculationRunRow('running', null, {
            calculationMode: 'sync_sector_profile',
            overrideType: 'sector_profile',
            inputHash: sectorHash,
          }),
        ],
      })
      .mockImplementationOnce((_sql: string, params: unknown[]) => ({
        rows: [
          {
            id: 59,
            payload: params[1],
            correlation_id: params[3],
            created_at: new Date('2026-05-26T12:05:00.000Z'),
            snapshot_time: new Date('2026-05-26T12:05:00.000Z'),
          },
        ],
      }))
      .mockResolvedValueOnce({
        rows: [
          calculationRunRow('completed', 59, {
            calculationMode: 'sync_sector_profile',
            overrideType: 'sector_profile',
            inputHash: sectorHash,
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000128' }] });

    const result = await calculateFundScenarioSet(1, scenarioSetId);
    const snapshotInsertCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO fund_snapshots')
    );
    const snapshotInsertParams = snapshotInsertCall?.[1] as unknown[] | undefined;

    expect(result.payload.calculationMode).toBe('sync_sector_profile');
    expect(result.payload.variants[0]?.overrideType).toBe('sector_profile');
    expect(runEconomicsModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sectorProfiles: sectorProfileOverride.payload.sectorProfiles,
      })
    );
    expect(snapshotInsertParams?.[4]).toMatchObject({
      input_hash: sectorHash,
      calculation_mode: 'sync_sector_profile',
      override_type: 'sector_profile',
    });
    expect(snapshotInsertParams?.[7]).toBe(sectorHash);
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

  it('reuses the calculation hash across publish staleness changes', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 12, version: 4, config: baseConfig }] })
      .mockResolvedValueOnce({ rows: [{ version: 9 }] })
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
    const reusableLookupParams = queryMock.mock.calls[5]?.[1] as unknown[];

    expect(reusableLookupParams[5]).toBe(expectedInputHash());
    expect(result.payload.staleness.state).toBe('STALE_PUBLISH');
    expect(result.payload.staleness.currentPublishedConfigVersion).toBe(9);
    expect(runEconomicsModelMock).not.toHaveBeenCalled();
  });

  it('uses fee-profile overrides with the real economics engine when source configs have explicit fee tiers', async () => {
    const actualEconomics = await vi.importActual<
      typeof import('@shared/lib/economics/economics-engine')
    >('@shared/lib/economics/economics-engine');
    runEconomicsModelMock.mockImplementation(actualEconomics.runEconomicsModel);

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 12,
            version: 4,
            config: {
              ...baseConfig,
              fundLife: 10,
              investmentPeriod: 5,
              gpCommitment: 10_000_000,
              economicsAssumptions: explicitFeeTierEconomicsAssumptions,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [calculationRunRow('queued')] })
      .mockResolvedValueOnce({ rows: [calculationRunRow('running')] })
      .mockImplementationOnce((_sql: string, params: unknown[]) => ({
        rows: [
          {
            id: 57,
            payload: params[1],
            correlation_id: params[3],
            created_at: new Date('2026-05-26T12:05:00.000Z'),
            snapshot_time: new Date('2026-05-26T12:05:00.000Z'),
          },
        ],
      }))
      .mockResolvedValueOnce({ rows: [calculationRunRow('completed', 57)] })
      .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000126' }] });

    const result = await calculateFundScenarioSet(1, scenarioSetId);

    expect(result.payload.variants[0]?.economics.summary.totalManagementFees).toBe(15_000_000);
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
      .mockResolvedValueOnce({ rows: [calculationRunRow('queued')] })
      .mockResolvedValueOnce({ rows: [calculationRunRow('running')] })
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
      .mockResolvedValueOnce({ rows: [calculationRunRow('completed', 55)] })
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

  it('getScenarioResults preserves STALE_CONFIG over publish staleness', async () => {
    const payload = snapshotPayload();
    payload.staleness.state = 'STALE_CONFIG';

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [scenarioSetRow()] })
      .mockResolvedValueOnce({ rows: [variantRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 42,
            payload,
            correlation_id: correlationId,
            created_at: new Date('2026-05-26T12:05:00.000Z'),
            snapshot_time: new Date('2026-05-26T12:05:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ version: 9 }] });

    const result = await getScenarioResults(1, scenarioSetId);

    expect(result).not.toBeNull();
    expect(result!.payload.staleness.state).toBe('STALE_CONFIG');
    expect(result!.payload.staleness.currentPublishedConfigVersion).toBe(9);
  });

  it('getAllScenarioResultsForFund returns none_exist when no active scenario sets exist', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getAllScenarioResultsForFund(1);

    expect(result).toEqual({ kind: 'none_exist' });
    expect(queryMock.mock.calls[2]?.[0]).toContain('JOIN LATERAL');
    expect(queryMock.mock.calls[2]?.[0]).toContain('ADR-022 scenario-aware');
  });

  it('getAllScenarioResultsForFund returns none_calculated when sets have no snapshots', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            scenario_set_id: scenarioSetId,
            scenario_set_name: 'Fee sensitivity',
            source_config_id: 12,
            source_config_version: 4,
            variant_count: '1',
            snapshot_payload: null,
          },
        ],
      });

    const result = await getAllScenarioResultsForFund(1);

    expect(result).toEqual({ kind: 'none_calculated', scenarioSetCount: 1 });
  });

  it('getAllScenarioResultsForFund returns summary-only calculated scenario sets', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ version: 7 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            scenario_set_id: scenarioSetId,
            scenario_set_name: 'Fee sensitivity',
            source_config_id: 12,
            source_config_version: 4,
            variant_count: '1',
            snapshot_payload: snapshotPayload(),
          },
        ],
      });

    const result = await getAllScenarioResultsForFund(1);

    expect(result.kind).toBe('calculated');
    if (result.kind === 'calculated') {
      expect(result.sets).toHaveLength(1);
      expect(result.sets[0]?.staleness).toBe('STALE_PUBLISH');
      expect(result.sets[0]?.variants[0]).toEqual({
        variantId,
        name: 'Lower fee',
        overrideType: 'fee_profile',
        economicsSummary: economicsResult.summary,
      });
      expect(result.sets[0]?.variants[0]).not.toHaveProperty('economics');
    }
  });

  it('getAllScenarioResultsForFund preserves STALE_CONFIG as worst read staleness', async () => {
    const payload = snapshotPayload();
    payload.staleness.state = 'STALE_CONFIG';

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ version: 7 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            scenario_set_id: scenarioSetId,
            scenario_set_name: 'Fee sensitivity',
            source_config_id: 12,
            source_config_version: 4,
            variant_count: '1',
            snapshot_payload: payload,
          },
        ],
      });

    const result = await getAllScenarioResultsForFund(1);

    expect(result.kind).toBe('calculated');
    if (result.kind === 'calculated') {
      expect(result.sets[0]?.staleness).toBe('STALE_CONFIG');
    }
  });

  it('getAllScenarioResultsForFund rejects malformed scenario snapshots', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ version: 4 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            scenario_set_id: scenarioSetId,
            scenario_set_name: 'Fee sensitivity',
            source_config_id: 12,
            source_config_version: 4,
            variant_count: '1',
            snapshot_payload: {
              version: 'fund-scenarios-v1',
              variants: [],
            },
          },
        ],
      });

    await expect(getAllScenarioResultsForFund(1)).rejects.toThrow();
  });
});
