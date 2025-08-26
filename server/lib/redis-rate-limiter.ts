/**
 * Redis-backed rate limiter for distributed systems
 * Provides consistent rate limiting across multiple server instances
 */

import { createClient, RedisClientType } from 'redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
  redisUrl?: string;
}

/**
 * Redis-backed approval rate limiter
 * Uses sliding window algorithm for accurate rate limiting
 */
export class RedisApprovalRateLimiter {
  private redis: RedisClientType;
  private connected: boolean = false;
  
  constructor(
    private config: RateLimiterConfig = {
      maxRequests: 3,
      windowMs: 60000, // 1 minute default
      keyPrefix: 'ratelimit'
    }
  ) {
    this.redis = createClient({
      url: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    this.redis.on('error', (err) => {
      console.error('Redis rate limiter error:', err);
      this.connected = false;
    });
    
    this.redis.on('connect', () => {
      console.log('Redis rate limiter connected');
      this.connected = true;
    });
  }
  
  async connect(): Promise<void> {
    if (!this.connected) {
      await this.redis.connect();
      this.connected = true;
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.redis.quit();
      this.connected = false;
    }
  }
  
  /**
   * Check if approval creation is allowed
   * Uses sliding window with Redis sorted sets
   */
  async canCreateApproval(
    strategyId: string, 
    inputsHash: string
  ): Promise<RateLimitResult> {
    if (!this.connected) {
      await this.connect();
    }
    
    const key = `${this.config.keyPrefix}:approval:${strategyId}:${inputsHash}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.multi();
    
    // Remove old entries outside the window
    pipeline.zRemRangeByScore(key, '-inf', windowStart.toString());
    
    // Count current entries in the window
    pipeline.zCard(key);
    
    // Add current timestamp if under limit (conditional)
    pipeline.zAdd(key, { 
      score: now, 
      value: `${now}-${Math.random()}` // Unique value to handle concurrent requests
    });
    
    // Set expiry on the key
    pipeline.expire(key, Math.ceil(this.config.windowMs / 1000));
    
    const results = await pipeline.exec();
    
    // Extract count from pipeline results
    const currentCount = (results[1] as number) || 0;
    
    if (currentCount >= this.config.maxRequests) {
      // Get oldest entry to calculate reset time
      const oldestEntries = await this.redis.zRange(key, 0, 0, { 
        BY: 'SCORE',
        REV: false 
      });
      
      const oldestTimestamp = oldestEntries.length > 0 
        ? parseInt(oldestEntries[0].split('-')[0])
        : now;
      
      const resetAt = oldestTimestamp + this.config.windowMs;
      const retryAfter = Math.ceil((resetAt - now) / 1000); // seconds
      
      // Remove the entry we just added since it's over limit
      await this.redis.zRem(key, `${now}-${Math.random()}`);
      
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter
      };
    }
    
    return {
      allowed: true,
      remaining: this.config.maxRequests - currentCount - 1,
      resetAt: now + this.config.windowMs
    };
  }
  
  /**
   * Clear rate limit for a specific key
   * Useful for testing or manual intervention
   */
  async clearLimit(strategyId: string, inputsHash: string): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
    
    const key = `${this.config.keyPrefix}:approval:${strategyId}:${inputsHash}`;
    await this.redis.del(key);
  }
  
  /**
   * Get current usage for monitoring
   */
  async getCurrentUsage(
    strategyId: string, 
    inputsHash: string
  ): Promise<{ count: number; oldestRequest: number | null }> {
    if (!this.connected) {
      await this.connect();
    }
    
    const key = `${this.config.keyPrefix}:approval:${strategyId}:${inputsHash}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Clean old entries
    await this.redis.zRemRangeByScore(key, '-inf', windowStart.toString());
    
    // Get count and oldest
    const count = await this.redis.zCard(key);
    const oldest = await this.redis.zRange(key, 0, 0, { 
      BY: 'SCORE',
      REV: false 
    });
    
    return {
      count,
      oldestRequest: oldest.length > 0 
        ? parseInt(oldest[0].split('-')[0])
        : null
    };
  }
}

/**
 * Fallback in-memory rate limiter for development/testing
 * Only use when Redis is not available
 */
export class InMemoryRateLimiter {
  private storage = new Map<string, number[]>();
  
  constructor(
    private maxRequests: number = 3,
    private windowMs: number = 60000
  ) {}
  
  canCreateApproval(
    strategyId: string, 
    inputsHash: string
  ): RateLimitResult {
    const key = `approval:${strategyId}:${inputsHash}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get existing timestamps
    let timestamps = this.storage.get(key) || [];
    
    // Filter out expired timestamps
    timestamps = timestamps.filter(t => t > windowStart);
    
    if (timestamps.length >= this.maxRequests) {
      const oldestTimestamp = Math.min(...timestamps);
      const resetAt = oldestTimestamp + this.windowMs;
      
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil((resetAt - now) / 1000)
      };
    }
    
    // Add current timestamp
    timestamps.push(now);
    this.storage.set(key, timestamps);
    
    // Clean up old keys periodically
    if (this.storage.size > 1000) {
      this.cleanup();
    }
    
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetAt: now + this.windowMs
    };
  }
  
  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.storage.entries()) {
      const validTimestamps = timestamps.filter(t => t > now - this.windowMs);
      if (validTimestamps.length === 0) {
        this.storage.delete(key);
      } else {
        this.storage.set(key, validTimestamps);
      }
    }
  }
  
  clear(): void {
    this.storage.clear();
  }
}

/**
 * Factory function to create appropriate rate limiter
 * Uses Redis in production, in-memory for development
 */
export async function createRateLimiter(
  config?: RateLimiterConfig
): Promise<RedisApprovalRateLimiter | InMemoryRateLimiter> {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasRedis = !!process.env.REDIS_URL;
  
  if (isProduction || hasRedis) {
    try {
      const redisLimiter = new RedisApprovalRateLimiter(config);
      await redisLimiter.connect();
      console.log('Using Redis-backed rate limiter');
      return redisLimiter;
    } catch (error) {
      console.warn('Failed to connect to Redis, falling back to in-memory rate limiter:', error);
    }
  }
  
  console.log('Using in-memory rate limiter (development mode)');
  return new InMemoryRateLimiter(
    config?.maxRequests,
    config?.windowMs
  );
}