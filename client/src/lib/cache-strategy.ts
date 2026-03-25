/**
 * CalculationCache: LRU with TTL and stable hashing.
 * - Uses Web Crypto if available, falls back to Node 'crypto' in tests/SSR.
 * - Updates recency on get() via Map deletion+set.
 */
type CacheEntry<TData> = {
  data: TData;
  ts: number;
};

export class CalculationCache<TInput, TData> {
  private cache = new Map<string, CacheEntry<TData>>();

  constructor(private maxSize = 100, private ttlMs = 5 * 60 * 1000) {}

  private async hashJSON(obj: TInput): Promise<string> {
    const json = JSON.stringify(obj);

    const webCrypto = globalThis.crypto;
    if (webCrypto?.subtle) {
      const enc = new TextEncoder().encode(json);
      const digest = await webCrypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    try {
      const { createHash } = await import('crypto');
      return createHash('sha256').update(json).digest('hex');
    } catch {
      // Last-resort poor-man hash (non-cryptographic)
      let h = 0;
      for (let i = 0; i < json.length; i++) {
        h = ((h << 5) - h) + json.charCodeAt(i);
        h |= 0;
      }
      return String(h >>> 0);
    }
  }

  private touch(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;

    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  async get(input: TInput): Promise<TData | null> {
    const key = await this.hashJSON(input);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.ts > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    this.touch(key);
    return entry.data;
  }

  async set(input: TInput, data: TData): Promise<void> {
    const key = await this.hashJSON(input);

    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, { data, ts: Date.now() });
  }

  // Clear all cached data - useful for tests and manual cache management
  clear(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }
}

// Export a singleton instance for global cache clearing in tests
export const globalCalculationCache = new CalculationCache<unknown, unknown>();

// Export function for clearing all caches (used in tests)
export const clearCache = (): void => {
  globalCalculationCache.clear();
};
