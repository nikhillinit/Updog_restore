/**
 * TypeScript types for Fund Allocation Management
 */

export interface AllocationCompany {
  company_id: number;
  company_name: string;
  sector: string;
  stage: string;
  status: string;
  invested_amount_cents: number;
  deployed_reserves_cents: number;
  planned_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
  allocation_version: number;
  last_allocation_at: string | null;
}

export interface AllocationMetadata {
  total_planned_cents: number;
  total_deployed_cents: number;
  companies_count: number;
  last_updated_at: string | null;
}

export interface AllocationsResponse {
  companies: AllocationCompany[];
  metadata: AllocationMetadata;
}

export interface UpdateAllocationPayload {
  company_id: number;
  planned_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
  allocation_version: number;
}
