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
  const toBool = (v: unknown): boolean => String(v).toLowerCase() === 'true';

  return {
    // Foundation flags (map from ENV)
    enable_new_ia: toBool(import.meta.env.VITE_NEW_IA) ?? ALL_FLAGS.enable_new_ia.enabled,
    enable_kpi_selectors: toBool(import.meta.env.VITE_ENABLE_SELECTOR_KPIS) ?? ALL_FLAGS.enable_kpi_selectors.enabled,
    enable_cap_table_tabs: false, // Default off, enable via flag system
    enable_brand_tokens: true, // Always on (non-breaking CSS)

    // Build flags (map from ENV where available)
    enable_modeling_wizard: toBool(import.meta.env.VITE_ENABLE_MODELING_WIZARD) ?? false,
    enable_wizard_step_general: false,
    enable_wizard_step_sectors: false,
    enable_wizard_step_allocations: false,
    enable_wizard_step_fees: false,
    enable_wizard_step_recycling: false,
    enable_wizard_step_waterfall: false,
    enable_wizard_step_results: false,
    enable_reserve_engine: false,
    enable_portfolio_table_v2: false,
    enable_operations_hub: toBool(import.meta.env.VITE_ENABLE_OPERATIONS_HUB) ?? false,

    // Polish flags
    enable_lp_reporting: toBool(import.meta.env.VITE_ENABLE_LP_REPORTING) ?? false,
    enable_route_redirects: false, // Keep soft redirects until Phase 3
    enable_observability: false,
  };
}

/**
 * Check if a flag is enabled (respects dependencies)
 */
export function useFeatureFlag(flagKey: FlagKey): boolean {
  const flagStates = getInitialFlagStates();
  return isFlagEnabled(flagKey, flagStates);
}

/**
 * Simple ENV-based flags for starter kit components
 * Proxies to comprehensive system
 */
export const FLAGS = {
  NEW_IA: useFeatureFlag('enable_new_ia'),
  ENABLE_SELECTOR_KPIS: useFeatureFlag('enable_kpi_selectors'),
  ENABLE_MODELING_WIZARD: useFeatureFlag('enable_modeling_wizard'),
  ENABLE_OPERATIONS_HUB: useFeatureFlag('enable_operations_hub'),
  ENABLE_LP_REPORTING: useFeatureFlag('enable_lp_reporting'),
} as const;

/**
 * Export for direct access in components
 */
export { isFlagEnabled, type FlagKey };
