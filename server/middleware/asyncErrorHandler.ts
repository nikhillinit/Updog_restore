/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */

import { Queue } from 'bullmq';
import type { Request, Response, NextFunction } from 'express';
import { sendApiError, _createErrorBody, httpCodeToAppCode } from '../lib/apiError';

// Only create queue if Redis is available
let errorQueue: Queue | null = null;

if (process.env.REDIS_URL) {
  errorQueue = new Queue('error-tracking', {
    connection: {
      url: process.env.REDIS_URL
    },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    }
  });
}

/**
 * Non-blocking error capture
 */
export function captureErrorAsync(error: Error, context: any) {
  // Use setImmediate to avoid blocking
  setImmediate(() => {
    if (errorQueue) {
      errorQueue.add('capture', {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        context,
        timestamp: new Date().toISOString()
      }).catch(err => {
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
  return (err: any, req: Request, res: Response, _next: NextFunction) => {
    const context = {
      requestId: (req as any).requestId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString()
    };
    
    // Capture async - don't block response
    captureErrorAsync(err, context);
    
    // Send response immediately
    if (!res.headersSent) {
      const status = err.status || err.statusCode || 500;
      const message = status >= 500 ? 'Internal Server Error' : err.message;
      
      sendApiError(res, status, {
        error: message,
        code: err.code || httpCodeToAppCode(status),
        requestId: context.requestId
      });
    }
  };
}

