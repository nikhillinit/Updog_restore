import type { Store, Options } from 'express-rate-limit';

/**
 * Factory for rate limit stores
 * Allows switching between memory and Redis stores via environment
 */
export async function createRateLimitStore(): Promise<Store | undefined> {
  const redisUrl = process.env.RATE_LIMIT_REDIS_URL;
  
  if (!redisUrl) {
    // Use default memory store
    return undefined;
  }
  
  try {
    // Dynamically import Redis store only if needed
    const { default: RedisStore } = await import('rate-limit-redis');
    const Redis = await import('ioredis');
    
    const client = new Redis.default(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true
    });
    
    await client.ping();
    console.log('✅ Rate limit Redis store connected');
    
    return new RedisStore({
      client,
      prefix: 'rate-limit:',
    });
  } catch (error) {
    console.warn('⚠️ Rate limit Redis unavailable, falling back to memory store:', error);
    return undefined;
  }
}

/**
 * Create rate limit options with configurable store
 */
export async function createRateLimitOptions(baseOptions: Partial<Options>): Promise<Partial<Options>> {
  const store = await createRateLimitStore();
  
  return {
    ...baseOptions,
    store,
    // Ensure we don't leak store type in response
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  };
}