// client/src/services/funds.ts
// Fund creation and finalize commands over the fund-workflow/v1 transport.
// Keys are UUIDs reserved by the caller and persisted before dispatch, so a
// retry after an uncertain outcome replays the same command.

import { clampPct, clampInt } from '../lib/coerce';
import * as Telemetry from '../lib/telemetry';
import { startInFlight, isInFlight, cancelInFlight } from '../lib/inflight';
import type {
  FundFinalizeResponseV1,
  FundFinalizeV1,
} from '@shared/contracts/fund-finalize-v1.contract';
import { newWorkflowKey, workflowRequest, type WorkflowResult } from './fund-workflow';

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
  /** UUID reserved for this creation; reused on retry so replay returns the same fund. */
  idempotencyKey?: string;
  endpoint?: string; // default: '/api/funds'
  timeoutMs?: number; // default: 10_000
  signal?: AbortSignal; // optional external signal
  telemetry?: boolean; // default: true
}

export interface CreateFundResult {
  status: number;
  body: unknown;
  etag: string | null;
  replayed: boolean;
  key: string;
  durationMs: number;
}

const DEFAULT_ENDPOINT = '/api/funds';

export function isCreateFundInFlight(key: string) {
  return isInFlight(key);
}

export function cancelCreateFund(key: string) {
  return cancelInFlight(key);
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

    return p;
  } catch {
    return payload as FundPayload; // never block on "safety"; better to ship the payload than throw here
  }
}

function track(event: string, data: Record<string, unknown>) {
  try {
    Telemetry.track(event, data);
  } catch {
    // Ignore telemetry errors
  }
}

// ---------- Main entry ----------
export async function startCreateFund(
  payload: Json,
  opts: CreateFundOptions = {}
): Promise<CreateFundResult> {
  const key = opts.idempotencyKey ?? newWorkflowKey();
  const finalized = finalizePayload(payload);
  const useTelemetry = opts.telemetry ?? true;
  // Optional: 1 ms hold only in test to avoid flicker; keep 0 in prod if you prefer.
  const holdForMs = import.meta.env?.MODE === 'test' ? 1 : 0;

  // Same key in flight = same command; join it instead of dispatching twice.
  return startInFlight(
    key,
    async ({ signal }) => {
      const startedAt = performance.now();
      if (useTelemetry) track('fund_create_attempt', { request_id: key });
      try {
        const result: WorkflowResult<unknown> = await workflowRequest(
          'POST',
          opts.endpoint ?? DEFAULT_ENDPOINT,
          finalized,
          {
            key,
            signal: opts.signal ? anySignal(signal, opts.signal) : signal,
            ...(opts.timeoutMs != null ? { timeoutMs: opts.timeoutMs } : {}),
          }
        );
        const durationMs = Math.round(performance.now() - startedAt);
        if (useTelemetry) {
          track('fund_create_success', {
            idempotency_status: result.replayed ? 'replayed' : 'created',
            request_id: key,
          });
        }
        return { ...result, key, durationMs };
      } catch (err) {
        if (useTelemetry) {
          track('fund_create_failure', { idempotency_status: 'error', request_id: key });
        }
        throw Object.assign(err instanceof Error ? err : new Error('Create fund failed'), {
          key,
          durationMs: Math.round(performance.now() - startedAt),
        });
      }
    },
    { holdForMs }
  );
}

function anySignal(first: AbortSignal, second: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of [first, second]) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
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

/**
 * Fund creation commits before credential renewal, so a
 * credentialRenewal: 'reauth_required' marker means the fund exists but this
 * session's credential no longer covers it. Surface the session gate and let
 * the caller stop follow-on writes; never retry the creation.
 */
export function handleCredentialRenewalMarker(body: unknown): boolean {
  if (
    body &&
    typeof body === 'object' &&
    (body as Record<string, unknown>)['credentialRenewal'] === 'reauth_required'
  ) {
    void import('../lib/queryClient').then(({ markSessionReauthRequired }) =>
      markSessionReauthRequired()
    );
    return true;
  }
  return false;
}

/** POST /api/funds with a caller-reserved key. Throws ApiError / FundWorkflowUncertainError. */
export async function createFund(
  payload: Json,
  options: CreateFundOptions & { idempotencyKey: string }
): Promise<CreateFundResult> {
  const result = await startCreateFund(payload, options);
  handleCredentialRenewalMarker(result.body);
  return result;
}

export interface FinalizeFundOptions {
  key: string;
  /** Strong ETag of the reviewed draft; required when draftFundId is set. */
  etag?: string | null;
  signal?: AbortSignal;
}

// ---------- Single-submit finalize endpoint ----------
export async function finalizeFund(
  payload: FundFinalizeV1,
  options: FinalizeFundOptions
): Promise<FundFinalizeResponseV1> {
  const result = await workflowRequest<FundFinalizeResponseV1>(
    'POST',
    '/api/funds/finalize',
    payload,
    {
      key: options.key,
      etag: payload.draftFundId != null ? (options.etag ?? null) : null,
      ...(options.signal ? { signal: options.signal } : {}),
    }
  );
  handleCredentialRenewalMarker(result.body);
  return result.body;
}
