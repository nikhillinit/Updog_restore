import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';

import { AllocationCompanyActualsDriftV1Schema } from '@shared/contracts/allocations/allocation-actuals-drift-v1.contract';
import type { FundCompanyActualsFactsResponse } from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { funds, portfolioCompanies } from '@shared/schema';
import { db } from '../../db';
import { logger } from '../../lib/logger.js';
import { storage } from '../../storage';
import {
  buildAllocationActualsDrift,
  buildFailedAllocationActualsDrift,
} from './allocation-actuals-drift-service.js';
import {
  buildFundCompanyActualsFacts,
  FundActualsFactsServiceError,
} from '../fund-actuals/fund-company-actuals-facts-service.js';
import {
  companyListCursorPredicate,
  compareCompanyListRows,
  encodeCompanyListCursor,
  isAfterCompanyListCursor,
  type CompanyListCursor,
  type CompanyListSortBy,
} from './company-list-cursor.js';

const LatestAllocationActualsDriftSummarySchema = z
  .object({
    facts_status: z.enum(['available', 'failed']),
    drifted_company_count: z.number().int().nonnegative(),
    material_company_count: z.number().int().nonnegative(),
    degraded_company_count: z.number().int().nonnegative(),
    facts_input_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    as_of_date: z.string().date(),
  })
  .strict();

const LatestAllocationCompanySchema = z
  .object({
    company_id: z.number().int().positive(),
    company_name: z.string(),
    sector: z.string(),
    stage: z.string(),
    status: z.string(),
    invested_amount_cents: z.number().int(),
    planned_reserves_cents: z.number().int(),
    deployed_reserves_cents: z.number().int(),
    allocation_cap_cents: z.number().int().nullable(),
    allocation_reason: z.string().nullable(),
    allocation_version: z.number().int().nonnegative(),
    last_allocation_at: z.string().datetime().nullable(),
    allocation_facts_missing: z.boolean(),
    missing_allocation_fields: z.array(z.string()),
    actuals_drift: AllocationCompanyActualsDriftV1Schema,
  })
  .strict();

const LatestAllocationResponseSchema = z
  .object({
    fund_id: z.number().int().positive(),
    companies: z.array(LatestAllocationCompanySchema),
    metadata: z
      .object({
        total_planned_cents: z.number().int(),
        total_deployed_cents: z.number().int(),
        companies_count: z.number().int().nonnegative(),
        allocation_facts_missing_count: z.number().int().nonnegative(),
        last_updated_at: z.string().datetime().nullable(),
        actuals_drift_summary: LatestAllocationActualsDriftSummarySchema,
      })
      .strict(),
  })
  .strict();

export interface CompanyListItem {
  id: number;
  fundId: number;
  name: string;
  sector: string;
  stage: string;
  status: 'active' | 'exited' | 'written-off';
  invested_cents: number;
  deployed_reserves_cents: number;
  planned_reserves_cents: number;
  exit_moic_bps: number | null;
  ownership_pct: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
  last_allocation_at: string | null;
}

interface CompanyListSourceRow {
  id: number;
  fundId: number | null;
  name: string;
  sector: string;
  stage: string;
  status: string | null;
  investmentAmount: string | number | null;
  deployedReservesCents?: number | bigint | null;
  plannedReservesCents?: number | bigint | null;
  exitMoicBps?: number | null;
  ownershipCurrentPct?: string | number | null;
  allocationCapCents?: number | bigint | null;
  allocationReason?: string | null;
  lastAllocationAt?: Date | string | null;
}

export interface CompanyListResponse {
  companies: CompanyListItem[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
    total_count?: number;
  };
}

export interface CompanyListReadInput {
  fundId: number;
  cursor?: CompanyListCursor;
  limit: number;
  q?: string;
  status?: CompanyListItem['status'];
  sector?: string;
  stage?: string;
  sortBy: CompanyListSortBy;
}

