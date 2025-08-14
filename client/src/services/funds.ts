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
  return fnv1a(stableStringify(payload));
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

// ---------- In-flight de-duplication registry ----------
const inflight = new Map<
  string,
  { promise: Promise<CreateFundResult>; controllers: AbortController[]; startedAt: number }
>();

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
          (Telemetry as any).track?.('fund_create_attempt', {
            ok: res.ok,
            status: res.status,
            durationMs,
            hash,
          });
        } catch {}
      }
      return { res, hash, aborted: false, durationMs };
    } catch (err: any) {
      const aborted = err?.name === 'AbortError';
      const durationMs = Math.round(performance.now() - startedAt);
      if (useTelemetry) {
        try {
          (Telemetry as any).track?.('fund_create_error', {
            aborted,
            message: String(err?.message ?? err),
            durationMs,
            hash,
          });
        } catch {}
      }
      // surface same shape; callers can inspect aborted if needed
      throw Object.assign(err ?? new Error('Create fund failed'), { aborted, hash, durationMs });
    } finally {
      cleanup();
      inflight.delete(hash); // ensure cleanup on success AND failure/abort
    }
  };

  const promise = exec();
  inflight.set(hash, { promise, controllers: [controller], startedAt });
  return promise;
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
    } else {
      toast('❌ Network error saving fund', 'error');
    }
    throw err;
  }
}
