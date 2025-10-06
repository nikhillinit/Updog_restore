/**
 * Tiered rate limiting configuration for different endpoint types
 * Provides granular control over API usage with Redis-backed distributed limiting
 */
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import type { Request, Response } from 'express';
import { sendApiError, createErrorBody } from '../lib/apiError.js';

// Redis client for distributed rate limiting (optional)
let redisClient: Redis | null = null;

// Only connect to Redis if not in memory mode
if (process.env['REDIS_URL'] && process.env['REDIS_URL'] !== 'memory://') {
  try {
    redisClient = new Redis(process.env['REDIS_URL']);
    console.log('[RateLimit] Connected to Redis for distributed rate limiting');
  } catch (error) {
    console.warn('[RateLimit] Redis unavailable, falling back to memory store:', error.message);
  }
} else if (process.env['REDIS_URL'] === 'memory://') {
  console.log('[RateLimit] Memory mode detected, using in-memory rate limiting');
}

/**
 * Rate limiter configurations for different endpoint categories
 */
export const rateLimitConfigs = {
  // General API endpoints - standard rate
  api: {
    windowMs: 60 * 1000,        // 1 minute
    max: 100,                    // 100 requests per minute
    message: 'Too many API requests'
  },
  
  // Heavy simulation endpoints - restricted rate
  simulation: {
    windowMs: 60 * 60 * 1000,    // 1 hour
    max: 10,                      // 10 simulations per hour
    message: 'Simulation quota exceeded'
  },
  
  // Authentication endpoints - strict rate limiting
  auth: {
    windowMs: 5 * 60 * 1000,     // 5 minutes
    max: 5,                       // 5 attempts per 5 minutes
    message: 'Too many authentication attempts'
  },
  
  // Report generation - moderate rate
  reports: {
    windowMs: 60 * 1000,         // 1 minute
    max: 20,                      // 20 reports per minute
    message: 'Report generation rate exceeded'
  },
  
  // Health check endpoints - higher rate allowed
  health: {
    windowMs: 60 * 1000,         // 1 minute
    max: 30,                      // 30 checks per minute
    message: 'Health check rate exceeded'
  },
  
  // WebSocket connections - connection rate limiting
  websocket: {
    windowMs: 60 * 1000,         // 1 minute
    max: 5,                       // 5 new connections per minute
    message: 'Connection rate exceeded'
  }
};

/**
 * Create a rate limiter with specified configuration
 */
function createRateLimiter(
  config: typeof rateLimitConfigs[keyof typeof rateLimitConfigs],
  keyPrefix: string
) {
  const store = redisClient
    ? new RedisStore({
        client: redisClient as any, // TODO: Add proper Redis adapter
        sendCommand: (...args: string[]) => (redisClient as any).call(...args),
        prefix: `rl:${keyPrefix}:`
      } as any)
    : undefined; // Falls back to memory store
  
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    keyGenerator: (req: Request) => {
      // Use IP address as key, with support for proxies
      const forwarded = req.headers['x-forwarded-for'];
      const ip = forwarded 
        ? (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0])
        : req.ip;
      
      // Include user ID if authenticated
      const userId = (req as any).user?.id;
      return userId ? `${ip}:user:${userId}` : `${ip}:anon`;
    },
    skip: (req: Request) => {
      // Allow bypass for internal health checks with valid key
      const healthKey = process.env['HEALTH_KEY'];
      if (healthKey && req['get']('X-Health-Key') === healthKey) {
        return true;
      }
      
      // Skip rate limiting in development mode if configured
      if (process.env['NODE_ENV'] === 'development' && process.env['SKIP_RATE_LIMIT'] === 'true') {
        return true;
      }
      
      return false;
    },
    handler: (req: Request, res: Response) => {
      const resetTime = (req as any).rateLimit?.resetTime;
      const seconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : 60;
      
      res['setHeader']('Retry-After', String(seconds));
      sendApiError(
        res, 
        429, 
        createErrorBody(config.message, (req as any).requestId, 'RATE_LIMITED')
      );
    }
  });
}

