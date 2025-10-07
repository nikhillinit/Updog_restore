/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
export type Status = 'in-progress' | 'succeeded' | 'failed';

export interface IdemRecord<T = unknown> {
  status: Status;
  result?: T;
  error?: string;
  updatedAt: number;
  ttlMs: number;
}

export interface IdempotencyStore {
  get<T = unknown>(_key: string): Promise<IdemRecord<T> | undefined>;
  set<T = unknown>(_key: string, _rec: IdemRecord<T>): Promise<void>;
  del(_key: string): Promise<void>;
}

// In-memory store with TTL GC (sufficient for single-process dev/test)
export function memoryStore(): IdempotencyStore {
  const m = new Map<string, IdemRecord>();
  const gc = () => {
    const now = Date.now();
    for (const [k, v] of m) if (now - v.updatedAt > v.ttlMs) m.delete(k);
  };
  setInterval(gc, 10_000).unref();
  return {
    async get<T>(key: string) { return m['get'](key) as IdemRecord<T> | undefined; },
    async set<T>(key: string, rec: IdemRecord<T>) { m['set'](key, rec); },
    async del(key: string) { m.delete(key); }
  };
}

// (Optional) Hook up a Redis-backed store implementing IdempotencyStore in production.

import type { Request, Response, NextFunction } from 'express';

/**
 * Express middleware for idempotency support
 * Prevents duplicate operations from network retries
 */
export function withIdempotency(options?: { 
  ttlSeconds?: number; 
  store?: IdempotencyStore;
}) {
  const ttl = (options?.ttlSeconds ?? 86400) * 1000; // Default 24 hours
  const store = options?.store ?? memoryStore();
  
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    
    // Skip if no idempotency key provided
    if (!idempotencyKey) {
      return next();
    }
    
    try {
      // Check if we've seen this key before
      const existing = await store['get'](idempotencyKey);
      
      if (existing) {
        if (existing.status === 'in-progress') {
          // Request still being processed
          return res.status(409).json({
            error: 'request_in_progress',
            message: 'A request with this idempotency key is already being processed'
          });
        }
        
        if (existing.status === 'succeeded' && existing.result) {
          // Return cached successful result
          res['set']('X-Idempotent-Replay', 'true');
          return res.json(existing.result);
        }
        
        if (existing.status === 'failed' && existing.error) {
          // Return cached error
          res['set']('X-Idempotent-Replay', 'true');
          return res.status(500).json({
            error: 'cached_error',
            message: existing.error
          });
        }
      }
      
      // Mark as in-progress
      await store['set'](idempotencyKey, {
        status: 'in-progress',
        updatedAt: Date.now(),
        ttlMs: ttl
      });
      
      // Capture response
      const originalJson = res.json;
      res.json = function(data: any) {
        // Store successful response
        store['set'](idempotencyKey, {
          status: 'succeeded',
          result: data,
          updatedAt: Date.now(),
          ttlMs: ttl
        }).catch(console.error);
        
        return originalJson.call(this, data);
      };
      
      // Continue processing
      next();
      
    } catch (error) {
      console.error('Idempotency middleware error:', error);
      next(); // Continue without idempotency on error
    }
  };
}
