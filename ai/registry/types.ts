/**
 * Type definitions for Agent Registry
 * Enables capability-based agent discovery and routing
 */

export type Capability =
  | 'scenario.optimize'    // Scenario construction optimization
  | 'explain.lp'           // LP-facing explanations
  | 'data.quality'         // Data validation and quality checks
  | 'reserve.analyze';     // Reserve allocation analysis

export interface AgentHealth {
  success_ratio_1h: number; // 0-1
  success_ratio_24h: number; // 0-1
  latency_p95_ms: number;
  last_success_at?: number;
  last_failure_at?: number;
}

export interface AgentDescriptor {
  id: string;
  version: string;
  capabilities: Capability[];
  costProfile?: {
    estUsdPer1kTokens?: number;
    estimatedLatencyMs?: number;
  };
  qualityProfile?: {
    notes?: string;
    successRate?: number;
  };
  health?: AgentHealth;
  constraints?: Record<string, unknown>;
}

export interface ConstraintSet {
  maxCostUsd?: number;
  maxLatencyMs?: number;
  minQuality?: number;
}
