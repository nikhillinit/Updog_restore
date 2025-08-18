/**
 * Feature flag system with user-level overrides
 * Supports URL parameters for testing and gradual rollout
 */

export type FlagName = 
  | 'ts_reserves'
  | 'wasm_reserves'
  | 'shadow_compare'
  | 'reserves_v11'
  | 'remain_pass'
  | 'stage_based_caps'
  | 'export_async'
  | 'metrics_collection';

interface FlagConfig {
  defaultValue: boolean;
  rolloutPercent: number;
  description: string;
  allowOverride: boolean;
}

// Flag configurations
const FLAGS: Record<FlagName, FlagConfig> = {
  ts_reserves: {
    defaultValue: true,
    rolloutPercent: 100,
    description: 'Use TypeScript reserves calculation engine',
    allowOverride: true
  },
  wasm_reserves: {
    defaultValue: false,
    rolloutPercent: 0,
    description: 'Use WASM reserves calculation engine',
    allowOverride: true
  },
  shadow_compare: {
    defaultValue: false,
    rolloutPercent: 10,
    description: 'Run shadow comparison between engines',
    allowOverride: true
  },
  reserves_v11: {
    defaultValue: true,
    rolloutPercent: 100,
    description: 'Enable reserves v1.1 features',
    allowOverride: true
  },
  remain_pass: {
    defaultValue: true,
    rolloutPercent: 100,
    description: 'Enable remain pass in reserves calculation',
    allowOverride: true
  },
  stage_based_caps: {
    defaultValue: true,
    rolloutPercent: 100,
    description: 'Enable stage-based cap policies',
    allowOverride: true
  },
  export_async: {
    defaultValue: true,
    rolloutPercent: 100,
    description: 'Use async export with dynamic imports',
    allowOverride: true
  },
  metrics_collection: {
    defaultValue: true,
    rolloutPercent: 100,
    description: 'Enable metrics collection',
    allowOverride: true
  }
};

// Cache for overrides
const overrideCache = new Map<FlagName, boolean>();

// Parse URL parameters once
const urlParams = typeof window !== 'undefined' 
  ? new URLSearchParams(window.location.search)
  : new URLSearchParams();

// Check for engine override
const engineOverride = urlParams.get('force_reserves_engine');

/**
 * Check if a feature flag is enabled for a user
 */
export function isEnabled(flag: FlagName, userId?: string): boolean {
  // Check cache first
  if (overrideCache.has(flag)) {
    return overrideCache.get(flag)!;
  }
  
  const config = FLAGS[flag];
  if (!config) {
    console.warn(`Unknown feature flag: ${flag}`);
    return false;
  }
  
  // Handle engine-specific overrides
  if (engineOverride) {
    if (flag === 'ts_reserves' && engineOverride === 'ts') {
      overrideCache.set(flag, true);
      return true;
    }
    if (flag === 'wasm_reserves' && engineOverride === 'wasm') {
      overrideCache.set(flag, true);
      return true;
    }
    if (flag === 'ts_reserves' && engineOverride === 'wasm') {
      overrideCache.set(flag, false);
      return false;
    }
    if (flag === 'wasm_reserves' && engineOverride === 'ts') {
      overrideCache.set(flag, false);
      return false;
    }
  }
  
  // Check URL parameter override
  if (config.allowOverride) {
    const paramValue = urlParams.get(`ff_${flag}`);
    if (paramValue === '1' || paramValue === 'true') {
      overrideCache.set(flag, true);
      return true;
    }
    if (paramValue === '0' || paramValue === 'false') {
      overrideCache.set(flag, false);
      return false;
    }
  }
  
  // Check localStorage override (for persistent testing)
  if (typeof localStorage !== 'undefined' && config.allowOverride) {
    const stored = localStorage.getItem(`ff_${flag}`);
    if (stored === 'true') {
      overrideCache.set(flag, true);
      return true;
    }
    if (stored === 'false') {
      overrideCache.set(flag, false);
      return false;
    }
  }
  
  // Check rollout percentage with user ID
  if (userId && config.rolloutPercent < 100) {
    const hash = hashUserId(userId);
    const bucket = hash % 100;
    const enabled = bucket < config.rolloutPercent;
    overrideCache.set(flag, enabled);
    return enabled;
  }
  
  // Return default value
  return config.defaultValue;
}

/**
 * Set a feature flag override (for testing)
 */
export function setFlag(flag: FlagName, value: boolean): void {
  const config = FLAGS[flag];
  if (!config) {
    console.warn(`Unknown feature flag: ${flag}`);
    return;
  }
  
  if (!config.allowOverride) {
    console.warn(`Flag ${flag} does not allow overrides`);
    return;
  }
  
  overrideCache.set(flag, value);
  
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`ff_${flag}`, String(value));
  }
}

/**
 * Clear all flag overrides
 */
export function clearOverrides(): void {
  overrideCache.clear();
  
  if (typeof localStorage !== 'undefined') {
    Object.keys(FLAGS).forEach(flag => {
      localStorage.removeItem(`ff_${flag}`);
    });
  }
}

/**
 * Get all flag states for debugging
 */
export function getAllFlags(userId?: string): Record<FlagName, boolean> {
  const result: Partial<Record<FlagName, boolean>> = {};
  
  Object.keys(FLAGS).forEach(flag => {
    result[flag as FlagName] = isEnabled(flag as FlagName, userId);
  });
  
  return result as Record<FlagName, boolean>;
}

/**
 * Simple hash function for user ID bucketing
 */
function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Export kill switch function for emergency rollback
export function killSwitch(flag: FlagName): void {
  setFlag(flag, false);
  console.warn(`Kill switch activated for flag: ${flag}`);
  
  // Send beacon to server if configured
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const killSwitchUrl = document.querySelector('meta[name="kill-switch-url"]')?.getAttribute('content');
    if (killSwitchUrl) {
      navigator.sendBeacon(killSwitchUrl, JSON.stringify({ flag, action: 'kill' }));
    }
  }
}

// Auto-check for kill switch commands
if (typeof window !== 'undefined') {
  // Check every 30 seconds for kill switch updates
  setInterval(() => {
    const killSwitchMeta = document.querySelector('meta[name="kill-switch-flags"]');
    if (killSwitchMeta) {
      const flags = killSwitchMeta.getAttribute('content')?.split(',') || [];
      flags.forEach(flag => {
        if (FLAGS[flag as FlagName]) {
          killSwitch(flag as FlagName);
        }
      });
    }
  }, 30000);
}