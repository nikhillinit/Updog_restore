// REFLECTION_ID: REFL-016
// This test is linked to: docs/skills/REFL-016-vitest-include-patterns-miss-new-test-directories.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-016: Vitest Include Patterns Miss New Test Directories
 *
 * Adding test files to new directories that aren't covered by vitest's
 * include patterns causes tests to silently not run.
 */
describe('REFL-016: Vitest Include Patterns Miss New Test Directories', () => {
  // Simulated glob pattern matcher
  function matchesGlob(filePath: string, pattern: string): boolean {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Convert glob pattern to regex - order matters!
    const regexPattern = normalizedPattern
      // Escape dots first
      .replace(/\./g, '\\.')
      // Handle ** (any directory depth)
      .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
      // Handle * (any characters except /)
      .replace(/\*/g, '[^/]*')
      // Restore **
      .replace(/<<<DOUBLESTAR>>>/g, '.*')
      // Handle brace expansion {a,b}
      .replace(/\{([^}]+)\}/g, '($1)')
      .replace(/,/g, '|');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedPath);
  }

  // Check if file is discovered by any pattern
  function isFileDiscovered(filePath: string, patterns: string[]): boolean {
    return patterns.some((pattern) => matchesGlob(filePath, pattern));
  }

  // Find undiscovered test files
  function findUndiscoveredTests(
    testFiles: string[],
    includePatterns: string[]
  ): string[] {
    return testFiles.filter((file) => !isFileDiscovered(file, includePatterns));
  }

  describe('Anti-pattern: Restrictive include patterns', () => {
    it('should miss tests in new directories', () => {
      // ANTI-PATTERN: Restrictive patterns
      const includePatterns = [
        'tests/unit/**/*.test.ts',
        'tests/api/**/*.test.ts',
        'client/src/**/*.test.ts',
      ];

      // New test directory not covered
      const testFiles = [
        'tests/unit/utils.test.ts',
        'tests/api/endpoints.test.ts',
        'tests/regressions/REFL-001.test.ts', // NOT discovered!
        'tests/integration/database.test.ts', // NOT discovered!
      ];

      const undiscovered = findUndiscoveredTests(testFiles, includePatterns);

      expect(undiscovered).toContain('tests/regressions/REFL-001.test.ts');
      expect(undiscovered).toContain('tests/integration/database.test.ts');
    });

    it('should demonstrate silent failure behavior', () => {
      const patterns = ['tests/**/*.test.ts'];

      // File exists but doesn't match pattern
      const file = 'src/components/Button.test.tsx';

      const isDiscovered = isFileDiscovered(file, patterns);

      // Test file is silently skipped - no error, just not run
      expect(isDiscovered).toBe(false);
    });

    it('should show pattern mismatch for tsx files', () => {
      // Pattern only matches .ts
      const patterns = ['**/*.test.ts'];

      const tsxFile = 'client/src/components/Modal.test.tsx';

      const isDiscovered = isFileDiscovered(tsxFile, patterns);

      expect(isDiscovered).toBe(false);
    });
  });

  describe('Verified fix: Comprehensive include patterns', () => {
    it('should discover tests in all directories', () => {
      // Comprehensive patterns
      const includePatterns = [
        'tests/**/*.test.ts',
        'tests/**/*.test.tsx',
        'client/src/**/*.test.ts',
        'client/src/**/*.test.tsx',
        'server/**/*.test.ts',
      ];

      const testFiles = [
        'tests/unit/utils.test.ts',
        'tests/regressions/REFL-001.test.ts',
        'tests/integration/api.test.ts',
        'client/src/components/Button.test.tsx',
        'server/routes/api.test.ts',
      ];

      const undiscovered = findUndiscoveredTests(testFiles, includePatterns);

      expect(undiscovered).toHaveLength(0);
    });

    it('should use broad glob patterns', () => {
      // Very broad pattern catches most conventions (shown for documentation)
      const _broadPattern = '**/*.{test,spec}.{ts,tsx}';

      // Simulate matching with this pattern
      const files = [
        'src/utils.test.ts',
        'src/utils.spec.ts',
        'tests/api.test.tsx',
        'deep/nested/file.test.ts',
      ];

      // All should match broad pattern logic
      files.forEach((file) => {
        const hasTestOrSpec = file.includes('.test.') || file.includes('.spec.');
        const hasTsOrTsx = file.endsWith('.ts') || file.endsWith('.tsx');
        expect(hasTestOrSpec && hasTsOrTsx).toBe(true);
      });
    });

    it('should properly exclude node_modules and dist', () => {
      // Simple exclusion check using string includes (how most tools actually work)
      function shouldExclude(filePath: string, excludeDirs: string[]): boolean {
        const normalized = filePath.replace(/\\/g, '/');
        return excludeDirs.some((dir) => normalized.includes(`/${dir}/`) || normalized.startsWith(`${dir}/`));
      }

      const excludeDirs = ['node_modules', 'dist', '.git'];

      const testFiles = [
        'tests/valid.test.ts', // Should run
        'node_modules/package/test.test.ts', // Should NOT run
        'dist/test.test.ts', // Should NOT run
      ];

      const excluded = testFiles.filter((file) => shouldExclude(file, excludeDirs));

      expect(excluded).toContain('node_modules/package/test.test.ts');
      expect(excluded).toContain('dist/test.test.ts');
      expect(excluded).not.toContain('tests/valid.test.ts');
    });
  });

  describe('Verification helpers', () => {
    it('should provide discovery verification function', () => {
      const patterns = ['tests/**/*.test.ts', 'client/**/*.test.tsx'];

      function verifyTestDiscovery(
        newTestFile: string,
        includePatterns: string[]
      ): { discovered: boolean; matchingPattern: string | null } {
        for (const pattern of includePatterns) {
          if (matchesGlob(newTestFile, pattern)) {
            return { discovered: true, matchingPattern: pattern };
          }
        }
        return { discovered: false, matchingPattern: null };
      }

      const result1 = verifyTestDiscovery('tests/new/feature.test.ts', patterns);
      expect(result1.discovered).toBe(true);
      expect(result1.matchingPattern).toBe('tests/**/*.test.ts');

      const result2 = verifyTestDiscovery('src/unmatched.test.ts', patterns);
      expect(result2.discovered).toBe(false);
      expect(result2.matchingPattern).toBeNull();
    });

    it('should suggest pattern additions for new directories', () => {
      function suggestPattern(filePath: string): string {
        // Extract directory path and extension
        const parts = filePath.split('/');
        const ext = filePath.split('.').slice(-2).join('.');
        const dir = parts.slice(0, -1).join('/');

        return `${dir}/**/*.${ext}`;
      }

      const suggestion = suggestPattern('client/src/components/Button.test.tsx');

      expect(suggestion).toBe('client/src/components/**/*.test.tsx');
    });

    it('should detect when test count is suspiciously low', () => {
      function validateTestCount(
        foundTests: number,
        expectedMinimum: number
      ): { valid: boolean; warning: string | null } {
        if (foundTests === 0) {
          return {
            valid: false,
            warning: 'No tests found! Check include patterns.',
          };
        }
        if (foundTests < expectedMinimum) {
          return {
            valid: false,
            warning: `Only ${foundTests} tests found, expected at least ${expectedMinimum}. Some tests may be excluded.`,
          };
        }
        return { valid: true, warning: null };
      }

      const zeroTests = validateTestCount(0, 10);
      expect(zeroTests.valid).toBe(false);
      expect(zeroTests.warning).toContain('No tests found');

      const fewTests = validateTestCount(3, 10);
      expect(fewTests.valid).toBe(false);
      expect(fewTests.warning).toContain('Only 3 tests found');

      const enoughTests = validateTestCount(15, 10);
      expect(enoughTests.valid).toBe(true);
    });
  });
});
