export type AllocationCompanyStatus = 'active' | 'exited' | 'written-off';

export interface AllocationCompanySourceRow {
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

export interface AllocationCompanyListItem {
  id: number;
  fundId: number;
  name: string;
  sector: string;
  stage: string;
  status: AllocationCompanyStatus;
  invested_cents: number;
  deployed_reserves_cents: number;
  planned_reserves_cents: number;
  exit_moic_bps: number | null;
  ownership_pct: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
  last_allocation_at: string | null;
}

export interface LatestAllocationSourceRow {
  company_id: number;
  company_name: string;
  sector: string;
  stage: string;
  status: string | null;
  invested_amount: string | number | null;
  planned_reserves_cents: number | bigint | string | null;
  deployed_reserves_cents: number | bigint | string | null;
  allocation_cap_cents: number | bigint | string | null;
  allocation_reason: string | null;
  allocation_version: number | null;
  last_allocation_at: Date | string | null;
}

export interface LatestAllocationCompany {
  company_id: number;
  company_name: string;
  sector: string;
  stage: string;
  status: string | null;
  invested_amount_cents: number;
  planned_reserves_cents: number;
  deployed_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
  allocation_version: number;
  last_allocation_at: string | null;
  allocation_facts_missing: boolean;
  missing_allocation_fields: string[];
}

export interface LatestAllocationResponse {
  fund_id: number;
  companies: LatestAllocationCompany[];
  metadata: {
    total_planned_cents: number;
    total_deployed_cents: number;
    companies_count: number;
    allocation_facts_missing_count: number;
    last_updated_at: string | null;
  };
}

export interface CompanyListResponse {
  companies: AllocationCompanyListItem[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
    total_count?: number;
  };
}
