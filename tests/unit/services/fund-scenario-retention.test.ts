import { describe, expect, it, vi } from 'vitest';

import { persistFeeProfileScenarioSnapshot } from '../../../server/services/fund-scenario-calculation-service';
import { acquireScenarioCalculationRun } from '../../../server/services/fund-scenario-calculation-run-service';
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
};

const calculationIdentity = {
  fundId: 1,
  scenarioSetId,
  sourceConfigId: 2,
  sourceConfigVersion: 3,
  calculationMode: 'sync_fee_profile' as const,
  overrideType: 'fee_profile' as const,
  inputHash: 'c'.repeat(64),
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
  });
});
