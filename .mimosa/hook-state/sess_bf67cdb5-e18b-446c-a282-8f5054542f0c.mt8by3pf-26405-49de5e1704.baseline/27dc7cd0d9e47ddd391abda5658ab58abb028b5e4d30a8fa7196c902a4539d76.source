import type { Response } from 'express';
import type { LPApiError } from '@shared/types/lp-api';
import { recordError, recordLPRequest } from '../observability/lp-metrics';

export function createLPApiErrorResponse(
  code: string,
  message: string,
  field?: string
): LPApiError {
  const response: LPApiError = {
    error: code,
    message,
    timestamp: new Date().toISOString(),
  };

  if (field !== undefined) {
    response.field = field;
  }

  return response;
}

interface InvalidCursorResponseOptions {
  res: Response;
  endTimer: () => number;
  endpoint: string;
  lpId?: number;
}

export function respondInvalidCursor({
  res,
  endTimer,
  endpoint,
  lpId,
}: InvalidCursorResponseOptions) {
  const duration = endTimer();
  recordLPRequest(endpoint, 'GET', 400, duration, lpId);
  recordError(endpoint, 'INVALID_CURSOR', 400);
  return res
    .status(400)
    .json(createLPApiErrorResponse('INVALID_CURSOR', 'Pagination cursor is invalid or tampered'));
}
