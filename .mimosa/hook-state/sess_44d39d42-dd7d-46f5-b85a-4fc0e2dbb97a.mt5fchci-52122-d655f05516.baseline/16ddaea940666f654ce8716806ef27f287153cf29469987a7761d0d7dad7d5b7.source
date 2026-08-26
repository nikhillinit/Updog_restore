import type { PoolClient } from 'pg';
import {
  COMPARISON_LINEAGE_VERSION,
  SCENARIO_INPUT_HASH_V2_VERSION,
} from '@shared/lib/scenarios/scenario-input-envelope';

const SCENARIO_RUN_SOURCE = 'fund_scenario_calculation_runs' as const;

interface ComparisonLineageRow {
  economics_snapshot_id: number;
  economics_run_id: number;
  scenario_snapshot_id: number;
  scenario_run_id: string;
  model_inputs_as_of_date: string;
  input_hash: string;
}

interface ComparisonLineageDiagnosticRow {
  economics_snapshot_id: number | null;
  economics_snapshot_fund_id: number | null;
  economics_snapshot_config_id: number | null;
  economics_snapshot_config_version: number | null;
  economics_run_id: number | null;
  economics_run_fund_id: number | null;
  economics_run_config_id: number | null;
  economics_run_config_version: number | null;
  economics_lineage_version: string | null;
  economics_model_inputs_as_of_date: string | null;
  scenario_snapshot_id: number | null;
  scenario_snapshot_state_hash: string | null;
  linked_run_count: number;
  completed_linked_run_count: number;
  scenario_run_id: string | null;
  scenario_run_fund_id: number | null;
  scenario_run_scenario_set_id: string | null;
  scenario_run_config_id: number | null;
  scenario_run_config_version: number | null;
  scenario_lineage_version: string | null;
  scenario_model_inputs_as_of_date: string | null;
  scenario_hash_kind: string | null;
  scenario_input_hash: string | null;
}

type QueryClient = Pick<PoolClient, 'query'>;

export type ScenarioComparisonLineageProof =
  | { kind: 'unavailable'; reason: ScenarioComparisonLineageUnavailableReason }
  | {
      kind: 'comparable';
      economicsSnapshotId: number;
      economicsRunId: number;
      scenarioSnapshotId: number;
      scenarioRunId: string;
      source: typeof SCENARIO_RUN_SOURCE;
      asOfDate: string;
      hashKind: typeof SCENARIO_INPUT_HASH_V2_VERSION;
      inputHash: string;
    };

export type ScenarioComparisonLineageUnavailableReason =
  | 'economics_snapshot_missing'
  | 'economics_run_link_missing'
  | 'economics_run_identity_mismatch'
  | 'scenario_snapshot_missing'
  | 'scenario_run_link_missing'
  | 'scenario_run_not_completed'
  | 'multiple_scenario_run_links'
  | 'scenario_run_identity_mismatch'
  | 'legacy_row'
  | 'lineage_version_mismatch'
  | 'model_inputs_date_mismatch'
  | 'hash_kind_mismatch'
  | 'invalid_input_hash'
  | 'snapshot_hash_mismatch'
  | 'joined_identity_mismatch';

const EXACT_LOWERCASE_SHA256 = /^[a-f0-9]{64}$/;

