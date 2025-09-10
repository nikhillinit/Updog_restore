/**
 * Redis client with circuit breaker protection
 * Provides resilient cache access with automatic failure handling
 */
import Redis from 'ioredis';
import { CircuitBreaker } from '../infra/circuit-breaker/CircuitBreaker';
import { breakerRegistry } from '../infra/circuit-breaker/breaker-registry';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  enableOfflineQueue: false,
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,
  commandTimeout: 5000,
  lazyConnect: true,
};

// Create Redis client (lazy connection)
const redis = new Redis(process.env.REDIS_URL || redisConfig);

// Redis event handlers for monitoring
redis.on('connect', () => {
  console.log('[Redis] Connected to Redis server');
});

redis.on('ready', () => {
  console.log('[Redis] Redis client ready');
});

redis.on('error', (err) => {
  console.error('[Redis] Redis client error:', err.message);
});

redis.on('close', () => {
  console.log('[Redis] Redis connection closed');
});

redis.on('reconnecting', (delay: number) => {
  console.log(`[Redis] Reconnecting in ${delay}ms`);
});

// Circuit breaker configuration for Redis operations
const redisBreakerConfig = {
  failureThreshold: parseInt(process.env.CB_CACHE_FAILURE_THRESHOLD || '5', 10),
  resetTimeout: parseInt(process.env.CB_CACHE_RESET_TIMEOUT_MS || '30000', 10),
  operationTimeout: parseInt(process.env.CB_CACHE_OP_TIMEOUT_MS || '2000', 10),
  successesToClose: parseInt(process.env.CB_CACHE_SUCCESS_TO_CLOSE || '3', 10),
  halfOpenMaxConcurrent: parseInt(process.env.CB_CACHE_HALF_OPEN_MAX_CONC || '2', 10),
};

// Create circuit breaker for Redis operations
const redisBreaker = new CircuitBreaker<any>(redisBreakerConfig, async () => {}, async () => {});

// Register with the breaker registry for monitoring
breakerRegistry.register('redis', redisBreaker);

/**
 * In-memory fallback cache for when Redis is unavailable
 */
class MemoryCache {
  private cache = new Map<string, { value: any; expiry?: number }>();
  private readonly maxSize = 1000;
  
  set(key: string, value: any, ttl?: number): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    const expiry = ttl ? Date.now() + (ttl * 1000) : undefined;
    this.cache.set(key, { value, expiry });
  }
  
  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check expiry
    if (entry.expiry && Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  del(key: string): void {
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
}

const memoryCache = new MemoryCache();

/**
 * Cache operation metrics
 */
interface CacheMetrics {
  operation: string;
  key: string;
  duration: number;
  hit: boolean;
  error?: Error;
  fallback?: boolean;
}

const cacheMetrics: CacheMetrics[] = [];
const MAX_METRICS = 100;

function recordMetrics(metrics: CacheMetrics) {
  cacheMetrics.push(metrics);
  if (cacheMetrics.length > MAX_METRICS) {
    cacheMetrics.shift();
  }
  
  // Log slow operations
  if (metrics.duration > 100) {
    console.warn(`[Redis] Slow operation (${metrics.duration}ms): ${metrics.operation} ${metrics.key}`);
  }
  
  // Log fallback usage
  if (metrics.fallback) {
    console.info(`[Redis] Using memory fallback for: ${metrics.key}`);
  }
}

/**
 * Get cache performance metrics
 */
export function getCacheMetrics() {
  const totalOps = cacheMetrics.length;
  const hits = cacheMetrics.filter(m => m.hit).length;
  const errors = cacheMetrics.filter(m => m.error).length;
  const fallbacks = cacheMetrics.filter(m => m.fallback).length;
  const avgDuration = cacheMetrics.reduce((sum, m) => sum + m.duration, 0) / totalOps || 0;
  
  return {
    totalOps,
    hitRate: totalOps > 0 ? (hits / totalOps) * 100 : 0,
    errors,
    fallbacks,
    avgDuration: Math.round(avgDuration),
    memoryCacheSize: memoryCache.size(),
    recentOps: cacheMetrics.slice(-10),
  };
}

/**
 * Get a value from cache with circuit breaker protection
 */
export async function get(key: string): Promise<string | null> {
  const start = Date.now();
  let hit = false;
  let error: Error | undefined;
  let fallback = false;
  
  try {
    // Skip circuit breaker if disabled
    if (process.env.CB_CACHE_ENABLED === 'false') {
      const value = await redis.get(key);
      hit = value !== null;
      return value;
    }
    
    // Try Redis with circuit breaker
    const value = await redisBreaker.execute(async () => {
      const result = await redis.get(key);
      hit = result !== null;
      return result;
    });
    
    return value;
  } catch (err) {
    error = err as Error;
    
    // Fallback to memory cache
    console.warn(`[Redis] Falling back to memory cache for key: ${key}`);
    const cachedValue = memoryCache.get(key);
    hit = cachedValue !== null;
    fallback = true;
    
    return cachedValue;
  } finally {
    recordMetrics({
      operation: 'get',
      key,
      duration: Date.now() - start,
      hit,
      error,
      fallback,
    });
  }
}

/**
 * Set a value in cache with circuit breaker protection
 */
export async function set(
  key: string,
  value: string | number | Buffer,
  ttl?: number
): Promise<void> {
  const start = Date.now();
  let error: Error | undefined;
  let fallback = false;
  
  try {
    // Always update memory cache as backup
    memoryCache.set(key, value, ttl);
    
    // Skip circuit breaker if disabled
    if (process.env.CB_CACHE_ENABLED === 'false') {
      if (ttl) {
        await redis.setex(key, ttl, value);
      } else {
        await redis.set(key, value);
      }
      return;
    }
    
    // Try Redis with circuit breaker
    await redisBreaker.execute(async () => {
      if (ttl) {
        await redis.setex(key, ttl, value);
      } else {
        await redis.set(key, value);
      }
    });
  } catch (err) {
    error = err as Error;
    fallback = true;
    // Memory cache already updated, so operation succeeds
    console.warn(`[Redis] Failed to set in Redis, using memory cache: ${key}`);
  } finally {
    recordMetrics({
      operation: 'set',
      key,
      duration: Date.now() - start,
      hit: true,
      error,
      fallback,
    });
  }
}

/**
 * Delete a key from cache with circuit breaker protection
 */
export async function del(key: string): Promise<void> {
  const start = Date.now();
  let error: Error | undefined;
  
  try {
    // Always delete from memory cache
    memoryCache.del(key);
    
    // Skip circuit breaker if disabled
    if (process.env.CB_CACHE_ENABLED === 'false') {
      await redis.del(key);
      return;
    }
    
    // Try Redis with circuit breaker
    await redisBreaker.run(async () => redis.del(key), async () => {
      // Memory cache already cleared, so operation succeeds
      console.warn(`[Redis] Failed to delete from Redis: ${key}`);
      return 0;
    });
  } catch (err) {
    error = err as Error;
    // Memory cache already cleared, so operation succeeds
    console.warn(`[Redis] Failed to delete from Redis: ${key}`);
  } finally {
    recordMetrics({
      operation: 'del',
      key,
      duration: Date.now() - start,
      hit: false,
      error,
    });
  }
}

/**
 * Get JSON object from cache
 */
export async function getJSON<T>(key: string): Promise<T | null> {
  const value = await get(key);
  if (!value) return null;
  
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`[Redis] Failed to parse JSON for key ${key}:`, error);
    return null;
  }
}