export type CompanyListReadResult =
  | { kind: 'not_found' }
  | { kind: 'ok'; response: CompanyListResponse };

function normalizeCompanyListStatus(status: string | null | undefined): CompanyListItem['status'] {
  return status === 'exited' || status === 'written-off' ? status : 'active';
}

function isoDateOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function companyListItemFromRow(row: CompanyListSourceRow, fundId: number): CompanyListItem {
  return {
    id: row.id,
    fundId: row.fundId ?? fundId,
    name: row.name,
    sector: row.sector,
    stage: row.stage,
    status: normalizeCompanyListStatus(row.status),
    invested_cents: Math.round(parseFloat(String(row.investmentAmount ?? '0')) * 100),
    deployed_reserves_cents: Number(row.deployedReservesCents ?? 0),
    planned_reserves_cents: Number(row.plannedReservesCents ?? 0),
    exit_moic_bps: row.exitMoicBps ?? null,
    ownership_pct: parseFloat(String(row.ownershipCurrentPct ?? '0')),
    allocation_cap_cents: row.allocationCapCents != null ? Number(row.allocationCapCents) : null,
    allocation_reason: row.allocationReason ?? null,
    last_allocation_at: isoDateOrNull(row.lastAllocationAt),
  };
}

async function loadAllocationActualsFacts(input: {
  fundId: number;
  asOfDate: string;
  requestId: string;
}): Promise<FundCompanyActualsFactsResponse | null> {
  try {
    return await buildFundCompanyActualsFacts({
      fundId: input.fundId,
      asOfDate: input.asOfDate,
    });
  } catch (error) {
    logger.warn(
      {
        requestId: input.requestId,
        fundId: input.fundId,
        errorCode:
          error instanceof FundActualsFactsServiceError ? error.code : 'unexpected_facts_error',
        error: error instanceof Error ? error.message : String(error),
      },
      'actuals facts unavailable for latest allocation read'
    );
    return null;
  }
}

function missingAllocationFields(row: {
  planned_reserves_cents: number | bigint | string | null;
  deployed_reserves_cents: number | bigint | string | null;
  allocation_version: number | null;
}): string[] {
  const fields: string[] = [];
  if (row.planned_reserves_cents == null) fields.push('planned_reserves_cents');
  if (row.deployed_reserves_cents == null) fields.push('deployed_reserves_cents');
  if (row.allocation_version == null) fields.push('allocation_version');
  return fields;
}

