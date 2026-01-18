// REFLECTION_ID: REFL-007
// This test is linked to: docs/skills/REFL-007-global-vi-mock-pollutes-all-tests.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect, beforeEach } from 'vitest';

// TODO: Import actual engine/module being tested
// import { YourModule } from '@/path/to/module';

describe('REFL-007: Global vi.mock Pollutes All Tests', () => {
  beforeEach(() => {
    // Setup test context
  });

  it('should demonstrate the anti-pattern (this test would FAIL with buggy code)', () => {
    // TODO: Write test that exposes the bug
    // This proves the anti-pattern exists
    expect.fail('Implement anti-pattern demonstration');
  });

  it('should verify the fix works correctly', () => {
    // TODO: Write test that PASSES with the fix applied
    // This proves the fix is correct
    expect.fail('Implement fix verification');
  });
});
