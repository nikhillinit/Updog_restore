// Reserves v1.1 Types with Quarter-based timing and enhanced configuration

export interface Company {
  id: string;
  name: string;
  invested_cents: number; // Using integer cents for precision
  exit_moic_bps: number;  // Exit MOIC in basis points (10000 = 1.0x)
  stage?: string;
  sector?: string;
  ownership_pct?: number;
  metadata?: Record<string, unknown>;
}

export interface ReservesConfig {
  reserve_bps: number;      // Reserve percentage in basis points (1500 = 15%)
  remain_passes: 0 | 1;      // Number of "remain" passes (0 or 1)
  cap_policy: CapPolicy;     // Cap policy configuration
  audit_level: 'basic' | 'detailed' | 'debug';
}

export interface CapPolicy {
  kind: 'fixed_percent' | 'stage_based' | 'custom';
  default_percent?: number;  // Default cap as percentage of initial investment
  stage_caps?: Record<string, number>;
  custom_fn?: (_company: Company) => number;
}

export interface ReservesInput {
  companies: Company[];
  fund_size_cents: number;
  quarter_index: number;  // Current quarter (year * 4 + (q - 1))
}

export interface AllocationDecision {
  company_id: string;
  planned_cents: number;
  reason: string;
  cap_cents: number;
  iteration: number;
}

export interface ReservesOutput {
  allocations: AllocationDecision[];
  remaining_cents: number;
  metadata: {
    total_available_cents: number;
    total_allocated_cents: number;
    companies_funded: number;
    max_iterations: number;
    conservation_check: boolean;
    exit_moic_ranking: string[]; // Company IDs in ranked order
  };
}

export interface ReservesResult {
  ok: boolean;
  data?: ReservesOutput;
  error?: string;
  warnings?: string[];
  metrics?: {
    duration_ms: number;
    company_count: number;
    policy_type: string;
  };
}

// Audit log entry for traceability
export interface ReservesAuditEntry {
  timestamp: Date;
  input_hash: string;
  output_hash: string;
  config: ReservesConfig;
  duration_ms: number;
  warnings?: string[];
  user_id?: string;
}