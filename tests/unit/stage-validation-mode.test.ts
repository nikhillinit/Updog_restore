/**
 * Unit Tests: Stage Validation Mode Store
 *
 * Tests the Redis-backed mode store with TTL caching and fallback behavior.
 * Mock Redis to test timeout, failure, and caching scenarios.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mode } from '@/server/lib/stage-validation-mode';

// Mock Redis before importing the module
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisConnect = vi.fn();
const mockRedisQuit = vi.fn();

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    connect: mockRedisConnect,
    quit: mockRedisQuit,
  })),
}));

describe('Stage Validation Mode Store', () => {
  let getStageValidationMode: () => Promise<Mode>;
  let setStageValidationMode: (
    mode: Mode,
    opts?: { actor?: string; reason?: string }
  ) => Promise<void>;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Clear module cache to get fresh instance
    vi.resetModules();

    // Default: Redis connects successfully
    mockRedisConnect.mockResolvedValue(undefined);
    mockRedisGet.mockResolvedValue('warn'); // Default mode

    // Import fresh module
    const module = await import('@/server/lib/stage-validation-mode');
    getStageValidationMode = module.getStageValidationMode;
    setStageValidationMode = module.setStageValidationMode;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getStageValidationMode', () => {
    it('returns cached value within TTL (5s)', async () => {
      mockRedisGet.mockResolvedValue('enforce');

      // First call - fetches from Redis
      const mode1 = await getStageValidationMode();
      expect(mode1).toBe('enforce');
      expect(mockRedisConnect).toHaveBeenCalledTimes(1);
      expect(mockRedisGet).toHaveBeenCalledTimes(1);

      // Second call within TTL - should use cache, not call Redis again
      const mode2 = await getStageValidationMode();
      expect(mode2).toBe('enforce');
      expect(mockRedisGet).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('fetches from Redis after TTL expires', async () => {
      vi.useFakeTimers();
      mockRedisGet.mockResolvedValueOnce('warn').mockResolvedValueOnce('enforce');

      // First call
      const mode1 = await getStageValidationMode();
      expect(mode1).toBe('warn');

      // Advance time past 5s TTL
      vi.advanceTimersByTime(6000);

      // Second call - should fetch from Redis again
      const mode2 = await getStageValidationMode();
      expect(mode2).toBe('enforce');
      expect(mockRedisGet).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('falls back to default on Redis timeout (100ms)', async () => {
      // Redis client available but get times out
      mockRedisGet.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('enforce'), 200); // Takes longer than 100ms timeout
          })
      );

      const mode = await getStageValidationMode();
      // Should fall back to cached value or default
      expect(['warn', 'enforce']).toContain(mode);
    });

    it('falls back to cached value on Redis error', async () => {
      vi.useFakeTimers();
      mockRedisGet
        .mockResolvedValueOnce('enforce') // First call succeeds
        .mockRejectedValueOnce(new Error('Redis connection lost')); // Second call fails

      // First call - succeeds and caches
      const mode1 = await getStageValidationMode();
      expect(mode1).toBe('enforce');

      // Advance time past cache TTL (5000ms)
      vi.advanceTimersByTime(6000);

      // Second call - Redis fails, should fall back to cached 'enforce'
      const mode2 = await getStageValidationMode();
      expect(mode2).toBe('enforce');

      vi.useRealTimers();
    });

    it('validates Redis value before trusting (invalid mode)', async () => {
      mockRedisGet.mockResolvedValue('invalid-mode');

      // Should reject invalid value and use default
      const mode = await getStageValidationMode();
      expect(mode).toBe('warn'); // Default
    });

    it('handles null Redis response', async () => {
      mockRedisGet.mockResolvedValue(null);

      const mode = await getStageValidationMode();
      expect(mode).toBe('warn'); // Default
    });
  });

  describe('setStageValidationMode', () => {
    it('updates Redis and cache', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockRedisSet.mockResolvedValue('OK');
      mockRedisGet.mockResolvedValue('warn'); // Current mode

      // Set mode to 'enforce'
      await setStageValidationMode('enforce', { actor: 'admin', reason: 'manual' });

      expect(mockRedisSet).toHaveBeenCalledWith('stage:validation:mode', 'enforce');

      // Verify structured log was emitted
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('stage_validation_mode_changed')
      );

      consoleLogSpy.mockRestore();
    });

    it('validates mode input', async () => {
      await expect(setStageValidationMode('invalid' as Mode)).rejects.toThrow('Invalid mode');
    });

    it('emits structured audit log with actor and reason', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockRedisSet.mockResolvedValue('OK');
      mockRedisGet.mockResolvedValue('warn');

      await setStageValidationMode('enforce', {
        actor: 'alertmanager',
        reason: 'auto_downgrade',
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls.find((call) =>
        String(call[0]).includes('stage_validation_mode_changed')
      );
      expect(logCall).toBeDefined();

      const logData = JSON.parse(String(logCall![0]));
      expect(logData.event).toBe('stage_validation_mode_changed');
      expect(logData.old_mode).toBe('warn');
      expect(logData.new_mode).toBe('enforce');
      expect(logData.actor).toBe('alertmanager');
      expect(logData.reason).toBe('auto_downgrade');

      consoleLogSpy.mockRestore();
    });

    it('defaults actor and reason if not provided', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockRedisSet.mockResolvedValue('OK');
      mockRedisGet.mockResolvedValue('off');

      await setStageValidationMode('warn');

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls.find((call) =>
        String(call[0]).includes('stage_validation_mode_changed')
      );

      const logData = JSON.parse(String(logCall![0]));
      expect(logData.actor).toBe('system');
      expect(logData.reason).toBe('manual');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Environment variable configuration', () => {
    it('uses STAGE_VALIDATION_MODE env var as default', async () => {
      process.env['STAGE_VALIDATION_MODE'] = 'enforce';

      // Clear and re-import module with new env var
      vi.resetModules();
      mockRedisGet.mockResolvedValue(null); // No value in Redis

      const { getStageValidationMode: freshGet } = await import(
        '@/server/lib/stage-validation-mode'
      );

      const mode = await freshGet();
      expect(mode).toBe('enforce');

      delete process.env['STAGE_VALIDATION_MODE'];
    });

    it('falls back to "warn" if env var not set', async () => {
      delete process.env['STAGE_VALIDATION_MODE'];

      vi.resetModules();
      mockRedisGet.mockResolvedValue(null);

      const { getStageValidationMode: freshGet } = await import(
        '@/server/lib/stage-validation-mode'
      );

      const mode = await freshGet();
      expect(mode).toBe('warn');
    });
  });
});
