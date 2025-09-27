export interface KV {
  get<T>(_k: string): Promise<T | undefined>;
  set<T>(_k: string, _v: T, ttlMs?: number): Promise<void>;
  delete(_k: string): Promise<boolean>;
}

type Wrapped<T> = { v: T; x: number }; // value + expiresAtMs

export class TTLCache<T> {
  constructor(private kv: KV) {}

  private wrap(value: T, ttlMs?: number): Wrapped<T> {
    const now = Date.now();
    const expiresAt = typeof ttlMs === 'number' ? now + ttlMs : Number.POSITIVE_INFINITY;
    return { v: value, x: expiresAt };
  }

  async set(key: string, value: T, ttlMs?: number) {
    await this.kv.set<Wrapped<T>>(key, this.wrap(value, ttlMs), ttlMs);
  }

  async get(key: string): Promise<T | undefined> {
    const w = await this.kv.get<Wrapped<T>>(key);
    if (!w) return undefined;
    const now = Date.now();
    if (now >= w.x) {
      await this.kv.delete(key); // expire eagerly
      return undefined;
    }
    return w.v;
  }

  async ttlMs(key: string): Promise<number> {
    const w = await this.kv.get<Wrapped<T>>(key);
    if (!w) return 0;
    const now = Date.now();
    return Math.max(0, w.x - now);
  }
}

// Simple in-memory KV adapter for health cache
export class MemoryKV implements KV {
  private store = new Map<string, any>();

  async get<T>(k: string): Promise<T | undefined> {
    return this.store['get'](k);
  }

  async set<T>(k: string, v: T, ttlMs?: number): Promise<void> {
    this.store['set'](k, v);
    // For memory KV, we could implement native TTL cleanup here if needed
    // But the TTLCache wrapper handles expiration logic
  }

  async delete(k: string): Promise<boolean> {
    return this.store.delete(k);
  }

  clear(): void {
    this.store.clear();
  }
}