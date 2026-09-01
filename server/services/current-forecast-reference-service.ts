import { createHash } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import { runIdempotentCommand } from '../lib/idempotent-command';
import { runInTransaction, runWithTransactionFallback } from '../lib/transaction-support';
import { CURRENT_FORECAST_CALCULATION_KEY } from './current-forecast-calc-mode-resolver';
import { lockCurrentForecastFund } from './current-forecast-fund-lock';
import {
  FundCalculationModeIdempotencyConflictError,
  FundCalculationModeInProgressError,
  FundCalculationModeVersionConflictError,
} from './fund-calculation-mode-errors';

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
type CurrentForecastReferenceTransaction = Parameters<
  Parameters<CurrentForecastReferenceDatabase['transaction']>[0]
>[0];
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
  const basisHash = createHash('sha256')
    .update(`${params.inputHash}:${params.resultHash}`)
    .digest('hex');
  return `cfref:${params.fundId}:${basisHash}`;
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

  const result = await runWithTransactionFallback<
    CurrentForecastReferenceDatabase,
    CurrentForecastReferenceTransaction,
    { row: CurrentForecastReferenceRecord; replayed: boolean }
  >(database, async (executor) =>
    runIdempotentCommand<CurrentForecastReferenceRecord>({
      // The candidate insert is ON CONFLICT-idempotent. In neon-http fallback
      // mode this callback runs against the plain executor with autocommit.
      db: executor,
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
          executor,
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
          executor,
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
    })
  );

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
 * Fund-scoped reference lookup by id for the held serving lane (13.2, P1):
 * `held` loads EXACTLY the pointer head named by `cutover_reference_id`,
 * never a latest-accepted query.
 */
