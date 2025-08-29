/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
// Deterministic in-flight registry with dedupe, capacity, timeout, and cleanup
type Entry<T> = {
  promise: Promise<T>;
  controllers: Set<AbortController>;
  createdAt: number;
};

const inflight = new Map<string, Entry<any>>();
let totalInflight = 0;
const waiters: Array<() => void> = [];

const MAX_INFLIGHT =
  Number(import.meta.env['VITE_MAX_INFLIGHT'] ?? '6'); // default capacity
const DEFAULT_TIMEOUT_MS =
  Number(import.meta.env['VITE_INFLIGHT_TIMEOUT_MS'] ?? '15000');

function ns() {
  return (import.meta.env.MODE ?? 'development') as string;
}
function nsKey(hash: string) {
  return `${ns()}|${hash}`;
}

function wakeOne() {
  const w = waiters.shift();
  if (w) w();
}
function waitForSlot(): Promise<void> {
  return new Promise((resolve) => waiters.push(resolve));
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) return signals[0];
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signals.forEach((s) => s.addEventListener('abort', onAbort, { once: true }));
  if (signals.some((s) => s.aborted)) controller.abort();
  return controller.signal;
}

export function isInFlight(hash: string): boolean {
  return inflight.has(nsKey(hash));
}

export function cancelInFlight(hash: string): boolean {
  const key = nsKey(hash);
  const e = inflight.get(key);
  if (!e) return false;
  e.controllers.forEach((c) => c.abort());
  inflight.delete(key);
  totalInflight = Math.max(0, totalInflight - 1);
  wakeOne();
  return true;
}

export function inFlightSize() {
  return totalInflight;
}

type StartOpts = {
  dedupe?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  holdForMs?: number;
};

export async function startInFlight<T>(
  hash: string,
  worker: (_ctx: { signal: AbortSignal }) => Promise<T>,
  opts: StartOpts = {}
): Promise<T> {
  const key = nsKey(hash);
  const dedupe = opts.dedupe !== false;

  if (dedupe) {
    const existing = inflight.get(key);
    if (existing) return existing.promise;
  }

  // Capacity gating
  if (totalInflight >= MAX_INFLIGHT) {
    await waitForSlot();
  }
  totalInflight++;

  // Timeout + abort wiring
  const local = new AbortController();
  const combined = opts.signal
    ? anySignal([local.signal, opts.signal])
    : local.signal;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => local.abort(), timeoutMs);

  const p = (async () => {
    try {
      return await worker({ signal: combined });
    } finally {
      clearTimeout(timeout);
      const hold = Math.max(0, opts.holdForMs ?? 0);
      const cleanup = () => {
        inflight.delete(key);
        totalInflight = Math.max(0, totalInflight - 1);
        wakeOne();
      };
      if (hold > 0) setTimeout(cleanup, hold);
      else queueMicrotask(cleanup);
    }
  })();

  inflight.set(key, {
    promise: p,
    controllers: new Set([local]),
    createdAt: Date.now(),
  });

  return p;
}
