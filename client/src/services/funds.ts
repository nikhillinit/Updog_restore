// client/src/services/funds.ts
// Idempotent + cancellable fund creation with timeout and telemetry
// Single source of truth lives in the store; this is a belt-and-suspenders final check.

import { clampPct, clampInt } from '../lib/coerce';
import * as Telemetry from '../lib/telemetry';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

export interface CreateFundOptions {
  endpoint?: string;            // default: '/api/funds'
  method?: 'POST' | 'PUT';      // default: 'POST'
  timeoutMs?: number;           // default: 10_000
  signal?: AbortSignal;         // optional external signal
  dedupe?: boolean;             // default: true
  telemetry?: boolean;          // default: true
  reuseExisting?: boolean;      // default: false - reuse existing fund if found
}

export interface CreateFundResult {
  res: Response;
  hash: string;
  aborted: boolean;
  durationMs: number;
}

const DEFAULT_ENDPOINT = '/api/funds';
const DEFAULT_TIMEOUT = 10_000;

// ---------- Stable stringify + FNV-1a hash (deterministic) ----------
function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  const walk = (v: unknown): any => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) return '[Circular]';
    seen.add(v as object);

    if (Array.isArray(v)) return v.map(walk);

    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = walk(obj[k]);
    return out;
  };
  return JSON.stringify(walk(value));
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  // unsigned >>> 0, represent as hex
  return (hash >>> 0).toString(16);
}

export function computeCreateFundHash(payload: Json): string {
  // Add environment namespace to avoid cross-env collisions
  const namespace = (import.meta.env.MODE || 'unknown-env') + '|fund-create|';
  return fnv1a(namespace + stableStringify(payload));
}

// ---------- Compose timeout + external AbortSignal ----------
function composeSignal(timeoutMs: number, external?: AbortSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timeout', 'AbortError')), timeoutMs);

  const onAbort = () => ctrl.abort(external?.reason ?? new DOMException('Aborted', 'AbortError'));
  if (external) {
    if (external.aborted) onAbort();
    else external.addEventListener('abort', onAbort, { once: true });
  }

  const cleanup = () => {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', onAbort);
  };

  return { signal: ctrl.signal, controller: ctrl, cleanup };
}

// ---------- In-flight de-duplication registry (in-flight only, no cache) ----------
// Purpose: Prevent duplicate requests while in-flight. Server handles post-completion idempotency.
const IDEMPOTENCY_MAX = Number(import.meta.env.VITE_IDEMPOTENCY_MAX || 200);

type InflightEntry = {
  promise: Promise<CreateFundResult>;
  controllers: AbortController[];
  startedAt: number;
};

const inflight = new Map<string, InflightEntry>();

// Ensure we don't exceed capacity (throw if at limit)
function assertInflightCapacity() {
  if (inflight.size >= IDEMPOTENCY_MAX) {
    const err = new Error('Too many concurrent requests; please retry shortly.');
    (err as any).code = 'CAPACITY_EXCEEDED';
    throw err;
  }
}

export function isCreateFundInFlight(hash: string) {
  return inflight.has(hash);
}

export function cancelCreateFund(hash: string) {
  const entry = inflight.get(hash);
  if (!entry) return false;
  entry.controllers.forEach((c) => c.abort(new DOMException('Manually cancelled', 'AbortError')));
  return true;
}

// ---------- Final clamp before wire (defense-in-depth) ----------
function finalizePayload(payload: any): any {
  try {
    const p = { ...payload };

    // If stages exist, ensure values are sane
    if (Array.isArray(p.stages)) {
      p.stages = p.stages.map((s: any) => ({
        ...s,
        name: typeof s.name === 'string' ? s.name.trim() : s.name,
        graduate: clampPct(Number(s.graduate)),
        exit: clampPct(Number(s.exit)),
        months: clampInt(Number(s.months) || 12, 1, 120),
      }));
    }

    // Version tag enables non-breaking evolution
    if (!p.modelVersion) p.modelVersion = 'reserves-ev1';

    return p;
  } catch {
    return payload; // never block on "safety"; better to ship the payload than throw here
  }
}

