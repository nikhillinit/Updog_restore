/**
 * Provision login users into a target Postgres (users table ONLY).
 *
 * Why this exists (do NOT use scripts/seed-db.ts for prod):
 *   seed-db.ts upserts the login users idempotently, but then ALSO inserts a
 *   sample fund + portfolio companies + investments + metrics + activities that
 *   are NON-idempotent (re-running stacks duplicate funds). Running it against
 *   prod would pollute prod with fake portfolio data. This script upserts the
 *   users table and touches nothing else.
 *
 * What it does: idempotent upsert (on username) of the shared seed identities
 *   (server/lib/seed-users.ts). Safe to re-run. No schema change.
 *
 * Credentials (ADR-034): reuses TEST_LOGIN_CREDENTIALS via buildSeedUsers().
 *   The passwords are committed in the repo -- acceptable ONLY because the
 *   audience is an internal team-of-5 in testing with no real/LP data. Rotate to
 *   distinct, uncommitted credentials the moment prod carries real data.
 *
 * Usage (run locally against the target DB, never from CI):
 *   DATABASE_URL="<prod-neon-url>" PROVISION_PROD=1 npx tsx scripts/provision-prod-users.ts
 *
 * NEVER db:push / db:migrate against prod -- this is a data upsert only.
 */

import { sql } from 'drizzle-orm';
import { db, closeDatabasePool } from '../server/db';
import { users } from '@shared/schema';
import { buildSeedUsers } from '../server/lib/seed-users';

async function provisionProdUsers(): Promise<number> {
  if (process.env['PROVISION_PROD'] !== '1') {
    throw new Error(
      'Refusing to run without PROVISION_PROD=1 (guards against accidental execution). ' +
        'Set PROVISION_PROD=1 and a DATABASE_URL pointing at the target DB.'
    );
  }

  const seedUsers = buildSeedUsers();

  for (const seedUser of seedUsers) {
    await db
      .insert(users)
      .values(seedUser)
      .onConflictDoUpdate({ target: users.username, set: { password: seedUser.password } });
  }

  // Verify the rows are present (count is idempotent across re-runs).
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);

  console.log(
    `[DONE] Provisioned ${seedUsers.length} login user(s); users table now has ${count} row(s).`
  );
  return seedUsers.length;
}

provisionProdUsers()
  .then(async () => {
    await closeDatabasePool();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[FAIL] User provisioning failed:', error);
    await closeDatabasePool();
    process.exit(1);
  });
