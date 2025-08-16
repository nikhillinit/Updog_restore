/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
export type Status = 'in-progress' | 'succeeded' | 'failed';

export interface IdemRecord<T = unknown> {
  status: Status;
  result?: T;
  error?: string;
  updatedAt: number;
  ttlMs: number;
}

export interface IdempotencyStore {
  get<T = unknown>(key: string): Promise<IdemRecord<T> | undefined>;
  set<T = unknown>(key: string, rec: IdemRecord<T>): Promise<void>;
  del(key: string): Promise<void>;
}

// In-memory store with TTL GC (sufficient for single-process dev/test)
export function memoryStore(): IdempotencyStore {
  const m = new Map<string, IdemRecord>();
  const gc = () => {
    const now = Date.now();
    for (const [k, v] of m) if (now - v.updatedAt > v.ttlMs) m.delete(k);
  };
  setInterval(gc, 10_000).unref();
  return {
    async get<T>(key: string) { return m.get(key) as IdemRecord<T> | undefined; },
    async set<T>(key: string, rec: IdemRecord<T>) { m.set(key, rec); },
    async del(key: string) { m.delete(key); }
  };
}

// (Optional) Hook up a Redis-backed store implementing IdempotencyStore in production.
