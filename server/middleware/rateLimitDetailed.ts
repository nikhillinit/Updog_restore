// Rate limiter for /health/detailed using express-rate-limit with Redis store
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { sendApiError, createErrorBody } from '../lib/apiError';

// Initialize Redis store for rate limiting across replicas
let redisStore: any = null;

// Initialize Redis store if available
if (process.env.REDIS_URL) {
  try {
    // Dynamic import will be resolved at module load time
    import('rate-limit-redis').then(async ({ default: RedisStore }) => {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(process.env.REDIS_URL!);
      redisStore = new RedisStore({
        sendCommand: (...args: string[]) => redis.call(...args),
      });
      console.log('📊 Rate limiting using Redis store for cluster consistency');
    }).catch(error => {
      console.warn('Failed to initialize Redis store for rate limiting, using memory store:', error);
    });
  } catch (error) {
    console.warn('Redis store initialization error:', error);
  }
}

export function rateLimitDetailed() {
  return rateLimit({
    windowMs: 60_000, // 1 minute
    max: 30, // 30 requests per minute
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    store: redisStore || undefined, // Use Redis store if available, fallback to memory
    keyGenerator: (req: Request) => ipKeyGenerator(req) ?? 'unknown',
    skip: (req: Request) => {
      // Allow on-call to bypass with a valid health key
      const healthKey = process.env.HEALTH_KEY;
      return Boolean(healthKey && req.get('X-Health-Key') === healthKey);
    },
    handler: (req: Request, res: Response) => {
      const seconds = req.rateLimit?.resetTime
        ? Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000))
        : 60;
      res.setHeader('Retry-After', String(seconds));
      sendApiError(res, 429, createErrorBody('Too Many Requests', (req as any).requestId, 'RATE_LIMITED'));
    }
  });
}

// Export for testing
export const WINDOW_MS = 60_000;
export const MAX_REQUESTS = 30;