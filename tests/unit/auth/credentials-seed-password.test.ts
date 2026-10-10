import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nodeEnv: 'production',
  getUserByUsername: vi.fn(),
}));

vi.mock('../../../server/config', () => ({
  getConfig: () => ({ NODE_ENV: mocks.nodeEnv }),
}));

vi.mock('../../../server/storage', () => ({
  storage: { getUserByUsername: mocks.getUserByUsername },
}));

import { verifyCredentials } from '../../../server/lib/auth/credentials';
import { TEST_LOGIN_CREDENTIALS } from '../../../server/lib/seed-users';

const seed = TEST_LOGIN_CREDENTIALS[0]!;

describe('verifyCredentials dev seed password guard', () => {
  beforeEach(async () => {
    mocks.getUserByUsername.mockReset();
    mocks.getUserByUsername.mockResolvedValue({
      id: 3,
      username: seed.username,
      password: await bcrypt.hash(seed.password, 4),
      isActive: true,
    });
  });

  it.each(['production', 'staging'])('refuses a seed password in %s', async (nodeEnv) => {
    mocks.nodeEnv = nodeEnv;
    await expect(verifyCredentials(seed.username, seed.password)).resolves.toBeNull();
    expect(mocks.getUserByUsername).not.toHaveBeenCalled();
  });

  it.each(['development', 'test'])('accepts a seed password in %s', async (nodeEnv) => {
    mocks.nodeEnv = nodeEnv;
    await expect(verifyCredentials(seed.username, seed.password)).resolves.toMatchObject({
      id: 3,
    });
  });

  it('accepts a non-seed password in production', async () => {
    mocks.nodeEnv = 'production';
    const password = 'not-a-seed-password-0123456789';
    mocks.getUserByUsername.mockResolvedValue({
      id: 9,
      username: 'provisioned',
      password: await bcrypt.hash(password, 4),
      isActive: true,
    });
    await expect(verifyCredentials('provisioned', password)).resolves.toMatchObject({ id: 9 });
  });
});
