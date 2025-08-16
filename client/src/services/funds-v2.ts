// client/src/services/funds-v2.ts
// Refactored funds service using singleflight pattern and dedupedFetch

import { dedupedFetch, nonDedupedFetch } from '../lib/dedupedFetch';
import { stableStringify, fnv1aHash } from '../../../shared/stableKey';
import { clampPct, clampInt } from '../lib/coerce';
import * as Telemetry from '../lib/telemetry';

export interface CreateFundOptions {
  dedupe?: boolean;          // Enable deduplication (default: true)
  idempotencyKey?: string;   // Server-side idempotency key
  signal?: AbortSignal;      // Abort signal for cancellation
  telemetry?: boolean;       // Enable telemetry (default: true)
}

export interface CreateFundResult {
  id: number;
  name: string;
  size: number;
  createdAt: string;
  hash?: string;
}

/**
 * Finalize and validate fund payload before sending.
 * Ensures all values are within acceptable ranges.
 */
function finalizePayload(payload: any): any {
  try {
    const finalized = { ...payload };

    // Clamp stages if present
    if (Array.isArray(finalized.stages)) {
      finalized.stages = finalized.stages.map((s: any) => ({
        ...s,
        name: typeof s.name === 'string' ? s.name.trim() : s.name,
        graduate: clampPct(Number(s.graduate)),
        exit: clampPct(Number(s.exit)),
        months: clampInt(Number(s.months) || 12, 1, 120),
      }));
    }

    // Add model version for evolution
    if (!finalized.modelVersion) {
      finalized.modelVersion = 'reserves-ev1';
    }

    // Add environment namespace to prevent cross-env collisions
    finalized._env = import.meta.env?.MODE || 'unknown';

    return finalized;
  } catch {
    return payload; // Better to send than crash
  }
}

/**
 * Create a new fund with automatic deduplication of concurrent requests.
 * Uses singleflight pattern to prevent duplicate API calls.
 */
export async function createFund(
  payload: any,
  options: CreateFundOptions = {}
): Promise<CreateFundResult> {
  const {
    dedupe = true,
    idempotencyKey,
    signal,
    telemetry = true,
  } = options;

  // Finalize payload for consistent hashing
  const finalized = finalizePayload(payload);
  const hash = fnv1aHash(stableStringify(finalized));

  // Track attempt
  if (telemetry) {
    try {
      (Telemetry as any).track?.('fund_create_attempt', {
        hash,
        model_version: finalized.modelVersion,
        env: import.meta.env?.MODE,
      });
    } catch {
      // Telemetry should never break the app
    }
  }

  const startedAt = performance.now();

  try {
    // Use dedupedFetch for automatic singleflight behavior
    const fetchFn = dedupe ? dedupedFetch : nonDedupedFetch;
    
    const result = await fetchFn<CreateFundResult>('/api/funds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey ?? hash }),
      },
      body: JSON.stringify(finalized),
      signal,
      dedupeKey: hash, // Use payload hash as dedup key
    });

    const durationMs = Math.round(performance.now() - startedAt);

    // Track success
    if (telemetry) {
      try {
        (Telemetry as any).track?.('fund_create_success', {
          status: 201,
          durationMs,
          hash,
          model_version: finalized.modelVersion,
          env: import.meta.env?.MODE,
        });
      } catch {
        // Silent fail
      }
    }

    return { ...result, hash };
  } catch (error: any) {
    const durationMs = Math.round(performance.now() - startedAt);
    const aborted = error?.name === 'AbortError';

    // Track failure
    if (telemetry) {
      try {
        (Telemetry as any).track?.('fund_create_failure', {
          aborted,
          message: String(error?.message ?? error),
          durationMs,
          hash,
          status: error?.status,
          model_version: finalized.modelVersion,
          env: import.meta.env?.MODE,
        });
      } catch {
        // Silent fail
      }
    }

    // Re-throw with additional context
    throw Object.assign(error ?? new Error('Create fund failed'), {
      aborted,
      hash,
      durationMs,
    });
  }
}

/**
 * Get fund by ID.
 * Safe to dedupe since it's a read operation.
 */
export async function getFund(id: number, signal?: AbortSignal): Promise<CreateFundResult> {
  return dedupedFetch<CreateFundResult>(`/api/funds/${id}`, {
    method: 'GET',
    signal,
  });
}

/**
 * List all funds with optional filters.
 * Automatically deduped for identical concurrent requests.
 */
export async function listFunds(
  filters?: { limit?: number; offset?: number },
  signal?: AbortSignal
): Promise<CreateFundResult[]> {
  const params = new URLSearchParams();
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  return dedupedFetch<CreateFundResult[]>(
    `/api/funds${params.toString() ? `?${params}` : ''}`,
    { signal }
  );
}

/**
 * Update fund (non-idempotent by default).
 */
export async function updateFund(
  id: number,
  updates: Partial<CreateFundResult>,
  options: CreateFundOptions = {}
): Promise<CreateFundResult> {
  const { dedupe = false, idempotencyKey, signal } = options;
  const fetchFn = dedupe ? dedupedFetch : nonDedupedFetch;

  return fetchFn<CreateFundResult>(`/api/funds/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
    },
    body: JSON.stringify(updates),
    signal,
  });
}

/**
 * Delete fund (never deduped).
 */
export async function deleteFund(
  id: number,
  signal?: AbortSignal
): Promise<void> {
  await nonDedupedFetch(`/api/funds/${id}`, {
    method: 'DELETE',
    signal,
    parseResponse: false,
  });
}