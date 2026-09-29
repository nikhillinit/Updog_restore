import bcrypt from 'bcryptjs';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runProvisioning } from '../../scripts/provision-prod-users.ts';
import { readDatabaseIdentity } from '../../scripts/reconcile-prod-schema.mjs';
import { computeTargetFingerprint } from '../../scripts/run-journaled-0050-0061-migrations.mjs';
import type { ProdIdentity } from '../../server/lib/prod-identity';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const databases: string[] = [];
const quiet = () => undefined;
let admin: Pool;
let startedContainer = false;

function baseConnection(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

async function withClient<T>(connectionString: string, callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function seededDatabase() {
  const name = `provision_users_${process.pid}_${Date.now()}_${databases.length}`;
  databases.push(name);
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(baseConnection());
  url.pathname = `/${name}`;
  const connectionString = url.toString();
  await runMigrationsWithConnectionString(connectionString);
  const fundId = await withClient(connectionString, async (client) => {
    const fund = await client.query<{ id: number }>(
      `INSERT INTO funds (name,size,management_fee,carry_percentage,vintage_year,status,is_active,base_currency,data_origin)
       VALUES ('Fund',1,0,0,2026,'active',true,'USD','production') RETURNING id`
    );
    const fundId = fund.rows[0]!.id;
    const user = await client.query<{ id: number }>(
      "INSERT INTO users (username, password, role) VALUES ('partner', 'seed-hash', 'admin') RETURNING id"
    );
    await client.query('INSERT INTO user_fund_grants (user_id, fund_id) VALUES ($1, $2)', [
      user.rows[0]!.id,
      fundId,
    ]);
    return fundId;
  });
  const fingerprint = await withClient(connectionString, async (client) => {
    const identity = await readDatabaseIdentity(client);
    const endpoint = new URL(connectionString);
    return computeTargetFingerprint({
      directHost: endpoint.hostname,
      port: endpoint.port,
      database: identity.database,
      user: identity.user,
    }) as string;
  });
  return { connectionString, fundId, fingerprint };
}

function identitiesFor(fundId: number): ProdIdentity[] {
  return [
    {
      username: 'partner',
      password: 'rotated-password-0001',
      role: 'admin',
      fundIds: [],
      active: false,
    },
    {
      username: 'release-canary',
      password: 'canary-password-00001',
      role: 'partner',
      fundIds: [fundId],
      releaseCanaryPrincipal: true,
    },
    {
      username: 'release-reconciler',
      password: 'reconciler-password-01',
      role: 'admin',
      fundIds: [],
    },
  ];
}

async function snapshot(connectionString: string) {
  return withClient(connectionString, async (client) => ({
    users: (
      await client.query(
        `SELECT username, password, role, is_active, is_release_canary_principal, updated_at::text
         FROM users ORDER BY username`
      )
    ).rows,
    grants: (await client.query('SELECT user_id, fund_id FROM user_fund_grants ORDER BY 1, 2'))
      .rows,
  }));
}

type ProvisioningClient = Parameters<typeof runProvisioning>[0]['client'];

function run(
  connectionString: string,
  options: {
    mode: 'dry-run' | 'apply';
    identities: ProdIdentity[];
    expectedTargetFingerprint?: string;
    expectedPlanDigest?: string;
    revalidateSource?: () => void;
    log?: (line: string) => void;
  },
  wrap: (client: Client) => ProvisioningClient = (client) => client
) {
  return withClient(connectionString, (client) =>
    runProvisioning({
      client: wrap(client),
      identityFileSha256: 'f'.repeat(64),
      headSha: 'a'.repeat(40),
      bcryptCost: 4,
      log: quiet,
      ...options,
    })
  );
}

describe.skipIf(skipIfNoDocker)('governed production user provisioning', { retry: 0 }, () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedContainer = true;
    }
    admin = new Pool({ connectionString: baseConnection(), max: 1 });
  }, 120_000);

  afterAll(async () => {
    try {
      for (const name of databases.reverse()) {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      }
    } finally {
      await admin?.end();
      if (startedContainer) await cleanupTestContainers();
    }
  });

  it('writes nothing on dry run, then applies exactly the reviewed plan', async () => {
    const { connectionString, fundId, fingerprint } = await seededDatabase();
    const identities = identitiesFor(fundId);
    const before = await snapshot(connectionString);

    const digest = await run(connectionString, { mode: 'dry-run', identities });
    expect(await snapshot(connectionString)).toEqual(before);

    await run(connectionString, {
      mode: 'apply',
      identities,
      expectedTargetFingerprint: fingerprint,
      expectedPlanDigest: digest,
    });
    const after = await withClient(
      connectionString,
      async (client) =>
        (
          await client.query(
            `SELECT u.username, u.password, u.role, u.is_active, u.is_release_canary_principal,
             COALESCE(array_agg(g.fund_id) FILTER (WHERE g.fund_id IS NOT NULL), '{}') AS fund_ids
           FROM users u LEFT JOIN user_fund_grants g ON g.user_id = u.id
           WHERE u.username = ANY($1::text[])
           GROUP BY u.id ORDER BY u.username`,
            [identities.map(({ username }) => username)]
          )
        ).rows
    );
    expect(after.map(({ password: _password, ...row }) => row)).toEqual([
      {
        username: 'partner',
        role: 'admin',
        is_active: false,
        is_release_canary_principal: false,
        fund_ids: [],
      },
      {
        username: 'release-canary',
        role: 'partner',
        is_active: true,
        is_release_canary_principal: true,
        fund_ids: [fundId],
      },
      {
        username: 'release-reconciler',
        role: 'admin',
        is_active: true,
        is_release_canary_principal: false,
        fund_ids: [],
      },
    ]);
    for (const [index, identity] of identities.entries()) {
      expect(await bcrypt.compare(identity.password, after[index].password)).toBe(true);
    }
  });

  it('prints the exact before and after fund IDs in the reviewed plan', async () => {
    const { connectionString, fundId } = await seededDatabase();
    const lines: string[] = [];
    await run(connectionString, {
      mode: 'dry-run',
      identities: identitiesFor(fundId),
      log: (line) => lines.push(line),
    });
    expect(lines[0]).toContain(
      `before: role=admin active=true grants=[${fundId}]; after: role=admin active=false grants=[]`
    );
    expect(lines[1]).toContain(
      `before: absent; after: role=partner active=true grants=[${fundId}]`
    );
  });

  it('refuses a mismatched target fingerprint with zero writes', async () => {
    const { connectionString, fundId } = await seededDatabase();
    const identities = identitiesFor(fundId);
    const digest = await run(connectionString, { mode: 'dry-run', identities });
    const before = await snapshot(connectionString);

    await expect(
      run(connectionString, {
        mode: 'apply',
        identities,
        expectedTargetFingerprint: '0'.repeat(64),
        expectedPlanDigest: digest,
      })
    ).rejects.toThrow(/fingerprint/i);
    expect(await snapshot(connectionString)).toEqual(before);
  });

  it('refuses a stale plan after a target row changes, with zero writes', async () => {
    const { connectionString, fundId, fingerprint } = await seededDatabase();
    const identities = identitiesFor(fundId);
    const digest = await run(connectionString, { mode: 'dry-run', identities });
    await withClient(connectionString, (client) =>
      client.query(
        "UPDATE users SET updated_at = now() + interval '1 second' WHERE username = 'partner'"
      )
    );
    const before = await snapshot(connectionString);

    await expect(
      run(connectionString, {
        mode: 'apply',
        identities,
        expectedTargetFingerprint: fingerprint,
        expectedPlanDigest: digest,
      })
    ).rejects.toThrow(/plan digest mismatch/i);
    expect(await snapshot(connectionString)).toEqual(before);
  });

  it('refuses a second apply of the same plan', async () => {
    const { connectionString, fundId, fingerprint } = await seededDatabase();
    const identities = identitiesFor(fundId);
    const digest = await run(connectionString, { mode: 'dry-run', identities });
    const apply = {
      mode: 'apply' as const,
      identities,
      expectedTargetFingerprint: fingerprint,
      expectedPlanDigest: digest,
    };
    await run(connectionString, apply);
    const afterFirst = await snapshot(connectionString);

    await expect(run(connectionString, apply)).rejects.toThrow(/plan digest mismatch/i);
    expect(await snapshot(connectionString)).toEqual(afterFirst);
  });

  it('refuses to flip the canary marker on an existing user before any write', async () => {
    const { connectionString, fundId } = await seededDatabase();
    const before = await snapshot(connectionString);

    await expect(
      run(connectionString, {
        mode: 'dry-run',
        identities: [
          {
            username: 'partner',
            password: 'rotated-password-0001',
            role: 'partner',
            fundIds: [fundId],
            releaseCanaryPrincipal: true,
          },
        ],
      })
    ).rejects.toThrow(/Refusing to change releaseCanaryPrincipal/);
    expect(await snapshot(connectionString)).toEqual(before);
  });

  it('fingerprints the effective endpoint, not a URL authority overridden by ?host=', async () => {
    const { connectionString, fundId } = await seededDatabase();
    const identities = identitiesFor(fundId);
    const digest = await run(connectionString, { mode: 'dry-run', identities });
    const real = new URL(connectionString);
    const spoofed = new URL(connectionString);
    spoofed.hostname = 'prod.example.invalid';
    spoofed.port = '';
    spoofed.searchParams.set('host', real.hostname);
    spoofed.searchParams.set('port', real.port);
    // The fingerprint the URL authority would produce: what an override hides.
    const authorityFingerprint = await withClient(connectionString, async (client) => {
      const identity = await readDatabaseIdentity(client);
      return computeTargetFingerprint({
        directHost: spoofed.hostname,
        port: '',
        database: identity.database,
        user: identity.user,
      }) as string;
    });
    const before = await snapshot(connectionString);

    await expect(
      run(spoofed.toString(), {
        mode: 'apply',
        identities,
        expectedTargetFingerprint: authorityFingerprint,
        expectedPlanDigest: digest,
      })
    ).rejects.toThrow(/fingerprint/i);
    expect(await snapshot(connectionString)).toEqual(before);
  });

  it('lets only one of two concurrent applies create users reviewed as absent', async () => {
    const { connectionString, fundId, fingerprint } = await seededDatabase();
    const identities = identitiesFor(fundId).filter(({ username }) => username !== 'partner');
    const digest = await run(connectionString, { mode: 'dry-run', identities });
    const apply = {
      mode: 'apply' as const,
      identities,
      expectedTargetFingerprint: fingerprint,
      expectedPlanDigest: digest,
    };

    const results = await Promise.allSettled([
      run(connectionString, apply),
      run(connectionString, apply),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const created = await withClient(
      connectionString,
      async (client) =>
        (
          await client.query(
            'SELECT username, count(*)::int AS n FROM users WHERE username = ANY($1::text[]) GROUP BY username ORDER BY username',
            [identities.map(({ username }) => username)]
          )
        ).rows
    );
    expect(created).toEqual([
      { username: 'release-canary', n: 1 },
      { username: 'release-reconciler', n: 1 },
    ]);
  });

  it('re-checks the source immediately before writing, with zero writes on failure', async () => {
    const { connectionString, fundId, fingerprint } = await seededDatabase();
    const identities = identitiesFor(fundId);
    const digest = await run(connectionString, { mode: 'dry-run', identities });
    const before = await snapshot(connectionString);

    await expect(
      run(connectionString, {
        mode: 'apply',
        identities,
        expectedTargetFingerprint: fingerprint,
        expectedPlanDigest: digest,
        revalidateSource: () => {
          throw new Error('Live origin main does not equal EXPECTED_SHA.');
        },
      })
    ).rejects.toThrow(/origin main/);
    expect(await snapshot(connectionString)).toEqual(before);
  });

  it('fails a blocked row lock at the lock timeout, with zero writes', async () => {
    const { connectionString, fundId, fingerprint } = await seededDatabase();
    const identities = identitiesFor(fundId);
    const digest = await run(connectionString, { mode: 'dry-run', identities });
    const before = await snapshot(connectionString);

    await withClient(connectionString, async (holder) => {
      await holder.query('BEGIN');
      await holder.query("SELECT 1 FROM users WHERE username = 'partner' FOR UPDATE");
      try {
        await expect(
          run(connectionString, {
            mode: 'apply',
            identities,
            expectedTargetFingerprint: fingerprint,
            expectedPlanDigest: digest,
          })
        ).rejects.toMatchObject({ code: '55P03' });
      } finally {
        await holder.query('ROLLBACK');
      }
    });
    expect(await snapshot(connectionString)).toEqual(before);
  });

  it('reports an unknown outcome when COMMIT is not acknowledged', async () => {
    const { connectionString, fundId, fingerprint } = await seededDatabase();
    const identities = identitiesFor(fundId);
    const digest = await run(connectionString, { mode: 'dry-run', identities });

    await expect(
      run(
        connectionString,
        {
          mode: 'apply',
          identities,
          expectedTargetFingerprint: fingerprint,
          expectedPlanDigest: digest,
        },
        (client) =>
          ({
            host: client.host,
            port: client.port,
            query: async (text: string, values?: unknown[]) => {
              const result = await client.query(text, values);
              if (text === 'COMMIT') throw new Error('connection lost after COMMIT');
              return result;
            },
          }) as unknown as ProvisioningClient
      )
    ).rejects.toThrow(/may or may not have committed/);
    const canary = await withClient(
      connectionString,
      async (client) =>
        (await client.query("SELECT 1 FROM users WHERE username = 'release-canary'")).rowCount
    );
    expect(canary).toBe(1);
  });
});
