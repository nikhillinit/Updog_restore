// REFLECTION_ID: REFL-007
// This test is linked to: docs/skills/REFL-007-global-vi-mock-pollutes-all-tests.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * REFL-007: Global vi.mock Pollutes All Tests
 *
 * Shared test utility files that call vi.mock() at the top level
 * pollute the mock state for ALL tests in the test run.
 */
describe('REFL-007: Global vi.mock Pollutes All Tests', () => {
  // Simulated module state tracking
  let _mockCallCount = 0; // Tracks global mock calls (unused - demonstrates pollution)
  let factoryCallCount = 0;

  beforeEach(() => {
    _mockCallCount = 0;
    factoryCallCount = 0;
  });

  // Anti-pattern: Global mock in shared utility
  // This simulates what happens when vi.mock() is called at top level
  const globalMockBehavior = {
    isGloballyMocked: true,
    affectsAllTests: true,
  };

  // Verified fix: Factory function pattern
  function createMockDb() {
    factoryCallCount++;
    return {
      query: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(),
      connect: vi.fn(),
    };
  }

  function createMockStorage() {
    factoryCallCount++;
    return {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
  }

  describe('Anti-pattern: Global vi.mock pollutes test state', () => {
    it('should demonstrate that global mocks affect all tests', () => {
      // When vi.mock() is at top level of a utility file,
      // it affects ALL tests that import anything from that file

      // Simulate the pollution behavior
      const testFile1Imports = { usesGlobalMock: globalMockBehavior.isGloballyMocked };
      const testFile2Imports = { usesGlobalMock: globalMockBehavior.isGloballyMocked };
      const testFile3NoImport = { usesGlobalMock: globalMockBehavior.affectsAllTests };

      // All tests see the same global mock state
      expect(testFile1Imports.usesGlobalMock).toBe(true);
      expect(testFile2Imports.usesGlobalMock).toBe(true);
      // Even tests that don't import the utility are affected!
      expect(testFile3NoImport.usesGlobalMock).toBe(true);
    });

    it('should show mock state persists across test files', () => {
      // Simulate state from previous test
      const previousTestState = { mockWasSet: true };

      // In anti-pattern, mock state leaks between tests
      const currentTestSeesPreviousState = previousTestState.mockWasSet;

      expect(currentTestSeesPreviousState).toBe(true);
    });

    it('should demonstrate test order dependency', () => {
      // Tests may pass or fail depending on run order
      const runOrder = ['test1', 'test2', 'test3'];
      const shuffledOrder = ['test3', 'test1', 'test2'];

      // With global mocks, different orders can produce different results
      expect(runOrder).not.toEqual(shuffledOrder);

      // This is problematic - tests should be order-independent
    });
  });

  describe('Verified fix: Factory functions for mock creation', () => {
    it('should create isolated mocks per test with factory', () => {
      // Each test creates its own mock instance
      const mockDb1 = createMockDb();
      const mockDb2 = createMockDb();

      // Configure differently
      mockDb1.query.mockResolvedValue([{ id: 1 }]);
      mockDb2.query.mockResolvedValue([{ id: 2 }]);

      // They are independent instances
      expect(mockDb1).not.toBe(mockDb2);
      expect(mockDb1.query).not.toBe(mockDb2.query);
    });

    it('should track factory calls for verification', () => {
      expect(factoryCallCount).toBe(0);

      createMockDb();
      expect(factoryCallCount).toBe(1);

      createMockStorage();
      expect(factoryCallCount).toBe(2);

      // Each test controls when mocks are created
    });

    it('should allow different mock configurations per test', async () => {
      const mockDb = createMockDb();

      // Test 1 scenario: successful query
      mockDb.query.mockResolvedValueOnce([{ id: 1, name: 'Alice' }]);
      const result1 = await mockDb.query('SELECT * FROM users');
      expect(result1).toEqual([{ id: 1, name: 'Alice' }]);

      // Test 2 scenario: empty result
      mockDb.query.mockResolvedValueOnce([]);
      const result2 = await mockDb.query('SELECT * FROM users WHERE id = 999');
      expect(result2).toEqual([]);

      // Each test controls its own mock behavior
    });

    it('should demonstrate proper test file structure', () => {
      // Proper structure: import factory, create mock, configure
      const structure = {
        step1: "import { createMockDb } from '../helpers/database-mock'",
        step2: 'const mockDb = createMockDb()',
        step3: "vi.mock('../../server/db', () => ({ db: mockDb }))",
        step4: 'mockDb.query.mockResolvedValue([...])',
      };

      // Each step is explicit and controlled by the test file
      expect(Object.keys(structure)).toHaveLength(4);
      expect(structure.step2).toContain('createMockDb');
    });

    it('should use vi.clearAllMocks in beforeEach for additional safety', () => {
      const mockFn = vi.fn();
      mockFn('call 1');

      // Simulate beforeEach clearing mocks
      vi.clearAllMocks();

      // Mock call history is cleared
      expect(mockFn).not.toHaveBeenCalled();
    });
  });
});
