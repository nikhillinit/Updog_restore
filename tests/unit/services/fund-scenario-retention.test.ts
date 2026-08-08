import { describe, expect, it, vi } from 'vitest';

import { persistFeeProfileScenarioSnapshot } from '../../../server/services/fund-scenario-calculation-service';
import {
  acquireScenarioCalculationRun,
  claimScenarioCalculationRunIfQueued,
  completeScenarioCalculationRunIfRunning,
  failScenarioCalculationRunIfRunning,
  findCompletedScenarioRun,
} from '../../../server/services/fund-scenario-calculation-run-service';
import { persistReserveScenarioSnapshot } from '../../../server/services/fund-scenario-reserve-snapshot-store';
import type { EconomicsResultV1 } from '../../../shared/contracts/economics-v1.contract';
import type { FundScenarioCalculationPayloadV1 } from '../../../shared/contracts/fund-scenario-sets-v1.contract';

const scenarioSetId = '11111111-1111-4111-8111-111111111111';
const variantId = '22222222-2222-4222-8222-222222222222';

const economics: EconomicsResultV1 = {
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
};

const scenarioPayload: FundScenarioCalculationPayloadV1 = {
  version: 'fund-scenarios-v1',
  calculationMode: 'sync_fee_profile',
  fundId: 1,
  scenarioSetId,
  sourceConfigId: 2,
  sourceConfigVersion: 3,
  staleness: {
    state: 'CURRENT',
    sourceConfigVersion: 3,
    currentPublishedConfigVersion: 3,
  },
  calculatedAt: '2026-05-29T00:00:00.000Z',
  variants: [
    {
      variantId,
      scenarioSetId,
      name: 'Fee variant',
      overrideType: 'fee_profile',
      economics,
    },
  ],
};

const reservePayload: FundScenarioCalculationPayloadV1 = {
  version: 'fund-scenarios-v1',
  calculationMode: 'async_reserve_allocation',
  fundId: 1,
  scenarioSetId,
  sourceConfigId: 2,
  sourceConfigVersion: 3,
  staleness: {
    state: 'CURRENT',
    sourceConfigVersion: 3,
    currentPublishedConfigVersion: 3,
  },
  calculatedAt: '2026-05-29T00:00:00.000Z',
  variants: [
    {
      variantId,
      scenarioSetId,
      name: 'Reserve variant',
      overrideType: 'reserve_allocation',
      reserve: {
        fundId: 1,
        totalBaseAllocationCents: 0,
        totalScenarioAllocationCents: 1000,
        totalAllocationDeltaCents: 1000,
        avgConfidence: 1,
        highConfidenceCount: 1,
        allocations: [
          {
            companyId: 1,
            baseAllocationCents: 0,
            plannedReservesCents: 1000,
            maxAllocationCents: null,
            scenarioAllocationCents: 1000,
            allocationDeltaCents: 1000,
            capApplied: false,
            confidence: 1,
            rationale: 'unit test',
          },
        ],
        warnings: [],
        generatedAt: '2026-05-29T00:00:00.000Z',
      },
    },
  ],
};

const snapshotInput = {
  fundId: 1,
  scenarioSetId,
  sourceConfigId: 2,
  sourceConfigVersion: 3,
  correlationId: '11111111-1111-4111-8111-111111111112',
  payload: scenarioPayload,
  inputHash: 'a'.repeat(64),
};

const reserveSnapshotInput = {
  ...snapshotInput,
  correlationId: '11111111-1111-4111-8111-111111111113',
  payload: reservePayload,
  inputHash: 'b'.repeat(64),
  variantCount: 1,
  companyCount: 1,
  warningCount: 0,
  reserveInputTrustSummary: {
    trustedForActivation: true,
    defaultedInputCount: 0,
    unavailableInputCount: 0,
    defaultedFields: [],
    unavailableFields: [],
  },
};

const calculationIdentity = {
  fundId: 1,
  scenarioSetId,
  sourceConfigId: 2,
  sourceConfigVersion: 3,
  calculationMode: 'sync_fee_profile' as const,
  overrideType: 'fee_profile' as const,
  inputHash: 'c'.repeat(64),
  hashKind: 'scenario-input-hash-v2' as const,
  modelInputsAsOfDate: '2026-06-30',
  comparisonLineageVersion: 'comparison-lineage-v1' as const,
  correlationId: '11111111-1111-4111-8111-111111111114',
};

