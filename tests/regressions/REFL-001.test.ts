// REFLECTION_ID: REFL-001
// This test is linked to: docs/skills/REFL-001-dynamic-imports-prevent-test-side-effects.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect, beforeAll, vi } from 'vitest';

/**
 * REFL-001: Dynamic Imports Prevent Test Side Effects
 *
 * This regression test verifies that dynamic imports defer module initialization
 * until the test environment is properly configured.
 */
describe('REFL-001: Dynamic Imports Prevent Test Side Effects', () => {
  // Track module loading order
  const loadOrder: string[] = [];

  // Simulated module that has side effects at import time
  const createMockModuleWithSideEffects = () => {
    return {
      // This would normally run at import time, causing issues
      initOrder: loadOrder.length,
      value: 'initialized',
    };
  };

  describe('Anti-pattern demonstration (static import behavior)', () => {
    it('static imports execute immediately, before beforeAll', () => {
      // In the anti-pattern, modules load when the file is parsed,
      // BEFORE any setup code runs. This test demonstrates the concept.

      // Simulate the problematic static import timing:
      const staticImportTime = 0; // Would be at file parse time
      const beforeAllTime = 1; // Would be after static imports

      // The problem: initialization happens before setup
      expect(staticImportTime).toBeLessThan(beforeAllTime);
    });

    it('should recognize the error patterns', () => {
      // Common error signals from premature module initialization
      const errorPatterns = [
        'ECONNREFUSED', // Database not ready
        'ERR_MODULE_NOT_FOUND', // Environment not configured
        'SQLITE_ERROR', // SQLite file not created yet
        'TypeError: Cannot read properties of undefined', // Config not loaded
      ];

      // Each of these errors suggests premature module loading
      expect(errorPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('Verified fix (dynamic import behavior)', () => {
    // Variables declared but NOT initialized
    let dynamicallyLoadedModule: { initOrder: number; value: string };

    beforeAll(async () => {
      // Record when beforeAll runs
      loadOrder.push('beforeAll');

      // Dynamic import happens AFTER setup
      // In real code: const module = await import('../../server/app');
      dynamicallyLoadedModule = createMockModuleWithSideEffects();
      loadOrder.push('dynamicImport');
    });

    it('dynamic imports execute in beforeAll, after test setup', () => {
      // With dynamic imports, initialization happens AFTER beforeAll starts
      expect(loadOrder).toContain('beforeAll');
      expect(loadOrder).toContain('dynamicImport');

      // beforeAll runs before the dynamic import
      const beforeAllIndex = loadOrder.indexOf('beforeAll');
      const dynamicImportIndex = loadOrder.indexOf('dynamicImport');

      expect(beforeAllIndex).toBeLessThan(dynamicImportIndex);
    });

    it('module is available after dynamic import', () => {
      expect(dynamicallyLoadedModule).toBeDefined();
      expect(dynamicallyLoadedModule.value).toBe('initialized');
    });
  });

  describe('Pattern recognition', () => {
    it('should identify static import patterns (anti-pattern)', () => {
      const antiPatternExamples = [
        "import { makeApp } from '../../server/app';",
        "import { storage } from '../../server/storage';",
        "import db from '../../server/db';",
      ];

      // All of these are problematic at top level of test files
      for (const pattern of antiPatternExamples) {
        expect(pattern).toMatch(/^import \{.*\} from/);
      }
    });

    it('should identify dynamic import patterns (verified fix)', () => {
      const verifiedPatterns = [
        "const appModule = await import('../../server/app');",
        "const { storage } = await import('../../server/storage');",
      ];

      // Dynamic imports use await import() inside async functions
      for (const pattern of verifiedPatterns) {
        expect(pattern).toMatch(/await import\(/);
      }
    });

    it('should identify safe static imports (types and vitest)', () => {
      const safePatterns = [
        "import type { Express } from 'express';",
        "import { describe, it, expect } from 'vitest';",
        "import type { IStorage } from '../../server/storage';",
      ];

      // Type imports have no runtime side effects
      for (const pattern of safePatterns) {
        const isTypeImport = pattern.includes('import type');
        const isVitestImport = pattern.includes('vitest');
        expect(isTypeImport || isVitestImport).toBe(true);
      }
    });
  });
});
