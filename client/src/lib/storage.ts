/**
 * Production-Grade localStorage Wrapper
 *
 * Safety features:
 * - Namespace isolation with exact prefix matching
 * - SSR/privacy-mode safety (no throws)
 * - Zod validation at load/save
 * - 7-day TTL with auto-cleanup
 * - Version migrations built-in
 * - Explicit success/failure returns
 *
 * @example
 * import { loadFromStorage, saveToStorage } from '@/lib/storage';
 * import { MySchema } from '@/schemas/my-schema';
 *
 * const data = loadFromStorage('my-key', MySchema);
 * const success = saveToStorage('my-key', data, MySchema);
 */

import { z } from 'zod';

// ============================================================================
// CONFIGURATION
// ============================================================================

const NAMESPACE = 'povc';
const NS_PREFIX = `${NAMESPACE}:`; // Exact prefix (prevents matching "povcX...")
const ALLOWED_KEYS = new Set(['modeling-wizard-progress', 'fund-preferences', 'ui-state']);
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CURRENT_VERSION = 1;

// ============================================================================
// TYPES
// ============================================================================

interface Persisted<T> {
  v: number;
  at: number;
  data: T;
}

type Migrator = (raw: Persisted<any>) => Persisted<any> | null;

// ============================================================================
// MIGRATIONS
// ============================================================================

/**
 * Version migration chain
 * Add new migrations as MIGRATIONS[n] when incrementing CURRENT_VERSION
 */
const MIGRATIONS: Record<number, Migrator> = {
  // Example: v0 -> v1 (add timestamp if missing)
  0: (raw) => ({
    v: 1,
    at: raw.at ?? Date.now(),
    data: raw.data
  }),
};

/**
 * Migrate data through version chain
 */
function migrate<T>(obj: Persisted<T>): Persisted<T> | null {
  while (obj.v < CURRENT_VERSION) {
    const step = MIGRATIONS[obj.v];
    if (!step) {
      console.warn(`[Storage] No migration path from v${obj.v} to v${CURRENT_VERSION}`);
      return null;
    }

    const next = step(obj);
    if (!next) {
      console.warn(`[Storage] Migration from v${obj.v} failed`);
      return null;
    }

    obj = next;
  }

  return obj;
}

// ============================================================================
// STORAGE AVAILABILITY CHECK
// ============================================================================

/**
 * Check if localStorage is available (SSR/privacy-mode safe)
 *
 * Returns false in:
 * - Server-side rendering (typeof window === 'undefined')
 * - Safari private mode (throws on setItem)
 * - Quota exceeded scenarios
 */
