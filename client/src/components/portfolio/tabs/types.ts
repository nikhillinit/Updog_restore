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

export interface AllocationScenarioSnapshotItem {
  company_id: number;
  planned_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
}

export interface AllocationScenarioSummary {
  id: string;
  fund_id: number;
  name: string;
  notes: string | null;
  source_allocation_version: number | null;
  company_count: number;
  total_planned_cents: number;
  last_applied_at: string | null;
  last_applied_by: string | null;
  last_applied_allocation_version: number | null;
  last_synced_at: string | null;
  last_synced_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AllocationScenarioDetail extends AllocationScenarioSummary {
  snapshot_items: AllocationScenarioSnapshotItem[];
}

export interface AllocationScenarioListResponse {
  scenarios: AllocationScenarioSummary[];
}

export interface CreateAllocationScenarioPayload {
  name: string;
  notes: string | null;
  source_allocation_version: number | null;
  snapshot_items: AllocationScenarioSnapshotItem[];
}

export interface UpdateAllocationScenarioPayload {
  name?: string;
  notes?: string | null;
  source_allocation_version?: number | null;
  snapshot_items?: AllocationScenarioSnapshotItem[];
}

export interface AllocationScenarioApplyPreview {
  scenario: AllocationScenarioSummary;
  live: {
    fund_id: number;
    company_count: number;
    total_planned_cents: number;
    total_deployed_cents: number;
    max_allocation_version: number | null;
    last_updated_at: string | null;
  };
  drift_status: 'exact_match' | 'stale_but_mappable' | 'company_set_changed';
  apply_state: 'apply_allowed' | 'confirmable_with_drift' | 'blocked';
  live_token: string;
  summary: {
    companies_changed: number;
    companies_unchanged: number;
    scenario_only_count: number;
    live_only_count: number;
    total_planned_delta_cents: number;
  };
}

export interface AllocationScenarioChangeSummary {
  companies_changed: number;
  companies_unchanged: number;
  scenario_only_count: number;
  live_only_count: number;
  total_planned_delta_cents: number;
  headline: string | null;
}

export interface AllocationScenarioEventSummary {
  id: string;
  event_type: 'applied' | 'synced';
  actor_user_id: number | null;
  actor_label: string | null;
  note: string | null;
  source_allocation_version: number | null;
  resulting_allocation_version: number | null;
  change_summary: AllocationScenarioChangeSummary;
  created_at: string;
}

export interface AllocationScenarioActionPayload {
  note?: string | null;
}

export interface ApplyAllocationScenarioPayload extends AllocationScenarioActionPayload {
  preview_token: string;
}

export interface AllocationScenarioSyncResult {
  scenario: AllocationScenarioDetail;
  event: AllocationScenarioEventSummary;
}

export interface AllocationScenarioApplyResult extends AllocationScenarioSyncResult {
  live: {
    updated_count: number;
    resulting_allocation_version: number | null;
    previous_preview_token: string;
    current_live_token: string;
  };
}
