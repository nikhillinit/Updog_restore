// Bounded write-intent queue for best-effort reconcile after OPEN periods
export interface WriteIntent {
  key: string;
  value: unknown;
  ttl?: number;
  ts: number;
}

export class WriteIntentQueue {
  private q: WriteIntent[] = [];
  constructor(private max = 1000) {}
  push(intent: WriteIntent) {
    if (this.q.length >= this.max) this.q.shift();
    this.q.push(intent);
  }
  drain(): WriteIntent[] {
    const out = this.q;
    this.q = [];
    return out;
  }
  size() { return this.q.length; }
}
