import { sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import { invalidateH9Artifacts } from './h9-artifact-invalidation-service';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';

const MOIC_INPUT_ROUTE = 'PUT /api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId';

type FundMoicInputDatabase = typeof db;
type FundMoicInputTransaction = Parameters<Parameters<FundMoicInputDatabase['transaction']>[0]>[0];
type ExecuteResult<T> = { rows: T[] };

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

async function claimOrReplay(params: {
  tx: FundMoicInputTransaction;
  fundId: number;
  companyId: number;
  idempotencyKey: string;
  requestHash: string;
  actorId: number | null;
}): Promise<{ claimed: true } | { claimed: false; response: FundMoicInputUpdateResponse }> {
  const claimed = await executeRows<{ id: number }>(
    params.tx,
    sql`
      INSERT INTO fund_moic_input_update_requests
        (fund_id, company_id, idempotency_key, request_hash, created_by, status)
      VALUES
        (${params.fundId}, ${params.companyId}, ${params.idempotencyKey}, ${params.requestHash}, ${params.actorId}, 'pending')
      ON CONFLICT (fund_id, company_id, idempotency_key) DO NOTHING
      RETURNING id
    `
  );

  if (claimed.length > 0) {
    return { claimed: true };
  }

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
    throw new Error('Idempotency claim conflict did not return an existing MOIC input request');
  }
  if (row.request_hash !== params.requestHash) {
    throw new FundMoicInputIdempotencyConflictError(
      'Idempotency-Key reused with a different MOIC input update request'
    );
  }
  if (row.status !== 'completed' || row.response_body === null) {
    throw new FundMoicInputInProgressError();
  }

  return { claimed: false, response: responseFromLedger(row.response_body) };
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

  const result = await database.transaction(async (tx) => {
    const claim = await claimOrReplay({ ...params, tx, requestHash });
    if (!claim.claimed) {
      return { response: claim.response, replayed: true };
    }

    const lockedRows = await executeRows<{ allocation_version: number }>(
      tx,
      sql`
        SELECT allocation_version
        FROM portfoliocompanies
        WHERE fund_id = ${params.fundId}
          AND id = ${params.companyId}
        FOR UPDATE
      `
    );

    const locked = lockedRows[0];
    if (!locked) {
      throw new FundMoicInputNotFoundError(params.fundId, params.companyId);
    }
    if (locked.allocation_version !== params.expectedVersion) {
      throw new FundMoicInputVersionConflictError(
        params.expectedVersion,
        locked.allocation_version
      );
    }

    const updatedRows = await executeRows<{
      allocation_version: number;
      exit_probability: string | number | null;
      exit_moic_bps: number | null;
    }>(
      tx,
      sql`
        UPDATE portfoliocompanies
        SET exit_probability = ${params.exitProbability},
            exit_moic_bps = ${params.exitMoicBps},
            allocation_version = allocation_version + 1,
            last_allocation_at = NOW()
        WHERE fund_id = ${params.fundId}
          AND id = ${params.companyId}
          AND allocation_version = ${params.expectedVersion}
        RETURNING allocation_version, exit_probability, exit_moic_bps
      `
    );

    const updated = updatedRows[0];
    if (!updated) {
      throw new FundMoicInputVersionConflictError(
        params.expectedVersion,
        locked.allocation_version
      );
    }

    const response: FundMoicInputUpdateResponse = {
      fundId: params.fundId,
      companyId: params.companyId,
      allocationVersion: updated.allocation_version,
      exitProbability: updated.exit_probability === null ? null : Number(updated.exit_probability),
      exitMoicBps: updated.exit_moic_bps,
    };

    await tx.execute(sql`
      INSERT INTO fund_events
        (fund_id, event_type, payload, user_id, event_time, operation, entity_type, metadata)
      VALUES (
        ${params.fundId},
        'MOIC_INPUTS_UPDATED',
        ${JSON.stringify({
          companyId: params.companyId,
          exitProbability: params.exitProbability,
          exitMoicBps: params.exitMoicBps,
          allocationVersion: response.allocationVersion,
        })}::jsonb,
        ${params.actorId},
        NOW(),
        'UPDATE',
        'portfolio_company_moic_inputs',
        ${JSON.stringify({ route: MOIC_INPUT_ROUTE })}::jsonb
      )
    `);

    await tx.execute(sql`
      UPDATE fund_moic_input_update_requests
      SET status = 'completed',
          response_status = 200,
          response_body = ${JSON.stringify(response)}::jsonb
      WHERE fund_id = ${params.fundId}
        AND company_id = ${params.companyId}
        AND idempotency_key = ${params.idempotencyKey}
    `);

    return { response, replayed: false };
  });
  if (!result.replayed) {
    await invalidateH9Artifacts(params.fundId);
  }
  return result;
}
