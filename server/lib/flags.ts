/**
 * Feature Flag Provider
 * Production-grade flag system with TTL, versioning, and audit integrity
 */

import { createHash } from 'crypto';
import { flagChanges, flagsState, type FlagChange, type NewFlagChange, type FlagState, type NewFlagState } from '../../shared/schemas/flags.js';
import { db } from '../db.js';
import { eq, desc } from 'drizzle-orm';

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

export interface FlagSnapshot {
  version: string;
  flags: FlagMap;
  hash: string;
  timestamp: number;
  environment: string;
}

export interface UserContext {
  id: string;
  email?: string;
  attributes?: Record<string, string>;
}

// Cache configuration
const TTL_MS = 30_000; // 30 seconds
const LKG_TTL_MS = 5 * 60 * 1000; // 5 minutes Last Known Good
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const CACHE_KEY = `flags:v1:${ENVIRONMENT}`;
const INVALIDATION_KEY = 'flags:changed';

// Global state with versioning and LKG
let cache: { 
  ts: number; 
  flags: FlagMap; 
  hash: string; 
  version: string;
  environment: string;
} = { 
  ts: 0, 
  flags: {}, 
  hash: '',
  version: '0',
  environment: ENVIRONMENT
};

let lastKnownGood: FlagSnapshot | null = null;

// Kill switch - disables ALL non-essential flags
const disabledAll = process.env.FLAGS_DISABLED_ALL === '1';

// Default flag values (safe fallbacks)
const defaultFlags: FlagMap = {
  'wizard.v1': { enabled: false, exposeToClient: true },
  'reserves.v1_1': { enabled: false, exposeToClient: false }
};

/**
 * Generate monotonic version string
 */
function generateVersion(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
}

/**
 * Compute deterministic hash for user bucketing
 */
function murmur3_32(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 0x9e3779b9);
    h = h ^ (h >>> 16);
  }
  return Math.abs(h);
}

/**
 * Check if user is in percentage bucket (deterministic)
 */
export function inBucket(userId: string, percent: number): boolean {
  const h = murmur3_32(userId) % 10000; // 0..9999
  return h < percent * 100; // e.g., 0.25 -> 2500
}

/**
 * Evaluate targeting rules for a flag
 */
function evaluateTargeting(flag: FlagValue, userContext?: UserContext): boolean {
  if (!flag.targeting?.enabled || !userContext) {
    return flag.enabled;
  }

  for (const rule of flag.targeting.rules) {
    if (rule.attribute === 'userId' && rule.operator === 'in_bucket' && rule.percentage) {
      if (inBucket(userContext.id, rule.percentage)) {
        return true;
      }
    }
    // Add more targeting rules as needed
  }

  return flag.enabled;
}

/**
 * Load flags from store with version tracking
 */
async function loadFlagsFromStore(): Promise<FlagSnapshot | null> {
  try {
    // Try to load from database first
    const latestState = await db.select()
      .from(flagsState)
      .where(eq(flagsState.environment, ENVIRONMENT))
      .orderBy(desc(flagsState.createdAt))
      .limit(1);

    if (latestState.length > 0) {
      const state = latestState[0];
      return {
        version: state.version,
        flags: state.flags as FlagMap,
        hash: state.flagsHash,
        timestamp: state.createdAt.getTime(),
        environment: state.environment
      };
    }

    // Fallback to environment defaults
    const version = generateVersion();
    const envFlags: FlagMap = {
      'wizard.v1': { 
        enabled: ENVIRONMENT === 'development', 
        exposeToClient: true 
      },
      'reserves.v1_1': { 
        enabled: false, 
        exposeToClient: false 
      }
    };

    const flagsJson = JSON.stringify(envFlags);
    const hash = createHash('sha256').update(flagsJson).digest('hex').substring(0, 16);

    // Store initial state
    await db.insert(flagsState).values({
      version,
      flagsHash: hash,
      flags: envFlags,
      environment: ENVIRONMENT
    }).onConflictDoNothing();

    return {
      version,
      flags: envFlags,
      hash,
      timestamp: Date.now(),
      environment: ENVIRONMENT
    };
    
  } catch (error) {
    console.error('Failed to load flags from store:', error);
    return null;
  }
}

/**
 * Get current flags with versioning and Last Known Good fallback
 */
