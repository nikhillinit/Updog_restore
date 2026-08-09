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
  response_status: number;
  response_row_version: number;
  response_updated_at: Date | string;
}

export interface PortfolioCompanyUpdateResponse {
  id: number;
  fundId: number;
  name: string;
  sector: string;
  stage: string;
  currentStage: string | null;
  investmentAmount: string | number;
  investmentDate: string | null;
  currentValuation: string | number | null;
  foundedYear: number | null;
  status: string;
  description: string | null;
  dealTags: string[] | null;
  createdAt: string | null;
  deployedReservesCents: number | string | null;
  plannedReservesCents: number | string | null;
  exitMoicBps: number | null;
  exitProbability: string | number | null;
  ownershipCurrentPct: string | number | null;
  allocationCapCents: number | string | null;
  allocationReason: string | null;
  allocationIteration: number;
  lastAllocationAt: string | null;
  allocationVersion: number;
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

function optionalIsoString(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}

function toResponse(
  row: PortfolioCompanyRow,
  replayFields?: { rowVersion: number; updatedAt: Date | string }
): PortfolioCompanyUpdateResponse {
  return {
    id: row.id,
    fundId: row.fund_id,
    name: row.name,
    sector: row.sector,
    stage: row.stage,
    currentStage: row.current_stage,
    investmentAmount: row.investment_amount,
    investmentDate: optionalIsoString(row.investment_date),
    currentValuation: row.current_valuation,
    foundedYear: row.founded_year,
    status: row.status,
    description: row.description,
    dealTags: row.deal_tags,
    createdAt: optionalIsoString(row.created_at),
    deployedReservesCents: row.deployed_reserves_cents,
    plannedReservesCents: row.planned_reserves_cents,
    exitMoicBps: row.exit_moic_bps,
    exitProbability: row.exit_probability,
    ownershipCurrentPct: row.ownership_current_pct,
    allocationCapCents: row.allocation_cap_cents,
    allocationReason: row.allocation_reason,
    allocationIteration: row.allocation_iteration,
    lastAllocationAt: optionalIsoString(row.last_allocation_at),
    allocationVersion: row.allocation_version,
    rowVersion: replayFields?.rowVersion ?? row.row_version,
    updatedAt: toIsoString(replayFields?.updatedAt ?? row.updated_at),
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
        SELECT request_hash, response_status, response_row_version, response_updated_at
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

    if (existingReceipt) {
      return {
        response: toResponse(current, {
          rowVersion: existingReceipt.response_row_version,
          updatedAt: existingReceipt.response_updated_at,
        }),
        replayed: true,
      };
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
         response_status, response_row_version, response_updated_at)
      VALUES
        (${params.fundId}, ${params.companyId}, ${params.actorId}, ${params.idempotencyKey},
         ${requestHash}, 200, ${updated.row_version}, ${updated.updated_at})
    `);

    return { response, replayed: false };
  });
}
