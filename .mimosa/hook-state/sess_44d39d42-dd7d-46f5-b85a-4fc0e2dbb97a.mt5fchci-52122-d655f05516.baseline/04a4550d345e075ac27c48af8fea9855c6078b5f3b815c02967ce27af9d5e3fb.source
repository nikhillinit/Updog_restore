import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pgMock = vi.hoisted(() => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const end = vi.fn().mockResolvedValue(undefined);
  const Pool = vi.fn(() => ({ end, query }));
  return { end, Pool, query };
});

vi.mock('pg', () => ({ default: { Pool: pgMock.Pool } }));
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: vi.fn(() => ({})) }));

const originalDatabaseUrl = process.env.DATABASE_URL;

describe('production seed dispatch block', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://operator:secret@prod.example/updog';
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    vi.restoreAllMocks();
  });

  it.each([
    ['multi-tenant seed', '../../../scripts/seed-multi-tenant'],
    ['test-data seed', '../../../scripts/seed-test-data'],
  ])('rejects remote %s before pool construction', async (_label, modulePath) => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const module = await import(modulePath);

    await expect(module.seedDatabaseForLocalTarget()).rejects.toThrow(/local database target/i);
    expect(pgMock.Pool).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
