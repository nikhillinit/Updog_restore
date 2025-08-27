/**
 * Minimal Domain Types
 * Basic type definitions to unblock compilation
 * TODO: Replace with full domain types from shared module
 */

export type CompanyStage = 
  | "preseed" 
  | "seed" 
  | "series_a" 
  | "series_b" 
  | "series_c" 
  | "series_d"
  | "series_dplus";

export interface Company {
  id: string;
  companyId?: string;  // Alias for some contexts
  name: string;
  stage: CompanyStage;
  allocated?: number;
  allocation?: number; // Alias for allocated in some contexts
}

export interface StagePolicy {
  stage: CompanyStage;
  max_check_size_cents: number;
  reserve_ratio: number;
  follow_on_percentage?: number;
  graduation_trigger?: number;
}

export interface ReserveConstraints {
  min_reserve_cents: number;
  max_reserve_cents: number;
  target_reserve_months: number;
  max_concentration_percent: number;
}