export async function proveScenarioComparisonLineage(
  client: QueryClient,
  input: {
    fundId: number;
    scenarioSetId: string;
    sourceConfigId: number;
    sourceConfigVersion: number;
  }
): Promise<ScenarioComparisonLineageProof> {
  const result = await client.query<ComparisonLineageRow>(
    `WITH latest_economics_snapshot AS (
       SELECT id, fund_id, run_id, config_id, config_version
         FROM fund_snapshots
        WHERE fund_id = $1
          AND type = 'ECONOMICS'
          AND config_id = $3
          AND config_version = $4
          AND scenario_set_id IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
     ),
     latest_scenario_snapshot AS (
       SELECT id, fund_id, scenario_set_id, config_id, config_version, state_hash
         FROM fund_snapshots
        WHERE fund_id = $1
          AND type = 'SCENARIOS'
          AND scenario_set_id = $2
          AND config_id = $3
          AND config_version = $4
        ORDER BY created_at DESC, id DESC
        LIMIT 1
     ),
     linked_scenario_runs AS (
       SELECT scenario_run.*, COUNT(*) OVER () AS linked_run_count
         FROM fund_scenario_calculation_runs scenario_run
         JOIN latest_scenario_snapshot scenario_snapshot
           ON scenario_snapshot.id = scenario_run.snapshot_id
        WHERE scenario_run.status = 'completed'
     )
     SELECT economics_snapshot.id AS economics_snapshot_id,
            economics_run.id AS economics_run_id,
            scenario_snapshot.id AS scenario_snapshot_id,
            scenario_run.id AS scenario_run_id,
            scenario_run.model_inputs_as_of_date::text AS model_inputs_as_of_date,
            scenario_run.input_hash
       FROM latest_economics_snapshot economics_snapshot
       JOIN calc_runs economics_run
         ON economics_run.id = economics_snapshot.run_id
        AND economics_run.fund_id = economics_snapshot.fund_id
        AND economics_run.config_id = economics_snapshot.config_id
        AND economics_run.config_version = economics_snapshot.config_version
       JOIN latest_scenario_snapshot scenario_snapshot
         ON scenario_snapshot.fund_id = economics_snapshot.fund_id
        AND scenario_snapshot.config_id = economics_snapshot.config_id
        AND scenario_snapshot.config_version = economics_snapshot.config_version
       JOIN linked_scenario_runs scenario_run
         ON scenario_run.snapshot_id = scenario_snapshot.id
        AND scenario_run.fund_id = scenario_snapshot.fund_id
        AND scenario_run.scenario_set_id = scenario_snapshot.scenario_set_id
        AND scenario_run.source_config_id = scenario_snapshot.config_id
        AND scenario_run.source_config_version = scenario_snapshot.config_version
      WHERE economics_run.comparison_lineage_version = $5
        AND economics_run.model_inputs_as_of_date IS NOT NULL
        AND scenario_run.comparison_lineage_version = economics_run.comparison_lineage_version
        AND scenario_run.model_inputs_as_of_date = economics_run.model_inputs_as_of_date
        AND scenario_run.hash_kind = $6
        AND scenario_run.input_hash ~ '^[a-f0-9]{64}$'
        AND scenario_snapshot.state_hash = scenario_run.input_hash
        AND scenario_run.linked_run_count = 1`,
    [
      input.fundId,
      input.scenarioSetId,
      input.sourceConfigId,
      input.sourceConfigVersion,
      COMPARISON_LINEAGE_VERSION,
      SCENARIO_INPUT_HASH_V2_VERSION,
    ]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      kind: 'unavailable',
      reason: await diagnoseUnavailableLineage(client, input),
    };
  }

  return {
    kind: 'comparable',
    economicsSnapshotId: row.economics_snapshot_id,
    economicsRunId: row.economics_run_id,
    scenarioSnapshotId: row.scenario_snapshot_id,
    scenarioRunId: row.scenario_run_id,
    source: SCENARIO_RUN_SOURCE,
    asOfDate: row.model_inputs_as_of_date,
    hashKind: SCENARIO_INPUT_HASH_V2_VERSION,
    inputHash: row.input_hash,
  };
}

