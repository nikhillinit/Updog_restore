// Zero-dependency async mutex
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.tail.then(() => fn());
    // Swallow errors in tail to prevent chain breakage; actual error propagates via next
    this.tail = next.catch((err) => {
      console.debug('[Mutex] Previous operation in chain failed:', err?.message || err);
    });
    return next;
  }
}
