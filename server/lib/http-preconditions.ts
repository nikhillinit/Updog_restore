/**
 * HTTP Preconditions for Optimistic Concurrency Control
 * Implements If-Match/ETag semantics (RFC 7232)
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface PreconditionRequest extends Request {
  ifMatch?: string;
  ifNoneMatch?: string;
  etag?: string;
}

/**
 * Generate a weak ETag from a value
 */
export function weakETag(value: string | object): string {
  const str = typeof value === 'object' ? JSON.stringify(value) : value;
  const hash = crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
  return `W/"${hash}"`;
}

/**
 * Generate a strong ETag from a value
 */
export function strongETag(value: string | object): string {
  const str = typeof value === 'object' ? JSON.stringify(value) : value;
  const hash = crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
  return `"${hash}"`;
}

/**
 * Parse ETag value (removes W/ prefix and quotes)
 */
export function parseETag(etag: string | undefined): string {
  if (!etag) return '';
  return etag.replace(/^W\//, '').replace(/"/g, '');
}

/**
 * Middleware that requires If-Match header for mutating operations
 * Returns 428 Precondition Required if missing
 */
export function requireIfMatch() {
  return (req: PreconditionRequest, res: Response, next: NextFunction) => {
    const ifMatch = req.headers['if-match'] as string | undefined;
    
    if (!ifMatch) {
      return res.status(428).json({
        error: 'precondition_required',
        message: 'If-Match header is required for this operation',
        code: 'PRECONDITION_REQUIRED'
      });
    }
    
    // Parse and store the If-Match value
    req.ifMatch = parseETag(ifMatch);
    next();
  };
}

/**
 * Middleware that checks If-None-Match for caching
 * Returns 304 Not Modified if content hasn't changed
 */
export function checkIfNoneMatch(getCurrentETag: (_req: Request) => string | Promise<string>) {
  return async (req: PreconditionRequest, res: Response, next: NextFunction) => {
    const ifNoneMatch = req.headers['if-none-match'] as string | undefined;
    
    if (!ifNoneMatch) {
      return next();
    }
    
    const currentETag = await getCurrentETag(req);
    req.etag = currentETag;
    
    if (parseETag(ifNoneMatch) === parseETag(currentETag)) {
      // Content hasn't changed, return 304
      res.setHeader('ETag', currentETag);
      res.setHeader('Cache-Control', 'private, must-revalidate');
      return res.status(304).end();
    }
    
    next();
  };
}

/**
 * Assert that the provided ETag matches the current version
 * Throws 412 Precondition Failed if mismatch
 */
export function assertNotModified(currentVersion: string, providedVersion: string | undefined): void {
  if (!providedVersion) {
    const error: any = new Error('Precondition Required');
    error.status = 428;
    error.code = 'PRECONDITION_REQUIRED';
    throw error;
  }
  
  const current = parseETag(currentVersion);
  const provided = parseETag(providedVersion);
  
  if (current !== provided) {
    const error: any = new Error('Precondition Failed');
    error.status = 412;
    error.code = 'PRECONDITION_FAILED';
    error.details = {
      current: currentVersion,
      provided: providedVersion
    };
    throw error;
  }
}

/**
 * Set ETag and cache headers on response
 */
export function setETagHeaders(res: Response, etag: string, options?: {
  maxAge?: number;
  private?: boolean;
  mustRevalidate?: boolean;
}): void {
  const opts = {
    maxAge: 0,
    private: true,
    mustRevalidate: true,
    ...options
  };
  
  res.setHeader('ETag', etag);
  
  const cacheDirectives = [];
  if (opts.private) cacheDirectives.push('private');
  if (opts.maxAge > 0) cacheDirectives.push(`max-age=${opts.maxAge}`);
  if (opts.mustRevalidate) cacheDirectives.push('must-revalidate');
  
  res.setHeader('Cache-Control', cacheDirectives.join(', '));
}

/**
 * Generate ETag from database row version
 */
export function rowVersionETag(rowVersion: string | number | Date): string {
  if (rowVersion instanceof Date) {
    return weakETag(rowVersion.toISOString());
  }
  return weakETag(String(rowVersion));
}

/**
 * Middleware to handle conditional requests (If-Match and If-None-Match)
 */
export function conditionalRequest(options: {
  getETag: (_req: Request) => string | Promise<string>;
  requireMatch?: boolean;
}) {
  return async (req: PreconditionRequest, res: Response, next: NextFunction) => {
    const currentETag = await options.getETag(req);
    req.etag = currentETag;
    
    // Check If-None-Match (for GET requests)
    const ifNoneMatch = req.headers['if-none-match'] as string | undefined;
    if (ifNoneMatch && req.method === 'GET') {
      if (parseETag(ifNoneMatch) === parseETag(currentETag)) {
        res.setHeader('ETag', currentETag);
        return res.status(304).end();
      }
    }
    
    // Check If-Match (for mutating requests)
    const ifMatch = req.headers['if-match'] as string | undefined;
    if (ifMatch || options.requireMatch) {
      if (!ifMatch && options.requireMatch) {
        return res.status(428).json({
          error: 'precondition_required',
          message: 'If-Match header is required'
        });
      }
      
      if (ifMatch && parseETag(ifMatch) !== parseETag(currentETag)) {
        return res.status(412).json({
          error: 'precondition_failed',
          message: 'Resource has been modified',
          current: currentETag
        });
      }
    }
    
    // Store parsed values for handler use
    req.ifMatch = ifMatch ? parseETag(ifMatch) : undefined;
    req.ifNoneMatch = ifNoneMatch ? parseETag(ifNoneMatch) : undefined;
    
    next();
  };
}

/**
 * Error handler for precondition failures
 */
export function handlePreconditionError(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err.status === 428) {
    res.status(428).json({
      error: 'precondition_required',
      message: err.message || 'Precondition required',
      code: err.code || 'PRECONDITION_REQUIRED'
    });
  } else if (err.status === 412) {
    res.status(412).json({
      error: 'precondition_failed',
      message: err.message || 'Precondition failed',
      code: err.code || 'PRECONDITION_FAILED',
      details: err.details
    });
  } else {
    next(err);
  }
}