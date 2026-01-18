// REFLECTION_ID: REFL-012
// This test is linked to: docs/skills/REFL-012-fire-and-forget-async-creates-race-conditions.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * REFL-012: Fire-and-Forget Async Creates Race Conditions
 *
 * Idempotency middleware that uses fire-and-forget storeResponse() calls
 * allows subsequent requests to arrive before storage completes, causing
 * duplicate processing.
 */
describe('REFL-012: Fire-and-Forget Async Creates Race Conditions', () => {
  // Simulated storage with configurable delay
  class SimulatedStore {
    private data: Map<string, unknown> = new Map();
    private storageDelay: number;

    constructor(storageDelayMs = 0) {
      this.storageDelay = storageDelayMs;
    }

    async get(key: string): Promise<unknown | null> {
      return this.data.get(key) ?? null;
    }

    async set(key: string, value: unknown): Promise<void> {
      // Simulate slow storage (network latency, Redis, etc.)
      if (this.storageDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.storageDelay));
      }
      this.data.set(key, value);
    }

    clear(): void {
      this.data.clear();
    }
  }

  // Track how many times a request was processed
  let processCount: number;

  beforeEach(() => {
    processCount = 0;
  });

  // Simulated request processing
  async function processRequest(id: string): Promise<{ id: string; result: number }> {
    processCount++;
    return { id, result: processCount };
  }

  // Anti-pattern: Fire-and-forget storage
  async function handleRequestFireAndForget(
    store: SimulatedStore,
    idempotencyKey: string
  ): Promise<{ id: string; result: number }> {
    // Check for cached response
    const cached = await store.get(idempotencyKey);
    if (cached) {
      return cached as { id: string; result: number };
    }

    // Process request
    const result = await processRequest(idempotencyKey);

    // ANTI-PATTERN: Fire-and-forget - no await!
    store.set(idempotencyKey, result); // This returns immediately

    return result;
  }

  // Verified fix: Await storage before responding
  async function handleRequestWithAwait(
    store: SimulatedStore,
    idempotencyKey: string
  ): Promise<{ id: string; result: number }> {
    // Check for cached response
    const cached = await store.get(idempotencyKey);
    if (cached) {
      return cached as { id: string; result: number };
    }

    // Process request
    const result = await processRequest(idempotencyKey);

    // CRITICAL: Await storage before responding
    await store.set(idempotencyKey, result);

    return result;
  }

  describe('Anti-pattern: Fire-and-forget causes race conditions', () => {
    it('should process duplicate requests when storage is slow', async () => {
      // Store with 50ms delay simulating network latency
      const slowStore = new SimulatedStore(50);
      const key = 'payment-123';

      // Fire two requests "simultaneously"
      const [result1, result2] = await Promise.all([
        handleRequestFireAndForget(slowStore, key),
        handleRequestFireAndForget(slowStore, key),
      ]);

      // PROBLEM: Both requests were processed because storage was slow
      // First request: check cache (empty), process, start storing (no await)
      // Second request: check cache (still empty!), process again
      expect(processCount).toBe(2); // Duplicate processing!

      // Results are different because both were processed
      expect(result1.result).toBe(1);
      expect(result2.result).toBe(2);
    });

    it('should demonstrate timing-dependent behavior', async () => {
      const fastStore = new SimulatedStore(0); // No delay
      const key = 'order-456';

      // With fast storage, might work by accident
      const result1 = await handleRequestFireAndForget(fastStore, key);

      // Small delay to let fire-and-forget complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result2 = await handleRequestFireAndForget(fastStore, key);

      // May work with fast storage, but it's not guaranteed!
      // This is the danger - tests pass locally, fail in production
      expect(result1.result).toBe(1);
      // result2 might be 1 (cached) or 2 (processed again) - flaky!
    });
  });

  describe('Verified fix: Await storage operations', () => {
    it('should prevent duplicate processing with awaited storage', async () => {
      const store = new SimulatedStore(10);
      const key = 'payment-789';

      // Reset counter
      processCount = 0;

      // Sequential requests (not concurrent) demonstrate the fix
      // First request processes and stores
      const result1 = await handleRequestWithAwait(store, key);
      expect(processCount).toBe(1);

      // Second request finds cached result
      const result2 = await handleRequestWithAwait(store, key);
      expect(processCount).toBe(1); // Still 1 - no additional processing

      // Both return the same result
      expect(result1).toEqual(result2);
    });

    it('should guarantee storage completes before response', async () => {
      const store = new SimulatedStore(10);
      const key = 'transaction-abc';

      processCount = 0;

      // Handle first request
      await handleRequestWithAwait(store, key);

      // Storage is guaranteed to be complete
      const cached = await store.get(key);
      expect(cached).not.toBeNull();
      expect((cached as { id: string }).id).toBe(key);
    });

    it('should return cached response for duplicate keys', async () => {
      const store = new SimulatedStore(5);
      const key = 'idempotency-key-123';

      processCount = 0;

      // First request
      const result1 = await handleRequestWithAwait(store, key);
      expect(processCount).toBe(1);

      // Second request - should return cached
      const result2 = await handleRequestWithAwait(store, key);
      expect(processCount).toBe(1); // No additional processing

      expect(result1).toEqual(result2);
    });
  });

  describe('Mutex pattern for concurrent requests', () => {
    // Simple mutex implementation
    class SimpleMutex {
      private locked = false;
      private queue: (() => void)[] = [];

      async acquire(): Promise<() => void> {
        return new Promise((resolve) => {
          const tryAcquire = () => {
            if (!this.locked) {
              this.locked = true;
              resolve(() => {
                this.locked = false;
                const next = this.queue.shift();
                if (next) next();
              });
            } else {
              this.queue.push(tryAcquire);
            }
          };
          tryAcquire();
        });
      }
    }

    it('should serialize concurrent requests with mutex', async () => {
      const store = new SimulatedStore(20);
      const mutexes = new Map<string, SimpleMutex>();
      processCount = 0;

      async function handleWithMutex(key: string) {
        if (!mutexes.has(key)) {
          mutexes.set(key, new SimpleMutex());
        }
        const mutex = mutexes.get(key)!;
        const release = await mutex.acquire();

        try {
          const cached = await store.get(key);
          if (cached) return cached;

          const result = await processRequest(key);
          await store.set(key, result);
          return result;
        } finally {
          release();
        }
      }

      // Concurrent requests to same key
      const [r1, r2, r3] = await Promise.all([
        handleWithMutex('critical-operation'),
        handleWithMutex('critical-operation'),
        handleWithMutex('critical-operation'),
      ]);

      // Only processed once due to mutex
      expect(processCount).toBe(1);
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });
  });
});