/**
 * Set JSON object in cache
 */
export async function setJSON<T>(key: string, value: T, ttl?: number): Promise<void> {
  const json = JSON.stringify(value);
  await set(key, json, ttl);
}

/**
 * Increment a counter with circuit breaker protection
 */
export async function incr(key: string): Promise<number> {
  try {
    if (process.env.CB_CACHE_ENABLED === 'false') {
      return await redis.incr(key);
    }
    
    return await redisBreaker.run(async () => redis.incr(key), async () => {
      console.error(`[Redis] Failed to increment ${key}`);
      // Return 0 as fallback
      return 0;
    });
  } catch (error) {
    console.error(`[Redis] Failed to increment ${key}:`, error);
    // Return 0 as fallback
    return 0;
  }
}

/**
 * Set expiry on a key
 */
export async function expire(key: string, seconds: number): Promise<boolean> {
  try {
    if (process.env.CB_CACHE_ENABLED === 'false') {
      return Boolean(await redis.expire(key, seconds));
    }
    
    return await redisBreaker.execute(async () => {
      return Boolean(await redis.expire(key, seconds));
    });
  } catch (error) {
    console.error(`[Redis] Failed to set expiry for ${key}:`, error);
    return false;
  }
}

/**
 * Health check for Redis connection
 */
export async function healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  const start = Date.now();
  
  try {
    await redis.ping();
    return {
      healthy: true,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      error: (error as Error).message,
      latency: Date.now() - start,
    };
  }
}

/**
 * Clear memory cache
 */
export function clearMemoryCache(): void {
  memoryCache.clear();
  console.log('[Redis] Memory cache cleared');
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
  console.log('[Redis] Connection closed');
}

/**
 * Exponential backoff utility for retries
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 50,
    maxDelay = 5000,
    factor = 2,
  } = options;
  
  let lastError: Error | undefined;
  let delay = initialDelay;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i === maxRetries) {
        throw error;
      }
      
      console.log(`[Redis Backoff] Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      delay = Math.min(delay * factor, maxDelay);
    }
  }
  
  throw lastError;
}

// Export the Redis client for advanced operations
export { redis };

// Export default cache operations
export default {
  get,
  set,
  del,
  getJSON,
  setJSON,
  incr,
  expire,
  healthCheck,
  clearMemoryCache,
  closeRedis,
  getCacheMetrics,
};







/**
 * Get circuit breaker stats
 */
export function getStats() {
  return redisBreaker.getMetrics();
}
