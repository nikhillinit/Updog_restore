export class Mutex {
  private tail = Promise.resolve();
  runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const p = this.tail.then(() => fn());
    this.tail = p.catch(() => {});
    return p;
  }
}
