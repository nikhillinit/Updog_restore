// REFLECTION_ID: REFL-040
// This test is linked to: docs/skills/REFL-040-cross-worktree-attribution-requires-environment-parity.md
// Do not rename without updating the reflection's test_file field.

import { describe, expect, it } from 'vitest';

describe('REFL-040: Cross-Worktree Attribution Requires Environment Parity', () => {
  it('preserves Vitest test mode through server dotenv loading', async () => {
    expect(process.env['NODE_ENV']).toBe('test');
    expect(process.env['_EXPLICIT_NODE_ENV']).toBe('test');

    const { loadEnv } = await import('../../server/config/index.js');

    expect(loadEnv().NODE_ENV).toBe('test');
  });
});
