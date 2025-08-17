// server/infra/cache-store.ts
// Abstract cache store interface with statistics

export interface CacheStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  mget<T = unknown>(keys: string[]): Promise<(T | undefined)[]>;
  mset<T = unknown>(entries: Array<[string, T, number?]>): Promise<void>;
  ping?(): Promise<boolean>;
  clear?(): Promise<void>;
  size?(): Promise<number>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
  size: number;
  hitRate: number;
}

export abstract class BaseCacheStore implements CacheStore {
  protected stats: CacheStats = { 
    hits: 0, 
    misses: 0, 
    errors: 0, 
    size: 0,
    hitRate: 0
  };

  abstract get<T>(key: string): Promise<T | undefined>;
  abstract set<T>(key: string, value: T, ttlSec?: number): Promise<void>;
  abstract del(key: string): Promise<void>;

  // Default implementations that can be overridden
  async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)));
  }

  async mset<T>(entries: Array<[string, T, number?]>): Promise<void> {
    await Promise.all(entries.map(([key, value, ttl]) => 
      this.set(key, value, ttl)
    ));
  }

  async ping(): Promise<boolean> {
    try {
      const testKey = '__ping__';
      await this.set(testKey, 'pong', 1);
      const result = await this.get(testKey);
      return result === 'pong';
    } catch {
      return false;
    }
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;
    return { 
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100
    };
  }

  protected recordHit() { 
    this.stats.hits++; 
  }
  
  protected recordMiss() { 
    this.stats.misses++; 
  }
  
  protected recordError() { 
    this.stats.errors++; 
  }
}

// In-memory cache implementation
export class MemoryCacheStore extends BaseCacheStore {
  private cache = new Map<string, { value: any; expiresAt?: number }>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key);
    if (!entry) {
      this.recordMiss();
      return undefined;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.recordMiss();
      return undefined;
    }

    this.recordHit();
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    const expiresAt = ttlSec ? Date.now() + ttlSec * 1000 : undefined;
    this.cache.set(key, { value, expiresAt });
    this.stats.size = this.cache.size;
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
    this.stats.size = this.cache.size;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.stats.size = 0;
  }

  async size(): Promise<number> {
    return this.cache.size;
  }
}