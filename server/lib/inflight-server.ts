/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import type { IdempotencyStore } from './idempotency';

export async function getOrStart<T>(
  store: IdempotencyStore,
  key: string,
  worker: (_signal: AbortSignal) => Promise<T>,
  ttlMs = 60_000
): Promise<{ status: 'joined' | 'created'; promise: Promise<T> }> {
  const existing = await store.get<T>(key);
  if (existing?.status === 'succeeded') {
    return { status: 'joined', promise: Promise.resolve(existing.result as T) };
  }
  if (existing?.status === 'in-progress') {
    // In a Redis-backed impl, you would return a shared promise via pub/sub or an operation endpoint.
    return { status: 'joined', promise: Promise.reject(new Error('in-progress')) };
  }

  const controller = new AbortController();
  await store['set'](key, { status: 'in-progress', updatedAt: Date.now(), ttlMs });

  const p = (async () => {
    try {
      const out = await worker(controller.signal);
      await store['set'](key, { status: 'succeeded', result: out, updatedAt: Date.now(), ttlMs });
      return out;
    } catch (e: any) {
      await store['set'](key, { status: 'failed', error: String(e?.message ?? e), updatedAt: Date.now(), ttlMs });
      throw e;
    }
  })();

  return { status: 'created', promise: p };
}