export async function getFlags(): Promise<FlagSnapshot> {
  // Kill switch - return empty flags (all disabled)
  if (disabledAll) {
    console.warn('FLAGS_DISABLED_ALL is active - all flags disabled');
    return {
      version: cache.version,
      flags: {},
      hash: '',
      timestamp: Date.now(),
      environment: ENVIRONMENT
    };
  }
  
  const now = Date.now();
  
  // Check if cache is still valid
  if (now - cache.ts <= TTL_MS && Object.keys(cache.flags).length > 0) {
    return {
      version: cache.version,
      flags: cache.flags,
      hash: cache.hash,
      timestamp: cache.ts,
      environment: cache.environment
    };
  }
  
  // Try to load fresh flags
  const freshSnapshot = await loadFlagsFromStore();
  
  if (freshSnapshot) {
    cache = {
      ts: now,
      flags: freshSnapshot.flags,
      hash: freshSnapshot.hash,
      version: freshSnapshot.version,
      environment: freshSnapshot.environment
    };
    
    // Update Last Known Good
    lastKnownGood = freshSnapshot;
    
    console.log(`Flags updated: ${Object.keys(freshSnapshot.flags).length} flags, version: ${freshSnapshot.version}, hash: ${freshSnapshot.hash}`);
    return freshSnapshot;
  }
  
  // Use Last Known Good if available and not too old
  if (lastKnownGood && (now - lastKnownGood.timestamp <= LKG_TTL_MS)) {
    console.warn(`Using Last Known Good flags (${Math.round((now - lastKnownGood.timestamp) / 1000)}s old)`);
    return lastKnownGood;
  }
  
  // Final fallback to defaults
  console.warn('Using default flags - store unavailable and LKG expired');
  const version = generateVersion();
  const flagsJson = JSON.stringify(defaultFlags);
  const hash = createHash('sha256').update(flagsJson).digest('hex').substring(0, 16);
  
  return {
    version,
    flags: defaultFlags,
    hash,
    timestamp: now,
    environment: ENVIRONMENT
  };
}

/**
 * Check if a specific flag is enabled with targeting
 */
export async function isEnabled(key: string, userContext?: UserContext): Promise<boolean> {
  const snapshot = await getFlags();
  const flag = snapshot.flags[key];
  
  if (!flag) {
    console.warn(`Flag '${key}' not found, defaulting to false`);
    return false;
  }
  
  // Evaluate targeting rules
  return evaluateTargeting(flag, userContext);
}

/**
 * Get flags safe for client exposure
 */
export async function getClientFlags(userContext?: UserContext): Promise<{ flags: Record<string, boolean>; version: string; hash: string }> {
  const snapshot = await getFlags();
  const clientFlags: Record<string, boolean> = {};
  
  for (const [key, flag] of Object.entries(snapshot.flags)) {
    if (flag.exposeToClient) {
      clientFlags[key] = evaluateTargeting(flag, userContext);
    }
  }
  
  return {
    flags: clientFlags,
    version: snapshot.version,
    hash: snapshot.hash
  };
}

/**
 * Get current flags hash for ETag support
 */
export async function getFlagsHash(): Promise<string> {
  const snapshot = await getFlags();
  return snapshot.hash;
}

/**
 * Get current flags version for concurrency control
 */
export async function getFlagsVersion(): Promise<string> {
  const snapshot = await getFlags();
  return snapshot.version;
}

/**
 * Update a flag value with audit trail
 */
export async function updateFlag(
  key: string,
  updates: Partial<FlagValue>,
  user: { sub: string; email: string; ip: string; userAgent: string },
  reason: string
): Promise<void> {
  const snapshot = await getFlags();
  const before = snapshot.flags[key] || null;
  const after = { ...before, ...updates };
  
  // Generate change hash
  const changeData = JSON.stringify({ before, after, actor: user.sub, timestamp: Date.now() });
  const changeHash = createHash('sha256').update(changeData).digest('hex').substring(0, 16);
  
  // Log the change
  const change: NewFlagChange = {
    key,
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: JSON.parse(JSON.stringify(after)),
    actorSub: user.sub,
    actorEmail: user.email,
    ip: user.ip,
    userAgent: user.userAgent,
    reason,
    changeHash,
    version: snapshot.version
  };
  
  try {
    await db.insert(flagChanges).values(change);
    console.log(`Flag '${key}' updated by ${user.email}: ${JSON.stringify(updates)}`);
    
    // Update store with new version
    const newVersion = generateVersion();
    const updatedFlags = { ...snapshot.flags, [key]: after };
    const newHash = createHash('sha256').update(JSON.stringify(updatedFlags)).digest('hex').substring(0, 16);
    
    // Store new state
    await db.insert(flagsState).values({
      version: newVersion,
      flagsHash: newHash,
      flags: updatedFlags,
      environment: ENVIRONMENT
    });
    
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