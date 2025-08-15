import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from '../types/request-response';

// We'll use a different approach to avoid conflicts with other declarations
// Instead of extending the Request interface directly, we'll use a module augmentation
// that's compatible with our other type definitions
declare global {
  namespace Express {
    interface Request {
      // Make requestId optional to avoid conflicts with other declarations
      requestId: string;
      log?: {
        info: (obj: any, msg?: string) => void;
        error: (obj: any, msg?: string) => void;
        warn: (obj: any, msg?: string) => void;
      };
    }
  }
}

/**
 * Request ID middleware for correlation across logs, telemetry, and responses
 * Accepts client-provided X-Request-ID or generates one
 */
export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Use client-provided ID or generate new one
    const incoming = req.get('X-Request-ID');
    const rid = incoming && incoming.trim() !== '' ? incoming : `req_${randomUUID()}`;
    
    // Attach to request object for logging
    req.requestId = rid;
    
    // Always set response header
    res.setHeader('X-Request-ID', rid);
    
    // Add to response locals for telemetry
    res.locals.requestId = rid;
    
    // If logger exists, create child logger with request context
    if ((global as any).logger) {
      req.log = (global as any).logger.child({ 
        requestId: rid, 
        path: req.path, 
        method: req.method 
      });
    }
    
    // Log request completion
    res.on('finish', () => {
      const duration = Date.now() - (res.locals.startTime || Date.now());
      if (req.log) {
        req.log.info({
          status: res.statusCode,
          duration,
          path: req.path,
          method: req.method,
          requestId: rid
        }, 'Request completed');
      }
    });
    
    // Track start time for duration calculation
    res.locals.startTime = Date.now();
    
    next();
  };
}