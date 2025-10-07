type Inflight<T> = { promise: Promise<T>; count: number };

export class Singleflight {
  private map = new Map<string, Inflight<any>>();
  async do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.map.get(key);
    if (existing) {
      existing.count += 1;
      try { return await existing.promise; } finally { existing.count -= 1; if (existing.count === 0) this.map.delete(key); }
    }
    const entry: Inflight<T> = { promise: fn(), count: 1 };
    this.map.set(key, entry);
    try { return await entry.promise; } finally { entry.count -= 1; if (entry.count === 0) this.map.delete(key); }
  }
}
