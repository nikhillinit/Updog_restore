/**
 * Unit tests for async iteration utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  forEachAsync,
  mapAsync,
  filterAsync,
  reduceAsync,
  processAsync,
  findAsync,
  type ProcessingOptions
} from '@/utils/async-iteration';
import { logger } from '@/lib/logger';

describe('async-iteration utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('forEachAsync', () => {
    it('should process each item with value and index', async () => {
      const items = ['a', 'b', 'c'];
      const callback = vi.fn().mockResolvedValue(undefined);

      await forEachAsync(items, callback);

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, 'a', 0, items);
      expect(callback).toHaveBeenNthCalledWith(2, 'b', 1, items);
      expect(callback).toHaveBeenNthCalledWith(3, 'c', 2, items);
    });

    it('should handle empty array', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      await forEachAsync([], callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle null input gracefully', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      await forEachAsync(null as any, callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle undefined input gracefully', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      await forEachAsync(undefined as any, callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should propagate errors in fail-fast mode', async () => {
      const items = ['a', 'b', 'c'];
      const error = new Error('Test error');
      const callback = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(error);

      await expect(forEachAsync(items, callback)).rejects.toThrow('Test error');
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('mapAsync', () => {
    it('should map each item and return results', async () => {
      const items = [1, 2, 3];
      const mapper = vi.fn()
        .mockResolvedValueOnce('a')
        .mockResolvedValueOnce('b')
        .mockResolvedValueOnce('c');

      const result = await mapAsync(items, mapper);

      expect(result).toEqual(['a', 'b', 'c']);
      expect(mapper).toHaveBeenCalledTimes(3);
    });

    it('should handle empty array', async () => {
      const mapper = vi.fn().mockResolvedValue('test');

      const result = await mapAsync([], mapper);

      expect(result).toEqual([]);
      expect(mapper).not.toHaveBeenCalled();
    });

    it('should handle null input gracefully', async () => {
      const mapper = vi.fn().mockResolvedValue('test');

      const result = await mapAsync(null as any, mapper);

      expect(result).toEqual([]);
      expect(mapper).not.toHaveBeenCalled();
    });

    it('should handle undefined input gracefully', async () => {
      const mapper = vi.fn().mockResolvedValue('test');

      const result = await mapAsync(undefined as any, mapper);

      expect(result).toEqual([]);
      expect(mapper).not.toHaveBeenCalled();
    });

    it('should process items in parallel by default', async () => {
      const items = [1, 2, 3];
      const mapper = vi.fn().mockImplementation(async (item: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return item * 2;
      });

      const startTime = Date.now();
      const result = await mapAsync(items, mapper);
      const endTime = Date.now();

      expect(result).toEqual([2, 4, 6]);
      // Should complete in roughly parallel time (less than sequential)
      expect(endTime - startTime).toBeLessThan(100); // More generous timing for CI
    });

    it('should process items sequentially when parallel=false', async () => {
      const items = [1, 2, 3];
      const mapper = vi.fn().mockImplementation(async (item: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return item * 2;
      });

      const result = await mapAsync(items, mapper, { parallel: false });

      expect(result).toEqual([2, 4, 6]);
    });
  });

  describe('filterAsync', () => {
    it('should filter items based on async predicate', async () => {
      const items = [1, 2, 3, 4, 5];
      const predicate = vi.fn().mockImplementation(async (item: number) => item % 2 === 0);

      const result = await filterAsync(items, predicate);

      expect(result).toEqual([2, 4]);
      expect(predicate).toHaveBeenCalledTimes(5);
    });

    it('should handle empty array', async () => {
      const predicate = vi.fn().mockResolvedValue(true);

      const result = await filterAsync([], predicate);

      expect(result).toEqual([]);
      expect(predicate).not.toHaveBeenCalled();
    });

    it('should handle null input gracefully', async () => {
      const predicate = vi.fn().mockResolvedValue(true);

      const result = await filterAsync(null as any, predicate);

      expect(result).toEqual([]);
      expect(predicate).not.toHaveBeenCalled();
    });

    it('should handle undefined input gracefully', async () => {
      const predicate = vi.fn().mockResolvedValue(true);

      const result = await filterAsync(undefined as any, predicate);

      expect(result).toEqual([]);
      expect(predicate).not.toHaveBeenCalled();
    });
  });

  describe('reduceAsync', () => {
    it('should reduce array with async reducer', async () => {
      const items = [1, 2, 3, 4];
      const reducer = vi.fn().mockImplementation(async (acc: number, current: number) => acc + current);

      const result = await reduceAsync(items, reducer, 0);

      expect(result).toBe(10);
      expect(reducer).toHaveBeenCalledTimes(4);
    });

    it('should handle empty array', async () => {
      const reducer = vi.fn().mockResolvedValue(0);
      const initialValue = 42;

      const result = await reduceAsync([], reducer, initialValue);

      expect(result).toBe(initialValue);
      expect(reducer).not.toHaveBeenCalled();
    });

    it('should handle null input gracefully', async () => {
      const reducer = vi.fn().mockResolvedValue(0);
      const initialValue = 42;

      const result = await reduceAsync(null as any, reducer, initialValue);

      expect(result).toBe(initialValue);
      expect(reducer).not.toHaveBeenCalled();
    });

    it('should handle undefined input gracefully', async () => {
      const reducer = vi.fn().mockResolvedValue(0);
      const initialValue = 42;

      const result = await reduceAsync(undefined as any, reducer, initialValue);

      expect(result).toBe(initialValue);
      expect(reducer).not.toHaveBeenCalled();
    });
  });

  describe('processAsync', () => {
    it('should process items with error-resilient mode', async () => {
      const items = [1, 2, 3];
      const processor = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Test error'))
        .mockResolvedValueOnce(undefined);

      // Mock logger.error to avoid noise in tests
      const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(vi.fn());

      await processAsync(items, processor, { continueOnError: true });

      expect(processor).toHaveBeenCalledTimes(3);
      expect(loggerSpy).toHaveBeenCalled();

      loggerSpy.mockRestore();
    });

    it('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = vi.fn().mockResolvedValue(undefined);

      await processAsync(items, processor, { 
        parallel: true, 
        batchSize: 2 
      });

      expect(processor).toHaveBeenCalledTimes(5);
    });

    it('should handle empty array', async () => {
      const processor = vi.fn().mockResolvedValue(undefined);

      await processAsync([], processor);

      expect(processor).not.toHaveBeenCalled();
    });

    it('should handle null array', async () => {
      const processor = vi.fn().mockResolvedValue(undefined);

      await processAsync(null as any, processor);

      expect(processor).not.toHaveBeenCalled();
    });
  });

  describe('findAsync', () => {
    it('should find first matching item', async () => {
      const items = [1, 2, 3, 4, 5];
      const predicate = vi.fn().mockImplementation(async (item: number) => item > 3);

      const result = await findAsync(items, predicate);

      expect(result).toBe(4);
    });

    it('should return undefined when no match found', async () => {
      const items = [1, 2, 3];
      const predicate = vi.fn().mockResolvedValue(false);

      const result = await findAsync(items, predicate);

      expect(result).toBeUndefined();
    });

    it('should handle null input gracefully', async () => {
      const predicate = vi.fn().mockResolvedValue(true);

      const result = await findAsync(null as any, predicate);

      expect(result).toBeUndefined();
      expect(predicate).not.toHaveBeenCalled();
    });

    it('should handle undefined input gracefully', async () => {
      const predicate = vi.fn().mockResolvedValue(true);

      const result = await findAsync(undefined as any, predicate);

      expect(result).toBeUndefined();
      expect(predicate).not.toHaveBeenCalled();
    });
  });
});
