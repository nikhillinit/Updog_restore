/**
 * Standardized validation error response helpers
 *
 * Used by route handlers that perform inline Zod validation
 * to return consistent 400 error shapes.
 */

import type { Response } from 'express';
import type { ZodError } from 'zod';

/**
 * Send a 400 response for an invalid request body
 * @param res Express response object
 * @param error Zod validation error
 */
export function sendBodyValidationError(res: Response, error: ZodError) {
  return res.status(400).json({
    error: 'invalid_request_body',
    message: 'Invalid request body',
    details: error.format(),
  });
}

/**
 * Send a 400 response for invalid query parameters
 * @param res Express response object
 * @param error Zod validation error
 */
export function sendQueryValidationError(res: Response, error: ZodError) {
  return res.status(400).json({
    error: 'invalid_query_parameters',
    message: 'Invalid query parameters',
    details: error.format(),
  });
}
