/**
 * Reallocation Types
 *
 * TypeScript definitions for the fund reallocation feature.
 */

/**
 * Individual company allocation change
 */
export interface ProposedAllocation {
  company_id: number;
  planned_reserves_cents: number;
  allocation_cap_cents?: number;
}

/**
 * Preview request payload
 */
export interface ReallocationPreviewRequest {
  current_version: number;
  proposed_allocations: ProposedAllocation[];
}

/**
 * Commit request payload (extends preview with reason)
 */
export interface ReallocationCommitRequest extends ReallocationPreviewRequest {
  reason: string;
}

/**
 * Delta calculation for a single company
 */
export interface ReallocationDelta {
  company_id: number;
  company_name: string;
  from_cents: number;
  to_cents: number;
  delta_cents: number;
  delta_pct: number;
  status: 'increased' | 'decreased' | 'unchanged';
}

/**
 * Warning types for validation
 */
export type WarningType =
  | 'cap_exceeded'
  | 'negative_delta'
  | 'high_concentration'
  | 'unrealistic_moic'
  | 'invalid_company';

/**
 * Warning severity levels
 */
export type WarningSeverity = 'warning' | 'error';

/**
 * Individual warning item
 */
export interface ReallocationWarning {
  type: WarningType;
  company_id?: number;
  company_name?: string;
  message: string;
  severity: WarningSeverity;
}

/**
 * Totals summary
 */
export interface ReallocationTotals {
  total_allocated_before: number;
  total_allocated_after: number;
  delta_cents: number;
  delta_pct: number;
}

/**
 * Validation results
 */
export interface ReallocationValidation {
  is_valid: boolean;
  errors: string[];
}

/**
 * Preview response from API
 */
export interface ReallocationPreviewResponse {
  deltas: ReallocationDelta[];
  totals: ReallocationTotals;
  warnings: ReallocationWarning[];
  validation: ReallocationValidation;
}

/**
 * Commit response from API
 */
export interface ReallocationCommitResponse {
  success: boolean;
  message: string;
  timestamp: string;
  new_version: number;
  audit_log_id?: string;
}

/**
 * Selected company for reallocation (UI state)
 */
export interface SelectedCompany {
  id: number;
  name: string;
  currentAllocation: number; // in cents
  newAllocation: number; // in cents
  cap?: number; // in cents
}

/**
 * API error response
 */
export interface ReallocationError {
  status: number;
  message: string;
  errors?: string[];
}
