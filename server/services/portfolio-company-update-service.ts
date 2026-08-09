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
  response_id: number;
  response_fund_id: number;
  response_name: string;
  response_sector: string;
  response_stage: string;
  response_current_stage: string | null;
  response_investment_amount: string | number;
  response_investment_date: Date | string | null;
  response_current_valuation: string | number | null;
  response_founded_year: number | null;
  response_company_status: string;
  response_description: string | null;
  response_deal_tags: string[] | null;
  response_created_at: Date | string | null;
  response_deployed_reserves_cents: number | string | null;
  response_planned_reserves_cents: number | string | null;
  response_exit_moic_bps: number | null;
  response_exit_probability: string | number | null;
  response_ownership_current_pct: string | number | null;
  response_allocation_cap_cents: number | string | null;
  response_allocation_reason: string | null;
  response_allocation_iteration: number;
  response_last_allocation_at: Date | string | null;
  response_allocation_version: number;
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

function nullableIsoString(value: Date | string | null): string | null {
  return value == null ? null : toIsoString(value);
}

function toResponse(
  row: PortfolioCompanyRow,
  replayFields?: PortfolioCompanyUpdateReceiptRow
): PortfolioCompanyUpdateResponse {
  return {
    id: replayFields ? replayFields.response_id : row.id,
    fundId: replayFields ? replayFields.response_fund_id : row.fund_id,
    name: replayFields ? replayFields.response_name : row.name,
    sector: replayFields ? replayFields.response_sector : row.sector,
    stage: replayFields ? replayFields.response_stage : row.stage,
    currentStage: replayFields ? replayFields.response_current_stage : row.current_stage,
    investmentAmount: replayFields
      ? replayFields.response_investment_amount
      : row.investment_amount,
    investmentDate: nullableIsoString(
      replayFields ? replayFields.response_investment_date : row.investment_date
    ),
    currentValuation: replayFields
      ? replayFields.response_current_valuation
      : row.current_valuation,
    foundedYear: replayFields ? replayFields.response_founded_year : row.founded_year,
    status: replayFields ? replayFields.response_company_status : row.status,
    description: replayFields ? replayFields.response_description : row.description,
    dealTags: replayFields ? replayFields.response_deal_tags : row.deal_tags,
    createdAt: nullableIsoString(replayFields ? replayFields.response_created_at : row.created_at),
    deployedReservesCents: replayFields
      ? replayFields.response_deployed_reserves_cents
      : row.deployed_reserves_cents,
    plannedReservesCents: replayFields
      ? replayFields.response_planned_reserves_cents
      : row.planned_reserves_cents,
    exitMoicBps: replayFields ? replayFields.response_exit_moic_bps : row.exit_moic_bps,
    exitProbability: replayFields
      ? replayFields.response_exit_probability
      : row.exit_probability,
    ownershipCurrentPct: replayFields
      ? replayFields.response_ownership_current_pct
      : row.ownership_current_pct,
    allocationCapCents: replayFields
      ? replayFields.response_allocation_cap_cents
      : row.allocation_cap_cents,
    allocationReason: replayFields
      ? replayFields.response_allocation_reason
      : row.allocation_reason,
    allocationIteration: replayFields
      ? replayFields.response_allocation_iteration
      : row.allocation_iteration,
    lastAllocationAt: nullableIsoString(
      replayFields ? replayFields.response_last_allocation_at : row.last_allocation_at
    ),
    allocationVersion: replayFields
      ? replayFields.response_allocation_version
      : row.allocation_version,
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
        SELECT request_hash, response_id, response_fund_id, response_name, response_sector,
               response_stage, response_current_stage, response_investment_amount,
               response_investment_date, response_current_valuation, response_founded_year,
               response_company_status, response_description, response_deal_tags,
               response_created_at, response_deployed_reserves_cents,
               response_planned_reserves_cents, response_exit_moic_bps,
               response_exit_probability, response_ownership_current_pct,
               response_allocation_cap_cents, response_allocation_reason,
               response_allocation_iteration, response_last_allocation_at,
               response_allocation_version, response_status, response_row_version,
               response_updated_at
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
    const responseDealTags =
      updated.deal_tags == null ? null : JSON.stringify(updated.deal_tags);
    await tx.execute(sql`
      INSERT INTO portfolio_company_update_receipts
        (fund_id, company_id, actor_id, idempotency_key, request_hash,
         response_id, response_fund_id, response_name, response_sector, response_stage,
         response_current_stage, response_investment_amount, response_investment_date,
         response_current_valuation, response_founded_year, response_company_status,
         response_description, response_deal_tags, response_created_at,
         response_deployed_reserves_cents, response_planned_reserves_cents,
         response_exit_moic_bps, response_exit_probability, response_ownership_current_pct,
         response_allocation_cap_cents, response_allocation_reason,
         response_allocation_iteration, response_last_allocation_at,
         response_allocation_version, response_status, response_row_version, response_updated_at)
      VALUES
        (${params.fundId}, ${params.companyId}, ${params.actorId}, ${params.idempotencyKey},
         ${requestHash}, ${updated.id}, ${updated.fund_id}, ${updated.name}, ${updated.sector},
         ${updated.stage}, ${updated.current_stage}, ${updated.investment_amount},
         ${updated.investment_date}, ${updated.current_valuation}, ${updated.founded_year},
         ${updated.status}, ${updated.description}, ${responseDealTags},
         ${updated.created_at}, ${updated.deployed_reserves_cents},
         ${updated.planned_reserves_cents}, ${updated.exit_moic_bps},
         ${updated.exit_probability}, ${updated.ownership_current_pct},
         ${updated.allocation_cap_cents}, ${updated.allocation_reason},
         ${updated.allocation_iteration}, ${updated.last_allocation_at},
         ${updated.allocation_version}, 200,
         ${updated.row_version}, ${updated.updated_at})
    `);

    return { response, replayed: false };
  });
}
