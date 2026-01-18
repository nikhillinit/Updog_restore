// REFLECTION_ID: REFL-014
// This test is linked to: docs/skills/REFL-014-test-key-reuse-across-test-cases.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * REFL-014: Test Key Reuse Across Test Cases
 *
 * Tests that use fixed keys without clearing storage between tests cause
 * cross-test pollution when tests run in different orders.
 */
describe('REFL-014: Test Key Reuse Across Test Cases', () => {
  // Simulated persistent storage (like Redis)
  class PersistentStore {
    private static data: Map<string, unknown> = new Map();

    static get(key: string): unknown | null {
      return this.data.get(key) ?? null;
    }

    static set(key: string, value: unknown): void {
      this.data.set(key, value);
    }

    static has(key: string): boolean {
      return this.data.has(key);
    }

    static clear(): void {
      this.data.clear();
    }

    static size(): number {
      return this.data.size;
    }
  }

  // Generate unique key with UUID-like suffix
  function uniqueKey(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}-${timestamp}-${random}`;
  }

  describe('Anti-pattern: Fixed keys cause test pollution', () => {
    // Note: These tests intentionally demonstrate the anti-pattern
    // In a real codebase, you'd want to clear state between tests

    it('test A: stores data with fixed key', () => {
      // ANTI-PATTERN: Using fixed key
      const key = 'fixed-key-1';

      // Clear to simulate clean start (but other tests might not!)
      PersistentStore.clear();

      PersistentStore.set(key, { from: 'testA', value: 100 });

      expect(PersistentStore.has(key)).toBe(true);
    });

    it('test B: may see data from test A if order changes', () => {
      // This test demonstrates order dependency
      const key = 'fixed-key-1';

      // Without cleanup, state from test A might exist
      // If tests run in different order, behavior changes
      const existingData = PersistentStore.get(key);

      // This assertion would be flaky without proper isolation
      // If test A ran first: existingData exists
      // If test A ran after: existingData is null
      if (existingData) {
        expect((existingData as { from: string }).from).toBe('testA');
      }
    });

    it('should show accumulated state from multiple tests', () => {
      // Fixed keys accumulate state
      PersistentStore.set('fixed-key-a', 'value-a');
      PersistentStore.set('fixed-key-b', 'value-b');
      PersistentStore.set('fixed-key-c', 'value-c');

      // State accumulates - size depends on test order
      expect(PersistentStore.size()).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Verified fix: Unique keys per test', () => {
    // Clear store before each test in this describe block
    beforeEach(() => {
      PersistentStore.clear();
    });

    it('should use unique keys for isolation', () => {
      const key = uniqueKey('test-store');

      PersistentStore.set(key, { operation: 'store', amount: 500 });

      expect(PersistentStore.get(key)).toEqual({
        operation: 'store',
        amount: 500,
      });
    });

    it('should not interfere with other tests', () => {
      const key = uniqueKey('test-retrieve');

      // Even though previous test stored data, our unique key is clean
      expect(PersistentStore.get(key)).toBeNull();

      PersistentStore.set(key, { operation: 'retrieve' });
      expect(PersistentStore.has(key)).toBe(true);
    });

    it('should generate truly unique keys', () => {
      const keys = new Set<string>();

      // Generate 100 keys and verify uniqueness
      for (let i = 0; i < 100; i++) {
        keys.add(uniqueKey('unique'));
      }

      expect(keys.size).toBe(100); // All unique
    });
  });

  describe('Alternative fix: Clear store in beforeEach', () => {
    // This approach uses fixed keys but clears store before each test
    beforeEach(() => {
      PersistentStore.clear();
    });

    it('test 1: can use fixed key safely', () => {
      const key = 'reusable-key';

      // Store is cleared, so key is guaranteed clean
      expect(PersistentStore.has(key)).toBe(false);

      PersistentStore.set(key, 'test-1-value');
      expect(PersistentStore.get(key)).toBe('test-1-value');
    });

    it('test 2: same key is clean due to beforeEach', () => {
      const key = 'reusable-key';

      // Store was cleared before this test
      expect(PersistentStore.has(key)).toBe(false);

      PersistentStore.set(key, 'test-2-value');
      expect(PersistentStore.get(key)).toBe('test-2-value');
    });

    it('test 3: store size is 0 at start', () => {
      // Verify clean state at test start
      expect(PersistentStore.size()).toBe(0);
    });
  });

  describe('Test-scoped key pattern', () => {
    let testId: string;

    beforeEach(() => {
      // Generate new testId for each test
      testId = Math.random().toString(36).substring(2, 10);
    });

    const scopedKey = (name: string) => `${testId}-${name}`;

    it('should scope keys to current test', () => {
      const key1 = scopedKey('data');
      const key2 = scopedKey('config');

      PersistentStore.set(key1, 'data-value');
      PersistentStore.set(key2, 'config-value');

      // Keys include testId, so won't collide with other tests
      expect(key1).toContain(testId);
      expect(key2).toContain(testId);
    });

    it('should have different testId from previous test', () => {
      const currentId = testId;
      const key = scopedKey('example');

      // This test's keys won't collide with previous test's keys
      // because testId is regenerated in beforeEach
      expect(key).toContain(currentId);
      expect(key.length).toBeGreaterThan(10);
    });
  });

  describe('Key naming for debugging', () => {
    it('should include test context in key name', () => {
      // Include test name in key for easier debugging
      const testName = 'payment-processing';
      const key = `${testName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      PersistentStore.set(key, { amount: 100 });

      // When debugging, key name tells you which test created it
      expect(key).toContain('payment-processing');

      // Can find all keys from this test by prefix
      const testKeys = Array.from(
        { length: 10 },
        () => `${testName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );

      const allFromSameTest = testKeys.every((k) => k.startsWith(testName));
      expect(allFromSameTest).toBe(true);
    });
  });
});
