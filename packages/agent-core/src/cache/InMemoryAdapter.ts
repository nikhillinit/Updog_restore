/**
 * In-Memory Cache Adapter
 *
 * Simple in-memory implementation of CacheAdapter for testing.
 * Not suitable for production (no persistence).
 *
 * Phase 2 - Issue #2: Redis L2 Cache
 */

import {
  CacheAdapter,
  CacheAdapterConfig,
  CacheEntry
} from './CacheAdapter';

interface CacheItem<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory adapter implementation
 *
 * Usage:
 * ```typescript
 * const adapter = new InMemoryAdapter();
 * await adapter.set('key', value, 60);
 * const cached = await adapter.get('key');
 * ```
 */
export class InMemoryAdapter implements CacheAdapter {
  private store = new Map<string, CacheItem<unknown>>();
  private sets = new Map<string, Set<string>>();

  constructor(config?: Partial<CacheAdapterConfig>) {
    // Config ignored for in-memory adapter
  }

  async get<T>(key: string): Promise<T | null> {
    const item = this.store.get(key);

    if (!item) return null;

    // Check expiration
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return item.value as T;
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(k => this.get<T>(k)));
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    const expiresAt = Date.now() + (ttlSec * 1000);

    this.store.set(key, {
      value,
      expiresAt
    });
  }

  async mset<T>(entries: CacheEntry<T>[]): Promise<void> {
    for (const { key, value, ttlSec } of entries) {
      await this.set(key, value, ttlSec);
    }
  }

  async del(keys: string | string[]): Promise<number> {
    const keysArray = Array.isArray(keys) ? keys : [keys];
    let deleted = 0;

    for (const key of keysArray) {
      if (this.store.delete(key)) {
        deleted++;
      }
    }

    return deleted;
  }

  async ttl(key: string): Promise<number | null> {
    const item = this.store.get(key);

    if (!item) return null;

    const remaining = Math.floor((item.expiresAt - Date.now()) / 1000);

    return remaining > 0 ? remaining : null;
  }

  async sadd(setKey: string, member: string): Promise<void> {
    if (!this.sets.has(setKey)) {
      this.sets.set(setKey, new Set());
    }

    this.sets.get(setKey)!.add(member);
  }

  async smembers(setKey: string): Promise<string[]> {
    const set = this.sets.get(setKey);
    return set ? Array.from(set) : [];
  }

  async ping(): Promise<boolean> {
    return true;
  }

  getName(): string {
    return 'InMemoryAdapter';
  }

  isCircuitOpen(): boolean {
    return false;
  }

  /**
   * Clear all data (testing utility)
   */
  clear(): void {
    this.store.clear();
    this.sets.clear();
  }

  /**
   * Get size (testing utility)
   */
  size(): number {
    return this.store.size;
  }
}
