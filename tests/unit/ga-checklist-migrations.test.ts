import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkMigrations } from '../../scripts/ga-checklist.mjs';

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  vi.restoreAllMocks();
});

describe('ga checklist migrations', () => {
  it('treats a missing DATABASE_URL schema-audit skip as non-failing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    delete process.env.DATABASE_URL;

    await expect(checkMigrations()).resolves.toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('schema audit skipped: no direct DATABASE_URL')
    );
  });
});
