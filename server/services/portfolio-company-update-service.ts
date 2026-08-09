import { sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import type {
  PortfolioCompanyMetadataPatchInput,
  PortfolioCompanyUpdateRequestInput,
} from '../../shared/schemas/portfolio-route';

export const PORTFOLIO_COMPANY_METADATA_UPDATE_ROUTE =
  'PATCH /api/portfolio-companies/:id?fundId=:fundId';

export type PortfolioCompanyUpdateDatabase = typeof db;
type PortfolioCompanyUpdateTransaction = Parameters<
  Parameters<PortfolioCompanyUpdateDatabase['transaction']>[0]
>[0];
type ExecuteResult<T> = { rows: T[] };

interface PortfolioCompanyRow {
  id: number;
  fund_id: number;
  name: string;
  sector: string;
  stage: string;
  current_stage: string | null;
  investment_amount: string | number;
  investment_date: Date | string | null;
  current_valuation: string | number | null;
  founded_year: number | null;
  status: string;
  description: string | null;
  deal_tags: string[] | null;
  created_at: Date | string | null;
  deployed_reserves_cents: number | string | null;
  planned_reserves_cents: number | string | null;
  exit_moic_bps: number | null;
  exit_probability: string | number | null;
  ownership_current_pct: string | number | null;
  allocation_cap_cents: number | string | null;
  allocation_reason: string | null;
  allocation_iteration: number;
  last_allocation_at: Date | string | null;
  allocation_version: number;
  row_version: number;
  updated_at: Date | string;
}

interface PortfolioCompanyUpdateReceiptRow {
  request_hash: string;
  response_name: string;
  response_sector: string;
  response_founded_year: number | null;
  response_description: string | null;
  response_deal_tags: string[] | null;
  response_status: number;
  response_row_version: number;
  response_updated_at: Date | string;
}

export interface PortfolioCompanyUpdateResponse {
  id: number;
  fundId: number;
  name: string;
  sector: string;
  foundedYear: number | null;
  description: string | null;
  dealTags: string[] | null;
  rowVersion: number;
  updatedAt: string;
}

export class PortfolioCompanyUpdateNotFoundError extends Error {
  readonly code = 'PORTFOLIO_COMPANY_NOT_FOUND';

  constructor(fundId: number, companyId: number) {
    super(`Portfolio company ${companyId} was not found in fund ${fundId}`);
    this.name = 'PortfolioCompanyUpdateNotFoundError';
  }
}

export class PortfolioCompanyUpdateVersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number
  ) {
    super(`Expected portfolio company version ${expectedVersion}, found ${actualVersion}`);
    this.name = 'PortfolioCompanyUpdateVersionConflictError';
  }
}