function returnedSnapshot(id: number, payload: FundScenarioCalculationPayloadV1, correlationId: string) {
  return {
    id,
    payload,
    correlation_id: correlationId,
    created_at: new Date(),
    snapshot_time: new Date(),
  };
}

describe('scenario retention helpers', () => {
  const asyncRunIdentity = {
    fundId: 1,
    scenarioSetId,
    sourceConfigId: 2,
    sourceConfigVersion: 3,
    calculationMode: 'async_reserve_allocation' as const,
    overrideType: 'reserve_allocation' as const,
    inputHash: 'd'.repeat(64),
    hashKind: 'scenario-input-hash-v2' as const,
    modelInputsAsOfDate: '2026-06-30',
    comparisonLineageVersion: 'comparison-lineage-v1' as const,
  };

  const asyncRunRow = {
    id: '11111111-1111-4111-8111-111111111116',
    fund_id: asyncRunIdentity.fundId,
    scenario_set_id: asyncRunIdentity.scenarioSetId,
    source_config_id: asyncRunIdentity.sourceConfigId,
    source_config_version: asyncRunIdentity.sourceConfigVersion,
    calculation_mode: asyncRunIdentity.calculationMode,
    override_type: asyncRunIdentity.overrideType,
    input_hash: asyncRunIdentity.inputHash,
    hash_kind: asyncRunIdentity.hashKind,
    model_inputs_as_of_date: asyncRunIdentity.modelInputsAsOfDate,
    comparison_lineage_version: asyncRunIdentity.comparisonLineageVersion,
    job_id: 'job-async-1',
    correlation_id: '11111111-1111-4111-8111-111111111117',
    status: 'running' as const,
    snapshot_id: null,
  };

  it('claims only a queued run and maps the owned row', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [asyncRunRow] });

    const run = await claimScenarioCalculationRunIfQueued(
      { query: queryMock } as never,
      asyncRunRow.id,
      asyncRunIdentity
    );

    expect(run).toMatchObject({ id: asyncRunRow.id, status: 'running' });
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("status = 'queued'");
    expect(String(queryMock.mock.calls[0]?.[0])).toContain('model_inputs_as_of_date IS NOT DISTINCT FROM');
    expect(String(queryMock.mock.calls[0]?.[0])).toContain('comparison_lineage_version IS NOT DISTINCT FROM');
  });

  it.each([
    ['fundId', { fundId: 2 }],
    ['scenarioSetId', { scenarioSetId: '99999999-9999-4999-8999-999999999999' }],
    ['sourceConfigId', { sourceConfigId: 9 }],
    ['sourceConfigVersion', { sourceConfigVersion: 8 }],
    ['calculationMode', { calculationMode: 'sync_allocation' as const }],
    ['overrideType', { overrideType: 'allocation' as const }],
    ['inputHash', { inputHash: 'e'.repeat(64) }],
    ['hashKind', {
      hashKind: 'scenario-input-hash-v1' as const,
      modelInputsAsOfDate: null,
      comparisonLineageVersion: null,
    }],
    ['modelInputsAsOfDate', { modelInputsAsOfDate: '2026-07-31' }],
  ])('returns null for an independently mutated %s fence field', async (_field, mutation) => {
    const storedValues = [
      asyncRunIdentity.fundId,
      asyncRunIdentity.scenarioSetId,
      asyncRunIdentity.sourceConfigId,
      asyncRunIdentity.sourceConfigVersion,
      asyncRunIdentity.calculationMode,
      asyncRunIdentity.overrideType,
      asyncRunIdentity.inputHash,
      asyncRunIdentity.hashKind,
      asyncRunIdentity.modelInputsAsOfDate,
      asyncRunIdentity.comparisonLineageVersion,
    ];
    const queryMock = vi.fn().mockImplementation(async (_sql: unknown, params: unknown[]) => {
      const fenceValues = params.slice(1);
      return {
        rows: fenceValues.every((value, index) => value === storedValues[index])
          ? [asyncRunRow]
          : [],
      };
    });

    await expect(
      claimScenarioCalculationRunIfQueued(
        { query: queryMock } as never,
        asyncRunRow.id,
        { ...asyncRunIdentity, ...mutation }
      )
    ).resolves.toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a comparison-lineage mutation without querying the database', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      claimScenarioCalculationRunIfQueued(
        { query: queryMock } as never,
        asyncRunRow.id,
        { ...asyncRunIdentity, comparisonLineageVersion: 'comparison-lineage-v2' as never }
      )
    ).rejects.toThrow('Scenario input hash v2 requires complete comparison lineage');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns null when completion or failure ownership CAS affects zero rows', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      completeScenarioCalculationRunIfRunning(
        { query: queryMock } as never,
        asyncRunRow.id,
        asyncRunIdentity,
        42
      )
    ).resolves.toBeNull();
    await expect(
      failScenarioCalculationRunIfRunning(
        { query: queryMock } as never,
        asyncRunRow.id,
        asyncRunIdentity,
        { code: 'CALC_FAILED', message: 'calculation failed' }
      )
    ).resolves.toBeNull();

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("status = 'running'");
    expect(String(queryMock.mock.calls[0]?.[0])).toContain('snapshot_id IS NULL');
  });

  it('maps realistic winning completion and failure CAS rows', async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ ...asyncRunRow, status: 'completed', snapshot_id: 42 }],
      })
      .mockResolvedValueOnce({
        rows: [{ ...asyncRunRow, status: 'failed', snapshot_id: null }],
      });

    const completed = await completeScenarioCalculationRunIfRunning(
      { query: queryMock } as never,
      asyncRunRow.id,
      asyncRunIdentity,
      42
    );
    const failed = await failScenarioCalculationRunIfRunning(
      { query: queryMock } as never,
      asyncRunRow.id,
      asyncRunIdentity,
      { code: 'CALC_FAILED', message: 'calculation failed' }
    );

    expect(completed).toMatchObject({ id: asyncRunRow.id, status: 'completed', snapshotId: 42 });
    expect(failed).toMatchObject({ id: asyncRunRow.id, status: 'failed', snapshotId: null });
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0]?.[1]).toEqual([
      asyncRunRow.id,
      asyncRunIdentity.fundId,
      asyncRunIdentity.scenarioSetId,
      asyncRunIdentity.sourceConfigId,
      asyncRunIdentity.sourceConfigVersion,
      asyncRunIdentity.calculationMode,
      asyncRunIdentity.overrideType,
      asyncRunIdentity.inputHash,
      asyncRunIdentity.hashKind,
      asyncRunIdentity.modelInputsAsOfDate,
      asyncRunIdentity.comparisonLineageVersion,
      42,
    ]);
  });

  it('normalizes a legacy null hash kind only to the v1 fence value', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const legacyIdentity = {
      ...asyncRunIdentity,
      hashKind: null,
      modelInputsAsOfDate: null,
      comparisonLineageVersion: null,
    };

    await expect(
      claimScenarioCalculationRunIfQueued(
        { query: queryMock } as never,
        asyncRunRow.id,
        legacyIdentity
      )
    ).resolves.toBeNull();

    expect(queryMock.mock.calls[0]?.[1]?.[8]).toBe('scenario-input-hash-v1');
    expect(queryMock.mock.calls[0]?.[1]?.[9]).toBeNull();
    expect(queryMock.mock.calls[0]?.[1]?.[10]).toBeNull();
  });

  it('keeps the dated comparison fields in the async identity fence', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const datedIdentity = {
      ...asyncRunIdentity,
      modelInputsAsOfDate: '2026-07-31',
    };

    await expect(
      claimScenarioCalculationRunIfQueued(
        { query: queryMock } as never,
        asyncRunRow.id,
        datedIdentity
      )
    ).resolves.toBeNull();

    expect(queryMock.mock.calls[0]?.[1]?.[9]).toBe('2026-07-31');
    expect(queryMock.mock.calls[0]?.[1]?.[10]).toBe('comparison-lineage-v1');
  });

  it('rejects a lineage mutation instead of silently broadening the async fence', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const mutatedIdentity = {
      ...asyncRunIdentity,
      comparisonLineageVersion: 'comparison-lineage-v2' as never,
    };

    await expect(
      claimScenarioCalculationRunIfQueued(
        { query: queryMock } as never,
        asyncRunRow.id,
        mutatedIdentity
      )
    ).rejects.toThrow('Scenario input hash v2 requires complete comparison lineage');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('fee-profile snapshot insert is conflict-safe on canonical state_hash', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [returnedSnapshot(101, scenarioPayload, snapshotInput.correlationId)],
    });

    await persistFeeProfileScenarioSnapshot({ query: queryMock } as never, snapshotInput);

    const insertSql = queryMock.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('INSERT INTO fund_snapshots'));
    expect(insertSql).toContain('state_hash');
    expect(insertSql).toContain('ON CONFLICT');
    expect(insertSql).toContain('fund_snapshots_scenarios_dedup_idx');
    expect(insertSql).not.toContain('ON CONFLICT (fund_id, scenario_set_id)');
  });

  it('reserve snapshot insert is conflict-safe on canonical state_hash', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [returnedSnapshot(202, reservePayload, reserveSnapshotInput.correlationId)],
    });

    await persistReserveScenarioSnapshot({ query: queryMock } as never, reserveSnapshotInput);

    const insertSql = queryMock.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('INSERT INTO fund_snapshots'));
    expect(insertSql).toContain('state_hash');
    expect(insertSql).toContain('ON CONFLICT');
    expect(insertSql).toContain('fund_snapshots_scenarios_dedup_idx');
    expect(insertSql).not.toContain('ON CONFLICT (fund_id, scenario_set_id)');
  });

  it('allows retry after failed run because failed is excluded from active dedupe', async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111115',
            fund_id: 1,
            scenario_set_id: scenarioSetId,
            source_config_id: 2,
            source_config_version: 3,
            calculation_mode: 'sync_fee_profile',
            override_type: 'fee_profile',
            input_hash: calculationIdentity.inputHash,
            hash_kind: calculationIdentity.hashKind,
            model_inputs_as_of_date: calculationIdentity.modelInputsAsOfDate,
            comparison_lineage_version: calculationIdentity.comparisonLineageVersion,
            job_id: null,
            correlation_id: calculationIdentity.correlationId,
            status: 'queued',
            snapshot_id: null,
          },
        ],
      });

    const run = await acquireScenarioCalculationRun({ query: queryMock } as never, calculationIdentity);

    expect(run.status).toBe('queued');
    expect(String(queryMock.mock.calls[0]?.[0])).toContain(
      "WHERE status IN ('queued', 'running', 'completed')"
    );
    expect(String(queryMock.mock.calls[0]?.[0])).toContain(
      "COALESCE(hash_kind, 'scenario-input-hash-v1')"
    );
  });

  it('rejects malformed or uppercase typed hashes before querying', async () => {
    const queryMock = vi.fn();

    await expect(
      acquireScenarioCalculationRun(
        { query: queryMock } as never,
        { ...calculationIdentity, inputHash: 'A'.repeat(64) }
      )
    ).rejects.toThrow('exact lowercase SHA-256 hex');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('normalizes PostgreSQL DATE objects without a UTC day shift', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111115',
          fund_id: calculationIdentity.fundId,
          scenario_set_id: calculationIdentity.scenarioSetId,
          source_config_id: calculationIdentity.sourceConfigId,
          source_config_version: calculationIdentity.sourceConfigVersion,
          calculation_mode: calculationIdentity.calculationMode,
          override_type: calculationIdentity.overrideType,
          input_hash: calculationIdentity.inputHash,
          hash_kind: calculationIdentity.hashKind,
          model_inputs_as_of_date: new Date(2026, 5, 30),
          comparison_lineage_version: calculationIdentity.comparisonLineageVersion,
          job_id: null,
          correlation_id: calculationIdentity.correlationId,
          status: 'completed',
          snapshot_id: 42,
        },
      ],
    });

    const run = await findCompletedScenarioRun(
      { query: queryMock } as never,
      calculationIdentity
    );

    expect(run?.modelInputsAsOfDate).toBe('2026-06-30');
  });
});