export class AllocationReadService {
  async listCompanies(input: CompanyListReadInput): Promise<CompanyListReadResult> {
    const { fundId } = input;

    if (storage.kind === 'memory') {
      const storedAll = await storage.getPortfolioCompanies(fundId);

      if (storedAll.length === 0 && input.cursor === undefined) {
        return { kind: 'not_found' };
      }

      const sorted = storedAll
        .filter((company) => {
          if (input.cursor && !isAfterCompanyListCursor(company, input.cursor, input.sortBy)) {
            return false;
          }
          if (input.status && normalizeCompanyListStatus(company.status) !== input.status) {
            return false;
          }
          if (input.sector && company.sector !== input.sector) {
            return false;
          }
          if (input.stage && company.stage !== input.stage) {
            return false;
          }
          if (input.q && !company.name.toLowerCase().includes(input.q.toLowerCase())) {
            return false;
          }
          return true;
        })
        .sort((left, right) => compareCompanyListRows(left, right, input.sortBy));

      const hasMore = sorted.length > input.limit;
      const page = hasMore ? sorted.slice(0, input.limit) : sorted;
      const nextCursor =
        hasMore && page.length > 0
          ? encodeCompanyListCursor(page[page.length - 1]!, input.sortBy)
          : null;

      return {
        kind: 'ok',
        response: {
          companies: page.map((company) => companyListItemFromRow(company, fundId)),
          pagination: {
            next_cursor: nextCursor,
            has_more: hasMore,
          },
        },
      };
    }

    const conditions: SQL[] = [eq(portfolioCompanies.fundId, fundId)];

    if (input.cursor !== undefined) {
      conditions.push(companyListCursorPredicate(input.cursor, input.sortBy));
    }
    if (input.status) {
      conditions.push(eq(portfolioCompanies.status, input.status));
    }
    if (input.sector) {
      conditions.push(eq(portfolioCompanies.sector, input.sector));
    }
    if (input.stage) {
      conditions.push(eq(portfolioCompanies.stage, input.stage));
    }
    if (input.q) {
      conditions.push(sql`LOWER(${portfolioCompanies.name}) LIKE LOWER(${`%${input.q}%`})`);
    }

    let orderBy;
    switch (input.sortBy) {
      case 'exit_moic_desc':
        orderBy = [
          sql`${portfolioCompanies.exitMoicBps} DESC NULLS LAST`,
          desc(portfolioCompanies.id),
        ];
        break;
      case 'planned_reserves_desc':
        orderBy = [desc(portfolioCompanies.plannedReservesCents), desc(portfolioCompanies.id)];
        break;
      case 'name_asc':
        orderBy = [asc(portfolioCompanies.name), desc(portfolioCompanies.id)];
        break;
      default:
        orderBy = [
          sql`${portfolioCompanies.exitMoicBps} DESC NULLS LAST`,
          desc(portfolioCompanies.id),
        ];
    }

    const results = await db
      .select({
        id: portfolioCompanies.id,
        fundId: portfolioCompanies.fundId,
        name: portfolioCompanies.name,
        sector: portfolioCompanies.sector,
        stage: portfolioCompanies.stage,
        status: portfolioCompanies.status,
        investmentAmount: portfolioCompanies.investmentAmount,
        deployedReservesCents: portfolioCompanies.deployedReservesCents,
        plannedReservesCents: portfolioCompanies.plannedReservesCents,
        exitMoicBps: portfolioCompanies.exitMoicBps,
        ownershipCurrentPct: portfolioCompanies.ownershipCurrentPct,
        allocationCapCents: portfolioCompanies.allocationCapCents,
        allocationReason: portfolioCompanies.allocationReason,
        lastAllocationAt: portfolioCompanies.lastAllocationAt,
      })
      .from(portfolioCompanies)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(input.limit + 1);

    const hasMore = results.length > input.limit;
    const companies = hasMore ? results.slice(0, input.limit) : results;
    const nextCursor =
      hasMore && companies.length > 0
        ? encodeCompanyListCursor(companies[companies.length - 1]!, input.sortBy)
        : null;
    const responseCompanies = companies.map((row) => companyListItemFromRow(row, fundId));

    if (responseCompanies.length === 0 && input.cursor === undefined) {
      const fundCheck = await db
        .select({ count: sql<number>`count(*)` })
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.fundId, fundId));

