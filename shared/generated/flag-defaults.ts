/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Generated from: flags/registry.yaml
 * Generated at: 2026-01-23T01:59:30.794Z
 *
 * Run `npm run flags:generate` to regenerate
 */

import type { FlagKey, FlagDefinition, FlagRecord } from './flag-types.js';

/**
 * Complete flag definitions
 */
export const FLAG_DEFINITIONS: Record<FlagKey, FlagDefinition> = {
  'enable_new_ia': {
    default: false,
    description: '5-route navigation (Overview, Portfolio, Model, Operate, Report)',
    owner: 'gp-team',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: [],
    expiresAt: null,
    aliases: ['NEW_IA', 'new_ia'],
    
  },
  'enable_kpi_selectors': {
    default: false,
    description: 'KPI selector system for metrics dashboard',
    owner: 'gp-team',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_new_ia'],
    expiresAt: null,
    aliases: ['ENABLE_SELECTOR_KPIS'],
    
  },
  'enable_brand_tokens': {
    default: false,
    description: 'Press On Ventures brand token system',
    owner: 'design',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    dependencies: [],
    expiresAt: null,
    
    
  },
  'enable_modeling_wizard': {
    default: false,
    description: '7-step modeling wizard',
    owner: 'gp-team',
    risk: 'medium',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_new_ia', 'enable_kpi_selectors'],
    expiresAt: null,
    aliases: ['ENABLE_MODELING_WIZARD'],
    
  },
  'enable_operations_hub': {
    default: false,
    description: 'Capital calls and distributions hub',
    owner: 'gp-team',
    risk: 'medium',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_new_ia', 'enable_kpi_selectors'],
    expiresAt: null,
    aliases: ['ENABLE_OPERATIONS_HUB'],
    
  },
  'enable_lp_reporting': {
    default: false,
    description: 'LP reporting dashboard',
    owner: 'gp-team',
    risk: 'medium',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_kpi_selectors', 'enable_operations_hub'],
    expiresAt: null,
    aliases: ['ENABLE_LP_REPORTING'],
    
  },
  'enable_reserve_engine': {
    default: false,
    description: 'Deterministic reserve allocation engine',
    owner: 'analytics',
    risk: 'medium',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_kpi_selectors'],
    expiresAt: null,
    
    
  },
  'ts_reserves': {
    default: true,
    description: 'TypeScript reserves calculation engine',
    owner: 'analytics',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    dependencies: [],
    expiresAt: null,
    
    rolloutPercentage: 100,
  },
  'wasm_reserves': {
    default: false,
    description: 'WebAssembly reserves calculation engine (experimental)',
    owner: 'analytics',
    risk: 'high',
    exposeToClient: true,
    
    environments: {
      development: false,
      staging: false,
      production: false,
    },
    dependencies: [],
    expiresAt: null,
    
    rolloutPercentage: 0,
  },
  'shadow_compare': {
    default: false,
    description: 'Shadow comparison between TS and WASM engines',
    owner: 'analytics',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: false,
      staging: false,
      production: false,
    },
    dependencies: ['ts_reserves', 'wasm_reserves'],
    expiresAt: null,
    
    rolloutPercentage: 0,
  },
  'reserves_v11': {
    default: true,
    description: 'Reserves v1.1 calculation improvements',
    owner: 'analytics',
    risk: 'medium',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    dependencies: [],
    expiresAt: null,
    
    
  },
  'remain_pass': {
    default: true,
    description: 'Remaining pass calculation',
    owner: 'analytics',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    dependencies: [],
    expiresAt: null,
    
    
  },
  'stage_based_caps': {
    default: true,
    description: 'Stage-based capital allocation caps',
    owner: 'analytics',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    dependencies: [],
    expiresAt: null,
    
    
  },
  'export_async': {
    default: true,
    description: 'Async export functionality',
    owner: 'gp-team',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    dependencies: [],
    expiresAt: null,
    
    
  },
  'metrics_collection': {
    default: true,
    description: 'Client-side metrics collection',
    owner: 'analytics',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: true,
      production: true,
    },
    dependencies: [],
    expiresAt: null,
    
    
  },
  'ui_catalog': {
    default: false,
    description: 'Admin UI component catalog',
    owner: 'design',
    risk: 'low',
    exposeToClient: true,
    adminOnly: true,
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: [],
    expiresAt: null,
    aliases: ['UI_CATALOG'],
    
  },
  'onboarding_tour': {
    default: false,
    description: 'GP onboarding tour for new users',
    owner: 'gp-team',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: [],
    expiresAt: null,
    aliases: ['ONBOARDING_TOUR'],
    
  },
  'demo_mode': {
    default: false,
    description: 'Demo mode with sample data',
    owner: 'platform',
    risk: 'low',
    exposeToClient: false,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: [],
    expiresAt: null,
    
    
  },
  'require_auth': {
    default: false,
    description: 'Require authentication for API access',
    owner: 'platform',
    risk: 'high',
    exposeToClient: false,
    
    environments: {
      development: false,
      staging: true,
      production: true,
    },
    dependencies: [],
    expiresAt: null,
    
    
  },
  'enable_faults': {
    default: false,
    description: 'Enable fault injection for testing',
    owner: 'platform',
    risk: 'high',
    exposeToClient: false,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: [],
    expiresAt: null,
    
    
  },
  'enable_wizard_step_general': {
    default: false,
    description: 'Wizard Step 1: General fund info',
    owner: 'gp-team',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_modeling_wizard'],
    expiresAt: null,
    
    
  },
  'enable_wizard_step_sizing': {
    default: false,
    description: 'Wizard Step 2: Fund sizing',
    owner: 'gp-team',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_wizard_step_general'],
    expiresAt: null,
    
    
  },
  'enable_wizard_step_pacing': {
    default: false,
    description: 'Wizard Step 3: Pacing and deployment',
    owner: 'gp-team',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_wizard_step_sizing'],
    expiresAt: null,
    
    
  },
  'enable_wizard_step_reserves': {
    default: false,
    description: 'Wizard Step 4: Reserve allocation',
    owner: 'gp-team',
    risk: 'medium',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_wizard_step_pacing'],
    expiresAt: null,
    
    
  },
  'enable_wizard_step_fees': {
    default: false,
    description: 'Wizard Step 5: Fee structure',
    owner: 'gp-team',
    risk: 'medium',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_wizard_step_reserves'],
    expiresAt: null,
    
    
  },
  'enable_wizard_step_waterfall': {
    default: false,
    description: 'Wizard Step 6: Waterfall distribution',
    owner: 'gp-team',
    risk: 'medium',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_wizard_step_fees'],
    expiresAt: null,
    
    
  },
  'enable_wizard_step_results': {
    default: false,
    description: 'Wizard Step 7: Results summary',
    owner: 'gp-team',
    risk: 'low',
    exposeToClient: true,
    
    environments: {
      development: true,
      staging: false,
      production: false,
    },
    dependencies: ['enable_wizard_step_waterfall'],
    expiresAt: null,
    
    
  },
};

