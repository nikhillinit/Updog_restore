/**
 * Unit Tests: Stage Validation Mode Store
 *
 * Tests the Redis-backed mode store with TTL caching, timeout, and fallback behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis before importing the module
const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  set: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
};

const mockCreateClient = vi.fn(() => mockRedisClient);

vi.mock('redis', () => ({
  createClient: mockCreateClient,
}));

// Import after mocking
import type { Mode } from '@server/lib/stage-validation-mode';

// Re-import module for each test to reset cache
async function importFresh() {
  const modulePath = '../../server/lib/stage-validation-mode';
  delete require.cache[require.resolve(modulePath)];
  return await import(modulePath);
}

describe('Stage Validation Mode Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset environment
    delete process.env.STAGE_VALIDATION_MODE;
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getStageValidationMode', () => {
    it('returns cached value within TTL (5s)', async () => {
      mockRedisClient.get.mockResolvedValue('warn');

      const { getStageValidationMode } = await importFresh();

      // First call - fetches from Redis
      const mode1 = await getStageValidationMode();
      expect(mode1).toBe('warn');
      expect(mockRedisClient.get).toHaveBeenCalledTimes(1);

      // Advance time by 3 seconds (within TTL)
      vi.advanceTimersByTime(3000);

      // Second call - uses cache
      const mode2 = await getStageValidationMode();
      expect(mode2).toBe('warn');
      expect(mockRedisClient.get).toHaveBeenCalledTimes(1); // No additional Redis call
    });

    it('fetches from Redis after TTL expires (>5s)', async () => {
      mockRedisClient.get.mockResolvedValue('warn');

      const { getStageValidationMode } = await importFresh();

      // First call
      await getStageValidationMode();
      expect(mockRedisClient.get).toHaveBeenCalledTimes(1);

      // Advance time by 6 seconds (beyond TTL)
      vi.advanceTimersByTime(6000);

      // Second call - cache expired, fetches from Redis
      mockRedisClient.get.mockResolvedValue('enforce');
      const mode2 = await getStageValidationMode();
      expect(mode2).toBe('enforce');
      expect(mockRedisClient.get).toHaveBeenCalledTimes(2);
    });

    it('falls back to default on Redis timeout (100ms)', async () => {
      // Mock Redis to hang (never resolve)
      mockRedisClient.get.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { getStageValidationMode } = await importFresh();

      // Advance time to trigger timeout
      const promise = getStageValidationMode();
      vi.advanceTimersByTime(150); // Beyond 100ms timeout
      await vi.runAllTimersAsync();

      const mode = await promise;
      expect(mode).toBe('warn'); // DEFAULT mode
    });

    it('validates Redis value is valid mode', async () => {
      // Redis returns invalid value
      mockRedisClient.get.mockResolvedValue('invalid-mode');

      const { getStageValidationMode } = await importFresh();

      const mode = await getStageValidationMode();
      expect(mode).toBe('warn'); // Falls back to DEFAULT
    });

    it('falls back to cached value on Redis error', async () => {
      mockRedisClient.get.mockResolvedValueOnce('warn');

      const { getStageValidationMode } = await importFresh();

      // First call succeeds
      await getStageValidationMode();

      // Advance time to expire cache
      vi.advanceTimersByTime(6000);

      // Second call fails
      mockRedisClient.get.mockRejectedValueOnce(new Error('Connection refused'));

      const mode2 = await getStageValidationMode();
      expect(mode2).toBe('warn'); // Uses cached value from first call
    });

    it('uses environment variable as default', async () => {
      process.env.STAGE_VALIDATION_MODE = 'enforce';
      mockRedisClient.get.mockRejectedValue(new Error('Redis unavailable'));

      const { getStageValidationMode } = await importFresh();

      const mode = await getStageValidationMode();
      expect(mode).toBe('enforce'); // Uses env var as default
    });

    it('ignores invalid environment variable', async () => {
      process.env.STAGE_VALIDATION_MODE = 'invalid';
      mockRedisClient.get.mockRejectedValue(new Error('Redis unavailable'));

      const { getStageValidationMode } = await importFresh();

      const mode = await getStageValidationMode();
      expect(mode).toBe('warn'); // Falls back to hard-coded default
    });
  });

  describe('setStageValidationMode', () => {
    it('updates Redis and cache', async () => {
      mockRedisClient.get.mockResolvedValue('warn');

      const { getStageValidationMode, setStageValidationMode } = await importFresh();

      // Set initial mode
      await getStageValidationMode();

      // Change mode
      await setStageValidationMode('enforce');

      expect(mockRedisClient.set).toHaveBeenCalledWith('stage:validation:mode', 'enforce');

      // Verify cache is updated (should return new value without Redis call)
      mockRedisClient.get.mockClear();
      const mode = await getStageValidationMode();
      expect(mode).toBe('enforce');
      expect(mockRedisClient.get).not.toHaveBeenCalled(); // Used cache
    });

    it('validates input mode', async () => {
      const { setStageValidationMode } = await importFresh();

      await expect(
        setStageValidationMode('invalid' as Mode)
      ).rejects.toThrow('invalid mode');

      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('emits structured audit log', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockRedisClient.get.mockResolvedValue('warn');

      const { getStageValidationMode, setStageValidationMode } = await importFresh();

      await getStageValidationMode(); // Set initial mode
      await setStageValidationMode('enforce', {
        actor: 'admin@test.com',
        reason: 'canary rollout',
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      const logData = JSON.parse(logCall);

      expect(logData).toMatchObject({
        event: 'stage_validation_mode_change',
        old_mode: 'warn',
        new_mode: 'enforce',
        actor: 'admin@test.com',
        reason: 'canary rollout',
      });
      expect(logData.timestamp).toBeDefined();

      consoleSpy.mockRestore();
    });

    it('uses default actor and reason if not provided', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockRedisClient.get.mockResolvedValue('warn');

      const { getStageValidationMode, setStageValidationMode } = await importFresh();

      await getStageValidationMode();
      await setStageValidationMode('enforce');

      const logCall = consoleSpy.mock.calls[0][0];
      const logData = JSON.parse(logCall);

      expect(logData.actor).toBe('system');
      expect(logData.reason).toBe('manual');

      consoleSpy.mockRestore();
    });
  });

  describe('Redis connection failure', () => {
    it('logs error on connect failure but continues', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.connect.mockRejectedValueOnce(new Error('Connection refused'));

      await importFresh();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[stage-mode] Redis connect failed');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Timing constants', () => {
    it('respects TTL_MS constant (5000ms)', async () => {
      mockRedisClient.get.mockResolvedValue('warn');

      const { getStageValidationMode } = await importFresh();

      await getStageValidationMode();
      mockRedisClient.get.mockClear();

      // Just before TTL expires
      vi.advanceTimersByTime(4999);
      await getStageValidationMode();
      expect(mockRedisClient.get).not.toHaveBeenCalled();

      // Just after TTL expires
      vi.advanceTimersByTime(2);
      await getStageValidationMode();
      expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
    });

    it('respects TIMEOUT_MS constant (100ms)', async () => {
      mockRedisClient.get.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('warn'), 200))
      );

      const { getStageValidationMode } = await importFresh();

      const promise = getStageValidationMode();
      vi.advanceTimersByTime(101);
      await vi.runAllTimersAsync();

      const mode = await promise;
      expect(mode).toBe('warn'); // Falls back to default (timeout triggered)
    });
  });
});