export async function getCurrentForecastReferenceById(params: {
  fundId: number;
  referenceId: number;
  database?: CurrentForecastReferenceDatabase;
}): Promise<CurrentForecastReferenceRecord | null> {
  return loadReference(params.database ?? db, params.fundId, params.referenceId);
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
  shadow_started_at: Date | string | null;
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
             cutover_reference_id, shadow_started_at, version
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
 *
 * Class (b) under ADR-073: the guard-fenced single-statement CTE cannot
 * deliver the serial-order-equivalent both-succeed contract — under READ
 * COMMITTED the losing statement's supersede CTE filters the new head on its
 * pre-commit snapshot (candidate still true), so lock-wait re-evaluation
 * never rescues it and the loser would surface a contract-violating 409
 * (proven by the neon-lane concurrency test). Per the plan's pre-authorized
 * escalation, this path keeps its callback transaction; the surface-scoped
 * driver switch (server/db.ts) makes it work on Vercel.
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

export const CURRENT_FORECAST_ACTIVATE_ROUTE =
  'POST /api/admin/funds/:fundId/current-forecast/activate';

export class CurrentForecastActivationBlockedError extends Error {
  readonly code = 'activation_blocked';

  constructor(readonly blockers: string[]) {
    super(`current-forecast activation is blocked: ${blockers.join(', ')}`);
    this.name = 'CurrentForecastActivationBlockedError';
  }
}

export type VerifyGreenCandidateFn = (params: {
  executor: Executor;
  fundId: number;
  reference: CurrentForecastReferenceRecord;
}) => Promise<string[]>;

/**
 * Default green-candidate verification against the durable ledgers: the
 * reference must still be a live candidate, a fund-owned CURRENT_FORECAST_V2
 * snapshot must exist, the exact basis hash must have a green shadow `match`
 * replay, and the fund's latest decisive shadow observation must be an
 * available+match replay. Non-decisive unavailable/indicative observations are
 * intentionally skipped; a later decisive success supersedes an earlier
 * failure.
 */
export const verifyGreenCandidateWithLedger: VerifyGreenCandidateFn = async ({
  executor,
  fundId,
  reference,
}) => {
  const blockers: string[] = [];

  if (!reference.candidate || reference.supersededByReferenceId !== null) {
    blockers.push('activation_requires_green_candidate');
  }

  const snapshots = await executeRows<{ id: number }>(
    executor,
    sql`
      SELECT id
      FROM fund_snapshots
      WHERE fund_id = ${fundId}
        AND type = 'CURRENT_FORECAST_V2'
      LIMIT 1
    `
  );
  if (snapshots.length === 0) {
    blockers.push('current_forecast_snapshot_missing');
  }

  const matches = await executeRows<{ reconciliation_status: string }>(
    executor,
    sql`
      SELECT reconciliation_status
      FROM substrate_shadow_reconciliations
      WHERE fund_id = ${fundId}
        AND calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}
        AND input_hash = ${reference.inputHash}
        AND result_hash = ${reference.resultHash}
      LIMIT 1
    `
  );
  if (matches[0]?.reconciliation_status !== 'match') {
    blockers.push('shadow_green_required');
  }

  const latestDecisive = await executeRows<{
    substrate_state: string;
    reconciliation_status: string;
  }>(
    executor,
    sql`
      SELECT substrate_state, reconciliation_status
      FROM substrate_shadow_reconciliations
      WHERE fund_id = ${fundId}
        AND calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}
        AND (
          substrate_state = 'failed'
          OR (
            substrate_state = 'available'
            AND reconciliation_status IN ('match', 'mismatch')
          )
        )
      ORDER BY observed_at DESC, id DESC
      LIMIT 1
    `
  );
  const latest = latestDecisive[0];
  if (
    latest !== undefined &&
    (latest.substrate_state !== 'available' || latest.reconciliation_status !== 'match')
  ) {
    blockers.push('unexplained_divergence_present');
  }

  return blockers;
};

type ManualRecomputeLedgerRow = {
  status: string;
  started_at: Date | string;
  created_reconciliation: boolean;
  reconciliation_observed_at: Date | string | null;
};

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Phase 4 manual-run prohibition, machine-enforced at the latch (F_1.11.0 P0b
 * item 4). The fund is contaminated when any manual recompute command started
 * at or after the shadow interval began, or when a command that created its
 * current-forecast reconciliation row wrote it at or after that point (a
 * command that started before the transition but persisted after it). Status
 * is irrelevant: pending, completed, failed, and skipped attempts all count.
 * A NULL `shadow_started_at` leaves the interval unbounded, so any command
 * row for the fund blocks (fail-closed).
 */
export async function verifyNoManualRecomputeSinceShadowStart(params: {
  executor: Executor;
  fundId: number;
  shadowStartedAt: Date | string | null;
}): Promise<string[]> {
  // ponytail: loads every command row for the fund and filters in process;
  // push the interval predicate into SQL if this admin-only ledger ever grows.
  const rows = await executeRows<ManualRecomputeLedgerRow>(
    params.executor,
    sql`
      SELECT command.status,
             command.started_at,
             command.created_reconciliation,
             reconciliation.observed_at AS reconciliation_observed_at
      FROM current_forecast_recompute_commands AS command
      LEFT JOIN substrate_shadow_reconciliations AS reconciliation
        ON reconciliation.id = command.shadow_reconciliation_id
       AND reconciliation.fund_id = command.fund_id
       AND reconciliation.calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}
      WHERE command.fund_id = ${params.fundId}
    `
  );
  if (params.shadowStartedAt === null) {
    return rows.length > 0 ? ['manual_recompute_since_shadow_start'] : [];
  }

  const shadowStart = toTime(params.shadowStartedAt);
  const contaminated = rows.some(
    (row) =>
      toTime(row.started_at) >= shadowStart ||
      (row.created_reconciliation &&
        row.reconciliation_observed_at !== null &&
        toTime(row.reconciliation_observed_at) >= shadowStart)
  );
  return contaminated ? ['manual_recompute_since_shadow_start'] : [];
}

export interface CurrentForecastActivationResponse {
  calculationKey: string;
  configuredMode: 'on';
  activatedAt: string;
  cutoverReferenceId: number;
  version: number;
}

type ActivationLedgerRow = {
  request_hash: string;
  response_body: unknown;
  status: 'pending' | 'completed';
};

type ActivationMutationResult = {
  mode_exists: boolean;
  version_matches: boolean;
  actual_version: number | null;
  activated_at: Date | string | null;
  kill_switch_active: boolean;
  reference_exists: boolean;
  reference_eligible: boolean;
  existing_request_id: number | null;
  mode_write_id: number | null;
  claim_id: number | null;
  claim_response_body: unknown;
};

function activationResponseFromLedger(value: unknown): CurrentForecastActivationResponse {
  const parsed: unknown = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { calculationKey?: unknown }).calculationKey === CURRENT_FORECAST_CALCULATION_KEY &&
    (parsed as { configuredMode?: unknown }).configuredMode === 'on'
  ) {
    const response = parsed as CurrentForecastActivationResponse;
    // The ledger stores activatedAt as Postgres's jsonb timestamptz rendering
    // (microseconds, +00:00 offset); the API contract is canonical
    // Date.toISOString() form. Normalize on every read path.
    return { ...response, activatedAt: new Date(response.activatedAt).toISOString() };
  }
  throw new Error('Completed current-forecast activation ledger row has an invalid response body');
}

