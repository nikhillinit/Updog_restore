/**
 * Typed error for the Task 6 acceptance-layer services (staging, identity,
 * case resolution, commit). Carries the HTTP status, a pinned API error code,
 * and optional non-sensitive details. Routes map it to a client-safe response.
 *
 * @module server/services/financial-observations/reconciliation-errors
 */
import type { ReconciliationApiErrorCode } from '@shared/contracts/financial-observations/reconciliation-api.contract';

export class ReconciliationApiError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: ReconciliationApiErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'ReconciliationApiError';
    this.statusCode = status;
  }
}

export function isReconciliationApiError(error: unknown): error is ReconciliationApiError {
  return error instanceof ReconciliationApiError;
}