export class PortfolioCompanyUpdateIdempotencyReuseError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSE';

  constructor(readonly idempotencyKey: string) {
    super('Idempotency-Key was already used for a different portfolio company update request');
    this.name = 'PortfolioCompanyUpdateIdempotencyReuseError';
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toResponse(
  row: PortfolioCompanyRow,
  replayFields?: Pick<
    PortfolioCompanyUpdateReceiptRow,
    | 'response_name'
    | 'response_sector'
    | 'response_founded_year'
    | 'response_description'
    | 'response_deal_tags'
    | 'response_row_version'
    | 'response_updated_at'
  >
): PortfolioCompanyUpdateResponse {
  return {
    id: row.id,
    fundId: row.fund_id,
    name: replayFields ? replayFields.response_name : row.name,
    sector: replayFields ? replayFields.response_sector : row.sector,
    foundedYear: replayFields ? replayFields.response_founded_year : row.founded_year,
    description: replayFields ? replayFields.response_description : row.description,
    dealTags: replayFields ? replayFields.response_deal_tags : row.deal_tags,
    rowVersion: replayFields ? replayFields.response_row_version : row.row_version,
    updatedAt: toIsoString(replayFields ? replayFields.response_updated_at : row.updated_at),
  };
}

async function executeRows<T>(
  tx: Pick<PortfolioCompanyUpdateTransaction, 'execute'>,
  query: SQL
): Promise<T[]> {
  const result = (await tx.execute(query)) as ExecuteResult<T>;
  return result.rows;
}

function requestHashFor(params: {
  fundId: number;
  companyId: number;
  expectedVersion: number;
  patch: PortfolioCompanyMetadataPatchInput;
}): string {
  return canonicalSha256({
    route: PORTFOLIO_COMPANY_METADATA_UPDATE_ROUTE,
    fundId: params.fundId,
    companyId: params.companyId,
    expectedVersion: params.expectedVersion,
    patch: params.patch,
  });
}

function advisoryLockKey(params: {
  fundId: number;
  companyId: number;
  actorId: number;
  idempotencyKey: string;
}): string {
  return `portfolio-company-update:${params.fundId}:${params.companyId}:${params.actorId}:${params.idempotencyKey}`;
}

export async function updatePortfolioCompanyMetadata(params: {
  fundId: number;
  companyId: number;
  actorId: number;
  idempotencyKey: string;
  request: PortfolioCompanyUpdateRequestInput;
  database?: PortfolioCompanyUpdateDatabase;
}): Promise<{ response: PortfolioCompanyUpdateResponse; replayed: boolean }> {
  const database = params.database ?? db;
  const requestHash = requestHashFor({
    fundId: params.fundId,
    companyId: params.companyId,
    expectedVersion: params.request.expectedVersion,
    patch: params.request.patch,
  });

  return database.transaction(async (tx) => {
    const scopedCompany = await executeRows<{ id: number }>(
      tx,
      sql`
        SELECT id
        FROM portfoliocompanies
        WHERE id = ${params.companyId}
          AND fund_id = ${params.fundId}
        LIMIT 1
      `
    );
    if (!scopedCompany[0]) {
      throw new PortfolioCompanyUpdateNotFoundError(params.fundId, params.companyId);
    }

    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${advisoryLockKey(params)}, 0::bigint))`
    );

    const receipt = await executeRows<PortfolioCompanyUpdateReceiptRow>(
      tx,
      sql`
        SELECT request_hash, response_name, response_sector, response_founded_year,
               response_description, response_deal_tags, response_status,
               response_row_version, response_updated_at
        FROM portfolio_company_update_receipts
        WHERE fund_id = ${params.fundId}
          AND company_id = ${params.companyId}
          AND actor_id = ${params.actorId}
          AND idempotency_key = ${params.idempotencyKey}
        LIMIT 1
      `
    );
    const existingReceipt = receipt[0];
    if (existingReceipt && existingReceipt.request_hash !== requestHash) {
      throw new PortfolioCompanyUpdateIdempotencyReuseError(params.idempotencyKey);
    }

    if (existingReceipt) {
      return {
        response: toResponse(
          { id: params.companyId, fund_id: params.fundId } as PortfolioCompanyRow,
          existingReceipt
        ),
        replayed: true,
      };
    }

    const currentRows = await executeRows<PortfolioCompanyRow>(
      tx,
      sql`
        SELECT *
        FROM portfoliocompanies
        WHERE id = ${params.companyId}
          AND fund_id = ${params.fundId}
        FOR UPDATE
      `
    );
    const current = currentRows[0];
    if (!current) {
      throw new PortfolioCompanyUpdateNotFoundError(params.fundId, params.companyId);
    }

    const patch = params.request.patch;
    const updatedRows = await executeRows<PortfolioCompanyRow>(
      tx,
      sql`
        UPDATE portfoliocompanies
        SET name = CASE WHEN ${patch.name !== undefined} THEN ${patch.name ?? null} ELSE name END,
            sector = CASE WHEN ${patch.sector !== undefined} THEN ${patch.sector ?? null} ELSE sector END,
            founded_year = CASE
              WHEN ${patch.foundedYear !== undefined} THEN ${patch.foundedYear ?? null}
              ELSE founded_year
            END,
            description = CASE
              WHEN ${patch.description !== undefined} THEN ${patch.description ?? null}
              ELSE description
            END,
            deal_tags = CASE
              WHEN ${patch.dealTags !== undefined} THEN ${patch.dealTags ?? null}
              ELSE deal_tags
            END,
            row_version = row_version + 1,
            updated_at = clock_timestamp()
        WHERE id = ${params.companyId}
          AND fund_id = ${params.fundId}
          AND row_version = ${params.request.expectedVersion}
        RETURNING *
      `
    );
    const updated = updatedRows[0];
    if (!updated) {
      throw new PortfolioCompanyUpdateVersionConflictError(
        params.request.expectedVersion,
        current.row_version
      );
    }

    const response = toResponse(updated);
    await tx.execute(sql`
      INSERT INTO portfolio_company_update_receipts
        (fund_id, company_id, actor_id, idempotency_key, request_hash,
         response_name, response_sector, response_founded_year, response_description,
         response_deal_tags, response_status, response_row_version, response_updated_at)
      VALUES
        (${params.fundId}, ${params.companyId}, ${params.actorId}, ${params.idempotencyKey},
         ${requestHash}, ${updated.name}, ${updated.sector}, ${updated.founded_year},
         ${updated.description}, ${updated.deal_tags ?? null}, 200,
         ${updated.row_version}, ${updated.updated_at})
    `);

    return { response, replayed: false };
  });
}
