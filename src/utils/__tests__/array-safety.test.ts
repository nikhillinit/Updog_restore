// src/utils/__tests__/array-safety.test.ts
// --------------------------------------------------
// Comprehensive tests for array safety utilities

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  forEach,
  map,
  filter,
  reduce,
  find,
  some,
  every,
  safe,
  forEachNested,
  safeArray,
  length,
  at,
  forEachWithMetrics,
  forEachAsync,
  forEachParallel,
  isArray,
  isSafeArray
} from '../array-safety';

describe('Array Safety Utilities', () => {
  
  describe('Type Guards', () => {
    describe('isArray', () => {
      it('should correctly identify arrays', () => {
        expect(isArray([])).toBe(true);
        expect(isArray([1, 2, 3])).toBe(true);
        expect(isArray(null)).toBe(false);
        expect(isArray(undefined)).toBe(false);
        expect(isArray({})).toBe(false);
        expect(isArray('string')).toBe(false);
      });
    });
    
    describe('isSafeArray', () => {
      it('should identify safe arrays (non-null arrays)', () => {
        expect(isSafeArray([])).toBe(true);
        expect(isSafeArray([1, 2, 3])).toBe(true);
        expect(isSafeArray(null)).toBe(false);
        expect(isSafeArray(undefined)).toBe(false);
      });
    });
  });

  describe('forEach', () => {
    it('should handle null arrays safely', () => {
      const callback = vi.fn();
      forEach(null, callback);
      expect(callback).not.toHaveBeenCalled();
    });
    
    it('should handle undefined arrays safely', () => {
      const callback = vi.fn();
      forEach(undefined, callback);
      expect(callback).not.toHaveBeenCalled();
    });
    
    it('should handle empty arrays', () => {
      const callback = vi.fn();
      forEach([], callback);
      expect(callback).not.toHaveBeenCalled();
    });
    
    it('should iterate over valid arrays', () => {
      const callback = vi.fn();
      const array = [1, 2, 3];
      forEach(array, callback);
      
      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenCalledWith(1, 0, array);
      expect(callback).toHaveBeenCalledWith(2, 1, array);
      expect(callback).toHaveBeenCalledWith(3, 2, array);
    });
    
    it('should preserve this context when provided', () => {
      const context = { value: 42 };
      const results: number[] = [];
      
      forEach([1, 2], function(item) {
        // @ts-expect-error - this context test
        results.push(this.value + item);
      }, context);
      
      expect(results).toEqual([43, 44]);
    });
    
    it('should log debug message in development for null arrays', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const callback = vi.fn();
      
      forEach(null, callback);
      
      expect(consoleSpy).toHaveBeenCalledWith('forEach called on null/undefined array');
      
      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });
  });
  
  describe('map', () => {
    it('should return empty array for null/undefined', () => {
      expect(map(null, (x: number) => x * 2)).toEqual([]);
      expect(map(undefined, (x: number) => x * 2)).toEqual([]);
    });
    
    it('should map valid arrays correctly', () => {
      expect(map([1, 2, 3], (x: number) => x * 2)).toEqual([2, 4, 6]);
    });
    
    it('should handle empty arrays', () => {
      expect(map([], (x: number) => x * 2)).toEqual([]);
    });
    
    it('should preserve this context', () => {
      const context = { multiplier: 3 };
      const result = map([1, 2], function(x: number) {
        // @ts-expect-error - this context test
        return x * this.multiplier;
      }, context);
      
      expect(result).toEqual([3, 6]);
    });
  });
  
  describe('filter', () => {
    it('should return empty array for null/undefined', () => {
      expect(filter(null, (x: number) => x > 1)).toEqual([]);
      expect(filter(undefined, (x: number) => x > 1)).toEqual([]);
    });
    
    it('should filter valid arrays correctly', () => {
      expect(filter([1, 2, 3, 4], (x: number) => x > 2)).toEqual([3, 4]);
    });
    
    it('should handle empty arrays', () => {
      expect(filter([], (x: number) => x > 1)).toEqual([]);
    });
  });
  
  describe('reduce', () => {
    it('should return initial value for null/undefined arrays', () => {
      expect(reduce(null, (sum: number, x: number) => sum + x, 0)).toBe(0);
      expect(reduce(undefined, (sum: number, x: number) => sum + x, 10)).toBe(10);
    });
    
    it('should reduce valid arrays correctly', () => {
      expect(reduce([1, 2, 3], (sum: number, x: number) => sum + x, 0)).toBe(6);
    });
    
    it('should handle empty arrays', () => {
      expect(reduce([], (sum: number, x: number) => sum + x, 5)).toBe(5);
    });
  });
  
  describe('find', () => {
    it('should return undefined for null/undefined arrays', () => {
      expect(find(null, (x: number) => x > 1)).toBeUndefined();
      expect(find(undefined, (x: number) => x > 1)).toBeUndefined();
    });
    
    it('should find elements in valid arrays', () => {
      expect(find([1, 2, 3], (x: number) => x > 1)).toBe(2);
      expect(find([1, 2, 3], (x: number) => x > 10)).toBeUndefined();
    });
  });
  
  describe('some', () => {
    it('should return false for null/undefined arrays', () => {
      expect(some(null, (x: number) => x > 1)).toBe(false);
      expect(some(undefined, (x: number) => x > 1)).toBe(false);
    });
    
    it('should work correctly with valid arrays', () => {
      expect(some([1, 2, 3], (x: number) => x > 2)).toBe(true);
      expect(some([1, 2, 3], (x: number) => x > 10)).toBe(false);
    });
  });
  
  describe('every', () => {
    it('should return true for null/undefined arrays (empty array behavior)', () => {
      expect(every(null, (x: number) => x > 1)).toBe(true);
      expect(every(undefined, (x: number) => x > 1)).toBe(true);
    });
    
    it('should work correctly with valid arrays', () => {
      expect(every([2, 3, 4], (x: number) => x > 1)).toBe(true);
      expect(every([1, 2, 3], (x: number) => x > 1)).toBe(false);
    });
  });
  
  describe('safeArray', () => {
    it('should return empty array for null/undefined', () => {
      expect(safeArray(null)).toEqual([]);
      expect(safeArray(undefined)).toEqual([]);
    });
    
    it('should return the array if valid', () => {
      const arr = [1, 2, 3];
      expect(safeArray(arr)).toBe(arr);
    });
    
    it('should use custom default value', () => {
      const defaultVal = [99];
      expect(safeArray(null, defaultVal)).toBe(defaultVal);
    });
  });
  
  describe('length', () => {
    it('should return 0 for null/undefined arrays', () => {
      expect(length(null)).toBe(0);
      expect(length(undefined)).toBe(0);
    });
    
    it('should return correct length for valid arrays', () => {
      expect(length([1, 2, 3])).toBe(3);
      expect(length([])).toBe(0);
    });
  });
  
  describe('at', () => {
    it('should return undefined for null/undefined arrays', () => {
      expect(at(null, 0)).toBeUndefined();
      expect(at(undefined, 0)).toBeUndefined();
    });
    
    it('should return correct element for valid arrays', () => {
      expect(at([1, 2, 3], 0)).toBe(1);
      expect(at([1, 2, 3], -1)).toBe(3);
      expect(at([1, 2, 3], 10)).toBeUndefined();
    });
  });
  
  describe('forEachNested', () => {
    it('should handle nested null arrays safely', () => {
      const callback = vi.fn();
      const data = [
        { id: 1, items: null },
        { id: 2, items: [1, 2] },
        { id: 3, items: undefined }
      ];
      
      forEachNested(
        data,
        parent => parent.items,
        callback
      );
      
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(
        { id: 2, items: [1, 2] },
        1,
        1,
        0
      );
      expect(callback).toHaveBeenCalledWith(
        { id: 2, items: [1, 2] },
        2,
        1,
        1
      );
    });
    
    it('should handle null parent array', () => {
      const callback = vi.fn();
      
      forEachNested(
        null,
        parent => parent.items,
        callback
      );
      
      expect(callback).not.toHaveBeenCalled();
    });
  });
  
  describe('SafeArray (Chainable Operations)', () => {
    it('should chain operations safely with null array', () => {
      const result = safe(null as number[] | null)
        .map(x => x * 2)
        .filter(x => x > 5)
        .toArray();
      
      expect(result).toEqual([]);
    });
    
    it('should chain operations with valid data', () => {
      const result = safe([1, 2, 3, 4, 5])
        .map(x => x * 2)
        .filter(x => x > 5)
        .toArray();
      
      expect(result).toEqual([6, 8, 10]);
    });
    
    it('should provide correct length', () => {
      expect(safe(null).length).toBe(0);
      expect(safe([1, 2, 3]).length).toBe(3);
    });
    
    it('should correctly identify empty/non-empty arrays', () => {
      expect(safe(null).isEmpty()).toBe(true);
      expect(safe([]).isEmpty()).toBe(true);
      expect(safe([1]).isEmpty()).toBe(false);
      
      expect(safe(null).isNotEmpty()).toBe(false);
      expect(safe([]).isNotEmpty()).toBe(false);
      expect(safe([1]).isNotEmpty()).toBe(true);
    });
    
    it('should handle find, some, every operations', () => {
      const safeArr = safe([1, 2, 3, 4]);
      
      expect(safeArr.find((x: number) => x > 2)).toBe(3);
      expect(safeArr.some((x: number) => x > 2)).toBe(true);
      expect(safeArr.every((x: number) => x > 0)).toBe(true);
      expect(safeArr.every((x: number) => x > 2)).toBe(false);
    });
    
    it('should handle reduce operation', () => {
      expect(safe([1, 2, 3]).reduce((sum: number, x: number) => sum + x, 0)).toBe(6);
      expect(safe(null as number[] | null).reduce((sum: number, x: number) => sum + x, 10)).toBe(10);
    });
    
    it('should support chained forEach', () => {
      const results: number[] = [];
      safe([1, 2, 3])
        .forEach((x: number) => results.push(x))
        .map((x: number) => x * 2)
        .forEach((x: number) => results.push(x));
      
      expect(results).toEqual([1, 2, 3, 2, 4, 6]);
    });
  });
  
  describe('forEachWithMetrics', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });
    
    it('should execute callback normally', () => {
      const callback = vi.fn();
      forEachWithMetrics([1, 2, 3], callback);
      
      expect(callback).toHaveBeenCalledTimes(3);
    });
    
    it('should log metrics in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const callback = vi.fn();
      
      forEachWithMetrics([1, 2, 3], callback, 'test-metric');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('forEach[test-metric]:')
      );
      
      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });
    
    it('should not log metrics without metric name', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const callback = vi.fn();
      
      forEachWithMetrics([1, 2, 3], callback);
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });
  });
  
  describe('forEachAsync', () => {
    it('should handle async operations safely', async () => {
      const results: number[] = [];
      const asyncCallback = async (item: number) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        results.push(item * 2);
      };
      
      await forEachAsync([1, 2, 3], asyncCallback);
      expect(results).toEqual([2, 4, 6]);
    });
    
    it('should handle null arrays safely', async () => {
      const asyncCallback = vi.fn();
      await forEachAsync(null, asyncCallback);
      expect(asyncCallback).not.toHaveBeenCalled();
    });
  });
  
  describe('forEachParallel', () => {
    it('should handle parallel async operations safely', async () => {
      const results: number[] = [];
      const asyncCallback = async (item: number) => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        results.push(item * 2);
      };
      
      await forEachParallel([1, 2, 3], asyncCallback);
      expect(results).toHaveLength(3);
      expect(results.sort()).toEqual([2, 4, 6]);
    });
    
    it('should handle null arrays safely', async () => {
      const asyncCallback = vi.fn();
      await forEachParallel(null, asyncCallback);
      expect(asyncCallback).not.toHaveBeenCalled();
    });
  });
});
