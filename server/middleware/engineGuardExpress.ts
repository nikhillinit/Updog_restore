import { Request, Response, NextFunction } from 'express';
import { assertFiniteDeep } from './engine-guards.js';
import { calcGuardBad, calcGuardEvents } from '../metrics/calcGuards.js';
import { withFaults } from '../engine/fault-injector.js';
import { z } from 'zod';

const Env = z.object({
  ENGINE_GUARD_ENABLED: z.coerce.boolean().default(true),
  ENGINE_FAULT_RATE: z.coerce.number().min(0).max(1).default(0), // 0 in prod
}).parse(process.env);

declare module 'express' {
  interface Request {
    correlationId?: string;
    guard?: {
      sanitizeResponse: (data: any) => any;
      injectFaults: <T>(fn: () => T | Promise<T>) => Promise<T>;
    }
  }
}

export function engineGuardExpress() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Ensure correlationId exists (from correlation middleware)
    const correlationId = req.correlationId || 'unknown';
    const routePath = req.route?.path || req.path || 'unknown';

    // Attach guard helpers to request
    req.guard = {
      sanitizeResponse: (data: any) => {
        const guardResult = assertFiniteDeep(data);
        if (!guardResult.ok) {
          calcGuardBad.inc({ route: routePath, correlation: correlationId });
          calcGuardEvents.inc({ route: routePath, correlation: correlationId });
          
          // Log the issue but don't throw - return sanitized data
          console.warn(`[Engine Guard] Sanitized non-finite values at ${guardResult.path}`, {
            correlationId,
            route: routePath,
            reason: guardResult.reason,
            value: typeof guardResult.value === 'number' ? String(guardResult.value) : '[complex]'
          });
          
          // For now, return null to avoid returning corrupted data
          // TODO: Implement smart sanitization that replaces NaN/Infinity with 0 or removes bad keys
          return null;
        }
        return data;
      },

      injectFaults: async <T>(fn: () => T | Promise<T>): Promise<T> => {
        if (!Env.ENGINE_GUARD_ENABLED || Env.ENGINE_FAULT_RATE <= 0) {
          return await fn();
        }
        
        // Wrap function with fault injection for testing
        const faultWrapper = withFaults(fn, {
          rate: Env.ENGINE_FAULT_RATE,
          seed: parseInt(correlationId.slice(-8), 16) || 1337,
          targetKeys: ['irr', 'moic', 'percentiles', 'median']
        });
        
        return await faultWrapper();
      }
    };

    next();
  };
}