/**
 * Default flag values (from registry)
 */
export const FLAG_DEFAULTS: FlagRecord = {
  'enable_new_ia': false,
  'enable_kpi_selectors': false,
  'enable_brand_tokens': false,
  'enable_modeling_wizard': false,
  'enable_operations_hub': false,
  'enable_lp_reporting': false,
  'enable_reserve_engine': false,
  'ts_reserves': true,
  'wasm_reserves': false,
  'shadow_compare': false,
  'reserves_v11': true,
  'remain_pass': true,
  'stage_based_caps': true,
  'export_async': true,
  'metrics_collection': true,
  'ui_catalog': false,
  'onboarding_tour': false,
  'demo_mode': false,
  'require_auth': false,
  'enable_faults': false,
  'enable_wizard_step_general': false,
  'enable_wizard_step_sizing': false,
  'enable_wizard_step_pacing': false,
  'enable_wizard_step_reserves': false,
  'enable_wizard_step_fees': false,
  'enable_wizard_step_waterfall': false,
  'enable_wizard_step_results': false,
};

/**
 * Environment-specific defaults
 * @param env - Environment name (development, staging, production)
 */
export function getEnvironmentDefaults(env: 'development' | 'staging' | 'production'): FlagRecord {
  const defaults: Partial<FlagRecord> = {};
  for (const [key, def] of Object.entries(FLAG_DEFINITIONS)) {
    defaults[key as FlagKey] = def.environments[env];
  }
  return defaults as FlagRecord;
}

/**
 * Get flag definition by key
 */
export function getFlagDefinition(key: FlagKey): FlagDefinition {
  return FLAG_DEFINITIONS[key];
}

/**
 * Get flag dependencies
 */
export function getFlagDependencies(key: FlagKey): FlagKey[] {
  return FLAG_DEFINITIONS[key].dependencies;
}

/**
 * Check if flag is expired
 */
export function isFlagExpired(key: FlagKey): boolean {
  const def = FLAG_DEFINITIONS[key];
  if (!def.expiresAt) return false;
  return new Date(def.expiresAt) < new Date();
}

/**
 * Resolve flag with dependencies
 * Returns true only if flag AND all dependencies are enabled
 */
export function resolveFlagWithDependencies(
  key: FlagKey,
  flagStates: Partial<FlagRecord>
): boolean {
  const def = FLAG_DEFINITIONS[key];

  // Check if flag itself is enabled
  const flagValue = flagStates[key] ?? def.default;
  if (!flagValue) return false;

  // Check all dependencies
  for (const dep of def.dependencies) {
    if (!resolveFlagWithDependencies(dep, flagStates)) {
      return false;
    }
  }

  return true;
}

/**
 * Legacy alias mapping (for migration)
 */
export const FLAG_ALIASES: Record<string, FlagKey> = {
  'NEW_IA': 'enable_new_ia',
  'new_ia': 'enable_new_ia',
  'ENABLE_SELECTOR_KPIS': 'enable_kpi_selectors',
  'ENABLE_MODELING_WIZARD': 'enable_modeling_wizard',
  'ENABLE_OPERATIONS_HUB': 'enable_operations_hub',
  'ENABLE_LP_REPORTING': 'enable_lp_reporting',
  'UI_CATALOG': 'ui_catalog',
  'ONBOARDING_TOUR': 'onboarding_tour',
};

/**
 * Resolve legacy alias to canonical key
 */
export function resolveAlias(aliasOrKey: string): FlagKey | undefined {
  if (aliasOrKey in FLAG_ALIASES) {
    return FLAG_ALIASES[aliasOrKey];
  }
  if (aliasOrKey in FLAG_DEFINITIONS) {
    return aliasOrKey as FlagKey;
  }
  return undefined;
}
