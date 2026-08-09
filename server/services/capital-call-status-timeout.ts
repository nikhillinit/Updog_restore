const CAPITAL_CALL_STATUS_HARD_TIMEOUT_ENV = 'CAPITAL_CALL_STATUS_HARD_TIMEOUT_MS';

export class CapitalCallStatusHardTimeoutError extends Error {
  readonly code = 'CAPITAL_CALL_STATUS_HARD_TIMEOUT';

  constructor(timeoutMs: number) {
    super(`Capital-call status job exceeded hard timeout of ${timeoutMs}ms`);
    this.name = 'CapitalCallStatusHardTimeoutError';
  }
}

export const CAPITAL_CALL_STATUS_HARD_TIMEOUT_MS_ENV = CAPITAL_CALL_STATUS_HARD_TIMEOUT_ENV;

export function getCapitalCallStatusHardTimeoutMs(): number {
  const raw = process.env[CAPITAL_CALL_STATUS_HARD_TIMEOUT_ENV]?.trim();
  if (!raw) {
    throw new Error(
      `${CAPITAL_CALL_STATUS_HARD_TIMEOUT_ENV} is required for capital-call status worker`
    );
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `${CAPITAL_CALL_STATUS_HARD_TIMEOUT_ENV} must be a positive integer in milliseconds`
    );
  }

  return value;
}

export function throwIfCapitalCallStatusAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('Capital-call status job was cancelled');
  }
}

export function isCapitalCallStatusHardTimeoutError(error: unknown): boolean {
  return (
    error instanceof CapitalCallStatusHardTimeoutError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'CAPITAL_CALL_STATUS_HARD_TIMEOUT')
  );
}
