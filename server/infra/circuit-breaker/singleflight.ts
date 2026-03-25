// Minimal singleflight to coalesce duplicate inflight work by key
const inflight = new Map<string, Promise<unknown>>();

export function singleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}
