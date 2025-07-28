import { createClient } from 'redis';
import { logger } from './logger';

// Create Redis client or mock
export const redis = process.env.REDIS_URL === 'mock' ? {
  // Mock Redis client implementation
  connect: () => Promise.resolve(),
  on: () => {},
  get: () => Promise.resolve(null),
  set: () => Promise.resolve(),
  del: () => Promise.resolve(),
} : createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

if (process.env.REDIS_URL !== 'mock') {
  // Handle connection events for real Redis client
  redis.on('error', (err) => {
    logger.error('Redis Client Error', err);
  });

  redis.on('connect', () => {
    logger.info('Redis Client Connected');
  });

  redis.connect().catch((err) => {
    logger.error('Redis Connection Failed', err);
  });
}
