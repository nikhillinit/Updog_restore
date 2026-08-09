import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import { ModelInputsAsOfDateSchema } from '@shared/contracts/fund-draft-write-v1.contract';
import {
  COMPARISON_LINEAGE_VERSION,
  SCENARIO_INPUT_HASH_V1_VERSION,
  SCENARIO_INPUT_HASH_V2_VERSION,
  type ScenarioInputHashKind,
} from '@shared/lib/scenarios/scenario-input-envelope';
import { getFundScenarioHardTimeoutMs, isFundScenarioSweepEnabled } from './fund-scenario-timeout';

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
    'fee_profile' | 'allocation' | 'sector_profile' | 'methodology' | 'reserve_allocation';
  inputHash: string;
  hashKind: ScenarioInputHashKind;
  modelInputsAsOfDate: string | null;
  comparisonLineageVersion: typeof COMPARISON_LINEAGE_VERSION | null;
  correlationId: string;
  jobId?: string | null;
}

export interface ScenarioCalculationRunRecord extends Omit<
  ScenarioCalculationRunIdentity,
  'hashKind'
> {
  id: string;
  hashKind: ScenarioInputHashKind | null;
  status: ScenarioCalculationRunStatus;
  snapshotId: number | null;
  deadlineAt: Date | string | null;
  failureCode: string | null;
  failureMessage: string | null;
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
  deadline_at: Date | string | null;
  failure_code: string | null;
  failure_message: string | null;
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
    deadlineAt: row.deadline_at ?? null,
    failureCode: row.failure_code ?? null,
    failureMessage: row.failure_message ?? null,
  };
}

