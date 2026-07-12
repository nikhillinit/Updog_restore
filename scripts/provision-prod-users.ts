/**
 * Provision externally defined login users and fund grants into Neon Postgres.
 *
 * The identity file must live outside this repository and is validated in full
 * before any write. Dev/test seeding remains owned by scripts/seed-db.ts and
 * server/storage.ts.
 *
 * Usage (run locally against the target DB, never from CI):
 *   NODE_ENV=production DATABASE_URL="<prod-neon-url>" PROVISION_PROD=1 \
 *     IDENTITY_FILE="<absolute-path>" npx tsx scripts/provision-prod-users.ts [--dry-run]
 *
 * NEVER db:push / db:migrate against prod -- this is a data upsert only.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { neon } from '@neondatabase/serverless';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import bcrypt from 'bcryptjs';

import { funds, userFundGrants, users } from '@shared/schema';
import {
  assertFundIdsExist,
  assertIdentityFileOutsideRepo,
  getProdIdentityBcryptCost,
  parseProdIdentityFile,
  ProdIdentityValidationError,
} from '../server/lib/prod-identity';

class ProvisioningInputError extends Error {
  override readonly name = 'ProvisioningInputError';
}

function findRepoRoot(startDirectory: string): string {
  let candidate = startDirectory;

  while (true) {
    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }

    const parent = dirname(candidate);
    if (parent === candidate) {
      throw new ProvisioningInputError(
        'Could not locate repository root from the provisioning script path.'
      );
    }
    candidate = parent;
  }
}

async function provisionProdUsers(): Promise<number> {
  if (process.env['PROVISION_PROD'] !== '1') {
    throw new ProvisioningInputError(
      'Refusing to run without PROVISION_PROD=1 (guards against accidental execution). ' +
        'Set PROVISION_PROD=1 and a DATABASE_URL pointing at the target DB.'
    );
  }

  const connectionString = process.env['DATABASE_URL'] ?? process.env['NEON_DATABASE_URL'];
  if (!connectionString) {
    throw new ProvisioningInputError('DATABASE_URL (or NEON_DATABASE_URL) is required.');
  }

  const cliArgs = process.argv.slice(2);
  const identityFileInput =
    process.env['IDENTITY_FILE'] ?? cliArgs.find((argument) => !argument.startsWith('--'));
  if (!identityFileInput) {
    throw new ProvisioningInputError('IDENTITY_FILE or the first CLI path argument is required.');
  }

  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repoRoot = findRepoRoot(scriptDirectory);
  const identityFilePath = assertIdentityFileOutsideRepo(identityFileInput, repoRoot);
  let identityFileContents: string;
  try {
    identityFileContents = await readFile(identityFilePath, 'utf8');
  } catch {
    throw new ProvisioningInputError('Could not read IDENTITY_FILE.');
  }
  const identities = parseProdIdentityFile(identityFileContents);

  const db = drizzle(neon(connectionString));
  const existingFunds = await db.select({ id: funds.id }).from(funds);
  assertFundIdsExist(identities, new Set(existingFunds.map(({ id }) => id)));

  const isDryRun = cliArgs.includes('--dry-run') || process.env['DRY_RUN'] === '1';
  if (isDryRun) {
    for (const { username, role, fundIds } of identities) {
      console.log(
        `[DONE] DRY RUN username=${JSON.stringify(username)} role=${role} grants=${fundIds.length}`
      );
    }
    return identities.length;
  }

  const bcryptCost = getProdIdentityBcryptCost(process.env['NODE_ENV']);
  const preparedIdentities = await Promise.all(
    identities.map(async (identity) => ({
      identity,
      passwordHash: await bcrypt.hash(identity.password, bcryptCost),
    }))
  );

  for (const { identity, passwordHash } of preparedIdentities) {
    const { username, role, fundIds } = identity;
    const upsertUser = db
      .insert(users)
      .values({
        username,
        password: passwordHash,
        role,
        isActive: true,
        passwordUpdatedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: users.username,
        set: {
          password: passwordHash,
          role,
          isActive: true,
          passwordUpdatedAt: sql`now()`,
          updatedAt: sql`now()`,
        },
      });

    const userIdByUsername = sql<number>`(
      SELECT ${users.id}
      FROM ${users}
      WHERE ${users.username} = ${username}
    )`;
    const deleteExistingGrants = db
      .delete(userFundGrants)
      .where(eq(userFundGrants.userId, userIdByUsername));

    // neon-http's callback transaction API throws at runtime; batch delegates
    // these statements to the Neon client's atomic one-shot transaction.
    if (fundIds.length > 0) {
      const insertReplacementGrants = db.insert(userFundGrants).values(
        fundIds.map((fundId) => ({
          userId: userIdByUsername,
          fundId,
        }))
      );
      await db.batch([upsertUser, deleteExistingGrants, insertReplacementGrants]);
    } else {
      await db.batch([upsertUser, deleteExistingGrants]);
    }

    console.log(
      `[DONE] username=${JSON.stringify(username)} role=${role} grants=${fundIds.length}`
    );
  }

  return identities.length;
}

provisionProdUsers()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    if (error instanceof ProvisioningInputError || error instanceof ProdIdentityValidationError) {
      console.error(`[FAIL] User provisioning failed: ${error.message}`);
    } else {
      console.error('[FAIL] User provisioning failed; database/driver details were suppressed.');
    }
    process.exit(1);
  });
