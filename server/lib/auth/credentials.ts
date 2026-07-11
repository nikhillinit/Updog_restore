import bcrypt from 'bcryptjs';
import type { User } from '@shared/schema';
import { storage } from '../../storage';

/**
 * Verify a username/password pair against the user store.
 *
 * Returns the matching user iff the username exists AND the password matches the
 * stored bcrypt hash; otherwise null. The uniform null result (unknown user vs.
 * bad password) is what lets the login route return an identical 401 for both,
 * avoiding user enumeration.
 *
 * Lives in the auth lib (not the route) so the route stays free of direct
 * persistence access — see .baselines/route-persistence-imports.json.
 */
export async function verifyCredentials(username: string, password: string): Promise<User | null> {
  const user = await storage.getUserByUsername(username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return null;
  }
  return user;
}
