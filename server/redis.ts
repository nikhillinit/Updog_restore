import Redis from 'ioredis';
import { logger } from './logger';

// Create Redis client or mock
export const redis = process.env.REDIS_URL === 'mock' ? {
  // Mock Redis client implementation
  connect: () => Promise.resolve(),
  on: () => {},
  get: () => Promise.resolve(null),
  set: () => Promise.resolve(),
  setex: () => Promise.resolve(),
  del: () => Promise.resolve(),
  publish: () => Promise.resolve(0),
  subscribe: () => Promise.resolve(),
  duplicate: () => ({
    connect: () => Promise.resolve(),
    on: () => {},
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
    setex: () => Promise.resolve(),
    del: () => Promise.resolve(),
    publish: () => Promise.resolve(0),
    subscribe: () => Promise.resolve(),
  }),
} : new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

if (process.env.REDIS_URL !== 'mock') {
  // Handle connection events for real Redis client
  redis.on('error', (err: Error) => {
    logger.error('Redis Client Error', err);
  });

  redis.on('connect', () => {
    logger.info('Redis Client Connected');
  });
}
