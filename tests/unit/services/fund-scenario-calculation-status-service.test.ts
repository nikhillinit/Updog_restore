import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FundScenarioSetDetailV1 } from '../../../shared/contracts/fund-scenario-sets-v1.contract';

const { fetchScenarioSetDetailMock, queryMock, transactionMock, verifyFundExistsMock } = vi.hoisted(
  () => ({
    fetchScenarioSetDetailMock: vi.fn(),
    queryMock: vi.fn(),
    transactionMock: vi.fn(),
    verifyFundExistsMock: vi.fn(),
  })
);

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

vi.mock('../../../server/services/fund-scenario-set-service.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../../server/services/fund-scenario-set-service')
  >('../../../server/services/fund-scenario-set-service.js');

  return {
    ...actual,
    fetchScenarioSetDetail: fetchScenarioSetDetailMock,
    verifyFundExists: verifyFundExistsMock,
  };
});

import { getFundScenarioCalculationStatus } from '../../../server/services/fund-scenario-calculation-status-service';

const scenarioSetId = '00000000-0000-0000-0000-000000000111';

type StubClient = {
  query: typeof queryMock;
};

type TransactionCallback = (client: StubClient) => unknown;

describe('fund scenario calculation status service', () => {
  beforeEach(() => {
    fetchScenarioSetDetailMock.mockReset();
    queryMock.mockReset();
    transactionMock.mockReset();
    verifyFundExistsMock.mockReset();

    transactionMock.mockImplementation(async (callback: TransactionCallback) =>
      callback({ query: queryMock })
    );
    verifyFundExistsMock.mockResolvedValue(undefined);
    fetchScenarioSetDetailMock.mockResolvedValue(feeScenarioSetDetail());
  });

  it('rejects fee-profile scenario sets through the real reserve identity guard', async () => {
    await expect(getFundScenarioCalculationStatus(123, scenarioSetId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'scenario_calculation_mode_mismatch',
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(verifyFundExistsMock).toHaveBeenCalledTimes(1);
    expect(fetchScenarioSetDetailMock).toHaveBeenCalledTimes(1);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('accepts only the exact completed run snapshot and hash-kind event chain', async () => {
    fetchScenarioSetDetailMock.mockResolvedValue(reserveScenarioSetDetail());
    queryMock.mockImplementation(async (sqlValue: unknown, params: unknown[] = []) => {
      const sql = String(sqlValue);
      if (sql.includes('FROM fundconfigs') && sql.includes('id = $2')) {
        return {
          rows: [
            {
              id: 12,
              version: 4,
              config: {
                fundName: 'Status fund',
                modelInputsAsOfDate: '2026-06-30',
              },
            },
          ],
        };
      }
      if (sql.includes('FROM fundconfigs') && sql.includes('is_published = TRUE')) {
        return { rows: [{ version: 4 }] };
      }
      if (sql.includes('FROM fund_scenario_calculation_runs')) {
        return {
          rows: [
            {
              id: '00000000-0000-0000-0000-000000000222',
              fund_id: 123,
              scenario_set_id: scenarioSetId,
              source_config_id: 12,
              source_config_version: 4,
              calculation_mode: 'async_reserve_allocation',
              override_type: 'reserve_allocation',
              input_hash: params[4],
              hash_kind: 'scenario-input-hash-v2',
              model_inputs_as_of_date: new Date(2026, 5, 30),
              comparison_lineage_version: 'comparison-lineage-v1',
              job_id: 'job-42',
              correlation_id: '00000000-0000-0000-0000-000000000333',
              status: 'completed',
              snapshot_id: 42,
            },
          ],
        };
      }
      if (sql.includes('FROM fund_snapshots')) {
        expect(params[1]).toBe(42);
        return {
          rows: [
            {
              id: 42,
              correlation_id: '00000000-0000-0000-0000-000000000333',
              created_at: new Date('2026-07-01T00:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('FROM fund_scenario_set_events')) {
        expect(params[3]).toBe('scenario-input-hash-v2');
        return {
          rows: [
            {
              event_type: 'calculated',
              change_summary_json: {
                input_hash: params[2],
                hash_kind: params[3],
                job_id: 'job-42',
              },
              created_at: new Date('2026-07-01T00:00:01.000Z'),
            },
          ],
        };
      }
      throw new Error(`Unexpected status query: ${sql}`);
    });

    const result = await getFundScenarioCalculationStatus(123, scenarioSetId);

    expect(result).toMatchObject({
      status: 'succeeded',
      snapshotId: 42,
      correlationId: '00000000-0000-0000-0000-000000000333',
    });
    const sqlCalls = queryMock.mock.calls.map((call) => String(call[0]));
    expect(sqlCalls.some((sql) => sql.includes("COALESCE(hash_kind, 'scenario-input-hash-v1')"))).toBe(
      true
    );
    expect(sqlCalls.some((sql) => sql.includes("change_summary_json ->> 'hash_kind'"))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('AND id = $2'))).toBe(true);
  });
});

function feeScenarioSetDetail(): FundScenarioSetDetailV1 {
  return {
    id: scenarioSetId,
    fundId: 123,
    name: 'Fee sensitivity',
    description: null,
    sourceConfigId: 12,
    sourceConfigVersion: 4,
    variantCount: 1,
    archivedAt: null,
    archivedByUserId: null,
    archivedByLabel: null,
    createdByUserId: 17,
    createdByLabel: 'analyst@example.com',
    updatedByUserId: 17,
    updatedByLabel: 'analyst@example.com',
    createdAt: '2026-05-29T12:00:00.000Z',
    updatedAt: '2026-05-29T12:00:00.000Z',
    variants: [
      {
        id: '00000000-0000-0000-0000-000000000112',
        scenarioSetId,
        name: 'Lower fee',
        description: null,
        sortOrder: 0,
        override: {
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
        },
        createdAt: '2026-05-29T12:00:00.000Z',
        updatedAt: '2026-05-29T12:00:00.000Z',
      },
    ],
  };
}

function reserveScenarioSetDetail(): FundScenarioSetDetailV1 {
  return {
    ...feeScenarioSetDetail(),
    name: 'Reserve allocation',
    variants: [
      {
        id: '00000000-0000-0000-0000-000000000112',
        scenarioSetId,
        name: 'Reserve case',
        description: null,
        sortOrder: 0,
        override: {
          overrideType: 'reserve_allocation',
          payload: {
            allocationVersion: null,
            items: [{ companyId: 1, plannedReservesCents: 1000 }],
          },
        },
        createdAt: '2026-05-29T12:00:00.000Z',
        updatedAt: '2026-05-29T12:00:00.000Z',
      },
    ],
  };
}
