import { describe, expect, it, vi } from 'vitest';
import { proveScenarioComparisonLineage } from '../../../server/services/fund-scenario-comparison-lineage-service';

const fundId = 123;
const scenarioSetId = '00000000-0000-0000-0000-000000000111';
const inputHash = 'a'.repeat(64);

describe('fund scenario comparison lineage proof', () => {
  it('returns typed internal proof only for the exact joined chain selected by SQL', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          economics_snapshot_id: 41,
          economics_run_id: 17,
          scenario_snapshot_id: 42,
          scenario_run_id: '00000000-0000-0000-0000-000000000222',
          model_inputs_as_of_date: '2026-06-30',
          input_hash: inputHash,
        },
      ],
    });

    const result = await proveScenarioComparisonLineage(
      { query } as never,
      { fundId, scenarioSetId, sourceConfigId: 12, sourceConfigVersion: 4 }
    );

    expect(result).toEqual({
      kind: 'comparable',
      economicsSnapshotId: 41,
      economicsRunId: 17,
      scenarioSnapshotId: 42,
      scenarioRunId: '00000000-0000-0000-0000-000000000222',
      source: 'fund_scenario_calculation_runs',
      asOfDate: '2026-06-30',
      hashKind: 'scenario-input-hash-v2',
      inputHash,
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('economics_run.id = economics_snapshot.run_id');
    expect(sql).toContain('scenario_run.snapshot_id = scenario_snapshot.id');
    expect(sql).toContain('scenario_run.linked_run_count = 1');
    expect(sql).toContain('scenario_run.model_inputs_as_of_date = economics_run.model_inputs_as_of_date');
    expect(sql).toContain("scenario_run.input_hash ~ '^[a-f0-9]{64}$'");
    expect(sql).toContain('scenario_snapshot.state_hash = scenario_run.input_hash');
    expect(params).toEqual([
      fundId,
      scenarioSetId,
      12,
      4,
      'comparison-lineage-v1',
      'scenario-input-hash-v2',
    ]);
  });

  it('fails closed when any required join or equality yields no row', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          diagnosticRow({
            scenario_model_inputs_as_of_date: '2026-07-01',
          }),
        ],
      });

    await expect(
      proveScenarioComparisonLineage(
        { query } as never,
        { fundId, scenarioSetId, sourceConfigId: 12, sourceConfigVersion: 4 }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'model_inputs_date_mismatch' });

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1]?.[0])).toContain('first_completed_scenario_run');
  });
});

function diagnosticRow(overrides: Record<string, unknown> = {}) {
  return {
    economics_snapshot_id: 41,
    economics_snapshot_fund_id: fundId,
    economics_snapshot_config_id: 12,
    economics_snapshot_config_version: 4,
    economics_run_id: 17,
    economics_run_fund_id: fundId,
    economics_run_config_id: 12,
    economics_run_config_version: 4,
    economics_lineage_version: 'comparison-lineage-v1',
    economics_model_inputs_as_of_date: '2026-06-30',
    scenario_snapshot_id: 42,
    scenario_snapshot_state_hash: inputHash,
    linked_run_count: 1,
    completed_linked_run_count: 1,
    scenario_run_id: '00000000-0000-0000-0000-000000000222',
    scenario_run_fund_id: fundId,
    scenario_run_scenario_set_id: scenarioSetId,
    scenario_run_config_id: 12,
    scenario_run_config_version: 4,
    scenario_lineage_version: 'comparison-lineage-v1',
    scenario_model_inputs_as_of_date: '2026-06-30',
    scenario_hash_kind: 'scenario-input-hash-v2',
    scenario_input_hash: inputHash,
    ...overrides,
  };
}
