/**
 * Provision externally defined login users and fund grants into Postgres.
 *
 * The identity file must live outside this repository and is validated in full
 * before any write. Dev/test seeding remains owned by scripts/seed-db.ts and
 * server/storage.ts.
 *
 * Run locally by the owner, never from CI, against the direct (non-pooler)
 * endpoint. `--dry-run` prints the plan and its digest. `--apply` requires the
 * exact source SHA, the target fingerprint, and that digest, and refuses before
 * any write when anything has drifted. Owner sequence for production:
 * docs/workflows/PRODUCTION_SCRIPTS.md, "Production user provisioning".
 *
 *   NODE_ENV=production DATABASE_URL="<direct-url>" PROVISION_PROD=1 \
 *     IDENTITY_FILE="<absolute-path>" npx tsx scripts/provision-prod-users.ts --dry-run
 *
 * NEVER db:push / db:migrate against prod -- this is a data upsert only.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import pg from 'pg';

import {
  assertFundIdsExist,
  assertIdentityFileOutsideRepo,
  assertReleaseCanaryPrincipalImmutable,
  getProdIdentityBcryptCost,
  parseProdIdentityFile,
  ProdIdentityValidationError,
  type ProdIdentity,
} from '../server/lib/prod-identity';
import { isPoolerUrl, readDatabaseIdentity } from './reconcile-prod-schema.mjs';
import { computeTargetFingerprint } from './run-journaled-0050-0061-migrations.mjs';

export class ProvisioningInputError extends Error {
  override readonly name = 'ProvisioningInputError';
}

export type ProvisioningMode = 'dry-run' | 'apply';

type Queryable = Pick<pg.Client, 'query'>;

type CurrentUser = {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
  isReleaseCanaryPrincipal: boolean;
  updatedAt: string;
  fundIds: number[];
};

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

export function parseProvisioningMode(argv: readonly string[]): ProvisioningMode {
  const dryRun = argv.includes('--dry-run');
  const apply = argv.includes('--apply');
  if (dryRun === apply) {
    throw new ProvisioningInputError(
      'Production user mutation requires exactly one of --dry-run or --apply.'
    );
  }
  return apply ? 'apply' : 'dry-run';
}

export function assertSourceIdentity({
  expectedSha,
  headSha,
  liveMainSha,
  dirty,
}: {
  expectedSha: string | undefined;
  headSha: string;
  liveMainSha: string;
  dirty: boolean;
}): void {
  if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new ProvisioningInputError('EXPECTED_SHA must be a full 40-character commit SHA.');
  }
  if (headSha !== expectedSha) {
    throw new ProvisioningInputError('Checkout HEAD does not equal EXPECTED_SHA.');
  }
  if (liveMainSha !== expectedSha) {
    throw new ProvisioningInputError('Live origin main does not equal EXPECTED_SHA.');
  }
  if (dirty) {
    throw new ProvisioningInputError('Checkout has uncommitted tracked changes.');
  }
}

function readSourceIdentity(repoRoot: string) {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  return {
    headSha: git('rev-parse', 'HEAD'),
    liveMainSha: git('ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0] ?? '',
    dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
  };
}

export function computePlanDigest(plan: {
  headSha: string;
  identityFileSha256: string;
  targetFingerprint: string;
  current: readonly CurrentUser[];
}): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

async function readCurrentUsers(
  client: Queryable,
  usernames: readonly string[],
  lock: boolean
): Promise<CurrentUser[]> {
  if (lock) {
    // Holds the target rows until COMMIT so the digest check below stays true
    // through every write.
    await client.query(
      'SELECT id FROM users WHERE username = ANY($1::text[]) ORDER BY username FOR UPDATE',
      [usernames]
    );
  }
  const { rows } = await client.query(
    `SELECT u.id, u.username, u.role, u.is_active, u.is_release_canary_principal,
       u.updated_at::text AS updated_at,
       COALESCE(array_agg(g.fund_id ORDER BY g.fund_id)
         FILTER (WHERE g.fund_id IS NOT NULL), '{}') AS fund_ids
     FROM users u
     LEFT JOIN user_fund_grants g ON g.user_id = u.id
     WHERE u.username = ANY($1::text[])
     GROUP BY u.id
     ORDER BY u.username`,
    [usernames]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    username: String(row.username),
    role: String(row.role),
    isActive: Boolean(row.is_active),
    isReleaseCanaryPrincipal: Boolean(row.is_release_canary_principal),
    updatedAt: String(row.updated_at),
    fundIds: (row.fund_ids as number[]).map(Number),
  }));
}

async function writeIdentity(
  client: Queryable,
  identity: ProdIdentity,
  passwordHash: string
): Promise<void> {
  const releaseCanaryPrincipal = identity.releaseCanaryPrincipal === true;
  const { rows } = await client.query(
    `INSERT INTO users
       (username, password, role, is_active, is_release_canary_principal, password_updated_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now())
     ON CONFLICT (username) DO UPDATE SET
       password = EXCLUDED.password,
       role = EXCLUDED.role,
       is_active = EXCLUDED.is_active,
       password_updated_at = now(),
       updated_at = now()
     WHERE users.is_release_canary_principal = EXCLUDED.is_release_canary_principal
     RETURNING id`,
    [
      identity.username,
      passwordHash,
      identity.role,
      identity.active !== false,
      releaseCanaryPrincipal,
    ]
  );
  const userId = rows[0]?.id;
  if (rows.length !== 1 || userId === undefined) {
    throw new ProdIdentityValidationError(
      `Refusing to change releaseCanaryPrincipal for existing username ${JSON.stringify(identity.username)}.`
    );
  }
  await client.query('DELETE FROM user_fund_grants WHERE user_id = $1', [userId]);
  if (identity.fundIds.length > 0) {
    await client.query(
      'INSERT INTO user_fund_grants (user_id, fund_id) SELECT $1, unnest($2::int[])',
      [userId, identity.fundIds]
    );
  }
}

function describePlan(identity: ProdIdentity, current: CurrentUser | undefined): string {
  const active = identity.active !== false;
  const before = current
    ? `role=${current.role} active=${current.isActive} grants=${current.fundIds.length}`
    : 'absent';
  return (
    `[PLAN] username=${JSON.stringify(identity.username)} before: ${before}; ` +
    `after: role=${identity.role} active=${active} grants=${identity.fundIds.length} ` +
    `releaseCanaryPrincipal=${identity.releaseCanaryPrincipal === true}`
  );
}

export async function runProvisioning({
  mode,
  client,
  connectionString,
  identities,
  identityFileSha256,
  headSha,
  expectedTargetFingerprint,
  expectedPlanDigest,
  bcryptCost,
  log = console.log,
}: {
  mode: ProvisioningMode;
  client: Queryable;
  connectionString: string;
  identities: readonly ProdIdentity[];
  identityFileSha256: string;
  headSha: string;
  expectedTargetFingerprint?: string;
  expectedPlanDigest?: string;
  bcryptCost: number;
  log?: (line: string) => void;
}): Promise<string> {
  // Hash before BEGIN so the row locks stay short.
  const prepared =
    mode === 'apply'
      ? await Promise.all(
          identities.map(async (identity) => ({
            identity,
            passwordHash: await bcrypt.hash(identity.password, bcryptCost),
          }))
        )
      : [];

  await client.query(mode === 'apply' ? 'BEGIN' : 'BEGIN READ ONLY');
  try {
    const databaseIdentity = await readDatabaseIdentity(client);
    const endpoint = new URL(connectionString);
    const targetFingerprint = computeTargetFingerprint({
      directHost: endpoint.hostname,
      port: endpoint.port,
      database: databaseIdentity.database,
      user: databaseIdentity.user,
    });
    if (mode === 'apply' && targetFingerprint !== expectedTargetFingerprint) {
      throw new ProvisioningInputError('Target fingerprint missing or mismatched.');
    }

    const { rows: fundRows } = await client.query('SELECT id FROM funds');
    assertFundIdsExist(identities, new Set(fundRows.map(({ id }) => Number(id))));

    const current = await readCurrentUsers(
      client,
      identities.map(({ username }) => username),
      mode === 'apply'
    );
    const currentByUsername = new Map(current.map((user) => [user.username, user]));
    for (const identity of identities) {
      assertReleaseCanaryPrincipalImmutable(
        identity.username,
        currentByUsername.get(identity.username)?.isReleaseCanaryPrincipal,
        identity.releaseCanaryPrincipal === true
      );
    }
    const planDigest = computePlanDigest({
      headSha,
      identityFileSha256,
      targetFingerprint,
      current,
    });

    if (mode === 'dry-run') {
      for (const identity of identities) {
        log(describePlan(identity, currentByUsername.get(identity.username)));
      }
      log(`[PLAN] digest=${planDigest}`);
      await client.query('ROLLBACK');
      return planDigest;
    }

    if (planDigest !== expectedPlanDigest) {
      throw new ProvisioningInputError(
        'Plan digest mismatch: the source, target, identity file, or target rows changed ' +
          'since the dry run. Re-run --dry-run and review the new plan.'
      );
    }
    for (const { identity, passwordHash } of prepared) {
      await writeIdentity(client, identity, passwordHash);
    }
    await client.query('COMMIT');
    for (const identity of identities) {
      log(
        `[DONE] username=${JSON.stringify(identity.username)} role=${identity.role} ` +
          `active=${identity.active !== false} grants=${identity.fundIds.length} ` +
          `releaseCanaryPrincipal=${identity.releaseCanaryPrincipal === true}`
      );
    }
    return planDigest;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function provisionProdUsers(): Promise<void> {
  const cliArgs = process.argv.slice(2);
  const mode = parseProvisioningMode(cliArgs);
  if (process.env['PROVISION_PROD'] !== '1') {
    throw new ProvisioningInputError(
      'Refusing to run without PROVISION_PROD=1 (guards against accidental execution). ' +
        'Set PROVISION_PROD=1 and a DATABASE_URL pointing at the target DB.'
    );
  }

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new ProvisioningInputError('DATABASE_URL is required.');
  }
  if (isPoolerUrl(connectionString)) {
    throw new ProvisioningInputError(
      'Refusing pooled DATABASE_URL; use the direct (non-pooler) endpoint.'
    );
  }

  const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
  const source = readSourceIdentity(repoRoot);
  let expectedPlanDigest: string | undefined;
  if (mode === 'apply') {
    assertSourceIdentity({ expectedSha: process.env['EXPECTED_SHA'], ...source });
    expectedPlanDigest = cliArgs
      .find((argument) => argument.startsWith('--expected-plan-digest='))
      ?.slice('--expected-plan-digest='.length);
    if (!expectedPlanDigest || !/^[0-9a-f]{64}$/.test(expectedPlanDigest)) {
      throw new ProvisioningInputError(
        '--apply requires --expected-plan-digest=<digest printed by --dry-run>.'
      );
    }
    if (!process.env['EXPECTED_TARGET_FINGERPRINT']) {
      throw new ProvisioningInputError('--apply requires EXPECTED_TARGET_FINGERPRINT.');
    }
  }

  const identityFileInput =
    process.env['IDENTITY_FILE'] ?? cliArgs.find((argument) => !argument.startsWith('--'));
  if (!identityFileInput) {
    throw new ProvisioningInputError('IDENTITY_FILE or the first CLI path argument is required.');
  }
  const identityFilePath = assertIdentityFileOutsideRepo(identityFileInput, repoRoot);
  let identityFileContents: string;
  try {
    identityFileContents = await readFile(identityFilePath, 'utf8');
  } catch {
    throw new ProvisioningInputError('Could not read IDENTITY_FILE.');
  }
  const identities = parseProdIdentityFile(identityFileContents);

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await runProvisioning({
      mode,
      client,
      connectionString,
      identities,
      identityFileSha256: createHash('sha256').update(identityFileContents).digest('hex'),
      headSha: source.headSha,
      expectedTargetFingerprint: process.env['EXPECTED_TARGET_FINGERPRINT'],
      expectedPlanDigest,
      bcryptCost: getProdIdentityBcryptCost(process.env['NODE_ENV']),
    });
  } finally {
    await client.end();
  }
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
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
}