export function sanitizeScenarioCalculationFailureMessage(
  message: string | null | undefined
): string | null {
  if (message == null) return null;
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return firstLine.length > 240 ? firstLine.slice(0, 240) : firstLine || null;
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

export async function findLatestScenarioRun(
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
      ORDER BY updated_at DESC, created_at DESC
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
  return (await acquireScenarioCalculationRunWithCreation(client, identity)).run;
}

export async function acquireScenarioCalculationRunWithCreation(
  client: QueryClient,
  identity: ScenarioCalculationRunIdentity
): Promise<{ run: ScenarioCalculationRunRecord; inserted: boolean }> {
  assertRunIdentity(identity);
  const inserted = await insertScenarioCalculationRun(client, identity);
  if (inserted) return { run: inserted, inserted: true };

  const existing = await findActiveScenarioCalculationRun(client, identity);
  if (existing) return { run: existing, inserted: false };

  throw new Error('Scenario calculation run acquisition returned no active row');
}

export async function markQueuedScenarioCalculationRunEnqueueFailed(
  client: QueryClient,
  runId: string,
  identity: ScenarioCalculationRunFenceIdentity
): Promise<number> {
  const result = await client.query(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'failed',
            failure_code = 'QUEUE_ENQUEUE_FAILED',
            failure_message = NULL,
            failed_at = clock_timestamp(),
            deadline_at = NULL,
            updated_at = clock_timestamp()
      WHERE id = $1
        AND status = 'queued'
        AND job_id IS NOT DISTINCT FROM $12${ASYNC_RUN_IDENTITY_FENCE_SQL}`,
    asyncRunFenceParams(runId, identity)
  );
  return affectedRowCount(result);
}

export async function bindQueuedScenarioCalculationRunJobId(
  client: QueryClient,
  runId: string,
  provisionalJobId: string | null,
  jobId: string
): Promise<number> {
  const result = await client.query(
    `UPDATE fund_scenario_calculation_runs
        SET job_id = $3,
            updated_at = clock_timestamp()
      WHERE id = $1
        AND status = 'queued'
        AND job_id IS NOT DISTINCT FROM $2`,
    [runId, provisionalJobId, jobId]
  );
  return affectedRowCount(result);
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
       deadline_at,
       created_at,
       updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, 'queued',
       CASE
         WHEN $11 IS NULL THEN NULL
         ELSE clock_timestamp() + ($13::bigint * INTERVAL '1 millisecond')
       END,
       clock_timestamp(),
       clock_timestamp()
     )
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
      identity.jobId == null ? null : getFundScenarioHardTimeoutMs(),
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
  runId: string,
  identity: ScenarioCalculationRunFenceIdentity
): Promise<number> {
  const result = await client.query<ScenarioCalculationRunRow>(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'running',
            started_at = clock_timestamp(),
            deadline_at = CASE
              WHEN job_id IS NULL THEN NULL
              ELSE clock_timestamp() + ($13::bigint * INTERVAL '1 millisecond')
            END,
            updated_at = clock_timestamp()
      WHERE id = $1
        AND status = 'queued'
        AND job_id IS NOT DISTINCT FROM $12
        AND (deadline_at IS NULL OR clock_timestamp() < deadline_at)${ASYNC_RUN_IDENTITY_FENCE_SQL}
      RETURNING *`,
    [...asyncRunFenceParams(runId, identity), timeoutParam(identity)]
  );
  return affectedRowCount(result);
}

export async function markScenarioCalculationRunCompleted(
  client: QueryClient,
  runId: string,
  identity: ScenarioCalculationRunFenceIdentity,
  snapshotId: number
): Promise<number> {
  const result = await client.query<ScenarioCalculationRunRow>(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'completed',
            snapshot_id = $13,
            completed_at = clock_timestamp(),
            updated_at = clock_timestamp()
      WHERE id = $1
        AND status = 'running'
        AND snapshot_id IS NULL
        AND job_id IS NOT DISTINCT FROM $12
        AND (deadline_at IS NULL OR clock_timestamp() < deadline_at)${ASYNC_RUN_IDENTITY_FENCE_SQL}
      RETURNING *`,
    [...asyncRunFenceParams(runId, identity), snapshotId]
  );
  return affectedRowCount(result);
}

export async function markScenarioCalculationRunFailed(
  client: QueryClient,
  runId: string,
  identity: ScenarioCalculationRunFenceIdentity,
  failure: { code?: string | null; message?: string | null } = {}
): Promise<number> {
  const result = await client.query<ScenarioCalculationRunRow>(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'failed',
            failure_code = $13,
            failure_message = $14,
            failed_at = clock_timestamp(),
            updated_at = clock_timestamp()
      WHERE id = $1
        AND status = 'running'
        AND job_id IS NOT DISTINCT FROM $12${ASYNC_RUN_IDENTITY_FENCE_SQL}
      RETURNING *`,
    [
      ...asyncRunFenceParams(runId, identity),
      failure.code ?? null,
      sanitizeScenarioCalculationFailureMessage(failure.message),
    ]
  );
  return affectedRowCount(result);
}

export async function markScenarioCalculationRunTimedOut(
  client: QueryClient,
  runId: string,
  jobId: string | null
): Promise<number> {
  const result = await client.query(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'failed',
            failure_code = 'HARD_TIMEOUT',
            failure_message = 'Fund scenario calculation exceeded its hard deadline',
            failed_at = clock_timestamp(),
            updated_at = clock_timestamp()
      WHERE id = $1
        AND status IN ('queued', 'running')
        AND job_id IS NOT DISTINCT FROM $2
        AND deadline_at IS NOT NULL
        AND clock_timestamp() >= deadline_at`,
    [runId, jobId]
  );
  return affectedRowCount(result);
}

/**
 * Identity used by the async worker lease. Keep this separate from the
 * unconditional helpers above: synchronous callers retain their historical
 * update semantics while async delivery is fenced to its claimed input.
 */
export interface ScenarioCalculationRunFenceIdentity {
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  calculationMode: ScenarioCalculationRunIdentity['calculationMode'];
  overrideType: ScenarioCalculationRunIdentity['overrideType'];
  inputHash: string;
  hashKind: ScenarioInputHashKind | null;
  modelInputsAsOfDate: string | null;
  comparisonLineageVersion: typeof COMPARISON_LINEAGE_VERSION | null;
  jobId: string | null;
}

function normalizedFenceHashKind(hashKind: ScenarioInputHashKind | null): ScenarioInputHashKind {
  return hashKind ?? SCENARIO_INPUT_HASH_V1_VERSION;
}

function assertRunFenceIdentity(identity: ScenarioCalculationRunFenceIdentity): void {
  assertRunIdentity({
    ...identity,
    hashKind: normalizedFenceHashKind(identity.hashKind),
    correlationId: 'async-fence',
  });
}

function asyncRunFenceParams(
  runId: string,
  identity: ScenarioCalculationRunFenceIdentity
): unknown[] {
  assertRunFenceIdentity(identity);
  return [
    runId,
    identity.fundId,
    identity.scenarioSetId,
    identity.sourceConfigId,
    identity.sourceConfigVersion,
    identity.calculationMode,
    identity.overrideType,
    identity.inputHash,
    normalizedFenceHashKind(identity.hashKind),
    identity.modelInputsAsOfDate,
    identity.comparisonLineageVersion,
    identity.jobId,
  ];
}

function timeoutParam(identity: ScenarioCalculationRunFenceIdentity): number | null {
  return identity.jobId === null ? null : getFundScenarioHardTimeoutMs();
}

function affectedRowCount(result: { rowCount?: number | null; rows?: unknown[] }): number {
  return result.rowCount ?? result.rows?.length ?? 0;
}

const ASYNC_RUN_IDENTITY_FENCE_SQL = `
        AND fund_id = $2
        AND scenario_set_id = $3
        AND source_config_id = $4
        AND source_config_version = $5
        AND calculation_mode = $6
        AND override_type = $7
        AND input_hash = $8
        AND COALESCE(hash_kind, 'scenario-input-hash-v1') = $9
        AND model_inputs_as_of_date IS NOT DISTINCT FROM $10::date
        AND comparison_lineage_version IS NOT DISTINCT FROM $11`;

export async function claimScenarioCalculationRunIfQueued(
  client: QueryClient,
  runId: string,
  identity: ScenarioCalculationRunFenceIdentity
): Promise<ScenarioCalculationRunRecord | null> {
  const result = await client.query<ScenarioCalculationRunRow>(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'running',
            started_at = clock_timestamp(),
            deadline_at = CASE
              WHEN job_id IS NULL THEN NULL
              ELSE clock_timestamp() + ($13::bigint * INTERVAL '1 millisecond')
            END,
            updated_at = clock_timestamp()
      WHERE id = $1
        AND status = 'queued'
        AND job_id IS NOT DISTINCT FROM $12
        AND (deadline_at IS NULL OR clock_timestamp() < deadline_at)${ASYNC_RUN_IDENTITY_FENCE_SQL}
      RETURNING *`,
    [...asyncRunFenceParams(runId, identity), timeoutParam(identity)]
  );
  return result.rows[0] ? mapRun(result.rows[0]) : null;
}

export async function completeScenarioCalculationRunIfRunning(
  client: QueryClient,
  runId: string,
  identity: ScenarioCalculationRunFenceIdentity,
  snapshotId: number
): Promise<ScenarioCalculationRunRecord | null> {
  const result = await client.query<ScenarioCalculationRunRow>(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'completed',
            snapshot_id = $13,
            completed_at = clock_timestamp(),
            updated_at = clock_timestamp()
      WHERE id = $1
        AND status = 'running'
        AND snapshot_id IS NULL
        AND job_id IS NOT DISTINCT FROM $12
        AND (deadline_at IS NULL OR clock_timestamp() < deadline_at)${ASYNC_RUN_IDENTITY_FENCE_SQL}
      RETURNING *`,
    [...asyncRunFenceParams(runId, identity), snapshotId]
  );
  return result.rows[0] ? mapRun(result.rows[0]) : null;
}

export async function failScenarioCalculationRunIfRunning(
  client: QueryClient,
  runId: string,
  identity: ScenarioCalculationRunFenceIdentity,
  failure: { code?: string | null; message?: string | null } = {}
): Promise<ScenarioCalculationRunRecord | null> {
  const result = await client.query<ScenarioCalculationRunRow>(
    `UPDATE fund_scenario_calculation_runs
        SET status = 'failed',
            failure_code = $13,
            failure_message = $14,
            failed_at = clock_timestamp(),
            updated_at = clock_timestamp()
      WHERE id = $1
        AND status = 'running'
        AND job_id IS NOT DISTINCT FROM $12${ASYNC_RUN_IDENTITY_FENCE_SQL}
      RETURNING *`,
    [
      ...asyncRunFenceParams(runId, identity),
      failure.code ?? null,
      sanitizeScenarioCalculationFailureMessage(failure.message),
    ]
  );
  return result.rows[0] ? mapRun(result.rows[0]) : null;
}

export interface FundScenarioDeadlineSweepResult {
  reconciledCount: number;
  timedOutCount: number;
}

interface ExpiredScenarioCalculationRunRow {
  id: string;
  job_id: string;
}

export async function sweepFundScenarioCalculationRunDeadlines(
  options: {
    removeJob?: (jobId: string) => Promise<unknown>;
  } = {}
): Promise<FundScenarioDeadlineSweepResult> {
  const disabledResult = { reconciledCount: 0, timedOutCount: 0 };
  if (!isFundScenarioSweepEnabled()) {
    return disabledResult;
  }

  const timeoutMs = getFundScenarioHardTimeoutMs();
  const result = await transaction(async (client) => {
    const reconciliation = await client.query(
      `UPDATE fund_scenario_calculation_runs
          SET deadline_at = clock_timestamp() + ($1::bigint * INTERVAL '1 millisecond'),
              updated_at = clock_timestamp()
        WHERE status IN ('queued', 'running')
          AND job_id IS NOT NULL
          AND deadline_at IS NULL`,
      [timeoutMs]
    );

    const expired = await client.query<ExpiredScenarioCalculationRunRow>(
      `SELECT id, job_id
         FROM fund_scenario_calculation_runs
        WHERE status IN ('queued', 'running')
          AND job_id IS NOT NULL
          AND deadline_at IS NOT NULL
          AND clock_timestamp() >= deadline_at`,
      []
    );

    let timedOutCount = 0;
    const timedOutJobIds: string[] = [];
    for (const row of expired.rows) {
      const affected = await markScenarioCalculationRunTimedOut(client, row.id, row.job_id);
      timedOutCount += affected;
      if (affected === 1) timedOutJobIds.push(row.job_id);
    }

    return {
      reconciledCount: affectedRowCount(reconciliation),
      timedOutCount,
      timedOutJobIds,
    };
  });
  for (const jobId of result.timedOutJobIds) {
    try {
      await options.removeJob?.(jobId);
    } catch {
      // Timeout CAS is authoritative; stale BullMQ removal is best effort.
    }
  }
  return { reconciledCount: result.reconciledCount, timedOutCount: result.timedOutCount };
}
