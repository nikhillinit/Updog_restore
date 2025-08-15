/**
 * Resilient Cache System with Graceful Redis Fallback
 * Eliminates Redis connection failures in development
 */

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  close(): Promise<void>;
}

class MemoryCache implements Cache {
  private data = new Map<string, { value: string; expires?: number }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async get(key: string): Promise<string | null> {
    const entry = this.data.get(key);
    if (!entry) return null;
    
    if (entry.expires && Date.now() > entry.expires) {
      this.data.delete(key);
      return null;
    }
    
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expires = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : undefined;
    this.data.set(key, { value, expires });
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupInterval);
    this.data.clear();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.data.entries()) {
      if (entry.expires && now > entry.expires) {
        this.data.delete(key);
      }
    }
  }
}

class RedisCache implements Cache {
  constructor(private redis: any) {}

  async get(key: string): Promise<string | null> {
    return (await this.redis.get(key)) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

let lastRedisWarning = 0;
const REDIS_WARNING_THROTTLE = 60000; // 1 minute

function throttledWarn(message: string) {
  const now = Date.now();
  if (now - lastRedisWarning > REDIS_WARNING_THROTTLE) {
    console.warn(`[cache] ${message}`);
    lastRedisWarning = now;
  }
}

export async function buildCache(): Promise<Cache> {
  const url = process.env.REDIS_URL;
  
  // Explicit memory cache mode
  if (!url || url.startsWith('memory://')) {
    console.log('[cache] Using in-memory cache (development mode)');
    return new MemoryCache();
  }

  try {
    const { default: IORedis } = await import('ioredis');
    const redis = new IORedis(url, { 
      lazyConnect: true, 
      maxRetriesPerRequest: 1,
      retryDelayOnFailover: 100,
      connectTimeout: 800
    });

    // Test Redis availability with timeout
    await Promise.race([
      redis.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 800)
      )
    ]);

    // Verify with ping
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis ping timeout')), 500)
      )
    ]);

    console.log('[cache] Connected to Redis successfully');
    
    // Handle Redis errors gracefully in production
    redis.on('error', (err: Error) => {
      throttledWarn(`Redis error: ${err.message}`);
    });

    redis.on('reconnecting', () => {
      throttledWarn('Redis reconnecting...');
    });

    return new RedisCache(redis);

  } catch (error) {
    throttledWarn(`Redis unavailable, falling back to memory cache: ${(error as Error).message}`);
    return new MemoryCache();
  }
}

// Global cache instance
let cacheInstance: Cache | null = null;

export async function getCache(): Promise<Cache> {
  if (!cacheInstance) {
    cacheInstance = await buildCache();
  }
  return cacheInstance;
}

export async function closeCache(): Promise<void> {
  if (cacheInstance) {
    await cacheInstance.close();
    cacheInstance = null;
  }
}