/**
 * Unit Tests: Stage Validation Mode Store
 *
 * Tests the Redis-backed mode store with TTL caching and fallback behavior.
 * Mock Redis to test timeout, failure, and caching scenarios.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Default: Redis connects successfully
    mockRedisConnect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getStageValidationMode', () => {
    it('returns cached value within TTL (5s)', async () => {
      mockRedisGet.mockResolvedValue('enforce');

      const { getStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      // First call - fetches from Redis
      const mode1 = await getStageValidationMode();
      expect(mode1).toBe('enforce');
      expect(mockRedisGet).toHaveBeenCalledTimes(1);

      // Advance time by 3 seconds (within 5s TTL)
      vi.advanceTimersByTime(3000);

      // Second call - should use cache, not call Redis
      const mode2 = await getStageValidationMode();
      expect(mode2).toBe('enforce');
      expect(mockRedisGet).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('fetches from Redis after TTL expires', async () => {
      mockRedisGet.mockResolvedValueOnce('warn').mockResolvedValueOnce('enforce');

      const { getStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      // First call
      const mode1 = await getStageValidationMode();
      expect(mode1).toBe('warn');
      expect(mockRedisGet).toHaveBeenCalledTimes(1);

      // Advance time by 6 seconds (past 5s TTL)
      vi.advanceTimersByTime(6000);

      // Second call - should fetch from Redis again
      const mode2 = await getStageValidationMode();
      expect(mode2).toBe('enforce');
      expect(mockRedisGet).toHaveBeenCalledTimes(2);
    });

    it('falls back to default on Redis timeout (100ms)', async () => {
      // Simulate timeout by never resolving
      mockRedisGet.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { getStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      // Start the call
      const modePromise = getStageValidationMode();

      // Advance time past 100ms timeout
      vi.advanceTimersByTime(150);

      // Should resolve with default 'warn'
      const mode = await modePromise;
      expect(mode).toBe('warn');
    });

    it('falls back to cached value on Redis error', async () => {
      mockRedisGet
        .mockResolvedValueOnce('enforce') // First call succeeds
        .mockRejectedValueOnce(new Error('Redis connection lost')); // Second call fails

      const { getStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      // First call - succeeds and caches
      const mode1 = await getStageValidationMode();
      expect(mode1).toBe('enforce');

      // Advance time past TTL
      vi.advanceTimersByTime(6000);

      // Second call - Redis fails, should fall back to cached 'enforce'
      const mode2 = await getStageValidationMode();
      expect(mode2).toBe('enforce');
    });

    it('validates Redis value before trusting (invalid mode)', async () => {
      mockRedisGet.mockResolvedValue('invalid-mode');

      const { getStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      // Should reject invalid value and use default
      const mode = await getStageValidationMode();
      expect(mode).toBe('warn'); // Default
    });

    it('handles null Redis response', async () => {
      mockRedisGet.mockResolvedValue(null);

      const { getStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      const mode = await getStageValidationMode();
      expect(mode).toBe('warn'); // Default
    });
  });

  describe('setStageValidationMode', () => {
    it('updates Redis and cache', async () => {
      mockRedisSet.mockResolvedValue('OK');
      mockRedisGet.mockResolvedValue('warn'); // Current mode

      const { setStageValidationMode, getStageValidationMode } = await import(
        '@/server/lib/stage-validation-mode'
      );

      // Set mode to 'enforce'
      await setStageValidationMode('enforce', { actor: 'admin', reason: 'manual' });

      expect(mockRedisSet).toHaveBeenCalledWith('stage:validation:mode', 'enforce');

      // Verify cache was updated (should not call Redis again)
      const mode = await getStageValidationMode();
      expect(mode).toBe('enforce');
      expect(mockRedisGet).toHaveBeenCalledTimes(1); // Only from initial get for old mode
    });

    it('validates mode input', async () => {
      const { setStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      await expect(setStageValidationMode('invalid' as Mode)).rejects.toThrow('invalid mode');
    });

    it('emits structured audit log with actor and reason', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      mockRedisSet.mockResolvedValue('OK');
      mockRedisGet.mockResolvedValue('warn');

      const { setStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      await setStageValidationMode('enforce', {
        actor: 'alertmanager',
        reason: 'auto_downgrade',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('stage_validation_mode_changed')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"old_mode":"warn"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"new_mode":"enforce"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"actor":"alertmanager"'));

      consoleLogSpy.mockRestore();
    });

    it('defaults actor and reason if not provided', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      mockRedisSet.mockResolvedValue('OK');
      mockRedisGet.mockResolvedValue('off');

      const { setStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      await setStageValidationMode('warn');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"actor":"system"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"reason":"manual"'));

      consoleLogSpy.mockRestore();
    });
  });

  describe('Environment variable configuration', () => {
    it('uses STAGE_VALIDATION_MODE env var as default', async () => {
      process.env['STAGE_VALIDATION_MODE'] = 'enforce';
      mockRedisGet.mockResolvedValue(null); // No value in Redis

      const { getStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      const mode = await getStageValidationMode();
      expect(mode).toBe('enforce');

      delete process.env['STAGE_VALIDATION_MODE'];
    });

    it('falls back to "warn" if env var not set', async () => {
      delete process.env['STAGE_VALIDATION_MODE'];
      mockRedisGet.mockResolvedValue(null);

      const { getStageValidationMode } = await import('@/server/lib/stage-validation-mode');

      const mode = await getStageValidationMode();
      expect(mode).toBe('warn');
    });
  });
});
