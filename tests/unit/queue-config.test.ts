import { describe, expect, it } from 'vitest';
import {
  getQueueConfig,
  getQueueConnectionOptions,
  getQueueRuntimePolicy,
} from '../../server/config/features';
import {
  assertQueueRuntimePolicy,
  resolveQueueProcessPolicy,
} from '../../server/config/queue-runtime-policy';

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

  it('disables every queue runtime capability when queues are disabled', () => {
    expect(
      getQueueRuntimePolicy({
        NODE_ENV: 'development',
        ENABLE_QUEUES: '0',
        REDIS_URL: 'redis://localhost:6379',
      })
    ).toMatchObject({
      enabled: false,
      legacyProviderProducersEnabled: false,
      inProcessConsumersEnabled: false,
    });
  });

  it.each(['development', 'test'] as const)(
    'keeps %s queues producer-only when consumer opt-in is absent',
    (NODE_ENV) => {
      expect(
        getQueueRuntimePolicy({
          NODE_ENV,
          ENABLE_QUEUES: '1',
          REDIS_URL: 'redis://localhost:6379',
        })
      ).toMatchObject({
        enabled: true,
        legacyProviderProducersEnabled: true,
        inProcessConsumersEnabled: false,
      });
    }
  );

  it.each(['development', 'test'] as const)(
    'enables local %s consumers only with explicit opt-in',
    (NODE_ENV) => {
      expect(
        resolveQueueProcessPolicy({
          NODE_ENV,
          ENABLE_QUEUES: '1',
          REDIS_URL: 'redis://localhost:6379',
          ENABLE_IN_PROCESS_QUEUE_WORKERS: '1',
        })
      ).toEqual({
        legacyProviderProducersEnabled: true,
        inProcessConsumersEnabled: true,
      });
    }
  );

  it.each(['staging', 'production'] as const)(
    'keeps supported %s route-owned queue capability without legacy provider producers',
    (NODE_ENV) => {
      expect(
        getQueueRuntimePolicy({
          NODE_ENV,
          ENABLE_QUEUES: '1',
          REDIS_URL: 'redis://localhost:6379',
        })
      ).toMatchObject({
        enabled: true,
        legacyProviderProducersEnabled: false,
        inProcessConsumersEnabled: false,
      });
    }
  );

  it.each(['staging', 'production'] as const)('rejects in-process consumers in %s', (NODE_ENV) => {
    expect(() =>
      assertQueueRuntimePolicy({
        NODE_ENV,
        ENABLE_IN_PROCESS_QUEUE_WORKERS: '1',
      })
    ).toThrow(/in-process queue workers/i);
  });

  it.each([{ VERCEL: '1' }, { VERCEL_ENV: 'preview' }])(
    'rejects in-process consumers on Vercel even when NODE_ENV is test',
    (vercelEnv) => {
      expect(() =>
        assertQueueRuntimePolicy({
          NODE_ENV: 'test',
          ...vercelEnv,
          ENABLE_IN_PROCESS_QUEUE_WORKERS: '1',
        })
      ).toThrow(/Vercel/i);
    }
  );

  it('defaults a missing consumer flag to producer-only', () => {
    expect(
      resolveQueueProcessPolicy({
        NODE_ENV: 'development',
        ENABLE_QUEUES: '1',
        REDIS_URL: 'redis://localhost:6379',
      })
    ).toEqual({
      legacyProviderProducersEnabled: true,
      inProcessConsumersEnabled: false,
    });
  });
});
