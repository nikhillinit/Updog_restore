import bcrypt from 'bcryptjs';
import type { InsertUser } from '@shared/schema';

/**
 * TEST-ONLY login credentials for the internal ~5-person team. These are NOT
 * production identities. Single source of truth consumed by both MemStorage
 * (server/storage.ts, dev/tests) and scripts/seed-db.ts (Postgres).
 */
export const TEST_LOGIN_CREDENTIALS: ReadonlyArray<{ username: string; password: string }> = [
  { username: 'admin', password: 'admin-dev-2026' },
  { username: 'partner', password: 'partner-dev-2026' },
  { username: 'analyst', password: 'analyst-dev-2026' },
  { username: 'operator', password: 'operator-dev-2026' },
  { username: 'viewer', password: 'viewer-dev-2026' },
];

export const DEV_SEED_PASSWORDS: ReadonlySet<string> = new Set(
  TEST_LOGIN_CREDENTIALS.map(({ password }) => password)
);

// Low cost factor: throwaway test creds, not real secrets. Hashing runs once at
// MemStorage construction / seed time.
const SEED_BCRYPT_COST = 8;

export function buildSeedUsers(): InsertUser[] {
  return TEST_LOGIN_CREDENTIALS.map(({ username, password }) => ({
    username,
    password: bcrypt.hashSync(password, SEED_BCRYPT_COST),
  }));
}
