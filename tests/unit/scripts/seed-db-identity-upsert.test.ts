import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));

  return { insert, onConflictDoUpdate, values };
});

vi.mock('../../../server/db', () => ({ db: dbMock }));

import { users } from '@shared/schema';
import { TEST_LOGIN_CREDENTIALS } from '../../../server/lib/seed-users';
import { seedDatabase, seedLoginUsers } from '../../../scripts/seed-db';

describe('seedLoginUsers', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('upserts each seed password and role on username conflicts', async () => {
    await expect(seedLoginUsers(dbMock as never)).resolves.toBe(TEST_LOGIN_CREDENTIALS.length);

    expect(dbMock.insert).toHaveBeenCalledTimes(TEST_LOGIN_CREDENTIALS.length);
    expect(dbMock.values).toHaveBeenCalledTimes(TEST_LOGIN_CREDENTIALS.length);
    expect(dbMock.onConflictDoUpdate).toHaveBeenCalledTimes(TEST_LOGIN_CREDENTIALS.length);

    TEST_LOGIN_CREDENTIALS.forEach((credential, index) => {
      expect(dbMock.onConflictDoUpdate).toHaveBeenNthCalledWith(index + 1, {
        target: users.username,
        set: {
          password: expect.any(String),
          role: credential.role,
        },
      });
    });
  });

  it('rejects a remote seed target before database dispatch', async () => {
    await expect(
      seedDatabase({ databaseUrl: 'postgres://operator:secret@prod.example/updog' })
    ).rejects.toThrow(/local database target/i);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('rejects remote login-user seeding before resolving database dispatch', async () => {
    process.env.DATABASE_URL = 'postgres://operator:secret@prod.example/updog';

    await expect(seedLoginUsers()).rejects.toThrow(/local database target/i);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
