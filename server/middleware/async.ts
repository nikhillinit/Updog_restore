/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '@shared/types';

/**
 * Wraps async route handlers to properly catch errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error('Async handler error:', error);
      
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
