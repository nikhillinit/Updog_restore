import bcrypt from 'bcryptjs';
import type { User } from '@shared/schema';
import { getConfig } from '../../config';
import { storage } from '../../storage';
import { DEV_SEED_PASSWORDS } from '../seed-users';

/**
 * Verify a username/password pair against the user store.
 *
 * Returns the matching user iff the username exists AND the password matches the
 * stored bcrypt hash; otherwise null. The uniform null result (unknown user vs.
 * bad password) is what lets the login route return an identical 401 for both,
 * avoiding user enumeration.
 *
 * Outside development and test, a dev seed password is refused for every
 * account: the seed passwords are public in this repository, and accounts
 * created outside scripts/provision-prod-users.ts never passed its check.
 *
 * Lives in the auth lib (not the route) so the route stays free of direct
 * persistence access — see .baselines/route-persistence-imports.json.
 */
export async function verifyCredentials(username: string, password: string): Promise<User | null> {
  const nodeEnv = getConfig().NODE_ENV;
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && DEV_SEED_PASSWORDS.has(password)) {
    return null;
  }
  const user = await storage.getUserByUsername(username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return null;
  }
  return user;
}

export async function getUserFundGrants(userId: number): Promise<number[]> {
  return storage.getUserFundGrants(userId);
}
