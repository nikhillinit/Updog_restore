/**
 * mockAbortableFetch
 * A tiny, abort-aware fetch mock for timing-sensitive tests.
 *
 * Usage:
 *   import { mockAbortableFetch } from '../helpers/mockAbortableFetch';
 *   mockAbortableFetch({ delayMs: 50, json: { ok: true } });
 *
 *   // Your code under test can pass an AbortSignal; if it aborts before `delayMs`,
 *   // the returned promise rejects with an AbortError-like object.
 */
import { vi } from 'vitest';

type MockFetchOpts = {
  delayMs?: number;
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
};

function createAbortError(): Error {
  // DOMException might not exist in Node; fall back to Error with name "AbortError".
  try {
    // @ts-ignore
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch {
    const err = new Error('The operation was aborted.');
    (err as any).name = 'AbortError';
    return err;
  }
}

export function mockAbortableFetch({
  delayMs = 0,
  status = 200,
  json,
  text,
  headers = {},
}: MockFetchOpts = {}) {
  const bodyText =
    text ?? (json !== undefined ? JSON.stringify(json) : '');

  const makeResponse = () => ({
    ok: status >= 200 && status < 300,
    status,
    headers,
    // Keep the surface minimal; most tests only need json()/text()
    async json() {
      return json;
    },
    async text() {
      return bodyText;
    },
  });

  // @ts-ignore - we intentionally assign to globalThis.fetch
  globalThis.fetch = vi.fn((input: RequestInfo, init?: RequestInit) => {
    return new Promise((resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;

      const abortNow = () => {
        cleanup();
        reject(createAbortError());
      };

      const cleanup = () => {
        signal?.removeEventListener('abort', abortNow);
      };

      if (signal?.aborted) {
        return abortNow();
      }

      signal?.addEventListener('abort', abortNow);

      const timer = setTimeout(() => {
        cleanup();
        resolve(makeResponse());
      }, delayMs);

      // If the test advances time or completes early, timers are fine.
      void timer;
    });
  });
}