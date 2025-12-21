/**
 * Tests for Redis Factory
 * Verifies URL parsing, config options, TLS, Sentinel, and health checks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import IORedis from 'ioredis';
import {
  createRedis,
  createCacheFromEnv,
  checkRedisHealth,
  type CreateRedisConfig,
} from '../../server/db/redis-factory';

// Mock ioredis
vi.mock('ioredis', () => ({
  __esModule: true,
  default: vi.fn(),
}));

// Mock logger to avoid console noise during tests
vi.mock('../../server/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs for TLS cert tests
vi.mock('fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.includes('ca.crt')) return Buffer.from('ca-cert');
    if (path.includes('tls.crt')) return Buffer.from('tls-cert');
    if (path.includes('tls.key')) return Buffer.from('tls-key');
    return Buffer.from('mock-cert');
  }),
}));

describe('Redis Factory', () => {
  let mockRedisInstance: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock Redis instance
    mockRedisInstance = {
      on: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
      get: vi.fn(),
      set: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      quit: vi.fn(),
    };

    // Mock IORedis constructor to return our mock instance
    vi.mocked(IORedis).mockImplementation(() => mockRedisInstance);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env['REDIS_URL'];
    delete process.env['REDIS_HOST'];
    delete process.env['REDIS_PORT'];
    delete process.env['REDIS_PASSWORD'];
    delete process.env['REDIS_USERNAME'];
    delete process.env['REDIS_DB'];
    delete process.env['REDIS_TLS'];
    delete process.env['REDIS_SENTINELS'];
    delete process.env['REDIS_SENTINEL_NAME'];
    delete process.env['REDIS_CA_PATH'];
    delete process.env['REDIS_CERT_PATH'];
    delete process.env['REDIS_KEY_PATH'];
    delete process.env['REDIS_SERVERNAME'];
  });

  describe('createRedis', () => {
    it('should create Redis client with default options', () => {
      const redis = createRedis();

      expect(IORedis).toHaveBeenCalledTimes(1);
      const options = vi.mocked(IORedis).mock.calls[0][0];

      // Check default options are set
      expect(options).toMatchObject({
        lazyConnect: true,
        enableAutoPipelining: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
        connectTimeout: 10_000,
        commandTimeout: 5_000,
      });

      // Check retry strategy exists and returns exponential backoff
      expect(options.retryStrategy).toBeDefined();
      if (options.retryStrategy) {
        expect(options.retryStrategy(1)).toBe(2000); // 1000 * 2^1
        expect(options.retryStrategy(2)).toBe(4000); // 1000 * 2^2
        expect(options.retryStrategy(3)).toBe(8000); // 1000 * 2^3
        expect(options.retryStrategy(10)).toBe(30_000); // Capped at 30s
      }
    });

    it('should parse redis:// URL correctly', () => {
      const config: CreateRedisConfig = {
        url: 'redis://user:pass@localhost:6380/2',
      };

      createRedis(config);

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options).toMatchObject({
        host: 'localhost',
        port: 6380,
        username: 'user',
        password: 'pass',
        db: 2,
      });
    });

    it('should parse rediss:// URL and enable TLS', () => {
      const config: CreateRedisConfig = {
        url: 'rediss://user:pass@secure.redis.com:6380/1',
      };

      createRedis(config);

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options).toMatchObject({
        host: 'secure.redis.com',
        port: 6380,
        username: 'user',
        password: 'pass',
        db: 1,
      });
      expect(options.tls).toBeDefined();
    });

    it('should pass through individual options', () => {
      const config: CreateRedisConfig = {
        host: 'custom-host',
        port: 7000,
        password: 'secret',
        db: 3,
        connectTimeout: 20_000,
        commandTimeout: 8_000,
      };

      createRedis(config);

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options).toMatchObject({
        host: 'custom-host',
        port: 7000,
        password: 'secret',
        db: 3,
        connectTimeout: 20_000,
        commandTimeout: 8_000,
      });
    });

    it('should override URL options with explicit config options', () => {
      const config: CreateRedisConfig = {
        url: 'redis://localhost:6379/0',
        password: 'override-password',
        db: 5,
      };

      createRedis(config);

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.password).toBe('override-password');
      expect(options.db).toBe(5);
    });

    it('should configure Sentinel from config', () => {
      const config: CreateRedisConfig = {
        sentinels: [
          { host: 'sentinel1', port: 26379 },
          { host: 'sentinel2', port: 26379 },
        ],
        name: 'mymaster',
      };

      createRedis(config);

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.sentinels).toHaveLength(2);
      expect(options.sentinels?.[0]).toEqual({ host: 'sentinel1', port: 26379 });
      expect(options.name).toBe('mymaster');
    });

    it('should add event listeners to Redis client', () => {
      createRedis();

      expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });
  });

  describe('createCacheFromEnv', () => {
    it('should use REDIS_URL if provided', () => {
      process.env['REDIS_URL'] = 'redis://env-host:6380/1';
      process.env['REDIS_PASSWORD'] = 'env-pass';

      createCacheFromEnv();

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options).toMatchObject({
        host: 'env-host',
        port: 6380,
        db: 1,
        password: 'env-pass',
      });
    });

    it('should use individual env vars when REDIS_URL not provided', () => {
      process.env['REDIS_HOST'] = 'separate-host';
      process.env['REDIS_PORT'] = '7000';
      process.env['REDIS_PASSWORD'] = 'separate-pass';
      process.env['REDIS_DB'] = '2';

      createCacheFromEnv();

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options).toMatchObject({
        host: 'separate-host',
        port: 7000,
        password: 'separate-pass',
        db: 2,
      });
    });

    it('should handle REDIS_USERNAME env var', () => {
      process.env['REDIS_URL'] = 'redis://localhost:6379';
      process.env['REDIS_USERNAME'] = 'custom-user';

      createCacheFromEnv();

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.username).toBe('custom-user');
    });

    it('should enable TLS from REDIS_TLS env var', () => {
      process.env['REDIS_URL'] = 'redis://localhost:6379';
      process.env['REDIS_TLS'] = 'true';

      createCacheFromEnv();

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.tls).toBeDefined();
    });

    it('should load TLS certificates from env paths', () => {
      process.env['REDIS_URL'] = 'redis://localhost:6379';
      process.env['REDIS_TLS'] = '1';
      process.env['REDIS_CA_PATH'] = '/path/to/ca.crt';
      process.env['REDIS_CERT_PATH'] = '/path/to/tls.crt';
      process.env['REDIS_KEY_PATH'] = '/path/to/tls.key';
      process.env['REDIS_SERVERNAME'] = 'redis.example.com';

      createCacheFromEnv();

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.tls).toBeDefined();
      expect(options.tls?.ca).toEqual(Buffer.from('ca-cert'));
      expect(options.tls?.cert).toEqual(Buffer.from('tls-cert'));
      expect(options.tls?.key).toEqual(Buffer.from('tls-key'));
      expect(options.tls?.servername).toBe('redis.example.com');
    });

    it('should parse Sentinel configuration from env', () => {
      process.env['REDIS_SENTINELS'] = JSON.stringify([
        { host: 'sentinel1', port: 26379 },
        { host: 'sentinel2', port: 26379 },
      ]);
      process.env['REDIS_SENTINEL_NAME'] = 'mymaster';

      createCacheFromEnv();

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.sentinels).toHaveLength(2);
      expect(options.name).toBe('mymaster');
    });
  });

  describe('checkRedisHealth', () => {
    it('should return true when ping succeeds', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');
      const redis = createRedis();

      const healthy = await checkRedisHealth(redis);

      expect(healthy).toBe(true);
      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('should return false when ping fails', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('Connection refused'));
      const redis = createRedis();

      const healthy = await checkRedisHealth(redis);

      expect(healthy).toBe(false);
      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('should not throw errors on failure', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('Connection timeout'));
      const redis = createRedis();

      await expect(checkRedisHealth(redis)).resolves.toBe(false);
    });
  });

  describe('retry strategy', () => {
    it('should use exponential backoff', () => {
      createRedis();
      const options = vi.mocked(IORedis).mock.calls[0][0];
      const retryStrategy = options.retryStrategy!;

      // Test exponential growth
      expect(retryStrategy(1)).toBe(2000); // 1000 * 2^1
      expect(retryStrategy(2)).toBe(4000); // 1000 * 2^2
      expect(retryStrategy(3)).toBe(8000); // 1000 * 2^3
      expect(retryStrategy(4)).toBe(16000); // 1000 * 2^4
    });

    it('should cap at 30 seconds', () => {
      createRedis();
      const options = vi.mocked(IORedis).mock.calls[0][0];
      const retryStrategy = options.retryStrategy!;

      // Test cap
      expect(retryStrategy(10)).toBe(30_000);
      expect(retryStrategy(100)).toBe(30_000);
    });
  });

  describe('password masking', () => {
    it('should not expose password in logs', async () => {
      // Import the mocked logger
      const loggerModule = await import('../../server/lib/logger');
      const logger = loggerModule.logger;

      createRedis({
        url: 'redis://user:secret123@localhost:6379/0',
      });

      // Check that logger.info was called but doesn't contain the password
      const logCalls = vi.mocked(logger.info).mock.calls;
      const loggedStrings = logCalls.map(call => JSON.stringify(call));

      // Password should not appear in any logs
      loggedStrings.forEach(str => {
        expect(str).not.toContain('secret123');
      });

      // But masked version should appear
      const hasConnectionLog = logCalls.some(call =>
        JSON.stringify(call).includes('redis://user:***@localhost:6379')
      );
      expect(hasConnectionLog).toBe(true);
    });
  });

  describe('offline queue', () => {
    it('should disable offline queue by default', () => {
      createRedis();

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.enableOfflineQueue).toBe(false);
    });

    it('should allow enabling offline queue via config', () => {
      createRedis({ enableOfflineQueue: true });

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.enableOfflineQueue).toBe(true);
    });
  });

  describe('timeouts', () => {
    it('should set default connect timeout to 10s', () => {
      createRedis();

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.connectTimeout).toBe(10_000);
    });

    it('should set default command timeout to 5s', () => {
      createRedis();

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.commandTimeout).toBe(5_000);
    });

    it('should allow overriding timeouts', () => {
      createRedis({
        connectTimeout: 30_000,
        commandTimeout: 15_000,
      });

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.connectTimeout).toBe(30_000);
      expect(options.commandTimeout).toBe(15_000);
    });
  });

  describe('lazy connect', () => {
    it('should enable lazy connect by default', () => {
      createRedis();

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.lazyConnect).toBe(true);
    });

    it('should allow disabling lazy connect', () => {
      createRedis({ lazyConnect: false });

      const options = vi.mocked(IORedis).mock.calls[0][0];
      expect(options.lazyConnect).toBe(false);
    });
  });
});
