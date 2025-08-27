import { beforeEach, afterEach, vi } from 'vitest';

// ---------- Unique test keys ----------
const baseId =
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);

let seq = 0;
/** Deterministic-enough unique key generator for caches/registries */
export function uniqueKey(prefix = 'k'): string {
  seq += 1;
  return `${prefix}:${baseId}:${seq}`;
}

// ---------- Fake time utilities ----------
/** Advance fake timers safely (works whether Async API is present or not) */
export async function advance(ms: number): Promise<void> {
  // @ts-ignore - Vitest exposes an async variant in Node envs
  if (typeof vi.advanceTimersByTimeAsync === 'function') {
    // @ts-ignore
    await vi.advanceTimersByTimeAsync(ms);
  } else {
    vi.advanceTimersByTime(ms);
  }
}

/** Flush microtasks in a cross-runtime friendly way */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Run a block under fake timers and always restore real timers */
export async function withFakeTime<T>(fn: () => Promise<T> | T): Promise<T> {
  vi.useFakeTimers();
  try {
    const out = await fn();
    try {
      // Let any remaining scheduled work finish deterministically
      if (typeof (vi as any).runOnlyPendingTimersAsync === 'function') {
        await (vi as any).runOnlyPendingTimersAsync();
      } else {
        vi.runOnlyPendingTimers();
      }
    } catch {
      /* no-op */
    }
    return out;
  } finally {
    vi.useRealTimers();
  }
}

// ---------- Reset registry ----------
export type ResetFn = () => void | Promise<void>;
const resets = new Set<ResetFn>();

/** Allow app/test code to register a singleton/cached state reset */
export function registerTestReset(fn: ResetFn): void {
  resets.add(fn);
}

/** Invoke all registered resets + well-known optional globals */
export async function resetSingletons(): Promise<void> {
  for (const fn of Array.from(resets)) {
    try {
      await fn();
    } catch {
      /* swallow to avoid cascading failures */
    }
  }
  // If your app exposes these globals (see optional snippet below), use them:
  try { await (globalThis as any).__resetInflight?.(); } catch {}
  try { await (globalThis as any).__resetCaches?.(); } catch {}
}

// Publish a registration hook for application modules (test-only)
;(globalThis as any).__registerTestReset = registerTestReset;

// Install default hooks once (idempotent across multiple imports)
if (!(globalThis as any).__testHelpersInstalled) {
  (globalThis as any).__testHelpersInstalled = true;

  beforeEach(() => {
    // Keep real timers by default; tests opt into withFakeTime() explicitly.
  });

  afterEach(async () => {
    // If a test used fake timers, flush and restore; otherwise these no-op quickly.
    try {
      if (typeof (vi as any).runOnlyPendingTimersAsync === 'function') {
        await (vi as any).runOnlyPendingTimersAsync();
      } else {
        vi.runOnlyPendingTimers();
      }
    } catch { /* no-op */ }
    vi.useRealTimers();
    vi.restoreAllMocks();

    // Clear any shared registries/caches between tests.
    await resetSingletons();
  });
}