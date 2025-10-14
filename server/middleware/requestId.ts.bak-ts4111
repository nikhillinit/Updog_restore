/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from '../types/request-response';

// Request interface augmentation is now centralized in types/express.d.ts

/**
 * Request ID middleware for correlation across logs, telemetry, and responses
 * Accepts client-provided X-Request-ID or generates one
 */
export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    // ALWAYS generate server-side ID (security: prevent log injection/collision)
    const serverRid = `req_${randomUUID()}`;

    // Optionally preserve client-provided ID for debugging (separate header)
    const clientRid = req['get']('X-Request-ID');
    if (clientRid && process.env.NODE_ENV !== 'production') {
      res['setHeader']('X-Client-Request-ID', clientRid);
    }

    // Use server ID as authoritative
    req.requestId = serverRid;
    res['setHeader']('X-Request-ID', serverRid);
    res.locals.requestId = serverRid;

    // If logger exists, create child logger with request context
    if ((global as any).logger) {
      req.log = (global as any).logger.child({
        requestId: serverRid,
        path: req.path,
        method: req.method
      });
    }

    // Log request completion
    res['on']('finish', () => {
      const duration = Date.now() - (res.locals.startTime || Date.now());
      if (req.log) {
        req.log.info({
          status: res.statusCode,
          duration,
          path: req.path,
          method: req.method,
          requestId: serverRid
        }, 'Request completed');
      }
    });

    // Track start time for duration calculation
    res.locals.startTime = Date.now();

    next();
  };
}