/**
 * Pre-configured rate limiters for different endpoint types
 */
export const rateLimiters = {
  api: createRateLimiter(rateLimitConfigs.api, 'api'),
  simulation: createRateLimiter(rateLimitConfigs.simulation, 'sim'),
  auth: createRateLimiter(rateLimitConfigs.auth, 'auth'),
  reports: createRateLimiter(rateLimitConfigs.reports, 'report'),
  health: createRateLimiter(rateLimitConfigs.health, 'health'),
  websocket: createRateLimiter(rateLimitConfigs.websocket, 'ws')
};

/**
 * Cost-based rate limiting for expensive operations
 * Consumes multiple points based on operation cost
 */
export class CostBasedRateLimiter {
  private points: Map<string, number> = new Map();
  private resetTimes: Map<string, number> = new Map();
  private sweepTimer: NodeJS.Timeout;
  
  constructor(
    private maxPoints: number,
    private windowMs: number
  ) {
    // Set up automatic cleanup
    this.sweepTimer = setInterval(() => this.sweep(), Math.min(60_000, windowMs));
    (this.sweepTimer as any).unref?.();
  }
  
  private sweep() {
    const now = Date.now();
    for (const [k, reset] of this.resetTimes) {
      if (now > reset) { 
        this.resetTimes.delete(k); 
        this.points.delete(k); 
      }
    }
  }
  
  async consume(key: string, cost: number = 1): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const resetTime = this.resetTimes['get'](key) || 0;
    
    // Reset if window expired
    if (now > resetTime) {
      this.points['set'](key, 0);
      this.resetTimes['set'](key, now + this.windowMs);
    }
    
    const current = this.points['get'](key) || 0;
    const newTotal = current + cost;
    
    if (newTotal > this.maxPoints) {
      return { 
        allowed: false, 
        remaining: Math.max(0, this.maxPoints - current) 
      };
    }
    
    this.points['set'](key, newTotal);
    return { 
      allowed: true, 
      remaining: this.maxPoints - newTotal 
    };
  }
  
  getRemainingPoints(key: string): number {
    const now = Date.now();
    const resetTime = this.resetTimes['get'](key) || 0;
    
    if (now > resetTime) {
      return this.maxPoints;
    }
    
    const current = this.points['get'](key) || 0;
    return Math.max(0, this.maxPoints - current);
  }
  
  destroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
    this.points.clear();
    this.resetTimes.clear();
  }
}

// Cost-based limiter for simulation operations
export const simulationCostLimiter = new CostBasedRateLimiter(
  100,           // 100 points total
  60 * 60 * 1000 // per hour
);

/**
 * Middleware for cost-based rate limiting
 */
export function costBasedRateLimit(getCost: (_req: Request) => number) {
  return async (req: Request, res: Response, next: Function) => {
    const key = (req as any).user?.id || req.ip || 'unknown';
    const cost = getCost(req);
    
    const { allowed, remaining } = await simulationCostLimiter.consume(key, cost);
    
    res['setHeader']('X-RateLimit-Cost', String(cost));
    res['setHeader']('X-RateLimit-Remaining', String(remaining));
    
    if (!allowed) {
      res['setHeader']('Retry-After', '3600'); // 1 hour
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Operation cost (${cost}) exceeds remaining quota (${remaining})`,
        remaining,
        cost
      });
    }
    
    next();
  };
}

/**
 * Get rate limit status for monitoring
 */
export function getRateLimitStatus() {
  return {
    redis: redisClient ? 'connected' : 'unavailable',
    mode: redisClient ? 'distributed' : 'memory',
    configs: Object.keys(rateLimitConfigs).map(key => ({
      endpoint: key,
      ...rateLimitConfigs[key as keyof typeof rateLimitConfigs]
    }))
  };
}