// ---------- Main entry ----------
export async function startCreateFund(
  payload: Json,
  opts: CreateFundOptions = {}
): Promise<CreateFundResult> {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const method = opts.method ?? 'POST';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const dedupe = opts.dedupe ?? true;
  const useTelemetry = opts.telemetry ?? true;

  const finalized = finalizePayload(payload);
  const hash = computeCreateFundHash(finalized);

  if (dedupe) {
    const existing = inflight.get(hash);
    if (existing) return existing.promise;
  }

  const startedAt = performance.now();
  const { signal, controller, cleanup } = composeSignal(timeoutMs, opts.signal);

  const exec = async (): Promise<CreateFundResult> => {
    // Track attempt
    if (useTelemetry) {
      try {
        (Telemetry as any).track?.('fund_create_attempt', {
          hash,
          model_version: finalized.basics?.modelVersion,
          env: import.meta.env.MODE,
        });
      } catch {}
    }
    
    try {
      const res = await fetch(endpoint, {
        method,
        signal,
        headers: { 
          'Content-Type': 'application/json',
          'Idempotency-Key': hash  // Server-side deduplication
        },
        body: JSON.stringify(finalized),
      });

      const durationMs = Math.round(performance.now() - startedAt);
      if (useTelemetry) {
        try {
          const eventName = res.ok ? 'fund_create_success' : 'fund_create_failure';
          const idempotencyStatus = res.headers.get('Idempotency-Status') || 'created';
          (Telemetry as any).track?.(eventName, {
            status: res.status,
            durationMs,
            hash,
            idempotency_status: idempotencyStatus,
            model_version: finalized.basics?.modelVersion,
            env: import.meta.env.MODE,
          });
        } catch {}
      }
      return { res, hash, aborted: false, durationMs };
    } catch (err: any) {
      const aborted = err?.name === 'AbortError';
      const durationMs = Math.round(performance.now() - startedAt);
      if (useTelemetry) {
        try {
          (Telemetry as any).track?.('fund_create_failure', {
            aborted,
            message: String(err?.message ?? err),
            durationMs,
            hash,
            idempotency_status: 'error',
            model_version: finalized.basics?.modelVersion,
            env: import.meta.env.MODE,
          });
        } catch {}
      }
      // surface same shape; callers can inspect aborted if needed
      throw Object.assign(err ?? new Error('Create fund failed'), { aborted, hash, durationMs });
    } finally {
      cleanup();
      inflight.delete(hash); // Simply delete when done
    }
  };

  const promise = exec();
  assertInflightCapacity(); // Throw if at capacity
  inflight.set(hash, { 
    promise, 
    controllers: [controller], 
    startedAt
  });
  return promise;
}

// ---------- Toast throttling for capacity hits ----------
let lastCapacityToast = 0;
const TOAST_THROTTLE_MS = 10_000; // One toast every 10 seconds max

function maybeToastCapacity() {
  const now = Date.now();
  if (now - lastCapacityToast > TOAST_THROTTLE_MS) {
    lastCapacityToast = now;
    return true;
  }
  return false;
}

// ---------- Convenience wrappers for backward compatibility ----------
export async function createFund(payload: Json, options?: CreateFundOptions): Promise<any> {
  const result = await startCreateFund(payload, options);
  if (!result.res.ok) {
    throw new Error(`Fund creation failed: ${result.res.status}`);
  }
  return result.res.json();
}

export async function createFundWithToast(payload: Json, options?: CreateFundOptions) {
  const { toast } = await import('../lib/toast');
  
  try {
    const result = await startCreateFund(payload, options);
    if (!result.res.ok) {
      const text = await result.res.text().catch(() => '');
      toast(`❌ Failed to save fund: ${text || result.res.statusText}`, 'error');
      return null;
    }
    const data = await result.res.json();
    toast('✅ Fund saved successfully!', 'success');
    return data;
  } catch (err: any) {
    if (err?.aborted) {
      toast('⚠️ Save cancelled', 'info');
    } else if (err?.code === 'CAPACITY_EXCEEDED') {
      // Throttled user-friendly capacity hit message
      const showToast = maybeToastCapacity();
      if (showToast) {
        toast('⚠️ You have too many concurrent operations. Please wait a moment and try again.', 'info');
      }
      // Always track capacity hit for observability
      try {
        (Telemetry as any).track?.('client_capacity_hit', {
          route: '/api/funds',
          concurrent: inflight.size,
          env: import.meta.env.MODE,
          throttled: !showToast
        });
      } catch {}
    } else {
      toast('❌ Network error saving fund', 'error');
    }
    throw err;
  }
}
