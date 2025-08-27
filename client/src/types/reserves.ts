/**
 * Reserve Domain Types
 * Core data structures for reserve calculations and allocations
 */

export interface AuditEvent {
  at: string;            // ISO timestamp
  kind: string;
  msg?: string;
}

export interface AllocationDecision {
  company_id: string;
  planned_cents: number;
  iteration: number;
  reason: string;        // Required: explains allocation decision
  cap_cents: number;     // Required: maximum allowed allocation
}

export interface ReserveSummary {
  total_available_cents: number;
  total_allocated_cents: number;
  companies_funded: number;
  max_iterations: number;
  conservation_check: boolean;
  exit_moic_ranking: string[];
  audit_trail?: AuditEvent[];   // Optional audit history
}

export interface ReserveCalculationResult {
  summary: ReserveSummary;
  allocations: AllocationDecision[];
  timestamp: string;
  version: string;
}