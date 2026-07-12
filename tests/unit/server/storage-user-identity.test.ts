import { describe, expect, it } from 'vitest';
import { MemStorage } from '../../../server/storage';
import { TEST_LOGIN_CREDENTIALS } from '../../../server/lib/seed-users';

describe('MemStorage user identity support', () => {
  it('returns an empty explicit grant list for in-memory users', async () => {
    const storage = new MemStorage();

    await expect(storage.getUserFundGrants(1)).resolves.toEqual([]);
  });

  it('materializes each dev seed user with its declared role', async () => {
    const storage = new MemStorage();

    for (const credential of TEST_LOGIN_CREDENTIALS) {
      const user = await storage.getUserByUsername(credential.username);
      expect(user?.role).toBe(credential.role);
    }
  });
});
