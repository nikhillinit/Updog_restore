import { sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import { invalidateH9Artifacts } from './h9-artifact-invalidation-service';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';

const MOIC_INPUT_ROUTE = 'PUT /api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId';

type FundMoicInputDatabase = typeof db;
type FundMoicInputTransaction = Parameters<Parameters<FundMoicInputDatabase['transaction']>[0]>[0];
type ExecuteResult<T> = { rows: T[] };
type MoicInputMutationResult = {
  company_exists: boolean;
  actual_version: number | null;
  existing_request_id: number | null;
  claim_id: number | null;
  response_body: unknown;
};

export interface FundMoicInputUpdateResponse {
  fundId: number;
  companyId: number;
  allocationVersion: number;
  exitProbability: number | null;
  exitMoicBps: number | null;
}

export class FundMoicInputNotFoundError extends Error {
  readonly code = 'moic_input_not_found';

  constructor(fundId: number, companyId: number) {
    super(`Portfolio company ${companyId} was not found in fund ${fundId}`);
    this.name = 'FundMoicInputNotFoundError';
  }
}

export class FundMoicInputVersionConflictError extends Error {
  readonly code = 'stale_expected_version';

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number
  ) {
    super(`Expected allocation version ${expectedVersion}, found ${actualVersion}`);
    this.name = 'FundMoicInputVersionConflictError';
  }
}

export class FundMoicInputIdempotencyConflictError extends Error {
  readonly code = 'idempotency_conflict';

  constructor(message: string) {
    super(message);
    this.name = 'FundMoicInputIdempotencyConflictError';
  }
}

export class FundMoicInputInProgressError extends Error {
  readonly code = 'idempotency_request_in_progress';

  constructor() {
    super('Idempotent MOIC input update is still in progress');
    this.name = 'FundMoicInputInProgressError';
  }
}

function requestHashFor(params: {
  fundId: number;
  companyId: number;
  expectedVersion: number;
  exitProbability: number | null;
  exitMoicBps: number | null;
}): string {
  return canonicalSha256({
    route: MOIC_INPUT_ROUTE,
    fundId: params.fundId,
    companyId: params.companyId,
    expectedVersion: params.expectedVersion,
    exitProbability: params.exitProbability,
    exitMoicBps: params.exitMoicBps,
  });
}

async function executeRows<T>(
  tx: Pick<FundMoicInputTransaction, 'execute'>,
  query: SQL
): Promise<T[]> {
  const result = (await tx.execute(query)) as ExecuteResult<T>;
  return result.rows;
}

function responseFromLedger(value: unknown): FundMoicInputUpdateResponse {
  const parsed: unknown = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    typeof (parsed as { fundId?: unknown }).fundId === 'number' &&
    typeof (parsed as { companyId?: unknown }).companyId === 'number' &&
    typeof (parsed as { allocationVersion?: unknown }).allocationVersion === 'number'
  ) {
    return parsed as FundMoicInputUpdateResponse;
  }

  throw new Error('Completed MOIC input idempotency row has an invalid response body');
}

async function readMoicInputRequest(params: {
  tx: Pick<FundMoicInputTransaction, 'execute'>;
  fundId: number;
  companyId: number;
  idempotencyKey: string;
  requestHash: string;
}): Promise<{ response: FundMoicInputUpdateResponse; replayed: true } | null> {
  const existing = await executeRows<{
    request_hash: string;
    response_body: unknown;
    status: 'pending' | 'completed';
  }>(
    params.tx,
    sql`
      SELECT request_hash, response_body, status
      FROM fund_moic_input_update_requests
      WHERE fund_id = ${params.fundId}
        AND company_id = ${params.companyId}
        AND idempotency_key = ${params.idempotencyKey}
      LIMIT 1
    `
  );

  const row = existing[0];
  if (!row) {
    return null;
  }
  if (row.request_hash !== params.requestHash) {
    throw new FundMoicInputIdempotencyConflictError(
      'Idempotency-Key reused with a different MOIC input update request'
    );
  }
  if (row.status !== 'completed' || row.response_body === null) {
    throw new FundMoicInputInProgressError();
  }

  return { response: responseFromLedger(row.response_body), replayed: true };
}

