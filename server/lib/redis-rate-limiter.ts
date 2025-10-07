/**
 * Redis-backed rate limiter for distributed systems
 * Provides consistent rate limiting across multiple server instances
 */

import type { RedisClientType } from 'redis';
import { createClient } from 'redis';

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
 * Uses atomic Lua scripts for race-condition-free rate limiting
 */
export class RedisApprovalRateLimiter {
  private tokenBucketScript: string;
  private slidingWindowScript: string;
  private redis: RedisClientType | null;
  private connected = false;
  private readonly useMemory: boolean;
  private readonly memoryBuckets = new Map<string, number[]>();

  constructor(
    private config: RateLimiterConfig = {
      maxRequests: 3,
      windowMs: 60000, // 1 minute default
      keyPrefix: 'rl' // Namespace keys properly
    }
  ) {
    const resolvedRedisUrl = config.redisUrl ?? process.env['REDIS_URL'];
    this.useMemory = !resolvedRedisUrl || resolvedRedisUrl === 'memory://';

    this.redis = this.useMemory
      ? null
      : createClient({
          url: resolvedRedisUrl,
          socket: {
            connectTimeout: 5000
          },
        });

    // Atomic token bucket Lua script
    this.tokenBucketScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local ttl = tonumber(ARGV[4])
      
      local bucket = redis.call('HMGET', key, 'count', 'reset_time')
      local count = tonumber(bucket[1]) or 0
      local reset_time = tonumber(bucket[2]) or now
      
      -- Reset bucket if window expired
      if now >= reset_time then
        count = 0
        reset_time = now + window
      end
      
      if count >= limit then
        -- Rate limited
        return {0, 0, reset_time}
      else
        -- Allow request
        count = count + 1
        redis.call('HMSET', key, 'count', count, 'reset_time', reset_time)
        redis.call('EXPIRE', key, ttl)
        return {1, limit - count, reset_time}
      end
    `;
    
    // Sliding window Lua script (more accurate)
    this.slidingWindowScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local identifier = ARGV[4]
      
      local window_start = now - window
      
      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
      
      -- Count current entries
      local current = redis.call('ZCARD', key)
      
      if current >= limit then
        -- Find reset time (oldest entry + window)
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local reset_at = oldest[2] and (tonumber(oldest[2]) + window) or (now + window)
        return {0, 0, reset_at}
      else
        -- Add current request
        redis.call('ZADD', key, now, identifier)
        redis.call('EXPIRE', key, math.ceil(window / 1000))
        return {1, limit - current - 1, now + window}
      end
    `;
    
    if (this.redis) {
      this.redis['on']('error', (err: any) => {
        console.error('Redis rate limiter error:', err);
        this.connected = false;
      });

      this.redis['on']('connect', () => {
        console.log('Redis rate limiter connected');
        this.connected = true;
      });
    } else {
      this.connected = true;
    }
  }

  async connect(): Promise<void> {
    if (this.useMemory) {
      this.connected = true;
      return;
    }
    if (!this.connected && this.redis) {
      await this.redis.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.useMemory) {
      this.connected = false;
      this.memoryBuckets.clear();
      return;
    }
    if (this.connected && this.redis) {
      await this.redis['quit']();
      this.connected = false;
    }
  }
  
  /**
   * Check if approval creation is allowed
   * Uses atomic Lua scripts to prevent race conditions
   */
  async canCreateApproval(
    strategyId: string, 
    inputsHash: string
  ): Promise<RateLimitResult> {
    if (this.useMemory) {
      const key = `${this.config.keyPrefix}:approval:${strategyId}:${inputsHash}`;
      const now = Date.now();
      const windowStart = now - this.config.windowMs;
      const timestamps = (this.memoryBuckets.get(key) || []).filter(ts => ts > windowStart);
      if (timestamps.length >= this.config.maxRequests) {
        const resetAt = timestamps[0] + this.config.windowMs;
        this.memoryBuckets.set(key, timestamps);
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfter: Math.ceil((resetAt - now) / 1000)
        };
      }
      timestamps.push(now);
      this.memoryBuckets.set(key, timestamps);
      return {
        allowed: true,
        remaining: this.config.maxRequests - timestamps.length,
        resetAt: now + this.config.windowMs
      };
    }

    if (!this.connected) {
      try {
        await this.connect();
      } catch (error) {
        console.error('Redis connection failed, allowing request:', error);
        return {
          allowed: true,
          remaining: this.config.maxRequests - 1,
          resetAt: Date.now() + this.config.windowMs
        };
      }
    }

