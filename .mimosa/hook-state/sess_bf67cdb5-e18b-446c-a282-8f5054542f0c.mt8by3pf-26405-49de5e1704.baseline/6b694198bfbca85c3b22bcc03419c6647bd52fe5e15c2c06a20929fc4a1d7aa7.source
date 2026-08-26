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

// =====================
// STRESS SCENARIOS (Phase 4: 6 entries, multi-variable shocks over the 3 scalars)
// =====================

/**
 * A single override applied to a fund-config scalar by a stress scenario. The
 * variableId references the existing SUPPORTED_VARIABLES library; the value is
 * the absolute (not delta) value to set for that variable.
 */
export const StressScenarioOverrideSchema = z
  .object({
    variableId: SensitivityVariableIdSchema,
    value: z.number(),
  })
  .strict();

/**
 * A named stress scenario: 1..3 multi-variable overrides applied to the
 * deterministic fund config to model a coordinated shock. Stress scenarios
 * are pre-defined library entries (not user-constructed in v1).
 */
export const StressScenarioSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    overrides: z.array(StressScenarioOverrideSchema).min(1).max(3),
  })
  .strict();

export type StressScenarioOverride = z.infer<typeof StressScenarioOverrideSchema>;
export type StressScenario = z.infer<typeof StressScenarioSchema>;

/**
 * The 6 predefined stress scenarios. Each bundles 1..3 absolute-value
 * overrides applied to the existing 3 scalar variables. Severity is monotonic
 * within each direction (mild_downside is less severe than severe_downside,
 * etc.) so the worst_case / best_case scenarios act as bounds for the surface.
 */
export const SUPPORTED_STRESS_SCENARIOS: readonly StressScenario[] = [
  {
    id: 'mild_downside',
    label: 'Mild Downside',
    description: 'Compress reserves and bump management fees modestly.',
    overrides: [
      { variableId: 'reserve_pool_pct', value: 0.1 },
      { variableId: 'management_fee_rate', value: 0.025 },
    ],
  },
  {
    id: 'severe_downside',
    label: 'Severe Downside',
    description:
      'Heavy reserve compression, elevated management fees, and an extended fee horizon.',
    overrides: [
      { variableId: 'reserve_pool_pct', value: 0.05 },
      { variableId: 'management_fee_rate', value: 0.035 },
      { variableId: 'management_fee_years', value: 12 },
    ],
  },
  {
    id: 'mild_upside',
    label: 'Mild Upside',
    description: 'Modestly larger reserve pool and slightly reduced management fees.',
    overrides: [
      { variableId: 'reserve_pool_pct', value: 0.2 },
      { variableId: 'management_fee_rate', value: 0.018 },
    ],
  },
  {
    id: 'severe_upside',
    label: 'Severe Upside',
    description: 'Aggressive reserve allocation, low management fees, and a shortened fee horizon.',
    overrides: [
      { variableId: 'reserve_pool_pct', value: 0.3 },
      { variableId: 'management_fee_rate', value: 0.012 },
      { variableId: 'management_fee_years', value: 8 },
    ],
  },
  {
    id: 'worst_case',
    label: 'Worst Case',
    description: 'Boundary-pinned downside: minimal reserves, maximum fees, longest fee horizon.',
    overrides: [
      { variableId: 'reserve_pool_pct', value: 0.05 },
      { variableId: 'management_fee_rate', value: 0.04 },
      { variableId: 'management_fee_years', value: 15 },
    ],
  },
  {
    id: 'best_case',
    label: 'Best Case',
    description: 'Boundary-pinned upside: large reserves, minimal fees, shortest fee horizon.',
    overrides: [
      { variableId: 'reserve_pool_pct', value: 0.35 },
      { variableId: 'management_fee_rate', value: 0.01 },
      { variableId: 'management_fee_years', value: 7 },
    ],
  },
] as const;

export const SUPPORTED_STRESS_SCENARIO_IDS = [
  'mild_downside',
  'severe_downside',
  'mild_upside',
  'severe_upside',
  'worst_case',
  'best_case',
] as const;

export const SensitivityStressScenarioIdSchema = z.enum(SUPPORTED_STRESS_SCENARIO_IDS);
export type SensitivityStressScenarioId = z.infer<typeof SensitivityStressScenarioIdSchema>;

/**
 * Resolve a stress scenario by id. Mirrors getVariableDefinition: returns
 * undefined on unknown id rather than throwing, so callers (which have
 * already validated against the Zod enum) can dispatch on absence.
 */
export function getStressScenarioById(id: SensitivityStressScenarioId): StressScenario | undefined {
  return SUPPORTED_STRESS_SCENARIOS.find((s) => s.id === id);
}