      if ((fundCheck[0]?.count || 0) === 0) {
        return { kind: 'not_found' };
      }
    }

    return {
      kind: 'ok',
      response: {
        companies: responseCompanies,
        pagination: {
          next_cursor: nextCursor,
          has_more: hasMore,
        },
      },
    };
  }

  async getLatest(input: { fundId: number; requestId: string }) {
    const { fundId } = input;
    const [fund] = await db
      .select({ id: funds.id })
      .from(funds)
      .where(eq(funds.id, fundId))
      .limit(1);

    if (!fund) {
      return null;
    }

    const rows = await db
      .select({
        company_id: portfolioCompanies.id,
        company_name: portfolioCompanies.name,
        sector: portfolioCompanies.sector,
        stage: portfolioCompanies.stage,
        status: portfolioCompanies.status,
        invested_amount: portfolioCompanies.investmentAmount,
        planned_reserves_cents: portfolioCompanies.plannedReservesCents,
        deployed_reserves_cents: portfolioCompanies.deployedReservesCents,
        allocation_cap_cents: portfolioCompanies.allocationCapCents,
        allocation_reason: portfolioCompanies.allocationReason,
        allocation_version: portfolioCompanies.allocationVersion,
        last_allocation_at: portfolioCompanies.lastAllocationAt,
      })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, fundId))
      .orderBy(asc(portfolioCompanies.id));

    const asOfDate = new Date().toISOString().slice(0, 10);
    const actualsFacts = await loadAllocationActualsFacts({
      fundId,
      asOfDate,
      requestId: input.requestId,
    });
    const factsByCompanyId = new Map(
      actualsFacts?.facts.map((fact) => [fact.companyId, fact]) ?? []
    );

    const companies = rows.map((row) => {
      const missingFields = missingAllocationFields(row);
      const plannedReservesCents =
        row.planned_reserves_cents != null ? Number(row.planned_reserves_cents) : 0;
      const deployedReservesCents =
        row.deployed_reserves_cents != null ? Number(row.deployed_reserves_cents) : 0;
      const allocationVersion = row.allocation_version ?? 0;
      const driftAllocationVersion = allocationVersion > 0 ? allocationVersion : 1;
      const driftInput = {
        allocation: {
          companyId: row.company_id,
          deployedReservesCents,
          investmentAmount: row.invested_amount || '0',
          allocationVersion: driftAllocationVersion,
          lastAllocationAt: row.last_allocation_at,
        },
        asOfDate,
      };
      const actualsDrift =
        actualsFacts === null
          ? buildFailedAllocationActualsDrift(driftInput)
          : buildAllocationActualsDrift({
              ...driftInput,
              fact: factsByCompanyId.get(row.company_id) ?? null,
            });

      return {
        company_id: row.company_id,
        company_name: row.company_name,
        sector: row.sector,
        stage: row.stage,
        status: row.status,
        invested_amount_cents: Math.round(parseFloat(row.invested_amount || '0') * 100),
        planned_reserves_cents: plannedReservesCents,
        deployed_reserves_cents: deployedReservesCents,
        allocation_cap_cents:
          row.allocation_cap_cents != null ? Number(row.allocation_cap_cents) : null,
        allocation_reason: row.allocation_reason,
        allocation_version: allocationVersion,
        last_allocation_at: row.last_allocation_at ? row.last_allocation_at.toISOString() : null,
        allocation_facts_missing: missingFields.length > 0,
        missing_allocation_fields: missingFields,
        actuals_drift: actualsDrift,
      };
    });

    const total_planned_cents = companies.reduce((sum, company) => {
      return sum + company.planned_reserves_cents;
    }, 0);
    const total_deployed_cents = companies.reduce((sum, company) => {
      return sum + company.deployed_reserves_cents;
    }, 0);
    const last_updated_at =
      companies
        .map((company) => company.last_allocation_at)
        .filter((date): date is string => date !== null)
        .sort()
        .reverse()[0] || null;

    return LatestAllocationResponseSchema.parse({
      fund_id: fundId,
      companies,
      metadata: {
        total_planned_cents,
        total_deployed_cents,
        companies_count: companies.length,
        allocation_facts_missing_count: companies.filter(
          (company) => company.allocation_facts_missing
        ).length,
        last_updated_at,
        actuals_drift_summary: {
          facts_status: actualsFacts === null ? 'failed' : 'available',
          drifted_company_count: companies.filter((company) =>
            company.actuals_drift.comparisons.some((comparison) => comparison.state === 'drifted')
          ).length,
          material_company_count: companies.filter((company) =>
            company.actuals_drift.comparisons.some((comparison) => comparison.material)
          ).length,
          degraded_company_count: companies.filter(
            (company) => company.actuals_drift.trustState !== 'LIVE'
          ).length,
          facts_input_hash: actualsFacts?.inputHash ?? null,
          as_of_date: asOfDate,
        },
      },
    });
  }
}

export const allocationReadService = new AllocationReadService();
