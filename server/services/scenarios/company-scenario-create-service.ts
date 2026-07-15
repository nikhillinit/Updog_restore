import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod/v4';

import { db } from '../../db';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';

const COMPANY_SCENARIO_CREATE_ROUTE = 'POST /api/companies/:companyId/scenarios';

type CompanyScenarioCreateDatabase = typeof db;
type CompanyScenarioCreateTransaction = Parameters<
  Parameters<CompanyScenarioCreateDatabase['transaction']>[0]
>[0];
type ExecuteResult<T> = { rows: T[] };

const CompanyScenarioCreateResponseSchema = z
  .object({
    scenario: z
      .object({
        id: z.string().uuid(),
        name: z.string(),
        version: z.number().int(),
        updatedAt: z.string().datetime(),
        isLocked: z.boolean(),
        caseCount: z.number().int().nonnegative(),
      })
      .strict(),
    replay: z.boolean(),
  })
  .strict();

export type CompanyScenarioCreateResponse = z.infer<typeof CompanyScenarioCreateResponseSchema>;

export class CompanyScenarioCreateIdempotencyConflictError extends Error {
  readonly code = 'idempotency_conflict';

  constructor() {
    super(
      'Idempotency-Key is already associated with another company scenario creation request'
    );
    this.name = 'CompanyScenarioCreateIdempotencyConflictError';
  }
}

export class CompanyScenarioCreateInProgressError extends Error {
  readonly code = 'idempotency_request_in_progress';

  constructor() {
    super('Company scenario creation request is still in progress');
    this.name = 'CompanyScenarioCreateInProgressError';
  }
}

export class CompanyScenarioCreateScopeError extends Error {
  readonly code = 'company_scope_mismatch';

  constructor() {
    super('Company was not found in the resolved fund');
    this.name = 'CompanyScenarioCreateScopeError';
  }
}

function requestHashFor(params: {
  fundId: number;
  companyId: number;
  name: string;
  description: string | null;
}): string {
  return canonicalSha256({
    route: COMPANY_SCENARIO_CREATE_ROUTE,
    fundId: params.fundId,
    companyId: params.companyId,
    name: params.name,
    description: params.description,
  });
}

async function executeRows<T>(
  tx: Pick<CompanyScenarioCreateTransaction, 'execute'>,
  query: SQL
): Promise<T[]> {
  const result = (await tx.execute(query)) as ExecuteResult<T>;
  return result.rows;
}

function responseFromLedger(value: unknown): CompanyScenarioCreateResponse {
  const parsed: unknown = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  const response = CompanyScenarioCreateResponseSchema.parse(parsed);
  return { ...response, replay: true };
}

async function claimOrReplay(params: {
  tx: CompanyScenarioCreateTransaction;
  fundId: number;
  companyId: number;
  idempotencyKey: string;
  requestHash: string;
  actorId: number | null;
}): Promise<{ claimed: true } | { claimed: false; response: CompanyScenarioCreateResponse }> {
  const claimed = await executeRows<{ id: number }>(
    params.tx,
    sql`
      INSERT INTO company_scenario_create_requests
        (fund_id, company_id, idempotency_key, request_hash, created_by, status)
      VALUES
        (${params.fundId}, ${params.companyId}, ${params.idempotencyKey}, ${params.requestHash}, ${params.actorId}, 'pending')
      ON CONFLICT (fund_id, idempotency_key) DO NOTHING
      RETURNING id
    `
  );

  if (claimed.length > 0) {
    return { claimed: true };
  }

  const existing = await executeRows<{
    request_hash: string;
    response_status: number | null;
    response_body: unknown;
    status: 'pending' | 'completed';
  }>(
    params.tx,
    sql`
      SELECT request_hash, response_status, response_body, status
      FROM company_scenario_create_requests
      WHERE fund_id = ${params.fundId}
        AND idempotency_key = ${params.idempotencyKey}
      LIMIT 1
    `
  );

  const row = existing[0];
  if (!row) {
    throw new Error('Idempotency claim conflict did not return a scenario creation request');
  }
  if (row.request_hash !== params.requestHash) {
    throw new CompanyScenarioCreateIdempotencyConflictError();
  }
  if (row.status !== 'completed' || row.response_status !== 201 || row.response_body === null) {
    throw new CompanyScenarioCreateInProgressError();
  }

  return { claimed: false, response: responseFromLedger(row.response_body) };
}

export async function createCompanyScenario(params: {
  fundId: number;
  companyId: number;
  name: string;
  description: string | null;
  idempotencyKey: string;
  actorId: number | null;
  database?: CompanyScenarioCreateDatabase;
}): Promise<CompanyScenarioCreateResponse> {
  const database = params.database ?? db;
  const requestHash = requestHashFor(params);

  return database.transaction(async (tx) => {
    const scopedCompany = await executeRows<{ id: number }>(
      tx,
      sql`
        SELECT id
        FROM portfoliocompanies
        WHERE id = ${params.companyId}
          AND fund_id = ${params.fundId}
        FOR UPDATE
      `
    );
    if (!scopedCompany[0]) {
      throw new CompanyScenarioCreateScopeError();
    }

    const claim = await claimOrReplay({ ...params, tx, requestHash });
    if (!claim.claimed) {
      return claim.response;
    }

    const insertedRows = await executeRows<{
      id: string;
      name: string;
      version: number;
      updated_at: Date | string;
      locked_at: Date | string | null;
    }>(
      tx,
      sql`
        INSERT INTO scenarios (company_id, name, description, version, is_default)
        VALUES (${params.companyId}, ${params.name}, ${params.description}, 1, false)
        RETURNING id, name, version, updated_at, locked_at
      `
    );

    const inserted = insertedRows[0];
    if (!inserted) {
      throw new Error('Scenario creation did not return the inserted scenario');
    }

    const response = CompanyScenarioCreateResponseSchema.parse({
      scenario: {
        id: inserted.id,
        name: inserted.name,
        version: inserted.version,
        updatedAt:
          inserted.updated_at instanceof Date
            ? inserted.updated_at.toISOString()
            : new Date(inserted.updated_at).toISOString(),
        isLocked: inserted.locked_at !== null,
        caseCount: 0,
      },
      replay: false,
    });

    await tx.execute(sql`
      INSERT INTO scenario_audit_logs
        (user_id, entity_type, entity_id, action, diff, timestamp)
      VALUES
        (${params.actorId === null ? null : String(params.actorId)}, 'scenario', ${inserted.id}, 'CREATE', NULL, NOW())
    `);

    await tx.execute(sql`
      UPDATE company_scenario_create_requests
      SET scenario_id = ${inserted.id},
          status = 'completed',
          response_status = 201,
          response_body = ${JSON.stringify(response)}::jsonb,
          updated_at = NOW()
      WHERE fund_id = ${params.fundId}
        AND idempotency_key = ${params.idempotencyKey}
    `);

    return response;
  });
}
