// Minimal singleflight to coalesce duplicate inflight work by key
const inflight = new Map<string, Promise<any>>();

export function singleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = fn()
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
