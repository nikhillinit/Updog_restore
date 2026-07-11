/**
 * Provision login users into a target Neon Postgres (users table ONLY).
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
 * Driver: uses the Neon HTTP driver (HTTPS, matches prod on Vercel) rather than
 *   importing the app's server/db, whose driver selection picks a WebSocket pool
 *   for remote hosts -- that WS upgrade is commonly blocked on local networks.
 *   HTTP over 443 is the reliable path for a one-off ops run.
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

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { users } from '@shared/schema';
import { buildSeedUsers } from '../server/lib/seed-users';

async function provisionProdUsers(): Promise<number> {
  if (process.env['PROVISION_PROD'] !== '1') {
    throw new Error(
      'Refusing to run without PROVISION_PROD=1 (guards against accidental execution). ' +
        'Set PROVISION_PROD=1 and a DATABASE_URL pointing at the target DB.'
    );
  }

  const connectionString = process.env['DATABASE_URL'] ?? process.env['NEON_DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL (or NEON_DATABASE_URL) is required.');
  }

  const db = drizzle(neon(connectionString));
  const seedUsers = buildSeedUsers();

  for (const seedUser of seedUsers) {
    await db
      .insert(users)
      .values(seedUser)
      .onConflictDoUpdate({ target: users.username, set: { password: seedUser.password } });
  }

  // Verify the rows are present (count is idempotent across re-runs).
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const count = row?.count ?? 0;

  console.log(
    `[DONE] Provisioned ${seedUsers.length} login user(s); users table now has ${count} row(s).`
  );
  return seedUsers.length;
}

provisionProdUsers()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[FAIL] User provisioning failed:', error);
    process.exit(1);
  });
