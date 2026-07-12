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
import { seedLoginUsers } from '../../../scripts/seed-db';

describe('seedLoginUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts each seed password and role on username conflicts', async () => {
    await expect(seedLoginUsers()).resolves.toBe(TEST_LOGIN_CREDENTIALS.length);

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
});
