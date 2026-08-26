import { describe, expect, it } from 'vitest';
import { MemStorage } from '../../../server/storage';
import { TEST_LOGIN_CREDENTIALS } from '../../../server/lib/seed-users';

describe('MemStorage user identity support', () => {
  it('grants only the seeded partner access to Fund 1', async () => {
    const storage = new MemStorage();
    const partner = await storage.getUserByUsername('partner');
    const admin = await storage.getUserByUsername('admin');

    expect(partner).toBeDefined();
    expect(admin).toBeDefined();
    await expect(storage.getUserFundGrants(partner!.id)).resolves.toEqual([1]);
    await expect(storage.getUserFundGrants(admin!.id)).resolves.toEqual([]);
    await expect(storage.getUserFundGrants(999_999)).resolves.toEqual([]);
  });

  it('materializes each dev seed user with its declared role', async () => {
    const storage = new MemStorage();

    for (const credential of TEST_LOGIN_CREDENTIALS) {
      const user = await storage.getUserByUsername(credential.username);
      expect(user?.role).toBe(credential.role);
    }
  });
});
