import { describe, expect, it } from 'vitest';
import { getQueueConfig, getQueueConnectionOptions } from '../../server/config/features';

describe('queue config helpers', () => {
  it('prefers QUEUE_REDIS_URL over REDIS_URL when queues are enabled', () => {
    const result = getQueueConfig({
      ENABLE_QUEUES: '1',
      REDIS_URL: 'memory://',
      QUEUE_REDIS_URL: 'redis://queue-user:queue-pass@queue-host:6380/4',
    });

    expect(result.enabled).toBe(true);
    expect(result.queueRedisUrl).toBe('redis://queue-user:queue-pass@queue-host:6380/4');
  });

  it('returns disabled when no usable queue Redis URL is configured', () => {
    const result = getQueueConfig({
      ENABLE_QUEUES: '1',
      REDIS_URL: 'memory://',
      QUEUE_REDIS_URL: undefined,
    });

    expect(result.enabled).toBe(false);
    expect(result.reason).toContain('memory://');
  });

  it('parses queue connection options from redis urls', () => {
    const result = getQueueConnectionOptions({
      ENABLE_QUEUES: '1',
      REDIS_URL: 'memory://',
      QUEUE_REDIS_URL: 'rediss://queue-user:queue-pass@queue-host:6380/4',
    });

    expect(result).toEqual({
      host: 'queue-host',
      port: 6380,
      username: 'queue-user',
      password: 'queue-pass',
      db: 4,
      tls: {},
    });
  });
});
