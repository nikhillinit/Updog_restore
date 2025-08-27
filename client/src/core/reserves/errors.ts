/**
 * Reserve Engine Error Types
 * Provides structured error handling for reserve calculations
 */

export type ReserveError = Error & {
  code?: string;
  errorMessage?: string;
  details?: unknown;
};

export function reserveError(
  message: string,
  extras?: Omit<ReserveError, "name" | "message" | "stack">
): ReserveError {
  const e = new Error(message) as ReserveError;
  if (extras) Object.assign(e, extras);
  return e;
}