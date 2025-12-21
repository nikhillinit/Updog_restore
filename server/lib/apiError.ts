 
 
 
 
 
import type { Response } from 'express';

export type ApiErrorBody = { 
  error: string; 
  code?: string; 
  requestId?: string;
  retryAfter?: number;
};

/**
 * Map HTTP status codes to application error codes
 */
export function httpCodeToAppCode(status: number): string {
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return status >= 500 ? 'INTERNAL' : 'UNKNOWN';
}

/**
 * Standardized API error response helper
 * Ensures consistent error shape across all endpoints
 */
export function sendApiError(res: Response, status: number, body: ApiErrorBody) {
  // Always include error code
  const finalBody = {
    ...body,
    code: body.code ?? httpCodeToAppCode(status)
  };
  res.type('application/json')["status"](status)["json"](finalBody);
}

/**
 * Create standard error body with request ID
 */
export function createErrorBody(message: string, requestId?: string, code?: string): ApiErrorBody {
  return {
    error: message,
    ...(code && { code }),
    ...(requestId && { requestId })
  };
}
