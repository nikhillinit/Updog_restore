/**
 * FEATURE FLAG DEFINITIONS
 *
 * Centralized feature flag registry for safe, progressive rollout.
 * Leverages existing flags/ package per executive feedback.
 *
 * Rollout sequence matches Phase 1-3 strategy:
 * Foundation → Build → Polish
 */

import { z } from 'zod';

// ============================================================================
// FLAG SCHEMA
// ============================================================================

export const FeatureFlagSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean().default(false),
  rolloutPercentage: z.number().min(0).max(100).default(0), // Gradual rollout
  dependencies: z.array(z.string()).optional(), // Must enable these flags first
  expiresAt: z.string().datetime().optional(), // Auto-disable after date
});

export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

// ============================================================================
// PHASE 1: FOUNDATION FLAGS (Week 1-6)
// ============================================================================

export const FOUNDATION_FLAGS: Record<string, FeatureFlag> = {
  enable_new_ia: {
    key: 'enable_new_ia',
    name: 'New Information Architecture',
    description: '5-route navigation (Overview/Portfolio/Model/Operate/Report) with redirects',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: [],
  },

  enable_kpi_selectors: {
    key: 'enable_kpi_selectors',
    name: 'KPI Selector System',
    description: 'Frozen KPI selector contract with real data binding to Fund cards',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_new_ia'],
  },

  enable_cap_table_tabs: {
    key: 'enable_cap_table_tabs',
    name: 'Cap Table in Company Tabs',
    description: 'Move Cap Table from top-level nav to Company detail tabs',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_new_ia'],
  },

  enable_brand_tokens: {
    key: 'enable_brand_tokens',
    name: 'Brand Token System',
    description: 'Inter/Poppins typography + neutral palette CSS variables',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: [],
  },
};

// ============================================================================
// PHASE 2: BUILD FLAGS (Week 7-17)
// ============================================================================

export const BUILD_FLAGS: Record<string, FeatureFlag> = {
  enable_modeling_wizard: {
    key: 'enable_modeling_wizard',
    name: 'Unified Modeling Wizard',
    description: '7-step wizard (General → Waterfall) with XState orchestration',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_new_ia', 'enable_kpi_selectors'],
  },

  enable_wizard_step_general: {
    key: 'enable_wizard_step_general',
    name: 'Wizard Step 1: General Info',
    description: 'Fund structure and basic parameters',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_modeling_wizard'],
  },

  enable_wizard_step_sectors: {
    key: 'enable_wizard_step_sectors',
    name: 'Wizard Step 2: Sector Profiles',
    description: 'Sector allocation and graduation matrix',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_wizard_step_general'],
  },

  enable_wizard_step_allocations: {
    key: 'enable_wizard_step_allocations',
    name: 'Wizard Step 3: Capital Allocations',
    description: 'Investment pacing and reserve strategy',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_wizard_step_sectors'],
  },

  enable_wizard_step_fees: {
    key: 'enable_wizard_step_fees',
    name: 'Wizard Step 4: Fees & Expenses',
    description: 'Tiered fee bases, step-downs, recycling toggles',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_wizard_step_allocations'],
  },

  enable_wizard_step_recycling: {
    key: 'enable_wizard_step_recycling',
    name: 'Wizard Step 5: Exit Recycling',
    description: 'Recycling provisions and capital redeployment',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_wizard_step_fees'],
  },

  enable_wizard_step_waterfall: {
    key: 'enable_wizard_step_waterfall',
    name: 'Wizard Step 6: Waterfall Configuration',
    description: 'Distribution waterfall, carry, and hurdle rates',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_wizard_step_recycling'],
  },

  enable_wizard_step_results: {
    key: 'enable_wizard_step_results',
    name: 'Wizard Step 7: Results Dashboard',
    description: 'Model outputs and scenario comparison',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_wizard_step_waterfall'],
  },

  enable_reserve_engine: {
    key: 'enable_reserve_engine',
    name: 'Reserve Optimization Engine',
    description: 'Deterministic reserve allocation with rationale',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_kpi_selectors'],
  },

  enable_portfolio_table_v2: {
    key: 'enable_portfolio_table_v2',
    name: 'Unified Portfolio Table',
    description: 'TanStack Table v8 with virtualization, replaces 3 legacy tables',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_new_ia'],
  },

  enable_operations_hub: {
    key: 'enable_operations_hub',
    name: 'Operations Hub',
    description: 'Capital calls, distributions, fees workflows',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_new_ia', 'enable_kpi_selectors'],
  },
};

// ============================================================================
// PHASE 3: POLISH FLAGS (Week 18-21)
// ============================================================================

export const POLISH_FLAGS: Record<string, FeatureFlag> = {
  enable_lp_reporting: {
    key: 'enable_lp_reporting',
    name: 'LP Reporting',
    description: 'Automated LP statement generation (PDF/CSV)',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_kpi_selectors', 'enable_operations_hub'],
  },

  enable_route_redirects: {
    key: 'enable_route_redirects',
    name: 'Legacy Route Redirects',
    description: 'Hard redirects from old routes to new IA (deprecation complete)',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['enable_new_ia'],
    expiresAt: '2026-04-01T00:00:00Z', // Remove old routes after 6 months
  },

  enable_observability: {
    key: 'enable_observability',
    name: 'Observability Stack',
    description: 'Error boundaries, Sentry, vitals logging per route',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: [],
  },
};

// ============================================================================
// CONSOLIDATED FLAG REGISTRY
// ============================================================================

export const ALL_FLAGS = {
  ...FOUNDATION_FLAGS,
  ...BUILD_FLAGS,
  ...POLISH_FLAGS,
} as const;

export type FlagKey = keyof typeof ALL_FLAGS;

// ============================================================================
// FLAG UTILITIES
// ============================================================================

/**
 * Check if flag is enabled, respecting dependencies
 */
export function isFlagEnabled(flagKey: FlagKey, flagStates: Record<string, boolean>): boolean {
  const flag = ALL_FLAGS[flagKey];
  if (!flag) {
    return false;
  }

  // Check dependencies first
  if (flag.dependencies) {
    const allDepsEnabled = flag.dependencies.every(dep => flagStates[dep] === true);
    if (!allDepsEnabled) {
      return false;
    }
  }

  // Check expiration
  if (flag.expiresAt && new Date(flag.expiresAt) < new Date()) {
    return false;
  }

  return flagStates[flagKey] ?? flag.enabled;
}

/**
 * Get rollout percentage for gradual feature release
 */
export function shouldEnableForUser(
  flagKey: FlagKey,
  userId: string,
  flagStates: Record<string, boolean>
): boolean {
  if (!isFlagEnabled(flagKey, flagStates)) {
    return false;
  }

  const flag = ALL_FLAGS[flagKey];
  if (!flag) {
    return false;
  }

  if (flag.rolloutPercentage === 100) {
    return true;
  }

  // Simple hash-based distribution
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return (hash % 100) < flag.rolloutPercentage;
}

/**
 * Validate flag configuration (detect circular dependencies)
 */
export function validateFlagConfiguration(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  Object.entries(ALL_FLAGS).forEach(([key, flag]) => {
    // Check for circular dependencies
    if (flag.dependencies?.includes(key)) {
      errors.push(`Flag ${key} depends on itself`);
    }

    // Check that dependencies exist
    flag.dependencies?.forEach(dep => {
      if (!ALL_FLAGS[dep as FlagKey]) {
        errors.push(`Flag ${key} depends on non-existent flag ${dep}`);
      }
    });
  });

  return { valid: errors.length === 0, errors };
}
