// Legacy compatibility flags with environment + localStorage override support.
// Route and admin exposure now live in client/src/app/route-control-flags.ts.
function readEnvValue(envKey: string): unknown {
  const envRecord = import.meta.env as Record<string, unknown>;
  return envRecord[envKey];
}

function getFlag(envKey: string, localStorageKey: string, defaultValue = false): boolean {
  if (typeof window !== 'undefined') {
    const lsValue = localStorage.getItem(localStorageKey);
    if (lsValue !== null) {
      return lsValue.toLowerCase() === 'true';
    }
  }

  const envValue = readEnvValue(envKey);
  return envValue == null ? defaultValue : String(envValue).toLowerCase() === 'true';
}

export const FLAGS = {
  NEW_IA: getFlag('VITE_NEW_IA', 'FF_NEW_IA'),
  ENABLE_SELECTOR_KPIS: getFlag('VITE_ENABLE_SELECTOR_KPIS', 'FF_ENABLE_SELECTOR_KPIS'),
  ENABLE_MODELING_WIZARD: getFlag('VITE_ENABLE_MODELING_WIZARD', 'FF_ENABLE_MODELING_WIZARD'),
  ENABLE_OPERATIONS_HUB: getFlag('VITE_ENABLE_OPERATIONS_HUB', 'FF_ENABLE_OPERATIONS_HUB'),
  ENABLE_ENGINE_INTEGRATION: getFlag(
    'VITE_ENABLE_ENGINE_INTEGRATION',
    'FF_ENABLE_ENGINE_INTEGRATION'
  ),
} as const;

export type Flags = typeof FLAGS;
