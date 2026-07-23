import { sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import { runIdempotentCommand } from '../lib/idempotent-command';
import { CURRENT_FORECAST_CALCULATION_KEY } from './current-forecast-calc-mode-resolver';

/**
 * Append-only reference plane for the current-forecast calculation key
 * (PLAN_61 Task 13.1-svc, R23/R24/R35). Lifecycle is STRUCTURAL (13.1 review
 * R1): rows are created as `candidate = true`; the single accepted
 * served-pointer head per fund is the non-superseded, non-candidate row
 * (partial unique index), and supersession is the self-FK chain. All writers
 * are fund-scoped idempotent through `runIdempotentCommand` (D13) and the
 * `(fund_id, idempotency_key)` unique (R3).
 */

export const CURRENT_FORECAST_REFERENCE_CONTRACT_VERSION = 'current-forecast-reference-v1';

export type CurrentForecastReferenceDatabase = typeof db;
type Executor = {
  execute: (query: SQL) => Promise<unknown>;
};
type ExecuteResult<T> = { rows: T[] };

async function executeRows<T>(executor: Executor, query: SQL): Promise<T[]> {
  const result = (await executor.execute(query)) as ExecuteResult<T>;
  return result.rows;
}

export class CurrentForecastReferenceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CurrentForecastReferenceError';
  }
}

export interface CurrentForecastReferenceBasis {
  fundSnapshotId: number;
  currentPlanVersionId: number;
  financialFactsSnapshotId: number;
  inputHash: string;
  resultHash: string;
  assumptionsHash: string;
  engineVersion: string;
  methodologyVersion: string;
}

export interface CurrentForecastReferenceRecord extends CurrentForecastReferenceBasis {
  id: number;
  fundId: number;
  calculationKey: string;
  candidate: boolean;
  supersededByReferenceId: number | null;
  reason: string | null;
  createdBy: number | null;
  createdAt: string;
}

/**
 * Deterministic shadow create-candidate key: corpus replays of the same basis
 * and result dedupe through `current_forecast_references_fund_idempotency_unique`.
 */
export function currentForecastReferenceIdempotencyKey(params: {
  fundId: number;
  inputHash: string;
  resultHash: string;
}): string {
  return `cfref:${params.fundId}:${params.inputHash}:${params.resultHash}`;
}

type ReferenceRow = {
  id: number;
  fund_id: number;
  calculation_key: string;
  fund_snapshot_id: number;
  current_plan_version_id: number;
  financial_facts_snapshot_id: number;
  input_hash: string;
  result_hash: string;
  assumptions_hash: string;
  engine_version: string;
  methodology_version: string;
  candidate: boolean;
  superseded_by_reference_id: number | null;
  reason: string | null;
  created_by: number | null;
  request_hash: string;
  created_at: Date | string;
};

const REFERENCE_COLUMNS = sql.raw(
  [
    'id',
    'fund_id',
    'calculation_key',
    'fund_snapshot_id',
    'current_plan_version_id',
    'financial_facts_snapshot_id',
    'input_hash',
    'result_hash',
    'assumptions_hash',
    'engine_version',
    'methodology_version',
    'candidate',
    'superseded_by_reference_id',
    'reason',
    'created_by',
    'request_hash',
    'created_at',
  ].join(', ')
);