    const key = `${this.config.keyPrefix}:approval:${strategyId}:${inputsHash}`;
    const now = Date.now();
    const ttl = Math.ceil(this.config.windowMs / 1000);
    const identifier = `${now}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const result = await this.redis!.eval(
        this.slidingWindowScript,
        {
          keys: [key],
          arguments: [
            now.toString(),
            this.config.windowMs.toString(),
            this.config.maxRequests.toString(),
            identifier
          ]
        }
      ) as [number, number, number];

      const [allowed, remaining, resetAt] = result;

      return {
        allowed: allowed === 1,
        remaining,
        resetAt,
        retryAfter: allowed === 0 ? Math.ceil((resetAt - now) / 1000) : undefined
      };

    } catch (error) {
      console.error('Redis rate limit check failed:', error);

      return {
        allowed: false,
        remaining: 0,
        resetAt: now + this.config.windowMs,
        retryAfter: Math.ceil(this.config.windowMs / 1000)
      };
    }
  }
  
  /**
   * Clear rate limit for a specific key
   * Useful for testing or manual intervention
   */
  async clearLimit(strategyId: string, inputsHash: string): Promise<void> {
    if (this.useMemory) {
      const key = `${this.config.keyPrefix}:approval:${strategyId}:${inputsHash}`;
      this.memoryBuckets.delete(key);
      return;
    }

    if (!this.connected) {
      await this.connect();
    }

    const key = `${this.config.keyPrefix}:approval:${strategyId}:${inputsHash}`;
    await this.redis!['del'](key);
  }

  /**
   * Get current usage for monitoring
   */
  async getCurrentUsage(
    strategyId: string,
    inputsHash: string
  ): Promise<{ count: number; oldestRequest: number | null }> {
    if (this.useMemory) {
      const key = `${this.config.keyPrefix}:approval:${strategyId}:${inputsHash}`;
      const now = Date.now();
      const windowStart = now - this.config.windowMs;
      const timestamps = (this.memoryBuckets.get(key) || []).filter(ts => ts > windowStart);
      this.memoryBuckets.set(key, timestamps);
      return {
        count: timestamps.length,
        oldestRequest: timestamps.length > 0 ? timestamps[0] : null,
      };
    }

    if (!this.connected) {
      await this.connect();
    }

    const key = `${this.config.keyPrefix}:approval:${strategyId}:${inputsHash}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    await this.redis!.zRemRangeByScore(key, '-inf', windowStart.toString());

    const count = await this.redis!.zCard(key);
    const oldest = await this.redis!.zRange(key, 0, 0);

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
  private storage = new Map<string, { timestamps: number[]; lastCleanup: number }>();
  private readonly maxStorageSize = 1000;
  private readonly cleanupInterval = 60000; // 1 minute
  
  constructor(
    private maxRequests: number = 3,
    private windowMs: number = 60000
  ) {}
  
  canCreateApproval(
    strategyId: string, 
    inputsHash: string
  ): RateLimitResult {
    const key = `rl:approval:${strategyId}:${inputsHash}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get existing data
    const data = this.storage['get'](key) || { timestamps: [], lastCleanup: now };
    
    // Filter out expired timestamps
    data.timestamps = data.timestamps.filter(t => t > windowStart);
    
    if (data.timestamps.length >= this.maxRequests) {
      const oldestTimestamp = Math.min(...data.timestamps);
      const resetAt = oldestTimestamp + this.windowMs;
      
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil((resetAt - now) / 1000)
      };
    }
    
    // Add current timestamp
    data.timestamps.push(now);
    data.lastCleanup = now;
    this.storage['set'](key, data);
    
    // Periodic cleanup
    if (this.storage.size > this.maxStorageSize || 
        now - data.lastCleanup > this.cleanupInterval) {
      this.cleanup(now);
    }
    
    return {
      allowed: true,
      remaining: this.maxRequests - data.timestamps.length,
      resetAt: now + this.windowMs
    };
  }
  
  private cleanup(now: number = Date.now()): void {
    for (const [key, data] of this.storage.entries()) {
      const validTimestamps = data.timestamps.filter(t => t > now - this.windowMs);
      if (validTimestamps.length === 0) {
        this.storage.delete(key);
      } else {
        data.timestamps = validTimestamps;
        data.lastCleanup = now;
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
  const isProduction = process.env['NODE_ENV'] === 'production';
  const redisUrl = config?.redisUrl ?? process.env['REDIS_URL'];
  const shouldUseRedis = !!redisUrl && redisUrl !== 'memory://';

  if (isProduction && shouldUseRedis) {
    try {
      const redisLimiter = new RedisApprovalRateLimiter({ ...config, redisUrl });
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
