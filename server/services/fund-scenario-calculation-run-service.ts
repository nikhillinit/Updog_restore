import type { PoolClient } from 'pg';
import { ModelInputsAsOfDateSchema } from '@shared/contracts/fund-draft-write-v1.contract';
import {
  COMPARISON_LINEAGE_VERSION,
  SCENARIO_INPUT_HASH_V1_VERSION,
  SCENARIO_INPUT_HASH_V2_VERSION,
  type ScenarioInputHashKind,
} from '@shared/lib/scenarios/scenario-input-envelope';

const SHA256_LOWERCASE_HEX = /^[a-f0-9]{64}$/;

type ScenarioCalculationRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScenarioCalculationRunIdentity {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  calculationMode:
    | 'sync_fee_profile'
    | 'sync_allocation'
    | 'sync_sector_profile'
    | 'sync_methodology'
    | 'async_reserve_allocation';
  overrideType:
    | 'fee_profile'
    | 'allocation'
    | 'sector_profile'
    | 'methodology'
    | 'reserve_allocation';
  inputHash: string;
  hashKind: ScenarioInputHashKind;
  modelInputsAsOfDate: string | null;
  comparisonLineageVersion: typeof COMPARISON_LINEAGE_VERSION | null;
  correlationId: string;
  jobId?: string | null;
}

export interface ScenarioCalculationRunRecord
  extends Omit<ScenarioCalculationRunIdentity, 'hashKind'> {
  id: string;
  hashKind: ScenarioInputHashKind | null;
  status: ScenarioCalculationRunStatus;
  snapshotId: number | null;
}

interface ScenarioCalculationRunRow {
  id: string;
  fund_id: number;
  scenario_set_id: string;
  source_config_id: number;
  source_config_version: number;
  calculation_mode: ScenarioCalculationRunIdentity['calculationMode'];
  override_type: ScenarioCalculationRunIdentity['overrideType'];
  input_hash: string;
  hash_kind: ScenarioInputHashKind | null;
  model_inputs_as_of_date: Date | string | null;
  comparison_lineage_version: typeof COMPARISON_LINEAGE_VERSION | null;
  job_id: string | null;
  correlation_id: string;
  status: ScenarioCalculationRunStatus;
  snapshot_id: number | null;
}

type QueryClient = Pick<PoolClient, 'query'>;

function assertRunIdentity(identity: ScenarioCalculationRunIdentity): void {
  if (!SHA256_LOWERCASE_HEX.test(identity.inputHash)) {
    throw new TypeError('Scenario calculation inputHash must be exact lowercase SHA-256 hex');
  }

  if (identity.hashKind === SCENARIO_INPUT_HASH_V2_VERSION) {
    if (
      identity.modelInputsAsOfDate === null ||
      !ModelInputsAsOfDateSchema.safeParse(identity.modelInputsAsOfDate).success ||
      identity.comparisonLineageVersion !== COMPARISON_LINEAGE_VERSION
    ) {
      throw new TypeError('Scenario input hash v2 requires complete comparison lineage');
    }
    return;
  }

  if (
    identity.hashKind !== SCENARIO_INPUT_HASH_V1_VERSION ||
    identity.modelInputsAsOfDate !== null ||
    identity.comparisonLineageVersion !== null
  ) {
    throw new TypeError('Scenario input hash v1 cannot carry comparison lineage');
  }
}

function mapRun(row: ScenarioCalculationRunRow): ScenarioCalculationRunRecord {
  return {
    id: row.id,
    fundId: row.fund_id,
    scenarioSetId: row.scenario_set_id,
    sourceConfigId: row.source_config_id,
    sourceConfigVersion: row.source_config_version,
    calculationMode: row.calculation_mode,
    overrideType: row.override_type,
    inputHash: row.input_hash,
    hashKind: row.hash_kind,
    modelInputsAsOfDate: normalizeDateOnly(row.model_inputs_as_of_date),
    comparisonLineageVersion: row.comparison_lineage_version,
    jobId: row.job_id,
    correlationId: row.correlation_id,
    status: row.status,
    snapshotId: row.snapshot_id,
  };
}

