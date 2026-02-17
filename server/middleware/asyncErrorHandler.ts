import { Queue } from 'bullmq';
import type { Request, Response, NextFunction } from 'express';
import { sendApiError, httpCodeToAppCode } from '../lib/apiError';

// Only create queue if Redis is available
let errorQueue: Queue | null = null;

if (process.env['REDIS_URL']) {
  errorQueue = new Queue('error-tracking', {
    connection: {
      url: process.env['REDIS_URL'],
    },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });
}

interface ErrorContext {
  requestId?: string;
  method: string;
  path: string;
  ip: string | undefined;
  userAgent: string | undefined;
  timestamp: string;
}

interface HttpErrorLike {
  status?: number;
  statusCode?: number;
  message?: string;
  code?: string;
}

function asHttpError(err: unknown): HttpErrorLike {
  if (typeof err === 'object' && err !== null) {
    return err as HttpErrorLike;
  }
  return {};
}

/**
 * Non-blocking error capture
 */
export function captureErrorAsync(error: Error, context: ErrorContext): void {
  // Use setImmediate to avoid blocking
  setImmediate(() => {
    if (errorQueue) {
      errorQueue
        .add('capture', {
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          context,
          timestamp: new Date().toISOString(),
        })
        .catch((err) => {
          console.error('Failed to queue error:', err);
        });
    } else {
      // Fallback to console if no queue
      console.error('Error:', error.message, context);
    }
  });
}

/**
 * Async error handler middleware
 */
export function asyncErrorHandler() {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const error = err instanceof Error ? err : new Error(String(err ?? 'Unknown error'));
    const context = {
      ...(req.requestId ? { requestId: req.requestId } : {}),
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req['get']('user-agent'),
      timestamp: new Date().toISOString(),
    };

    // Capture async - don't block response
    captureErrorAsync(error, context);

    // Send response immediately
    if (!res.headersSent) {
      const httpError = asHttpError(err);
      const status = httpError.status || httpError.statusCode || 500;
      const message = status >= 500 ? 'Internal Server Error' : httpError.message || error.message;

      sendApiError(res, status, {
        error: message,
        code: httpError.code || httpCodeToAppCode(status),
        ...(context.requestId ? { requestId: context.requestId } : {}),
      });
    }
  };
}