async function diagnoseUnavailableLineage(
  client: QueryClient,
  input: {
    fundId: number;
    scenarioSetId: string;
    sourceConfigId: number;
    sourceConfigVersion: number;
  }
): Promise<ScenarioComparisonLineageUnavailableReason> {
  const result = await client.query<ComparisonLineageDiagnosticRow>(
    `WITH latest_economics_snapshot AS (
       SELECT id, fund_id, run_id, config_id, config_version
         FROM fund_snapshots
        WHERE fund_id = $1
          AND type = 'ECONOMICS'
          AND config_id = $3
          AND config_version = $4
          AND scenario_set_id IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
     ),
     latest_scenario_snapshot AS (
       SELECT id, fund_id, scenario_set_id, config_id, config_version, state_hash
         FROM fund_snapshots
        WHERE fund_id = $1
          AND type = 'SCENARIOS'
          AND scenario_set_id = $2
          AND config_id = $3
          AND config_version = $4
        ORDER BY created_at DESC, id DESC
        LIMIT 1
     ),
     linked_scenario_runs AS (
       SELECT scenario_run.*
         FROM fund_scenario_calculation_runs scenario_run
         JOIN latest_scenario_snapshot scenario_snapshot
           ON scenario_snapshot.id = scenario_run.snapshot_id
     ),
     first_completed_scenario_run AS (
       SELECT *
         FROM linked_scenario_runs
        WHERE status = 'completed'
        ORDER BY id
        LIMIT 1
     )
     SELECT economics_snapshot.id AS economics_snapshot_id,
            economics_snapshot.fund_id AS economics_snapshot_fund_id,
            economics_snapshot.config_id AS economics_snapshot_config_id,
            economics_snapshot.config_version AS economics_snapshot_config_version,
            economics_run.id AS economics_run_id,
            economics_run.fund_id AS economics_run_fund_id,
            economics_run.config_id AS economics_run_config_id,
            economics_run.config_version AS economics_run_config_version,
            economics_run.comparison_lineage_version AS economics_lineage_version,
            economics_run.model_inputs_as_of_date::text AS economics_model_inputs_as_of_date,
            scenario_snapshot.id AS scenario_snapshot_id,
            scenario_snapshot.state_hash AS scenario_snapshot_state_hash,
            (SELECT COUNT(*)::int FROM linked_scenario_runs) AS linked_run_count,
            (
              SELECT COUNT(*)::int
                FROM linked_scenario_runs
               WHERE status = 'completed'
            ) AS completed_linked_run_count,
            scenario_run.id AS scenario_run_id,
            scenario_run.fund_id AS scenario_run_fund_id,
            scenario_run.scenario_set_id AS scenario_run_scenario_set_id,
            scenario_run.source_config_id AS scenario_run_config_id,
            scenario_run.source_config_version AS scenario_run_config_version,
            scenario_run.comparison_lineage_version AS scenario_lineage_version,
            scenario_run.model_inputs_as_of_date::text AS scenario_model_inputs_as_of_date,
            scenario_run.hash_kind AS scenario_hash_kind,
            scenario_run.input_hash AS scenario_input_hash
       FROM (SELECT 1) anchor
       LEFT JOIN latest_economics_snapshot economics_snapshot ON TRUE
       LEFT JOIN calc_runs economics_run ON economics_run.id = economics_snapshot.run_id
       LEFT JOIN latest_scenario_snapshot scenario_snapshot ON TRUE
       LEFT JOIN first_completed_scenario_run scenario_run ON TRUE`,
    [input.fundId, input.scenarioSetId, input.sourceConfigId, input.sourceConfigVersion]
  );

  const row = result.rows[0];
  if (!row || row.economics_snapshot_id === null) return 'economics_snapshot_missing';
  if (row.economics_run_id === null) return 'economics_run_link_missing';
  if (
    row.economics_run_fund_id !== row.economics_snapshot_fund_id ||
    row.economics_run_config_id !== row.economics_snapshot_config_id ||
    row.economics_run_config_version !== row.economics_snapshot_config_version
  ) {
    return 'economics_run_identity_mismatch';
  }
  if (row.scenario_snapshot_id === null) return 'scenario_snapshot_missing';
  if (row.linked_run_count === 0) return 'scenario_run_link_missing';
  if (row.linked_run_count !== 1 || row.completed_linked_run_count > 1) {
    return 'multiple_scenario_run_links';
  }
  if (row.completed_linked_run_count === 0 || row.scenario_run_id === null) {
    return 'scenario_run_not_completed';
  }
  if (
    row.scenario_run_fund_id !== input.fundId ||
    row.scenario_run_scenario_set_id !== input.scenarioSetId ||
    row.scenario_run_config_id !== input.sourceConfigId ||
    row.scenario_run_config_version !== input.sourceConfigVersion
  ) {
    return 'scenario_run_identity_mismatch';
  }
  if (
    row.economics_lineage_version === null ||
    row.economics_model_inputs_as_of_date === null ||
    row.scenario_lineage_version === null ||
    row.scenario_model_inputs_as_of_date === null
  ) {
    return 'legacy_row';
  }
  if (
    row.economics_lineage_version !== COMPARISON_LINEAGE_VERSION ||
    row.scenario_lineage_version !== row.economics_lineage_version
  ) {
    return 'lineage_version_mismatch';
  }
  if (row.scenario_model_inputs_as_of_date !== row.economics_model_inputs_as_of_date) {
    return 'model_inputs_date_mismatch';
  }
  if (row.scenario_hash_kind !== SCENARIO_INPUT_HASH_V2_VERSION) {
    return 'hash_kind_mismatch';
  }
  if (row.scenario_input_hash === null || !EXACT_LOWERCASE_SHA256.test(row.scenario_input_hash)) {
    return 'invalid_input_hash';
  }
  if (row.scenario_snapshot_state_hash !== row.scenario_input_hash) {
    return 'snapshot_hash_mismatch';
  }
  return 'joined_identity_mismatch';
}
