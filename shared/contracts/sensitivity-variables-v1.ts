/**
 * Sensitivity Variables Library (v1) -- Phase 1A
 *
 * Defines the SMALL EXPLICIT set of variables and metrics supported by the
 * sensitivity engine. Each variable maps to a top-level scalar field in
 * `FundModelInputs` (see shared/schemas/fund-model.ts) that the deterministic
 * engine actually consumes; per-stage rates that require sub-keys are
 * intentionally deferred to a future iteration.
 *
 * Each metric maps to a numeric field in `FundModelOutputs.kpis`.
 *
 * @module shared/contracts/sensitivity-variables-v1
 */

import { z } from 'zod';

// =====================
// VARIABLE / METRIC INTERFACES
// =====================

export interface SensitivityVariableDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Dot-path into FundModelInputs (top-level only in Phase 1A) */
  readonly fundConfigPath: string;
  readonly min: number;
  readonly max: number;
  readonly defaultSteps: number;
  readonly unit: 'ratio' | 'years' | 'dollars' | 'count';
}

export interface SensitivityMetricDefinition {
  readonly id: string;
  readonly label: string;
  /** Dot-path into FundModelOutputs (e.g., "kpis.tvpi") */
  readonly fundMetricPath: string;
  readonly formatter: 'ratio' | 'percent' | 'currency' | 'decimal';
}

// =====================
// SUPPORTED VARIABLES (Phase 1A: 3 entries, all top-level scalars)
// =====================

export const SUPPORTED_VARIABLES: readonly SensitivityVariableDefinition[] = [
  {
    id: 'reserve_pool_pct',
    label: 'Reserve Pool %',
    description: 'Reserve pool as % of fund size (carved from stage allocations).',
    fundConfigPath: 'reservePoolPct',
    min: 0,
    max: 0.5,
    defaultSteps: 11,
    unit: 'ratio',
  },
  {
    id: 'management_fee_rate',
    label: 'Management Fee Rate',
    description: 'Annual management fee as % of committed capital.',
    fundConfigPath: 'managementFeeRate',
    min: 0,
    max: 0.05,
    defaultSteps: 11,
    unit: 'ratio',
  },
  {
    id: 'management_fee_years',
    label: 'Management Fee Duration',
    description: 'Number of years to charge management fees.',
    fundConfigPath: 'managementFeeYears',
    min: 1,
    max: 15,
    defaultSteps: 8,
    unit: 'years',
  },
] as const;

// =====================
// SUPPORTED METRICS (Phase 1A: 3 entries, all from FundModelOutputs.kpis)
// =====================

export const SUPPORTED_METRICS: readonly SensitivityMetricDefinition[] = [
  {
    id: 'tvpi',
    label: 'TVPI',
    fundMetricPath: 'kpis.tvpi',
    formatter: 'ratio',
  },
  {
    id: 'dpi',
    label: 'DPI',
    fundMetricPath: 'kpis.dpi',
    formatter: 'ratio',
  },
  {
    id: 'irr_annualized',
    label: 'IRR (annualized)',
    fundMetricPath: 'kpis.irrAnnualized',
    formatter: 'percent',
  },
] as const;

// =====================
// ID LISTS + ZOD ENUMS
// =====================

export const SUPPORTED_VARIABLE_IDS = [
  'reserve_pool_pct',
  'management_fee_rate',
  'management_fee_years',
] as const;

export const SUPPORTED_METRIC_IDS = ['tvpi', 'dpi', 'irr_annualized'] as const;

export const SensitivityVariableIdSchema = z.enum(SUPPORTED_VARIABLE_IDS);
export const SensitivityMetricIdSchema = z.enum(SUPPORTED_METRIC_IDS);

export type SensitivityVariableId = z.infer<typeof SensitivityVariableIdSchema>;
export type SensitivityMetricId = z.infer<typeof SensitivityMetricIdSchema>;

// =====================
// LOOKUP HELPERS
// =====================

/**
 * Resolve a variable definition by id. Throws on unknown id rather than
 * returning undefined: callers have already validated against the Zod enum,
 * so a miss here is a programmer error.
 */
export function getVariableDefinition(id: SensitivityVariableId): SensitivityVariableDefinition {
  const def = SUPPORTED_VARIABLES.find((v) => v.id === id);
  if (!def) {
    throw new Error(`Unknown sensitivity variable id: ${id}`);
  }
  return def;
}

/**
 * Resolve a metric definition by id. Throws on unknown id; see
 * getVariableDefinition for rationale.
 */
export function getMetricDefinition(id: SensitivityMetricId): SensitivityMetricDefinition {
  const def = SUPPORTED_METRICS.find((m) => m.id === id);
  if (!def) {
    throw new Error(`Unknown sensitivity metric id: ${id}`);
  }
  return def;
}
