/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { logger } from './logger';

// Import the Redis factory to ensure consistent mock behavior
import { createCacheFromEnv } from './db/redis-factory';

// Create Redis client using the factory (ensures consistent mock behavior)
export const redis = createCacheFromEnv();

// Only add event listeners for real Redis connections (not mocks)
const redisUrl = process.env['REDIS_URL'];
if (redisUrl !== 'mock' && redisUrl !== 'memory://' && process.env['NODE_ENV'] !== 'test') {
  // Handle connection events for real Redis client
  redis['on']('error', (err: Error) => {
    logger.error('Redis Client Error', err);
  });

  redis['on']('connect', () => {
    logger.info('Redis Client Connected');
  });
}

