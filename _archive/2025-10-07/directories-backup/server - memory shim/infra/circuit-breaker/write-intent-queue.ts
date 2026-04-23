export interface WriteIntent<T=any> {
  key: string;
  value: T;
  ttl?: number;
  ts: number;
}
export class WriteIntentQueue<T=any> {
  private q: WriteIntent<T>[] = [];
  constructor(private capacity: number = 1000) {}
  enqueue(intent: WriteIntent<T>) {
    if (this.q.length >= this.capacity) this.q.shift();
    this.q.push(intent);
  }
  drain(handler: (wi: WriteIntent<T>) => Promise<void>): Promise<void> {
    const items = this.q.splice(0, this.q.length);
    return items.reduce((p, wi) => p.then(() => handler(wi)), Promise.resolve());
  }
  size() { return this.q.length; }
}
