/**
 * Standardized validation error response helpers
 *
 * Used by route handlers that perform inline Zod validation
 * to return consistent 400 error shapes.
 */

import type { Response } from 'express';
import type { ZodError } from 'zod';

interface ValidationErrorResponse {
  error: string;
  message: string;
  details: ReturnType<ZodError['format']>;
}

function sendValidationError(res: Response, payload: ValidationErrorResponse) {
  return res.status(400).json(payload);
}

/**
 * Send a 400 response for an invalid request body
 * @param res Express response object
 * @param error Zod validation error
 */
export function sendBodyValidationError(
  res: Response,
  error: ZodError,
  message: string = 'Invalid request body'
) {
  return sendValidationError(res, {
    error: 'invalid_request_body',
    message,
    details: error.format(),
  });
}

/**
 * Send a 400 response for invalid query parameters
 * @param res Express response object
 * @param error Zod validation error
 */
export function sendQueryValidationError(res: Response, error: ZodError) {
  return sendValidationError(res, {
    error: 'invalid_query_parameters',
    message: 'Invalid query parameters',
    details: error.format(),
  });
}
