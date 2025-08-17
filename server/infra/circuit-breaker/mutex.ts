// Zero-dependency async mutex
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.tail.then(() => fn());
    this.tail = next.catch(() => {});
    return next;
  }
}
