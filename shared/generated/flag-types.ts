/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Generated from: flags/registry.yaml
 * Generated at: 2026-02-17T01:16:12.283Z
 *
 * Run `npm run flags:generate` to regenerate
 */

/**
 * All available feature flag keys
 */
export type FlagKey =
  | 'enable_new_ia'
  | 'enable_kpi_selectors'
  | 'enable_brand_tokens'
  | 'enable_modeling_wizard'
  | 'enable_operations_hub'
  | 'enable_lp_reporting'
  | 'enable_reserve_engine'
  | 'ts_reserves'
  | 'wasm_reserves'
  | 'shadow_compare'
  | 'reserves_v11'
  | 'remain_pass'
  | 'stage_based_caps'
  | 'export_async'
  | 'metrics_collection'
  | 'ui_catalog'
  | 'onboarding_tour'
  | 'demo_mode'
  | 'require_auth'
  | 'enable_faults'
  | 'enable_wizard_step_general'
  | 'enable_wizard_step_sizing'
  | 'enable_wizard_step_pacing'
  | 'enable_wizard_step_reserves'
  | 'enable_wizard_step_fees'
  | 'enable_wizard_step_waterfall'
  | 'enable_wizard_step_results';

/**
 * Flags safe to expose to client
 */
export type ClientFlagKey =
  | 'enable_new_ia'
  | 'enable_kpi_selectors'
  | 'enable_brand_tokens'
  | 'enable_modeling_wizard'
  | 'enable_operations_hub'
  | 'enable_lp_reporting'
  | 'enable_reserve_engine'
  | 'ts_reserves'
  | 'wasm_reserves'
  | 'shadow_compare'
  | 'reserves_v11'
  | 'remain_pass'
  | 'stage_based_caps'
  | 'export_async'
  | 'metrics_collection'
  | 'ui_catalog'
  | 'onboarding_tour'
  | 'enable_wizard_step_general'
  | 'enable_wizard_step_sizing'
  | 'enable_wizard_step_pacing'
  | 'enable_wizard_step_reserves'
  | 'enable_wizard_step_fees'
  | 'enable_wizard_step_waterfall'
  | 'enable_wizard_step_results';

/**
 * Server-only flags (not exposed to client)
 */
export type ServerOnlyFlagKey = 'demo_mode' | 'require_auth' | 'enable_faults';

/**
 * Admin flags (no localStorage override)
 */
export type AdminFlagKey = 'ui_catalog';

/**
 * Flag risk levels
 */
export type FlagRisk = 'low' | 'medium' | 'high';

/**
 * Flag definition interface
 */
export interface FlagDefinition {
  default: boolean;
  description: string;
  owner: string;
  risk: FlagRisk;
  exposeToClient: boolean;
  adminOnly?: boolean;
  environments: {
    development: boolean;
    staging: boolean;
    production: boolean;
  };
  dependencies: FlagKey[];
  expiresAt: string | null;
  aliases?: string[];
  rolloutPercentage?: number;
}

/**
 * Type-safe flag record
 */
export type FlagRecord = Record<FlagKey, boolean>;

/**
 * Client-safe flag record
 */
export type ClientFlagRecord = Record<ClientFlagKey, boolean>;

/**
 * Array of all flag keys
 */
export const ALL_FLAG_KEYS: readonly FlagKey[] = [
  'enable_new_ia',
  'enable_kpi_selectors',
  'enable_brand_tokens',
  'enable_modeling_wizard',
  'enable_operations_hub',
  'enable_lp_reporting',
  'enable_reserve_engine',
  'ts_reserves',
  'wasm_reserves',
  'shadow_compare',
  'reserves_v11',
  'remain_pass',
  'stage_based_caps',
  'export_async',
  'metrics_collection',
  'ui_catalog',
  'onboarding_tour',
  'demo_mode',
  'require_auth',
  'enable_faults',
  'enable_wizard_step_general',
  'enable_wizard_step_sizing',
  'enable_wizard_step_pacing',
  'enable_wizard_step_reserves',
  'enable_wizard_step_fees',
  'enable_wizard_step_waterfall',
  'enable_wizard_step_results',
] as const;

/**
 * Array of client-safe flag keys
 */
export const CLIENT_FLAG_KEYS: readonly ClientFlagKey[] = [
  'enable_new_ia',
  'enable_kpi_selectors',
  'enable_brand_tokens',
  'enable_modeling_wizard',
  'enable_operations_hub',
  'enable_lp_reporting',
  'enable_reserve_engine',
  'ts_reserves',
  'wasm_reserves',
  'shadow_compare',
  'reserves_v11',
  'remain_pass',
  'stage_based_caps',
  'export_async',
  'metrics_collection',
  'ui_catalog',
  'onboarding_tour',
  'enable_wizard_step_general',
  'enable_wizard_step_sizing',
  'enable_wizard_step_pacing',
  'enable_wizard_step_reserves',
  'enable_wizard_step_fees',
  'enable_wizard_step_waterfall',
  'enable_wizard_step_results',
] as const;

/**
 * Array of admin flag keys (no localStorage override)
 */
export const ADMIN_FLAG_KEYS: readonly AdminFlagKey[] = ['ui_catalog'] as const;

/**
 * Check if a key is a valid flag key
 */
export function isFlagKey(key: string): key is FlagKey {
  return ALL_FLAG_KEYS.includes(key as FlagKey);
}

/**
 * Check if a flag is client-safe
 */
export function isClientFlag(key: FlagKey): key is ClientFlagKey {
  return CLIENT_FLAG_KEYS.includes(key as ClientFlagKey);
}

/**
 * Check if a flag is admin-only (no localStorage override)
 */
export function isAdminFlag(key: FlagKey): key is AdminFlagKey {
  return ADMIN_FLAG_KEYS.includes(key as AdminFlagKey);
}
