import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  serializeAsync,
  serializeSafely,
  serializeBatch,
  shutdownSerializationPool,
  type SerializationResult
} from '../SerializationHelper';

describe('SerializationHelper - Worker Thread Implementation', () => {
  afterAll(async () => {
    // Cleanup worker pool
    await shutdownSerializationPool();
  });

  describe('serializeAsync - Small Objects (Synchronous Path)', () => {
    it('should serialize primitives synchronously', async () => {
      const result = await serializeAsync(null);
      expect(result.serialized).toBe('null');
      expect(result.truncated).toBe(false);

      const numResult = await serializeAsync(42);
      expect(numResult.serialized).toBe('42');

      const strResult = await serializeAsync('hello');
      expect(strResult.serialized).toBe('"hello"');

      const boolResult = await serializeAsync(true);
      expect(boolResult.serialized).toBe('true');
    });

    it('should serialize small objects synchronously (< 1KB)', async () => {
      const smallObj = { id: 1, name: 'test', active: true };
      const result = await serializeAsync(smallObj);

      expect(result.truncated).toBe(false);
      expect(JSON.parse(result.serialized)).toEqual(smallObj);
    });

    it('should serialize small arrays synchronously', async () => {
      const smallArray = [1, 2, 3, 4, 5];
      const result = await serializeAsync(smallArray);

      expect(result.truncated).toBe(false);
      expect(JSON.parse(result.serialized)).toEqual(smallArray);
    });
  });

  describe('serializeAsync - Large Objects (Worker Thread Path)', () => {
    it('should serialize large objects using worker threads', async () => {
      // Create object > 1KB to trigger worker thread
      const largeObj = {
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'This is a test item with a longer description to increase size',
          metadata: { tags: ['tag1', 'tag2', 'tag3'], priority: i % 3 }
        }))
      };

      const result = await serializeAsync(largeObj);

      expect(result.truncated).toBe(false);
      expect(JSON.parse(result.serialized)).toEqual(largeObj);
    });

    it('should truncate very large objects when enabled', async () => {
      // Create object > 50KB (default maxSize)
      const veryLargeObj = {
        data: Array.from({ length: 5000 }, (_, i) => ({
          id: i,
          text: 'Lorem ipsum dolor sit amet '.repeat(10)
        }))
      };

      const result = await serializeAsync(veryLargeObj, {
        maxSize: 50000,
        truncate: true
      });

      expect(result.truncated).toBe(true);
      expect(result.originalSize).toBeGreaterThan(50000);

      const parsed = JSON.parse(result.serialized);
      expect(parsed._truncated).toBe(true);
      expect(parsed._originalSize).toBeGreaterThan(50000);
      expect(parsed.preview).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });

    it('should handle circular references gracefully in worker', async () => {
      const circular: Record<string, unknown> = { id: 1, name: 'test' };
      circular.self = circular; // Create circular reference

      const result = await serializeAsync(circular);

      expect(result.truncated).toBe(true);
      const parsed = JSON.parse(result.serialized);
      expect(parsed._serializationError).toBe(true);
      expect(parsed.error).toContain('circular');
    });

    it('should support pretty printing in worker', async () => {
      const obj = {
        nested: {
          data: Array.from({ length: 50 }, (_, i) => ({ id: i, value: i * 2 }))
        }
      };

      const result = await serializeAsync(obj, { pretty: true });

      expect(result.serialized).toContain('\n');
      expect(result.serialized).toContain('  '); // Indentation
    });
  });

  describe('serializeAsync - Custom Options', () => {
    it('should respect custom maxSize', async () => {
      const obj = {
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          text: 'Some text here'
        }))
      };

      const result = await serializeAsync(obj, {
        maxSize: 1000,
        truncate: true
      });

      expect(result.truncated).toBe(true);
      expect(result.serialized.length).toBeLessThanOrEqual(1000);
    });

    it('should not truncate when truncate=false', async () => {
      const largeObj = {
        data: Array.from({ length: 1000 }, (_, i) => ({ id: i }))
      };

      const result = await serializeAsync(largeObj, {
        maxSize: 1000,
        truncate: false
      });

      expect(result.truncated).toBe(false);
      expect(result.serialized.length).toBeGreaterThan(1000);
    });
  });

  describe('serializeSafely - Synchronous Fallback', () => {
    it('should serialize small objects synchronously', () => {
      const obj = { id: 1, name: 'test' };
      const result = serializeSafely(obj);

      expect(JSON.parse(result)).toEqual(obj);
    });

    it('should truncate large objects', () => {
      const largeObj = {
        data: Array.from({ length: 1000 }, (_, i) => ({ id: i, text: 'test'.repeat(20) }))
      };

      const result = serializeSafely(largeObj, 1000);

      const parsed = JSON.parse(result);
      expect(parsed._truncated).toBe(true);
      expect(parsed._size).toBeGreaterThan(1000);
    });

    it('should handle circular references', () => {
      const circular: Record<string, unknown> = { id: 1 };
      circular.self = circular;

      const result = serializeSafely(circular);

      const parsed = JSON.parse(result);
      expect(parsed._serializationError).toBe(true);
    });
  });

  describe('serializeBatch - Batch Processing', () => {
    it('should serialize multiple objects in batches', async () => {
      const objects = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        data: Array.from({ length: 10 }, (_, j) => ({ value: j }))
      }));

      const results = await serializeBatch(objects);

      expect(results).toHaveLength(20);
      results.forEach((result, i) => {
        expect(result.truncated).toBe(false);
        expect(JSON.parse(result.serialized)).toEqual(objects[i]);
      });
    });

    it('should handle mixed sizes in batch', async () => {
      const objects = [
        { small: true },
        { large: Array.from({ length: 100 }, (_, i) => ({ id: i, text: 'data'.repeat(10) })) },
        { medium: Array.from({ length: 10 }, (_, i) => ({ id: i })) }
      ];

      const results = await serializeBatch(objects);

      expect(results).toHaveLength(3);
      expect(results[0].truncated).toBe(false); // small
      expect(results[1].truncated).toBe(false); // large but under maxSize
      expect(results[2].truncated).toBe(false); // medium
    });
  });

  describe('Worker Pool Lifecycle', () => {
    it('should initialize worker pool lazily on first use', async () => {
      // Create large object to trigger worker thread
      const largeObj = {
        data: Array.from({ length: 100 }, (_, i) => ({ id: i, text: 'test'.repeat(5) }))
      };

      const start = Date.now();
      const result = await serializeAsync(largeObj);
      const duration = Date.now() - start;

      expect(result.truncated).toBe(false);
      // Worker pool initialization + serialization should complete reasonably fast
      expect(duration).toBeLessThan(1000);
    });

    it('should reuse worker pool for subsequent calls', async () => {
      const obj = {
        data: Array.from({ length: 50 }, (_, i) => ({ id: i }))
      };

      // First call (pool already initialized from previous test)
      const start1 = Date.now();
      await serializeAsync(obj);
      const duration1 = Date.now() - start1;

      // Second call (reusing pool)
      const start2 = Date.now();
      await serializeAsync(obj);
      const duration2 = Date.now() - start2;

      // Second call should be faster (no pool initialization)
      expect(duration2).toBeLessThanOrEqual(duration1 + 50); // Allow 50ms margin
    });

    it('should cleanup worker pool on shutdown', async () => {
      await shutdownSerializationPool();

      // After shutdown, next call should reinitialize pool
      const obj = { data: Array.from({ length: 50 }, (_, i) => ({ id: i })) };
      const result = await serializeAsync(obj);

      expect(result.truncated).toBe(false);
    });
  });

  describe('Performance - Event Loop Non-Blocking', () => {
    it('should not block event loop for large serialization', async () => {
      // Create very large object
      const veryLargeObj = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          text: 'Lorem ipsum dolor sit amet '.repeat(20),
          metadata: { tags: Array.from({ length: 10 }, (_, j) => `tag${j}`) }
        }))
      };

      const start = Date.now();
      let eventLoopBlocked = false;

      // Set timeout to check if event loop is responsive
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          const elapsed = Date.now() - start;
          // If timeout fires late, event loop was blocked
          if (elapsed > 150) {
            eventLoopBlocked = true;
          }
          resolve();
        }, 100);
      });

      // Serialize large object
      const serializePromise = serializeAsync(veryLargeObj);

      // Wait for both
      await Promise.all([serializePromise, timeoutPromise]);

      // Event loop should remain responsive (timeout should fire on time)
      expect(eventLoopBlocked).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle worker errors gracefully', async () => {
      // Test with object that might cause issues
      const problematicObj = {
        data: Array.from({ length: 100 }, (_, i) => ({ id: i })),
        toString: () => { throw new Error('toString error'); }
      };

      const result = await serializeAsync(problematicObj);

      // Should still return a result (possibly truncated or with error flag)
      expect(result.serialized).toBeDefined();
      expect(typeof result.serialized).toBe('string');
    });
  });
});