type ActivationReplay = { response: CurrentForecastActivationResponse; replayed: true };

async function readActivationRequest(
  executor: Executor,
  fundId: number,
  idempotencyKey: string,
  requestHash: string
): Promise<ActivationReplay | null> {
  const existing = await executeRows<ActivationLedgerRow>(
    executor,
    sql`
      SELECT request_hash, response_body, status
      FROM fund_calculation_mode_requests
      WHERE fund_id = ${fundId}::integer
        AND calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}::text
        AND idempotency_key = ${idempotencyKey}::text
      LIMIT 1
    `
  );
  const row = existing[0];
  if (!row) return null;
  if (row.request_hash !== requestHash) {
    throw new FundCalculationModeIdempotencyConflictError(
      'Idempotency-Key reused with a different current-forecast activation request'
    );
  }
  if (row.status !== 'completed' || row.response_body === null) {
    throw new FundCalculationModeInProgressError();
  }
  return { response: activationResponseFromLedger(row.response_body), replayed: true };
}

export interface ActivateCurrentForecastParams {
  fundId: number;
  referenceId: number;
  expectedVersion: number;
  idempotencyKey: string;
  actorId: number | null;
  database?: CurrentForecastReferenceDatabase;
  verifyGreenCandidate?: VerifyGreenCandidateFn;
}

/**
 * Activation critical section: typed pre-checks, blockers, and the
 * guard-fenced flip CTE on one transaction executor. The per-fund advisory
 * lock is taken first, so the manual-recompute claim (which takes the same
 * lock) can never land between the blocker read and the flip. The CTE still
 * repeats the mode, latch, and candidate guards while holding the mode-row
 * lock before any mutation.
 */
