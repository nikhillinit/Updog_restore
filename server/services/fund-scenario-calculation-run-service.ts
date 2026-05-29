import type { PoolClient } from 'pg';

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
    | 'async_reserve_allocation';
  overrideType: 'fee_profile' | 'allocation' | 'sector_profile' | 'reserve_allocation';
  inputHash: string;
  correlationId: string;
  jobId?: string | null;
}

export interface ScenarioCalculationRunRecord extends ScenarioCalculationRunIdentity {
  id: string;
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
  job_id: string | null;
  correlation_id: string;
  status: ScenarioCalculationRunStatus;
  snapshot_id: number | null;
}

type QueryClient = Pick<PoolClient, 'query'>;

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
    jobId: row.job_id,
    correlationId: row.correlation_id,
    status: row.status,
    snapshotId: row.snapshot_id,
  };
}

export async function findCompletedScenarioRun(
  client: QueryClient,
  identity: Omit<ScenarioCalculationRunIdentity, 'correlationId' | 'jobId'>
): Promise<ScenarioCalculationRunRecord | null> {
  const result = await client.query<ScenarioCalculationRunRow>(
    `SELECT *
       FROM fund_scenario_calculation_runs
      WHERE fund_id = $1
        AND scenario_set_id = $2
        AND source_config_id = $3
        AND source_config_version = $4
        AND input_hash = $5
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
    ]
  );
  return result.rows[0] ? mapRun(result.rows[0]) : null;
}

export async function acquireScenarioCalculationRun(
  client: QueryClient,
  identity: ScenarioCalculationRunIdentity
): Promise<ScenarioCalculationRunRecord> {
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
       job_id,
       correlation_id,
       status,
       created_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', NOW(), NOW())
     ON CONFLICT (scenario_set_id, source_config_id, source_config_version, input_hash)
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
        AND input_hash = $4
        AND status IN ('queued', 'running', 'completed')
      ORDER BY created_at DESC
      LIMIT 1`,
    [
      identity.scenarioSetId,
      identity.sourceConfigId,
      identity.sourceConfigVersion,
      identity.inputHash,
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
