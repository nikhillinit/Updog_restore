// REFLECTION_ID: REFL-005
// This test is linked to: docs/skills/REFL-005-stale-test-files-with-api-mismatch.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-005: Stale Test Files with API Mismatch
 *
 * Test files that import outdated API signatures continue to compile
 * but test the wrong behavior or fail at runtime with confusing errors.
 */
describe('REFL-005: Stale Test Files with API Mismatch', () => {
  // Simulated API versions
  // APIv1 shown for documentation - demonstrates the old signature
  interface _APIv1 {
    fetchUser(id: number): Promise<{ name: string }>;
  }

  interface APIv2 {
    fetchUser(
      id: string,
      options?: { includeProfile: boolean }
    ): Promise<{ name: string; profile?: object }>;
  }

  // Simulated implementations
  const apiv2: APIv2 = {
    fetchUser: async (id: string, options?) => ({
      name: `User ${id}`,
      profile: options?.includeProfile ? { bio: 'test' } : undefined,
    }),
  };

  describe('Anti-pattern: Tests using outdated API signatures', () => {
    it('should demonstrate type mismatch between test and implementation', () => {
      // Old test was written for APIv1 (number id)
      const oldTestId: number = 123;

      // New API expects string id
      const newApiExpectsString = (id: string) => id.startsWith('user-');

      // The mismatch: test passes number, API expects string
      expect(typeof oldTestId).toBe('number');
      expect(newApiExpectsString(String(oldTestId))).toBe(false); // Has to coerce
    });

    it('should demonstrate missing test coverage for new parameters', () => {
      // Old test only tested basic call
      const oldTestCoverage = ['fetchUser(id)'];

      // New API has optional parameter that changes behavior
      const newApiSignature = ['fetchUser(id)', 'fetchUser(id, options)'];

      // Tests don't cover the new options parameter
      expect(oldTestCoverage).not.toContain('fetchUser(id, options)');
      expect(newApiSignature.length).toBeGreaterThan(oldTestCoverage.length);
    });

    it('should demonstrate tests passing despite API change', async () => {
      // This simulates a test that still passes but doesn't test new behavior
      const result = await apiv2.fetchUser('123');

      // Old assertion still passes
      expect(result.name).toBeDefined();

      // But new behavior (profile) is never tested
      expect(result.profile).toBeUndefined(); // Only because includeProfile wasn't passed
    });
  });

  describe('Verified fix: Keep tests synchronized with API', () => {
    it('should test all API variants including new parameters', async () => {
      // Test basic call
      const basicResult = await apiv2.fetchUser('user-123');
      expect(basicResult.name).toBe('User user-123');
      expect(basicResult.profile).toBeUndefined();

      // Test with new options parameter
      const resultWithProfile = await apiv2.fetchUser('user-123', {
        includeProfile: true,
      });
      expect(resultWithProfile.name).toBe('User user-123');
      expect(resultWithProfile.profile).toBeDefined();
    });

    it('should use correct types matching current API', async () => {
      // Use string id as APIv2 expects
      const userId: string = 'user-456';

      const result = await apiv2.fetchUser(userId);

      expect(typeof userId).toBe('string');
      expect(result.name).toContain(userId);
    });

    it('should verify test file imports match implementation exports', () => {
      // Simulated check: test imports should match module exports
      const moduleExports = ['fetchUser', 'fetchUsers', 'updateUser'];
      const testImports = ['fetchUser', 'fetchUsers', 'updateUser'];

      // All exports should be imported in tests
      for (const exported of moduleExports) {
        expect(testImports).toContain(exported);
      }
    });

    it('should detect API changes that need test updates', () => {
      // Simulated API diff detection
      const v1Signature = { fetchUser: '(id: number) => Promise<User>' };
      const v2Signature = {
        fetchUser: '(id: string, options?: Options) => Promise<User>',
      };

      // Signatures differ - tests need update
      expect(v1Signature.fetchUser).not.toBe(v2Signature.fetchUser);

      // Check for parameter type changes
      expect(v1Signature.fetchUser).toContain('number');
      expect(v2Signature.fetchUser).toContain('string');
    });
  });
});
