/**
 * CalculationCache: LRU with TTL and stable hashing.
 * - Uses Web Crypto if available, falls back to Node 'crypto' in tests/SSR.
 * - Updates recency on get() via Map deletion+set.
 */
export class CalculationCache<TInput, TData> {
  private cache = new Map<string, { data: TData; ts: number }>();
  constructor(private maxSize = 100, private ttlMs = 5 * 60 * 1000) {}

  private async hashJSON(obj: TInput): Promise<string> {
    const json = JSON.stringify(obj);
    // Browser path
    if (typeof globalThis.crypto !== 'undefined' && (globalThis.crypto as any).subtle) {
      const enc = new TextEncoder().encode(json);
      const digest = await (globalThis.crypto as any).subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Node path (tests/SSR)
    try {
      // @ts-ignore dynamic import for Node only
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

  private touch(k: string) {
    const v = this.cache['get'](k);
    if (!v) return;
    this.cache.delete(k);
    this.cache['set'](k, v); // move to MRU
  }

  async get(input: TInput): Promise<TData | null> {
    const k = await this.hashJSON(input);
    const v = this.cache['get'](k);
    if (!v) return null;
    if (Date.now() - v.ts > this.ttlMs) {
      this.cache.delete(k);
      return null;
    }
    this.touch(k);
    return v.data;
  }

  async set(input: TInput, data: TData): Promise<void> {
    const k = await this.hashJSON(input);
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache['set'](k, { data, ts: Date.now() });
  }

  // Clear all cached data - useful for tests and manual cache management
  clear(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs
    };
  }
}

// Export a singleton instance for global cache clearing in tests
export const globalCalculationCache = new CalculationCache<any, any>();

// Export function for clearing all caches (used in tests)
export const clearCache = () => {
  globalCalculationCache.clear();
};