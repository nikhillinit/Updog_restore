// REFLECTION_ID: REFL-026
// This test is linked to: docs/skills/REFL-026-drizzle-mock-chain-overwrite.md
// Do not rename without updating the reflection's test_file field.

import { describe, expect, it, vi } from 'vitest';

function createCorrectDbMock() {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({ insertId: 1 }),
    }),
  };
}

function createBrokenDbMock() {
  const db = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  };

  db.insert.mockResolvedValue({ insertId: 1 });
  return db;
}

function createExtendedChainMock() {
  const onConflictDoNothing = vi.fn().mockResolvedValue({ rowsAffected: 0 });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });

  return {
    insert: vi.fn().mockReturnValue({ values }),
    values,
    onConflictDoNothing,
  };
}

describe('REFL-026: Drizzle ORM Mock Chain Overwrite', () => {
  it('shows the anti-pattern turning a synchronous builder into a Promise', () => {
    const db = createBrokenDbMock();

    expect(db.insert('table')).toBeInstanceOf(Promise);
    expect(() => (db as any).insert('table').values({ id: 1 })).toThrow(/values/i);
  });

  it('preserves the Drizzle builder chain when mockReturnValue is left intact', async () => {
    const db = createCorrectDbMock();

    const builder = db.insert('table');
    expect(typeof builder.values).toBe('function');
    await expect(builder.values({ id: 1 })).resolves.toEqual({ insertId: 1 });
  });

  it('supports extending the builder chain instead of overwriting it', async () => {
    const db = createExtendedChainMock();

    const builder = db.insert('table');
    const conflictHandler = builder.values({ id: 1 });

    await expect(conflictHandler.onConflictDoNothing()).resolves.toEqual({ rowsAffected: 0 });
    expect(db.values).toHaveBeenCalledWith({ id: 1 });
    expect(db.onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it('detects the dangerous overwrite pattern in test source', () => {
    const snippet = 'db.insert.mockResolvedValue({ insertId: 1 });';
    expect(/db\.insert\.mock(?:Resolved|Rejected)Value/.test(snippet)).toBe(true);
  });
});