function hasStorage(): boolean {
  try {
    if (typeof window === 'undefined') return false;

    const probe = '__storage_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Load from storage with schema validation
 *
 * @param key - Storage key (must be in ALLOWED_KEYS)
 * @param schema - Zod schema for runtime validation
 * @returns Validated data or null (never throws)
 *
 * @example
 * const data = loadFromStorage('my-key', MySchema);
 * if (!data) {
 *   // Handle missing/invalid/expired data
 * }
 */
export function loadFromStorage<T>(key: string, schema: z.ZodType<T>): T | null {
  if (!hasStorage()) return null;

  if (!ALLOWED_KEYS.has(key)) {
    console.warn(`[Storage] Attempted to read disallowed key: ${key}`);
    return null;
  }

  const k = `${NS_PREFIX}${key}`;
  const raw = localStorage.getItem(k);
  if (!raw) return null;

  try {
    let obj = JSON.parse(raw) as Persisted<T>;

    // Validate structure
    if (typeof obj !== 'object' || obj === null || typeof obj.v !== 'number' || typeof obj.at !== 'number') {
      console.warn(`[Storage] Invalid structure for key: ${key}`);
      localStorage.removeItem(k);
      return null;
    }

    // Migrate if needed
    const migrated = migrate(obj);
    if (!migrated) {
      localStorage.removeItem(k);
      return null;
    }
    obj = migrated;

    // Check TTL
    if (Date.now() - obj.at > TTL_MS) {
      console.info(`[Storage] Expired data for key: ${key} (age: ${Math.floor((Date.now() - obj.at) / 86400000)}d)`);
      localStorage.removeItem(k);
      return null;
    }

    // Validate data payload against schema
    const validation = schema.safeParse(obj.data);
    if (!validation.success) {
      console.warn(`[Storage] Schema validation failed for key: ${key}`, validation.error.errors);
      localStorage.removeItem(k); // Remove invalid data
      return null;
    }

    return validation.data;
  } catch (error) {
    console.error(`[Storage] Parse error for key: ${key}`, error);
    localStorage.removeItem(k); // Clean up malformed data
    return null;
  }
}

/**
 * Save to storage with optional validation
 *
 * @param key - Storage key (must be in ALLOWED_KEYS)
 * @param data - Data to save
 * @param schema - Optional Zod schema for pre-save validation
 * @returns true if saved successfully, false otherwise
 *
 * @example
 * const success = saveToStorage('my-key', data, MySchema);
 * if (!success) {
 *   // Handle save failure (quota exceeded, validation failed, etc.)
 * }
 */
export function saveToStorage<T>(
  key: string,
  data: T,
  schema?: z.ZodType<T>
): boolean {
  if (!hasStorage()) return false;

  if (!ALLOWED_KEYS.has(key)) {
    console.warn(`[Storage] Attempted to write disallowed key: ${key}`);
    return false;
  }

  // Optional: Validate before saving
  if (schema) {
    const validation = schema.safeParse(data);
    if (!validation.success) {
      console.error(`[Storage] Refusing to save invalid data for key: ${key}`, validation.error.errors);
      return false;
    }
  }

  const k = `${NS_PREFIX}${key}`;
  const payload: Persisted<T> = {
    v: CURRENT_VERSION,
    at: Date.now(),
    data
  };

  try {
    localStorage.setItem(k, JSON.stringify(payload));
    return true;
  } catch (error) {
    // Handle quota exceeded or other errors
    console.error(`[Storage] Write failed for key: ${key}`, error);
    return false;
  }
}

/**
 * Remove item from storage
 */
export function removeFromStorage(key: string): boolean {
  if (!hasStorage()) return false;
  if (!ALLOWED_KEYS.has(key)) return false;

  const k = `${NS_PREFIX}${key}`;
  try {
    localStorage.removeItem(k);
    return true;
  } catch (error) {
    console.error(`[Storage] Remove failed for key: ${key}`, error);
    return false;
  }
}

/**
 * Clear expired data safely
 *
 * Phase 1: Collect keys to remove (prevents iteration bugs)
 * Phase 2: Remove collected keys
 */
export function clearExpiredData(): void {
  if (!hasStorage()) return;

  const now = Date.now();
  const keysToRemove: string[] = [];

  // Phase 1: Collect keys to remove
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(NS_PREFIX)) continue; // Exact prefix match

      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        const obj = JSON.parse(raw) as Persisted<unknown>;
        if (
          typeof obj === 'object' &&
          obj !== null &&
          obj.v === CURRENT_VERSION &&
          typeof obj.at === 'number' &&
          now - obj.at > TTL_MS
        ) {
          keysToRemove.push(key);
        }
      } catch {
        // Malformed data should also be cleared
        keysToRemove.push(key);
      }
    }

    // Phase 2: Remove collected keys
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
      console.info(`[Storage] Cleared stale/expired key: ${key}`);
    }

    if (keysToRemove.length > 0) {
      console.info(`[Storage] Cleanup complete: ${keysToRemove.length} items removed`);
    }
  } catch (error) {
    console.error('[Storage] Cleanup failed:', error);
  }
}

/**
 * Get storage stats (for debugging)
 */
export function getStorageStats(): {
  available: boolean;
  itemCount: number;
  namespacedItems: number;
  estimatedSize: number;
} {
  if (!hasStorage()) {
    return { available: false, itemCount: 0, namespacedItems: 0, estimatedSize: 0 };
  }

  try {
    let namespacedItems = 0;
    let estimatedSize = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith(NS_PREFIX)) {
        namespacedItems++;
        const value = localStorage.getItem(key);
        if (value) {
          estimatedSize += key.length + value.length;
        }
      }
    }

    return {
      available: true,
      itemCount: localStorage.length,
      namespacedItems,
      estimatedSize // rough bytes estimate (key + value lengths)
    };
  } catch (error) {
    console.error('[Storage] Stats failed:', error);
    return { available: true, itemCount: 0, namespacedItems: 0, estimatedSize: 0 };
  }
}

// ============================================================================
// AUTO-INITIALIZATION
// ============================================================================

// Auto-cleanup on app init (only in browser)
if (hasStorage()) {
  clearExpiredData();
}