function toRecord(row: ReferenceRow): CurrentForecastReferenceRecord {
  return {
    id: row.id,
    fundId: row.fund_id,
    calculationKey: row.calculation_key,
    fundSnapshotId: row.fund_snapshot_id,
    currentPlanVersionId: row.current_plan_version_id,
    financialFactsSnapshotId: row.financial_facts_snapshot_id,
    inputHash: row.input_hash,
    resultHash: row.result_hash,
    assumptionsHash: row.assumptions_hash,
    engineVersion: row.engine_version,
    methodologyVersion: row.methodology_version,
    candidate: row.candidate,
    supersededByReferenceId: row.superseded_by_reference_id,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export interface CreateCandidateCurrentForecastReferenceParams {
  fundId: number;
  basis: CurrentForecastReferenceBasis;
  idempotencyKey: string;
  reason?: string;
  createdBy?: number | null;
  /** Set by the rollback path so clones of different sources never replay each other. */
  sourceReferenceId?: number;
  database?: CurrentForecastReferenceDatabase;
}

/** Append-only create-candidate (`candidate = true`), idempotent via D13. */
export async function createCandidateCurrentForecastReference(
  params: CreateCandidateCurrentForecastReferenceParams
): Promise<{ row: CurrentForecastReferenceRecord; replayed: boolean }> {
  const database = params.database ?? db;
  const reason = params.reason ?? null;
  const createdBy = params.createdBy ?? null;
  const { basis } = params;

  const result = await runIdempotentCommand<CurrentForecastReferenceRecord>({
    db: database,
    fundId: params.fundId,
    idempotencyKey: params.idempotencyKey,
    contractVersion: CURRENT_FORECAST_REFERENCE_CONTRACT_VERSION,
    request: {
      fundId: params.fundId,
      contractVersion: CURRENT_FORECAST_REFERENCE_CONTRACT_VERSION,
      ...basis,
      reason,
      sourceReferenceId: params.sourceReferenceId ?? null,
    },
    insert: async (requestHash) => {
      const rows = await executeRows<ReferenceRow>(
        database,
        sql`
          INSERT INTO current_forecast_references
            (fund_id, calculation_key, fund_snapshot_id, current_plan_version_id,
             financial_facts_snapshot_id, input_hash, result_hash, assumptions_hash,
             engine_version, methodology_version, candidate, reason, created_by,
             idempotency_key, request_hash)
          VALUES
            (${params.fundId}, ${CURRENT_FORECAST_CALCULATION_KEY}, ${basis.fundSnapshotId},
             ${basis.currentPlanVersionId}, ${basis.financialFactsSnapshotId},
             ${basis.inputHash}, ${basis.resultHash}, ${basis.assumptionsHash},
             ${basis.engineVersion}, ${basis.methodologyVersion}, true, ${reason},
             ${createdBy}, ${params.idempotencyKey}, ${requestHash})
          ON CONFLICT (fund_id, idempotency_key) DO NOTHING
          RETURNING ${REFERENCE_COLUMNS}
        `
      );
      const row = rows[0];
      return row ? toRecord(row) : null;
    },
    loadExisting: async () => {
      const rows = await executeRows<ReferenceRow>(
        database,
        sql`
          SELECT ${REFERENCE_COLUMNS}
          FROM current_forecast_references
          WHERE fund_id = ${params.fundId}
            AND idempotency_key = ${params.idempotencyKey}
          LIMIT 1
        `
      );
      const row = rows[0];
      return row ? { row: toRecord(row), requestHash: row.request_hash } : null;
    },
  });

  return result;
}

async function loadReference(
  executor: Executor,
  fundId: number,
  referenceId: number
): Promise<CurrentForecastReferenceRecord | null> {
  const rows = await executeRows<ReferenceRow>(
    executor,
    sql`
      SELECT ${REFERENCE_COLUMNS}
      FROM current_forecast_references
      WHERE fund_id = ${fundId}
        AND id = ${referenceId}
      LIMIT 1
    `
  );
  const row = rows[0];
  return row ? toRecord(row) : null;
}

/**
 * The accepted served-pointer head: the single non-superseded, non-candidate
 * row per fund (armed by the accepted-head partial unique from cutover onward).
 */
export async function getAcceptedCurrentForecastReferenceHead(params: {
  fundId: number;
  database?: CurrentForecastReferenceDatabase;
}): Promise<CurrentForecastReferenceRecord | null> {
  const database = params.database ?? db;
  const rows = await executeRows<ReferenceRow>(
    database,
    sql`
      SELECT ${REFERENCE_COLUMNS}
      FROM current_forecast_references
      WHERE fund_id = ${params.fundId}
        AND superseded_by_reference_id IS NULL
        AND candidate = false
      LIMIT 1
    `
  );
  const row = rows[0];
  return row ? toRecord(row) : null;
}

type ModeRowForPointer = {
  id: number;
  configured_mode: string;
  kill_switch_active: boolean;
  activated_at: Date | string | null;
  cutover_reference_id: number | null;
  version: number;
};

async function lockCurrentForecastModeRow(
  executor: Executor,
  fundId: number
): Promise<ModeRowForPointer | null> {
  const rows = await executeRows<ModeRowForPointer>(
    executor,
    sql`
      SELECT id, configured_mode, kill_switch_active, activated_at,
             cutover_reference_id, version
      FROM fund_calculation_modes
      WHERE fund_id = ${fundId}
        AND calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}
      FOR UPDATE
    `
  );
  return rows[0] ?? null;
}

/** Supersede the current accepted head (if any) with the incoming reference. */
function supersedeAcceptedHead(executor: Executor, fundId: number, referenceId: number) {
  return executor.execute(sql`
    UPDATE current_forecast_references
    SET superseded_by_reference_id = ${referenceId}
    WHERE fund_id = ${fundId}
      AND candidate = false
      AND superseded_by_reference_id IS NULL
      AND id <> ${referenceId}
  `);
}

/**
 * Advance the LIVE served pointer (P1) — legal ONLY while the mode row is
 * effective `on` post-cutover. Supersedes the old head BEFORE flipping the new
 * one (the accepted-head partial unique is checked per statement).
 */
export async function advanceCurrentForecastPointer(params: {
  fundId: number;
  referenceId: number;
  actorId: number | null;
  database?: CurrentForecastReferenceDatabase;
}): Promise<{ cutoverReferenceId: number; version: number }> {
  const database = params.database ?? db;

  return database.transaction(async (tx) => {
    const mode = await lockCurrentForecastModeRow(tx, params.fundId);
    if (
      !mode ||
      mode.activated_at === null ||
      mode.configured_mode !== 'on' ||
      mode.kill_switch_active
    ) {
      throw new CurrentForecastReferenceError(
        409,
        'pointer_advance_requires_on',
        'The current-forecast served pointer only advances while the mode is effective on post-cutover.'
      );
    }

    const reference = await loadReference(tx, params.fundId, params.referenceId);
    if (!reference) {
      throw new CurrentForecastReferenceError(
        404,
        'reference_not_found',
        `current_forecast_references row ${params.referenceId} does not exist for fund ${params.fundId}.`
      );
    }
    if (reference.supersededByReferenceId !== null) {
      throw new CurrentForecastReferenceError(
        409,
        'reference_superseded',
        `Reference ${params.referenceId} is superseded and cannot become the served head.`
      );
    }
    if (mode.cutover_reference_id === reference.id) {
      return { cutoverReferenceId: reference.id, version: mode.version };
    }

    await supersedeAcceptedHead(tx, params.fundId, reference.id);
    await tx.execute(sql`
      UPDATE current_forecast_references
      SET candidate = false
      WHERE id = ${reference.id}
    `);
    const updated = await executeRows<{ cutover_reference_id: number; version: number }>(
      tx,
      sql`
        UPDATE fund_calculation_modes
        SET cutover_reference_id = ${reference.id},
            version = version + 1,
            updated_by = ${params.actorId},
            updated_at = NOW()
        WHERE id = ${mode.id}
        RETURNING cutover_reference_id, version
      `
    );
    const row = updated[0];
    if (!row) {
      throw new CurrentForecastReferenceError(
        409,
        'pointer_advance_conflict',
        'The current-forecast mode row disappeared during pointer advance.'
      );
    }
    return { cutoverReferenceId: row.cutover_reference_id, version: row.version };
  });
}

/**
 * Admin override/rollback (13.1-svc): clone an existing reference's basis and
 * hashes into a NEW candidate row (append-only — the ledger never rewrites
 * history). The clone re-enters the normal candidate lifecycle; it becomes the
 * served head only through pointer advance or activation.
 */
export async function createRollbackCurrentForecastReference(params: {
  fundId: number;
  sourceReferenceId: number;
  reason: string;
  idempotencyKey: string;
  createdBy: number | null;
  database?: CurrentForecastReferenceDatabase;
}): Promise<{ row: CurrentForecastReferenceRecord; replayed: boolean }> {
  const database = params.database ?? db;

  const source = await loadReference(database, params.fundId, params.sourceReferenceId);
  if (!source) {
    throw new CurrentForecastReferenceError(
      404,
      'reference_not_found',
      `current_forecast_references row ${params.sourceReferenceId} does not exist for fund ${params.fundId}.`
    );
  }

  return createCandidateCurrentForecastReference({
    fundId: params.fundId,
    basis: {
      fundSnapshotId: source.fundSnapshotId,
      currentPlanVersionId: source.currentPlanVersionId,
      financialFactsSnapshotId: source.financialFactsSnapshotId,
      inputHash: source.inputHash,
      resultHash: source.resultHash,
      assumptionsHash: source.assumptionsHash,
      engineVersion: source.engineVersion,
      methodologyVersion: source.methodologyVersion,
    },
    idempotencyKey: params.idempotencyKey,
    reason: params.reason,
    createdBy: params.createdBy,
    sourceReferenceId: params.sourceReferenceId,
    database,
  });
}
