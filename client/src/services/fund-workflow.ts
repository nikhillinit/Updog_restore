/**
 * Fund workflow transport (fund-workflow/v1).
 *
 * Every mutation on POST /api/funds, PUT /api/funds/:id/draft,
 * POST /api/funds/finalize and POST /api/funds/:id/publish carries a UUID
 * Idempotency-Key and, when a draft revision is known, the strong ETag as
 * If-Match. Responses return the new ETag and an Idempotency-Replay marker.
 */

import { withApiBase } from '@/lib/api-url';
import { ApiError, markSessionReauthRequired, parseRetryAfterMs } from '@/lib/queryClient';
import { getErrorMessage, SERVER_ERROR_MESSAGE } from '@/lib/http-response';
import { isRecord } from '@shared/utils/type-guards';

export const FUND_WORKFLOW_TIMEOUT_MS = 10_000;

export function newWorkflowKey(): string {
  return crypto.randomUUID();
}

/** Request aborted, timed out or failed on the wire: the server may have committed. */
export class FundWorkflowUncertainError extends Error {
  readonly aborted: boolean;
  constructor(message: string, aborted: boolean) {
    super(message);
    this.name = 'FundWorkflowUncertainError';
    this.aborted = aborted;
  }
}

export interface WorkflowRequestOptions {
  key?: string | null;
  etag?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface WorkflowResult<T> {
  status: number;
  body: T;
  etag: string | null;
  replayed: boolean;
}

export type WorkflowOutcome = 'rejected' | 'retry_same_key' | 'uncertain';

/**
 * How a failed command may be retried.
 * - rejected: definitive, non-committing (validation, stale revision, key reuse,
 *   no draft, auth). A deliberate new attempt mints a new key.
 * - retry_same_key: the server asked for the same command again (lock contention,
 *   writes paused). Keep the key.
 * - uncertain: outcome unknown. Keep the key; never assume rollback.
 */
export function classifyWorkflowError(error: unknown): WorkflowOutcome {
  if (error instanceof FundWorkflowUncertainError) return 'uncertain';
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return error.errorCode === 'COMMAND_RETRY_REQUIRED' ||
        error.errorCode === 'FUND_WORKFLOW_WRITES_PAUSED' ||
        error.errorCode === 'CANARY_RESIDUE_CAPACITY_UNAVAILABLE'
        ? 'retry_same_key'
        : 'uncertain';
    }
    if (error.status === 409 && error.errorCode === 'REQUEST_IN_PROGRESS') return 'retry_same_key';
    return 'rejected';
  }
  return 'uncertain';
}

export function isStaleRevisionError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 412;
}

/** ETag the server reported as current on a 412. */
export function currentETagFrom(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isRecord(error.details)) return null;
  const current = error.details['current'];
  return typeof current === 'string' ? current : null;
}

export async function workflowRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body: unknown,
  options: WorkflowRequestOptions = {}
): Promise<WorkflowResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Timeout', 'AbortError')),
    options.timeoutMs ?? FUND_WORKFLOW_TIMEOUT_MS
  );
  const onExternalAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) onExternalAbort();
  else options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.key) headers['Idempotency-Key'] = options.key;
  if (options.etag) headers['If-Match'] = options.etag;

  const uncertain = (error: unknown, readingBody: boolean) => {
    const aborted =
      controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
    return new FundWorkflowUncertainError(
      aborted
        ? readingBody
          ? 'Request aborted while reading the response body'
          : 'Request timed out before a response arrived'
        : readingBody
          ? 'Network error while reading the response body'
          : 'Network error before a response arrived',
      aborted
    );
  };

  let response: Response;
  let payload: unknown = null;
  let bodyError: unknown = null;
  try {
    try {
      response = await fetch(withApiBase(path), {
        method,
        credentials: 'include',
        headers,
        signal: controller.signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      throw uncertain(error, false);
    }
    try {
      payload = await response.json();
    } catch (error) {
      bodyError = error;
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  // A non-2xx status is definitive whatever its body (proxy HTML, empty, truncated).
  if (!response.ok) {
    if (response.status === 401) markSessionReauthRequired();
    const errorData = isRecord(payload) ? payload : {};
    const code = errorData['code'] ?? errorData['error'];
    throw new ApiError(
      response.status,
      response.status >= 500
        ? SERVER_ERROR_MESSAGE
        : (getErrorMessage(payload, response.status) ??
            (typeof errorData['error'] === 'string'
              ? errorData['error']
              : `Request failed (${response.status})`)),
      typeof code === 'string' ? code : undefined,
      response.status >= 500 ? undefined : (errorData['issues'] as ApiError['issues'] | undefined),
      parseRetryAfterMs(response.headers.get('Retry-After')),
      response.status >= 500 ? undefined : errorData['details']
    );
  }

  // A 2xx whose body could not be read may still have committed.
  if (bodyError !== null) throw uncertain(bodyError, true);

  return {
    status: response.status,
    body: payload as T,
    etag: response.headers.get('ETag'),
    replayed: response.headers.get('Idempotency-Replay') === 'true',
  };
}