export async function updateFundMoicInputs(params: {
  fundId: number;
  companyId: number;
  expectedVersion: number;
  exitProbability: number | null;
  exitMoicBps: number | null;
  idempotencyKey: string;
  actorId: number | null;
  database?: FundMoicInputDatabase;
}): Promise<{ response: FundMoicInputUpdateResponse; replayed: boolean }> {
  const database = params.database ?? db;
  const requestHash = requestHashFor(params);

  const result = await (async (tx: FundMoicInputDatabase) => {
    const rows = await executeRows<MoicInputMutationResult>(
      tx,
      sql`
        WITH company_row AS (
          SELECT id, allocation_version
          FROM portfoliocompanies
          WHERE fund_id = ${params.fundId}
            AND id = ${params.companyId}
          FOR UPDATE
        ),
        company_guard AS (
          SELECT id, allocation_version, true::boolean AS company_exists
          FROM company_row
          UNION ALL
          SELECT NULL::integer, NULL::integer, false::boolean
          FROM (SELECT 1) AS missing
          WHERE NOT EXISTS (SELECT 1 FROM company_row)
        ),
        existing_request AS (
          SELECT id
          FROM fund_moic_input_update_requests
          WHERE fund_id = ${params.fundId}
            AND company_id = ${params.companyId}
            AND idempotency_key = ${params.idempotencyKey}
        ),
        updated_company AS (
          UPDATE portfoliocompanies AS company
          SET exit_probability = ${params.exitProbability}::numeric,
              exit_moic_bps = ${params.exitMoicBps}::integer,
              allocation_version = company.allocation_version + 1,
              last_allocation_at = NOW()
          FROM company_guard
          WHERE company_guard.company_exists
            AND NOT EXISTS (SELECT 1 FROM existing_request)
            AND company.id = company_guard.id
            AND company.fund_id = ${params.fundId}
            AND company.allocation_version = ${params.expectedVersion}
          RETURNING company.allocation_version, company.exit_probability, company.exit_moic_bps
        ),
        event_insert AS (
          INSERT INTO fund_events
            (fund_id, event_type, payload, user_id, event_time, operation, entity_type, metadata)
          SELECT
            ${params.fundId}::integer,
            'MOIC_INPUTS_UPDATED',
            jsonb_build_object(
              'companyId', ${params.companyId}::integer,
              'exitProbability', updated_company.exit_probability,
              'exitMoicBps', updated_company.exit_moic_bps,
              'allocationVersion', updated_company.allocation_version
            ),
            ${params.actorId}::integer,
            NOW(),
            'UPDATE',
            'portfolio_company_moic_inputs',
            jsonb_build_object('route', ${MOIC_INPUT_ROUTE}::text)
          FROM updated_company
          RETURNING id
        ),
        claim AS (
          INSERT INTO fund_moic_input_update_requests
            (fund_id, company_id, idempotency_key, request_hash, created_by,
             status, response_status, response_body)
          SELECT
            ${params.fundId}::integer,
            ${params.companyId}::integer,
            ${params.idempotencyKey},
            ${requestHash},
            ${params.actorId}::integer,
            'completed',
            200,
            jsonb_build_object(
              'fundId', ${params.fundId}::integer,
              'companyId', ${params.companyId}::integer,
              'allocationVersion', updated_company.allocation_version,
              'exitProbability', updated_company.exit_probability,
              'exitMoicBps', updated_company.exit_moic_bps
            )
          FROM updated_company
          JOIN event_insert ON TRUE
          ON CONFLICT (fund_id, company_id, idempotency_key) DO NOTHING
          RETURNING id, response_body
        )
        SELECT
          company_guard.company_exists,
          company_guard.allocation_version AS actual_version,
          (SELECT id FROM existing_request) AS existing_request_id,
          claim.id AS claim_id,
          claim.response_body
        FROM company_guard
        LEFT JOIN claim ON TRUE
      `
    );

    const mutation = rows[0];
    if (!mutation) {
      throw new Error('MOIC input update CTE returned no guard result');
    }

    if (mutation.claim_id !== null) {
      return { response: responseFromLedger(mutation.response_body), replayed: false };
    }

    // No mutation happened. Same-key request rows (pre-existing or committed
    // by a concurrent winner) resolve via the ledger replay contract first.
    const replay = await readMoicInputRequest({
      tx,
      fundId: params.fundId,
      companyId: params.companyId,
      idempotencyKey: params.idempotencyKey,
      requestHash,
    });
    if (replay) {
      return replay;
    }

    if (!mutation.company_exists) {
      throw new FundMoicInputNotFoundError(params.fundId, params.companyId);
    }
    if (mutation.actual_version !== params.expectedVersion) {
      throw new FundMoicInputVersionConflictError(
        params.expectedVersion,
        mutation.actual_version ?? params.expectedVersion + 1
      );
    }
    // Guard passed and no same-key row exists: a concurrent writer won the
    // race between our statement's guard read and its write re-check.
    throw new FundMoicInputVersionConflictError(params.expectedVersion, params.expectedVersion + 1);
  })(database);
  if (!result.replayed) {
    await invalidateH9Artifacts(params.fundId);
  }
  return result;
}
