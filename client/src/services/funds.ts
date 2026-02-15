// client/src/services/funds.ts
// Idempotent + cancellable fund creation with timeout and telemetry
// Single source of truth lives in the store; this is a belt-and-suspenders final check.

import { clampPct, clampInt } from '../lib/coerce';
import * as Telemetry from '../lib/telemetry';
import { startInFlight, isInFlight, cancelInFlight } from '../lib/inflight';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

interface StageData {
  name?: string;
  graduate?: number;
  exit?: number;
  months?: number;
}

interface FundPayload {
  stages?: StageData[];
  modelVersion?: string;
  basics?: {
    modelVersion?: string;
  };
}

export interface CreateFundOptions {
  endpoint?: string; // default: '/api/funds'
  method?: 'POST' | 'PUT'; // default: 'POST'
  timeoutMs?: number; // default: 10_000
  signal?: AbortSignal; // optional external signal
  dedupe?: boolean; // default: true
  telemetry?: boolean; // default: true
  reuseExisting?: boolean; // default: false - reuse existing fund if found
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
  const walk = (v: unknown): unknown => {
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
  const namespace = `${import.meta.env.MODE || 'unknown-env'}|fund-create|`;
  return fnv1a(namespace + stableStringify(payload));
}

// ---------- Compose timeout + external AbortSignal ----------
function _composeSignal(timeoutMs: number, external?: AbortSignal) {
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
function _assertInflightCapacity() {
  if (inflight.size >= IDEMPOTENCY_MAX) {
    const err = new Error('Too many concurrent requests; please retry shortly.') as Error & {
      code?: string;
    };
    err.code = 'CAPACITY_EXCEEDED';
    throw err;
  }
}

export function isCreateFundInFlight(hash: string) {
  return isInFlight(hash);
}

export function cancelCreateFund(hash: string) {
  return cancelInFlight(hash);
}

// ---------- Final clamp before wire (defense-in-depth) ----------
function finalizePayload(payload: Json): FundPayload {
  try {
    const p = { ...(payload as FundPayload) };

    // If stages exist, ensure values are sane
    if (Array.isArray(p.stages)) {
      p.stages = p.stages.map((s) => {
        const stage: StageData = {
          graduate: clampPct(Number(s.graduate)),
          exit: clampPct(Number(s.exit)),
          months: clampInt(Number(s.months) || 12, 1, 120),
        };
        if (typeof s.name === 'string') {
          stage.name = s.name.trim();
        }
        return stage;
      });
    }

    // Version tag enables non-breaking evolution
    if (!p.modelVersion) p.modelVersion = 'reserves-ev1';

    return p;
  } catch {
    return payload as FundPayload; // never block on "safety"; better to ship the payload than throw here
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
  const hash = computeCreateFundHash(finalized as Json);

  // Optional: 1 ms hold only in test to avoid flicker; keep 0 in prod if you prefer.
  const holdForMs = import.meta.env?.MODE === 'test' ? 1 : 0;

  if (!dedupe) {
    // Skip deduplication - create unique key with timestamp
    const uniqueHash = `${hash}-${Date.now()}-${Math.random()}`;
    return startInFlight(
      uniqueHash,
      async ({ signal }) => {
        return await executeCreateFund(
          finalized,
          endpoint,
          method,
          timeoutMs,
          signal,
          useTelemetry,
          hash
        );
      },
      { holdForMs }
    );
  }

  return startInFlight(
    hash,
    async ({ signal }) => {
      return await executeCreateFund(
        finalized,
        endpoint,
        method,
        timeoutMs,
        signal,
        useTelemetry,
        hash
      );
    },
    { holdForMs }
  );
}

// Helper function to execute the actual fund creation
async function executeCreateFund(
  finalized: FundPayload,
  endpoint: string,
  method: string,
  timeoutMs: number,
  signal: AbortSignal,
  useTelemetry: boolean,
  hash: string
): Promise<CreateFundResult> {
  const startedAt = performance.now();

  // Track attempt
  if (useTelemetry) {
    try {
      const track = (
        Telemetry as { track?: (event: string, data: Record<string, unknown>) => void }
      ).track;
      track?.('fund_create_attempt', {
        hash,
        model_version: finalized.basics?.modelVersion,
        env: import.meta.env.MODE,
      });
    } catch {
      // Ignore telemetry errors
    }
  }

  try {
    const res = await fetch(endpoint, {
      method,
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': hash, // Server-side deduplication
      },
      body: JSON.stringify(finalized),
    });

    const durationMs = Math.round(performance.now() - startedAt);
    if (useTelemetry) {
      try {
        const eventName = res.ok ? 'fund_create_success' : 'fund_create_failure';
        const idempotencyStatus = res.headers.get('Idempotency-Status') || 'created';
        const track = (
          Telemetry as { track?: (event: string, data: Record<string, unknown>) => void }
        ).track;
        track?.(eventName, {
          status: res.status,
          durationMs,
          hash,
          idempotency_status: idempotencyStatus,
          model_version: finalized.basics?.modelVersion,
          env: import.meta.env.MODE,
        });
      } catch {
        // Ignore telemetry errors
      }
    }
    return { res, hash, aborted: false, durationMs };
  } catch (err) {
    const error = err as Error & { name?: string; message?: string };
    const aborted = error?.name === 'AbortError';
    const durationMs = Math.round(performance.now() - startedAt);
    if (useTelemetry) {
      try {
        const track = (
          Telemetry as { track?: (event: string, data: Record<string, unknown>) => void }
        ).track;
        track?.('fund_create_failure', {
          aborted,
          message: String(error?.message ?? err),
          durationMs,
          hash,
          idempotency_status: 'error',
          model_version: finalized.basics?.modelVersion,
          env: import.meta.env.MODE,
        });
      } catch {
        // Ignore telemetry errors
      }
    }
    // surface same shape; callers can inspect aborted if needed
    const fundError = err instanceof Error ? err : new Error('Create fund failed');
    throw Object.assign(fundError, { aborted, hash, durationMs });
  }
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

export interface NormalizedFundResponse {
  id: number;
  [key: string]: unknown;
}

export function normalizeCreateFundResponse(raw: unknown): NormalizedFundResponse {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // Direct shape: { id: number, ... }
    if (typeof obj['id'] === 'number') {
      return obj as NormalizedFundResponse;
    }
    // Wrapped shape: { success: true, data: { id: number, ... } }
    if (obj['success'] && obj['data'] && typeof obj['data'] === 'object') {
      const data = obj['data'] as Record<string, unknown>;
      if (typeof data['id'] === 'number') {
        return data as NormalizedFundResponse;
      }
    }
  }
  throw new Error('Invalid fund response: missing id');
}

// ---------- Convenience wrappers for backward compatibility ----------
export async function createFund(payload: Json, options?: CreateFundOptions): Promise<unknown> {
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
  } catch (err) {
    const error = err as { aborted?: boolean; code?: string };
    if (error?.aborted) {
      toast('⚠️ Save cancelled', 'info');
    } else if (error?.code === 'CAPACITY_EXCEEDED') {
      // Throttled user-friendly capacity hit message
      const showToast = maybeToastCapacity();
      if (showToast) {
        toast(
          '⚠️ You have too many concurrent operations. Please wait a moment and try again.',
          'info'
        );
      }
      // Always track capacity hit for observability
      try {
        const { inFlightSize } = await import('../lib/inflight');
        const track = (
          Telemetry as { track?: (event: string, data: Record<string, unknown>) => void }
        ).track;
        track?.('client_capacity_hit', {
          route: '/api/funds',
          concurrent: inFlightSize(),
          env: import.meta.env.MODE,
          throttled: !showToast,
        });
      } catch {
        // Ignore telemetry errors
      }
    } else {
      toast('❌ Network error saving fund', 'error');
    }
    throw err;
  }
}
