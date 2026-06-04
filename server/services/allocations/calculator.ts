import { Decimal } from '@shared/lib/decimal-config';

import { InvalidAllocationRowError } from './calculator.errors';
import type {
  AllocationCompanyListItem,
  AllocationCompanySourceRow,
  AllocationCompanyStatus,
  CompanyListResponse,
  LatestAllocationCompany,
  LatestAllocationResponse,
  LatestAllocationSourceRow,
} from './calculator.types';

/**
 * Dark allocation service extraction.
 *
 * This module is intentionally pure: no Express req/res, no DB, no storage,
 * no schema imports, no logger, and no side effects. Keep it unimported from
 * server/routes/allocations.ts until the Milestone 6 wiring cutover.
 *
 * Cutover note: this service intentionally uses Decimal half-up cent rounding
 * and fail-fast row id validation. The current route still uses
 * Math.round(parseFloat(...)) and passes through DB ids, so Milestone 6 wiring
 * must update route contract expectations for cent-edge rows and translate
 * InvalidAllocationRowError at the route boundary.
 */

function centsFromDollarAmount(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0;
  return Number(new Decimal(String(value)).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
}

function numberFromNullable(value: number | bigint | string | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function nullableNumber(value: number | bigint | string | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

export function missingAllocationFields(row: {
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

export function normalizeCompanyListStatus(
  status: string | null | undefined
): AllocationCompanyStatus {
  return status === 'exited' || status === 'written-off' ? status : 'active';
}

export function isoDateOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function companyListItemFromRow(
  row: AllocationCompanySourceRow,
  fundId: number
): AllocationCompanyListItem {
  if (!Number.isSafeInteger(row.id) || row.id <= 0) {
    throw new InvalidAllocationRowError('Company row id must be a positive safe integer');
  }

  return {
    id: row.id,
    fundId: row.fundId ?? fundId,
    name: row.name,
    sector: row.sector,
    stage: row.stage,
    status: normalizeCompanyListStatus(row.status),
    invested_cents: centsFromDollarAmount(row.investmentAmount),
    deployed_reserves_cents: numberFromNullable(row.deployedReservesCents),
    planned_reserves_cents: numberFromNullable(row.plannedReservesCents),
    exit_moic_bps: row.exitMoicBps ?? null,
    ownership_pct: Number(row.ownershipCurrentPct ?? 0),
    allocation_cap_cents: nullableNumber(row.allocationCapCents),
    allocation_reason: row.allocationReason ?? null,
    last_allocation_at: isoDateOrNull(row.lastAllocationAt),
  };
}

export function buildCompanyListResponse(
  rows: readonly AllocationCompanySourceRow[],
  fundId: number,
  limit: number
): CompanyListResponse {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const companies = page.map((row) => companyListItemFromRow(row, fundId));
  const last = companies[companies.length - 1];

  return {
    companies,
    pagination: {
      next_cursor: hasMore && last ? String(last.id) : null,
      has_more: hasMore,
    },
  };
}

export function latestAllocationCompanyFromRow(
  row: LatestAllocationSourceRow
): LatestAllocationCompany {
  const missingFields = missingAllocationFields(row);

  return {
    company_id: row.company_id,
    company_name: row.company_name,
    sector: row.sector,
    stage: row.stage,
    status: row.status,
    invested_amount_cents: centsFromDollarAmount(row.invested_amount),
    planned_reserves_cents: numberFromNullable(row.planned_reserves_cents),
    deployed_reserves_cents: numberFromNullable(row.deployed_reserves_cents),
    allocation_cap_cents: nullableNumber(row.allocation_cap_cents),
    allocation_reason: row.allocation_reason,
    allocation_version: row.allocation_version ?? 0,
    last_allocation_at: isoDateOrNull(row.last_allocation_at),
    allocation_facts_missing: missingFields.length > 0,
    missing_allocation_fields: missingFields,
  };
}

export function summarizeLatestAllocations(
  fundId: number,
  rows: readonly LatestAllocationSourceRow[]
): LatestAllocationResponse {
  const companies = rows.map(latestAllocationCompanyFromRow);
  const total_planned_cents = companies.reduce(
    (sum, company) => sum + company.planned_reserves_cents,
    0
  );
  const total_deployed_cents = companies.reduce(
    (sum, company) => sum + company.deployed_reserves_cents,
    0
  );
  const last_updated_at =
    companies
      .map((company) => company.last_allocation_at)
      .filter((value): value is string => value !== null)
      .sort()
      .reverse()[0] ?? null;

  return {
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
    },
  };
}
