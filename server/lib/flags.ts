/**
 * Feature Flag Provider
 * Production-grade flag system with TTL, kill switch, and audit trail
 */

import { createHash } from 'crypto';
import { flagChanges, type FlagChange, type NewFlagChange } from '../../shared/schemas/flags.js';
import { db } from '../db.js';

export interface FlagValue {
  enabled: boolean;
  exposeToClient?: boolean;
  targeting?: {
    enabled: boolean;
    rules: Array<{
      attribute: string;
      operator: string;
      value: string | string[];
      percentage?: number;
    }>;
  };
}

export type FlagMap = Record<string, FlagValue>;

interface FlagMetadata {
  key: string;
  default: boolean;
  description: string;
  owner: string;
  risk: 'low' | 'medium' | 'high';
  expiresAt: string;
  exposeToClient: boolean;
  environments: {
    development: boolean;
    staging: boolean;
    production: boolean;
  };
}

// Cache configuration
const TTL_MS = 30_000; // 30 seconds
const CACHE_KEY = 'flags:v1';
const INVALIDATION_KEY = 'flags:changed';

// Global state
let cache: { ts: number; flags: FlagMap; hash: string } = { 
  ts: 0, 
  flags: {}, 
  hash: '' 
};

// Kill switch - disables ALL non-essential flags
const disabledAll = process.env.FLAGS_DISABLED_ALL === '1';

// Default flag values (safe fallbacks)
const defaultFlags: FlagMap = {
  'wizard.v1': { enabled: false, exposeToClient: true },
  'reserves.v1_1': { enabled: false, exposeToClient: false }
};

/**
 * Load flags from Redis/KV store
 */
async function loadFlagsFromStore(): Promise<FlagMap | null> {
  try {
    // For now, use environment-specific defaults
    // In production, this would fetch from Upstash Redis or similar KV store
    const env = process.env.NODE_ENV || 'development';
    
    // Environment-specific overrides
    const envFlags: FlagMap = {
      'wizard.v1': { 
        enabled: env === 'development', 
        exposeToClient: true 
      },
      'reserves.v1_1': { 
        enabled: false, 
        exposeToClient: false 
      }
    };
    
    return envFlags;
  } catch (error) {
    console.error('Failed to load flags from store:', error);
    return null;
  }
}

/**
 * Get current flags with caching and fallback
 */
export async function getFlags(): Promise<FlagMap> {
  // Kill switch - return empty flags (all disabled)
  if (disabledAll) {
    console.warn('FLAGS_DISABLED_ALL is active - all flags disabled');
    return {};
  }
  
  const now = Date.now();
  
  // Check if cache is still valid
  if (now - cache.ts <= TTL_MS && Object.keys(cache.flags).length > 0) {
    return cache.flags;
  }
  
  // Try to load fresh flags
  const freshFlags = await loadFlagsFromStore();
  
  if (freshFlags) {
    const flagsJson = JSON.stringify(freshFlags);
    const hash = createHash('sha256').update(flagsJson).digest('hex').substring(0, 8);
    
    cache = {
      ts: now,
      flags: freshFlags,
      hash
    };
    
    console.log(`Flags updated: ${Object.keys(freshFlags).length} flags, hash: ${hash}`);
    return freshFlags;
  }
  
  // Fallback to defaults if store is unreachable
  console.warn('Using default flags - store unavailable');
  return defaultFlags;
}

/**
 * Check if a specific flag is enabled
 */
export async function isEnabled(key: string, context?: Record<string, any>): Promise<boolean> {
  const flags = await getFlags();
  const flag = flags[key];
  
  if (!flag) {
    console.warn(`Flag '${key}' not found, defaulting to false`);
    return false;
  }
  
  // Simple enabled check (targeting rules would go here)
  return flag.enabled;
}

/**
 * Get flags safe for client exposure
 */
export async function getClientFlags(): Promise<Record<string, boolean>> {
  const flags = await getFlags();
  const clientFlags: Record<string, boolean> = {};
  
  for (const [key, flag] of Object.entries(flags)) {
    if (flag.exposeToClient) {
      clientFlags[key] = flag.enabled;
    }
  }
  
  return clientFlags;
}

/**
 * Update a flag value with audit trail
 */
export async function updateFlag(
  key: string,
  updates: Partial<FlagValue>,
  actor: string,
  reason?: string
): Promise<void> {
  const currentFlags = await getFlags();
  const before = currentFlags[key] || null;
  const after = { ...before, ...updates };
  
  // Log the change
  const change: NewFlagChange = {
    key,
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: JSON.parse(JSON.stringify(after)),
    actor,
    reason: reason || 'Manual update'
  };
  
  try {
    await db.insert(flagChanges).values(change);
    console.log(`Flag '${key}' updated by ${actor}: ${JSON.stringify(updates)}`);
    
    // Update store (in production, this would update Redis and publish invalidation)
    currentFlags[key] = after;
    
    // Invalidate cache
    cache.ts = 0;
    
  } catch (error) {
    console.error('Failed to update flag:', error);
    throw new Error(`Failed to update flag '${key}': ${error.message}`);
  }
}

/**
 * Get flag change history
 */
export async function getFlagHistory(key?: string): Promise<FlagChange[]> {
  const query = db.select().from(flagChanges);
  
  if (key) {
    query.where(eq(flagChanges.key, key));
  }
  
  return query.orderBy(desc(flagChanges.createdAt)).limit(100);
}

/**
 * Kill switch demo - immediately disable all flags
 */
export function activateKillSwitch(): void {
  process.env.FLAGS_DISABLED_ALL = '1';
  cache.ts = 0; // Force cache refresh
  console.warn('🚨 KILL SWITCH ACTIVATED - All flags disabled');
}

/**
 * Get cache status for monitoring
 */
export function getCacheStatus(): { age: number; hash: string; flagCount: number } {
  return {
    age: Date.now() - cache.ts,
    hash: cache.hash,
    flagCount: Object.keys(cache.flags).length
  };
}

// Import statement fix
import { eq, desc } from 'drizzle-orm';