function normalizeDateOnly(value: Date | string | null): string | null {
  if (value === null || typeof value === 'string') {
    return value;
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function findCompletedScenarioRun(
  client: QueryClient,
  identity: Omit<ScenarioCalculationRunIdentity, 'correlationId' | 'jobId'>
): Promise<ScenarioCalculationRunRecord | null> {
  assertRunIdentity({ ...identity, correlationId: 'lookup' });
  const result = await client.query<ScenarioCalculationRunRow>(
    `SELECT *
       FROM fund_scenario_calculation_runs
      WHERE fund_id = $1
        AND scenario_set_id = $2
        AND source_config_id = $3
        AND source_config_version = $4
        AND input_hash = $5
        AND COALESCE(hash_kind, 'scenario-input-hash-v1') = $6
        AND model_inputs_as_of_date IS NOT DISTINCT FROM $7::date
        AND comparison_lineage_version IS NOT DISTINCT FROM $8
        AND status = 'completed'
        AND snapshot_id IS NOT NULL
      ORDER BY completed_at DESC, created_at DESC
      LIMIT 1`,
    [
      identity.fundId,
      identity.scenarioSetId,
      identity.sourceConfigId,
      identity.sourceConfigVersion,
      identity.inputHash,
      identity.hashKind,
      identity.modelInputsAsOfDate,
      identity.comparisonLineageVersion,
    ]
  );
  return result.rows[0] ? mapRun(result.rows[0]) : null;
}

export async function acquireScenarioCalculationRun(
  client: QueryClient,
  identity: ScenarioCalculationRunIdentity
): Promise<ScenarioCalculationRunRecord> {
  assertRunIdentity(identity);
  const inserted = await insertScenarioCalculationRun(client, identity);
  if (inserted) return inserted;

  const existing = await findActiveScenarioCalculationRun(client, identity);
  if (existing) return existing;

  throw new Error('Scenario calculation run acquisition returned no active row');
}

async function insertScenarioCalculationRun(
  client: QueryClient,
  identity: ScenarioCalculationRunIdentity
): Promise<ScenarioCalculationRunRecord | null> {
  const insert = await client.query<ScenarioCalculationRunRow>(
    `INSERT INTO fund_scenario_calculation_runs (
       fund_id,
       scenario_set_id,
       source_config_id,
       source_config_version,
       calculation_mode,
       override_type,
       input_hash,
       hash_kind,
       model_inputs_as_of_date,
       comparison_lineage_version,
       job_id,
       correlation_id,
       status,
       created_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, 'queued', NOW(), NOW())
     ON CONFLICT (
       scenario_set_id,
       source_config_id,
       source_config_version,
       (COALESCE(hash_kind, 'scenario-input-hash-v1')),
       input_hash
     )
       WHERE status IN ('queued', 'running', 'completed')
     DO NOTHING
     RETURNING *`,
    [
      identity.fundId,
      identity.scenarioSetId,
      identity.sourceConfigId,
      identity.sourceConfigVersion,
      identity.calculationMode,
      identity.overrideType,
      identity.inputHash,
      identity.hashKind,
      identity.modelInputsAsOfDate,
      identity.comparisonLineageVersion,
      identity.jobId ?? null,
      identity.correlationId,
    ]
  );

  return insert.rows[0] ? mapRun(insert.rows[0]) : null;
}

async function findActiveScenarioCalculationRun(
  client: QueryClient,
  identity: ScenarioCalculationRunIdentity
): Promise<ScenarioCalculationRunRecord | null> {
  const existing = await client.query<ScenarioCalculationRunRow>(
    `SELECT *
       FROM fund_scenario_calculation_runs
      WHERE scenario_set_id = $1
        AND source_config_id = $2
        AND source_config_version = $3
        AND COALESCE(hash_kind, 'scenario-input-hash-v1') = $4
        AND input_hash = $5
        AND model_inputs_as_of_date IS NOT DISTINCT FROM $6::date
        AND comparison_lineage_version IS NOT DISTINCT FROM $7
        AND status IN ('queued', 'running', 'completed')
      ORDER BY created_at DESC
      LIMIT 1`,
    [
      identity.scenarioSetId,
      identity.sourceConfigId,
      identity.sourceConfigVersion,
      identity.hashKind,
      identity.inputHash,
      identity.modelInputsAsOfDate,
      identity.comparisonLineageVersion,
    ]
  );

  return existing.rows[0] ? mapRun(existing.rows[0]) : null;
}

export async function markScenarioCalculationRunRunning(
  client: QueryClient,
  runId: string
): Promise<ScenarioCalculationRunRecord> {
  const result = await client.query<ScenarioCalculationRunRow>(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'running',
            started_at = COALESCE(started_at, NOW()),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [runId]
  );
  if (result.rows[0]) return mapRun(result.rows[0]);
  throw new Error(`Scenario calculation run ${runId} was not found`);
}

export async function markScenarioCalculationRunCompleted(
  client: QueryClient,
  runId: string,
  snapshotId: number
): Promise<ScenarioCalculationRunRecord> {
  const result = await client.query<ScenarioCalculationRunRow>(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'completed',
            snapshot_id = $2,
            completed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [runId, snapshotId]
  );
  if (result.rows[0]) return mapRun(result.rows[0]);
  throw new Error(`Scenario calculation run ${runId} was not found`);
}

export async function markScenarioCalculationRunFailed(
  client: QueryClient,
  runId: string,
  failure: { code?: string | null; message?: string | null } = {}
): Promise<ScenarioCalculationRunRecord> {
  const result = await client.query<ScenarioCalculationRunRow>(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'failed',
            failure_code = $2,
            failure_message = $3,
            failed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [runId, failure.code ?? null, failure.message ?? null]
  );
  if (result.rows[0]) return mapRun(result.rows[0]);
  throw new Error(`Scenario calculation run ${runId} was not found`);
}