async function activateCurrentForecastUnderGuards(
  executor: Executor,
  params: Omit<ActivateCurrentForecastParams, 'database' | 'verifyGreenCandidate'>,
  requestHash: string,
  verifyGreenCandidate: VerifyGreenCandidateFn
): Promise<ActivationMutationResult | ActivationReplay> {
  await lockCurrentForecastFund(executor, params.fundId);
  // A same-key caller that waited on the lock must replay the outcome the
  // winner committed, not trip the version check on the flipped row.
  const replay = await readActivationRequest(
    executor,
    params.fundId,
    params.idempotencyKey,
    requestHash
  );
  if (replay) return replay;

  const mode = await lockCurrentForecastModeRow(executor, params.fundId);
  if (!mode) {
    throw new FundCalculationModeVersionConflictError(params.expectedVersion, 0);
  }
  if (mode.version !== params.expectedVersion) {
    throw new FundCalculationModeVersionConflictError(params.expectedVersion, mode.version);
  }
  if (mode.activated_at !== null) {
    throw new CurrentForecastReferenceError(
      409,
      'already_activated',
      `Fund ${params.fundId} current-forecast is already activated.`
    );
  }

  const reference = await loadReference(executor, params.fundId, params.referenceId);
  if (!reference) {
    throw new CurrentForecastReferenceError(
      404,
      'reference_not_found',
      `current_forecast_references row ${params.referenceId} does not exist for fund ${params.fundId}.`
    );
  }

  const blockers = [
    ...(mode.kill_switch_active ? ['kill_switch_active'] : []),
    ...(await verifyGreenCandidate({ executor, fundId: params.fundId, reference })),
    ...(await verifyNoManualRecomputeSinceShadowStart({
      executor,
      fundId: params.fundId,
      shadowStartedAt: mode.shadow_started_at,
    })),
  ];
  if (blockers.length > 0) {
    throw new CurrentForecastActivationBlockedError(blockers);
  }

  const rows = await executeRows<ActivationMutationResult>(
    executor,
    sql`
      WITH mode_row AS (
        SELECT id, version, activated_at, kill_switch_active
        FROM fund_calculation_modes
        WHERE fund_id = ${params.fundId}::integer
          AND calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}::text
        FOR UPDATE
      ),
      mode_guard AS (
        SELECT
          mode_row.id AS mode_id,
          mode_row.version AS actual_version,
          mode_row.activated_at,
          mode_row.kill_switch_active,
          true::boolean AS mode_exists,
          (mode_row.version = ${params.expectedVersion}::integer) AS version_matches,
          (mode_row.activated_at IS NULL) AS latch_open,
          reference_row.id AS reference_id,
          (reference_row.id IS NOT NULL) AS reference_exists,
          (
            reference_row.id IS NOT NULL
            AND reference_row.candidate
            AND reference_row.superseded_by_reference_id IS NULL
          ) AS reference_eligible
        FROM mode_row
        LEFT JOIN current_forecast_references AS reference_row
          ON reference_row.fund_id = ${params.fundId}::integer
         AND reference_row.id = ${params.referenceId}::integer
        UNION ALL
        SELECT
          NULL::integer,
          NULL::integer,
          NULL::timestamptz,
          false::boolean,
          false::boolean,
          false::boolean,
          false::boolean,
          NULL::integer,
          false::boolean,
          false::boolean
        FROM (SELECT 1) AS missing
        WHERE NOT EXISTS (SELECT 1 FROM mode_row)
      ),
      existing_request AS (
        SELECT id
        FROM fund_calculation_mode_requests
        WHERE fund_id = ${params.fundId}::integer
          AND calculation_key = ${CURRENT_FORECAST_CALCULATION_KEY}::text
          AND idempotency_key = ${params.idempotencyKey}::text
      ),
      supersede AS (
        UPDATE current_forecast_references AS old_head
        SET superseded_by_reference_id = guard.reference_id
        FROM mode_guard AS guard
        WHERE guard.mode_exists
          AND guard.version_matches
          AND guard.latch_open
          AND NOT guard.kill_switch_active
          AND guard.reference_eligible
          AND NOT EXISTS (SELECT 1 FROM existing_request)
          AND old_head.fund_id = ${params.fundId}::integer
          AND old_head.candidate = false
          AND old_head.superseded_by_reference_id IS NULL
          AND old_head.id <> guard.reference_id
        RETURNING old_head.id AS superseded_id
      ),
      supersede_ready AS (
        SELECT superseded_id
        FROM supersede
        UNION ALL
        SELECT NULL::integer AS superseded_id
        FROM mode_guard AS guard
        WHERE guard.mode_exists
          AND guard.version_matches
          AND guard.latch_open
          AND NOT guard.kill_switch_active
          AND guard.reference_eligible
          AND NOT EXISTS (SELECT 1 FROM existing_request)
          AND NOT EXISTS (
            SELECT 1
            FROM current_forecast_references AS old_head
            WHERE old_head.fund_id = ${params.fundId}::integer
              AND old_head.candidate = false
              AND old_head.superseded_by_reference_id IS NULL
              AND old_head.id <> guard.reference_id
          )
      ),
      candidate_flip AS (
        UPDATE current_forecast_references AS target
        SET candidate = false
        FROM supersede_ready
        CROSS JOIN mode_guard AS guard
        WHERE guard.mode_exists
          AND guard.version_matches
          AND guard.latch_open
          AND NOT guard.kill_switch_active
          AND guard.reference_eligible
          AND NOT EXISTS (SELECT 1 FROM existing_request)
          AND target.fund_id = ${params.fundId}::integer
          AND target.id = guard.reference_id
          AND target.candidate
          AND target.superseded_by_reference_id IS NULL
        RETURNING target.id AS reference_id, guard.mode_id
      ),
      mode_write AS (
        UPDATE fund_calculation_modes AS mode
        SET configured_mode = 'on',
            activated_at = NOW(),
            cutover_reference_id = flip.reference_id,
            version = mode.version + 1,
            updated_by = ${params.actorId}::integer,
            updated_at = NOW()
        FROM candidate_flip AS flip
        WHERE mode.id = flip.mode_id
        RETURNING mode.id, mode.cutover_reference_id, mode.version, mode.activated_at
      ),
      claim AS (
        INSERT INTO fund_calculation_mode_requests
          (fund_id, calculation_key, idempotency_key, request_hash, created_by,
           status, response_status, response_body)
        SELECT
          ${params.fundId}::integer,
          ${CURRENT_FORECAST_CALCULATION_KEY}::text,
          ${params.idempotencyKey}::text,
          ${requestHash}::text,
          ${params.actorId}::integer,
          'completed',
          200,
          jsonb_build_object(
            'calculationKey', ${CURRENT_FORECAST_CALCULATION_KEY}::text,
            'configuredMode', 'on'::text,
            'activatedAt', mode_write.activated_at,
            'cutoverReferenceId', mode_write.cutover_reference_id,
            'version', mode_write.version
          )
        FROM mode_write
        ON CONFLICT (fund_id, calculation_key, idempotency_key) DO NOTHING
        RETURNING id, response_body
      )
      SELECT
        guard.mode_exists,
        guard.version_matches,
        guard.actual_version,
        guard.activated_at,
        guard.kill_switch_active,
        guard.reference_exists,
        guard.reference_eligible,
        (SELECT id FROM existing_request) AS existing_request_id,
        mode_write.id AS mode_write_id,
        claim.id AS claim_id,
        claim.response_body AS claim_response_body
      FROM mode_guard AS guard
      LEFT JOIN mode_write ON TRUE
      LEFT JOIN claim ON TRUE
    `
  );
  const mutation = rows[0];
  if (!mutation) {
    throw new Error('Current-forecast activation CTE returned no guard result');
  }
  return mutation;
}

