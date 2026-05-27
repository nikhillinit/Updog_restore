import type { Request, Response, NextFunction } from 'express';
import type { ApiError } from '@shared/types';
import { logger } from '../lib/logger.js';

const log =
  typeof logger.child === 'function' ? logger.child({ module: 'middleware:async' }) : logger;

/**
 * Wraps async route handlers to properly catch errors
 */
export function asyncHandler(
  fn: (_req: Request, _res: Response, _next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error: unknown) => {
      log.error({ err: error }, 'Async handler error');

      // Check if response was already sent
      if (res.headersSent) {
        return next(error);
      }

      // Send error response
      const apiError: ApiError = {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      };

      res.status(500).json(apiError);
    });
  };
}
