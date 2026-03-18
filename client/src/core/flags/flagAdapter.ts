/**
 * FEATURE FLAG ADAPTER
 *
 * Maps lightweight Vite ENV flags to comprehensive flag system.
 * Single source of truth: shared/feature-flags/flag-definitions.ts
 *
 * This adapter allows starter kit components to work while
 * maintaining our dependency-aware, rollout-ready flag system.
 */

import { isFlagEnabled, type FlagKey, ALL_FLAGS } from '@shared/feature-flags/flag-definitions';

// ============================================================================
// ENV FLAG → COMPREHENSIVE FLAG MAPPING
// ============================================================================

/**
 * Initialize flag states from Vite environment variables
 * Falls back to flag defaults if env var not set
 */
export function getInitialFlagStates(): Record<string, boolean> {
  /** Read env var; return flag-definition default when var is absent. */
  const envFlag = (envKey: string, flagKey: string): boolean => {
    const raw = import.meta.env[envKey] as string | undefined;
    if (raw === undefined || raw === '') {
      return ALL_FLAGS[flagKey]?.enabled ?? false;
    }
    return String(raw).toLowerCase() === 'true';
  };

  return {
    // Foundation flags
    enable_new_ia: envFlag('VITE_NEW_IA', 'enable_new_ia'),
    enable_kpi_selectors: envFlag('VITE_ENABLE_SELECTOR_KPIS', 'enable_kpi_selectors'),
    enable_cap_table_tabs: ALL_FLAGS['enable_cap_table_tabs']?.enabled ?? false,
    enable_brand_tokens: true, // Always on (non-breaking CSS)

    // Build flags
    enable_modeling_wizard: envFlag('VITE_ENABLE_MODELING_WIZARD', 'enable_modeling_wizard'),
    enable_wizard_step_general: false,
    enable_wizard_step_sectors: false,
    enable_wizard_step_allocations: false,
    enable_wizard_step_fees: false,
    enable_wizard_step_recycling: false,
    enable_wizard_step_waterfall: false,
    enable_wizard_step_results: false,
    enable_reserve_engine: false,
    enable_portfolio_table_v2: false,
    enable_operations_hub: envFlag('VITE_ENABLE_OPERATIONS_HUB', 'enable_operations_hub'),

    // Polish flags
    enable_pipeline_bulk_actions: false,
    enable_pipeline_dnd: envFlag('VITE_ENABLE_PIPELINE_DND', 'enable_pipeline_dnd'),
    enable_lp_reporting: envFlag('VITE_ENABLE_LP_REPORTING', 'enable_lp_reporting'),
    enable_route_redirects: false,
    enable_observability: false,
  };
}

/**
 * Check if a flag is enabled (respects dependencies)
 * NOTE: This is a React Hook and must be called inside a component or custom hook
 */
export function useFeatureFlag(flagKey: FlagKey): boolean {
  const flagStates = getInitialFlagStates();
  return isFlagEnabled(flagKey, flagStates);
}

/**
 * Simple ENV-based flags for starter kit components
 * These are computed once at module load time (not reactive)
 * For reactive flags in components, use useFeatureFlag() hook instead
 */
const flagStates = getInitialFlagStates();
export const FLAGS = {
  NEW_IA: isFlagEnabled('enable_new_ia', flagStates),
  ENABLE_SELECTOR_KPIS: isFlagEnabled('enable_kpi_selectors', flagStates),
  ENABLE_MODELING_WIZARD: isFlagEnabled('enable_modeling_wizard', flagStates),
  ENABLE_OPERATIONS_HUB: isFlagEnabled('enable_operations_hub', flagStates),
  ENABLE_LP_REPORTING: isFlagEnabled('enable_lp_reporting', flagStates),
} as const;

/**
 * Export for direct access in components
 */
export { isFlagEnabled, type FlagKey };
