// Feature flags with environment + localStorage override support
function getFlag(envKey: string, localStorageKey: string): boolean {
  // 1. Check localStorage first (for local demo overrides)
  if (typeof window !== 'undefined') {
    const lsValue = localStorage.getItem(localStorageKey);
    if (lsValue !== null) {
      return lsValue.toLowerCase() === 'true';
    }
  }

  // 2. Fall back to environment variable
  const envValue = import.meta.env[envKey];
  return String(envValue).toLowerCase() === 'true';
}

// Admin flags - NO localStorage override (security: prevents client-side bypass)
// These can only be enabled via environment variables set at build time
function getAdminFlag(envKey: string): boolean {
  const envValue = import.meta.env[envKey];
  return String(envValue).toLowerCase() === 'true';
}

export const FLAGS = {
  NEW_IA: getFlag('VITE_NEW_IA', 'FF_NEW_IA'),
  ENABLE_SELECTOR_KPIS: getFlag('VITE_ENABLE_SELECTOR_KPIS', 'FF_ENABLE_SELECTOR_KPIS'),
  ENABLE_MODELING_WIZARD: getFlag('VITE_ENABLE_MODELING_WIZARD', 'FF_ENABLE_MODELING_WIZARD'),
  ENABLE_OPERATIONS_HUB: getFlag('VITE_ENABLE_OPERATIONS_HUB', 'FF_ENABLE_OPERATIONS_HUB'),
  ENABLE_LP_REPORTING: getFlag('VITE_ENABLE_LP_REPORTING', 'FF_ENABLE_LP_REPORTING'),
  // GP Modernization flags
  ONBOARDING_TOUR: getFlag('VITE_ONBOARDING_TOUR', 'FF_ONBOARDING_TOUR'),
  UI_CATALOG: getAdminFlag('VITE_UI_CATALOG'), // Admin flag - no localStorage override
} as const;

export type Flags = typeof FLAGS;

// Debug helper (only in dev)
if (import.meta.env.DEV) {
  console.log('[Feature Flags]', FLAGS);
}