/**
 * The DORMANT activation command (executed only by Task 23). One atomic
 * transaction validates a green candidate then writes mode `on` +
 * `activated_at` + `cutover_reference_id` AND flips the chosen candidate to
 * `candidate = false` (P2) — arming the accepted-head partial unique. The mode
 * route never writes `on` for this key; only this command does, so the
 * activation event is by construction written in the same transaction. This
 * is a one-way latch: a fresh-key repeat returns 409 (`already_activated`),
 * while a same-key retry replays 200. Pointer advance and rollback are never
 * recovery mechanisms; post-activation recovery clears held controls only.
 *
 * The blocker check and the flip share one transaction under the per-fund
 * advisory lock (F_1.11.0 P0b item 4), so the `manual_recompute_since_shadow_start`
 * blocker is evaluated immediately before the flip with no claim window in
 * between. Activation therefore requires a transactional driver (ADR-073
 * class (b), reclassified by ADR-096); on neon-http the driver's transaction
 * error propagates before any statement runs.
 */
export async function activateCurrentForecast(
  params: ActivateCurrentForecastParams
): Promise<{ response: CurrentForecastActivationResponse; replayed: boolean }> {
  const database = params.database ?? db;
  const verifyGreenCandidate = params.verifyGreenCandidate ?? verifyGreenCandidateWithLedger;
  const requestHash = canonicalSha256({
    route: CURRENT_FORECAST_ACTIVATE_ROUTE,
    fundId: params.fundId,
    referenceId: params.referenceId,
    expectedVersion: params.expectedVersion,
  });

  const replay = await readActivationRequest(
    database,
    params.fundId,
    params.idempotencyKey,
    requestHash
  );
  if (replay) return replay;

  const outcome = await runInTransaction(database, (tx) =>
    activateCurrentForecastUnderGuards(tx, params, requestHash, verifyGreenCandidate)
  );
  if ('replayed' in outcome) return outcome;

  const mutation = outcome;
  if (mutation.mode_write_id !== null && mutation.claim_id !== null) {
    return {
      response: activationResponseFromLedger(mutation.claim_response_body),
      replayed: false,
    };
  }

  const concurrentReplay = await readActivationRequest(
    database,
    params.fundId,
    params.idempotencyKey,
    requestHash
  );
  if (concurrentReplay) return concurrentReplay;

  if (!mutation.mode_exists || !mutation.version_matches) {
    throw new FundCalculationModeVersionConflictError(
      params.expectedVersion,
      mutation.actual_version ?? 0
    );
  }
  if (mutation.activated_at !== null) {
    throw new CurrentForecastReferenceError(
      409,
      'already_activated',
      `Fund ${params.fundId} current-forecast is already activated.`
    );
  }
  if (!mutation.reference_exists) {
    throw new CurrentForecastReferenceError(
      404,
      'reference_not_found',
      `current_forecast_references row ${params.referenceId} does not exist for fund ${params.fundId}.`
    );
  }
  if (mutation.kill_switch_active) {
    throw new CurrentForecastActivationBlockedError(['kill_switch_active']);
  }
  if (!mutation.reference_eligible) {
    throw new CurrentForecastActivationBlockedError(['activation_requires_green_candidate']);
  }
  throw new CurrentForecastReferenceError(
    409,
    'activation_conflict',
    'The current-forecast mode row disappeared during activation.'
  );
}
