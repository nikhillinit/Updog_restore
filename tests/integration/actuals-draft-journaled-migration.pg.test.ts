import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { computeTargetFingerprint } from '../../scripts/reconcile-prod-schema.mjs';
import { collectActualsMigrationPreflight } from '../../scripts/release/actuals-migration-preflight';
import {
  createDisposableActualsDraftMigrationTestContext,
  runActualsDraftJournaledMigration,
} from '../../scripts/run-actuals-draft-journaled-migration.mjs';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const databases: string[] = [];
const quiet = { write: () => true };
let admin: Client;
let localTestContext: Awaited<ReturnType<typeof createDisposableActualsDraftMigrationTestContext>>;

async function databaseAt(tag = '0055_current_forecast_recompute_commands') {
  const name = `draft_migration_${process.pid}_${Date.now()}_${databases.length}`;
  databases.push(name);
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(localTestContext.connectionString);
  url.pathname = `/${name}`;
  await runMigrationsWithConnectionString(url.toString(), tag);
  return url.toString();
}

async function withClient<T>(connectionString: string, callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function snapshot(client: Client) {
  return {
    ledger: (
      await client.query(
        'SELECT hash, created_at FROM public.drizzle_migrations ORDER BY created_at'
      )
    ).rows,
    catalog: (
      await client.query(`SELECT c.relname, c.relkind, a.attname, a.attnum
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public' ORDER BY c.relname, a.attnum`)
    ).rows,
  };
}

// The URL authority names prod.example.invalid; ?host= and ?port= reach the test container.
function overrideAuthority(connectionString: string) {
  const real = new URL(connectionString);
  const spoofed = new URL(connectionString);
  spoofed.hostname = 'prod.example.invalid';
  spoofed.port = '';
  spoofed.searchParams.set('host', real.hostname);
  spoofed.searchParams.set('port', real.port || '5432');
  return { real, spoofed: spoofed.toString() };
}

async function identityOf(client: Client) {
  const { rows } = await client.query<{ database: string; user: string }>(
    'SELECT current_database() AS database, current_user AS "user"'
  );
  return rows[0]!;
}

// Neon places the production endpoint at endpointHost. GitHub is unavailable here, which
// the preflight observes per predicate without skipping the target check.
function neonTransport(endpointHost: string, databaseName: string, owner: string) {
  const root = '/api/v2/projects/project-target';
  const bodies: Record<string, unknown> = {
    [root]: { project: { id: 'project-target' } },
    [`${root}/branches/branch-target`]: {
      branch: { id: 'branch-target', project_id: 'project-target' },
    },
    [`${root}/endpoints/ep-target`]: {
      endpoint: {
        id: 'ep-target',
        project_id: 'project-target',
        branch_id: 'branch-target',
        type: 'read_write',
        host: endpointHost,
        disabled: false,
        current_state: 'active',
      },
    },
    [`${root}/branches/branch-target/databases/${databaseName}`]: {
      database: { branch_id: 'branch-target', name: databaseName, owner_name: owner },
    },
  };
  return async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const body = url.origin === 'https://console.neon.tech' ? bodies[url.pathname] : undefined;
    return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 503 });
  };
}

describe('actuals draft 0056 bounded PostgreSQL migration', { retry: 0 }, () => {
  beforeAll(async () => {
    localTestContext = await createDisposableActualsDraftMigrationTestContext();
    admin = new Client({
      connectionString: localTestContext.connectionString,
    });
    await admin.connect();
  }, 120_000);

  afterAll(async () => {
    try {
      for (const name of databases.reverse())
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    } finally {
      try {
        await admin?.end();
      } finally {
        await localTestContext?.stop();
      }
    }
  }, 120_000);

  it('closes the connection before propagating an operation failure', async () => {
    const failure = new Error('operation failed');
    let connectionClosed = false;

    await expect(
      withClient(localTestContext.connectionString, async (client) => {
        client.once('end', () => {
          connectionClosed = true;
        });
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(connectionClosed).toBe(true);
  });

  it('refuses missing, copied, or wrong-target apply capabilities without changing database state', async () => {
    const connectionString = await databaseAt();
    await withClient(connectionString, async (client) => {
      const before = await snapshot(client);
      const wrongTarget = new URL(connectionString);
      wrongTarget.port = String(Number(wrongTarget.port) + 1);
      const cases = [
        { connectionString },
        { connectionString, localTestCapability: { ...localTestContext.capability } },
        {
          connectionString: wrongTarget.toString(),
          localTestCapability: localTestContext.capability,
        },
      ];
      for (const input of cases) {
        await expect(
          runActualsDraftJournaledMigration({ ...input, apply: true, stdout: quiet })
        ).rejects.toMatchObject({ details: { kind: 'production-mutation-blocked' } });
      }
      expect(await snapshot(client)).toEqual(before);
    });
  }, 180_000);

  it('reports the effective endpoint and refuses apply when ?host= overrides the URL authority', async () => {
    const connectionString = await databaseAt();
    const { real, spoofed } = overrideAuthority(connectionString);
    await withClient(connectionString, async (client) => {
      const { database, user } = await identityOf(client);
      const before = await snapshot(client);
      const result = await runActualsDraftJournaledMigration({
        connectionString: spoofed,
        apply: false,
        stdout: quiet,
      });
      expect(result.targetFingerprint).toBe(
        computeTargetFingerprint({ directHost: real.hostname, port: real.port, database, user })
      );
      await expect(
        runActualsDraftJournaledMigration({
          connectionString: spoofed,
          apply: true,
          localTestCapability: localTestContext.capability,
          stdout: quiet,
        })
      ).rejects.toMatchObject({ details: { kind: 'production-mutation-blocked' } });
      expect(await snapshot(client)).toEqual(before);
    });
  }, 180_000);

  it.each([
    ['apply-actuals-draft-0056', '0055_current_forecast_recompute_commands'],
    ['apply-actuals-restatement-0057', '0056_actuals_draft_revisions'],
  ] as const)(
    '%s preflight checks the effective endpoint, not a URL authority overridden by ?host=',
    async (mode, tag) => {
      const connectionString = await databaseAt(tag);
      const { real, spoofed } = overrideAuthority(connectionString);
      await withClient(connectionString, async (client) => {
        const { database, user } = await identityOf(client);
        const before = await snapshot(client);
        const collect = async (endpointHost: string) => {
          vi.stubGlobal('fetch', neonTransport(endpointHost, database, user));
          try {
            const report = await collectActualsMigrationPreflight(
              {
                mode,
                repository: 'fixture-owner/fixture-repo',
                candidateSha: 'a'.repeat(40),
                runId: '123',
                runAttempt: 1,
                databaseUrl: spoofed,
                provider: {
                  projectId: 'project-target',
                  branchId: 'branch-target',
                  endpointId: 'ep-target',
                  databaseName: database,
                  roleName: user,
                },
              },
              { githubToken: 'fixture-github-token', neonApiKey: 'fixture-neon-token' }
            );
            return {
              binding: report.binding,
              target: report.observations.find(
                (item) => item.predicate === 'protected-provider-and-database-identity'
              ),
            };
          } finally {
            vi.unstubAllGlobals();
          }
        };
        // Neon places production at the URL authority; the driver would reach the container.
        expect((await collect('prod.example.invalid')).target).toMatchObject({
          status: 'failed',
          code: 'PROVIDER_DATABASE_IDENTITY_MISMATCH',
        });
        // Neon places the target where the driver connects.
        const verified = await collect(real.hostname);
        expect(verified.target?.status).toBe('verified');
        expect(verified.binding.targetFingerprint).toBe(
          computeTargetFingerprint({ directHost: real.hostname, port: real.port, database, user })
        );
        expect(await snapshot(client)).toEqual(before);
      });
    },
    180_000
  );

  it.each(['canonical', 'adr074-reconciled'])(
    'dry-runs, applies and replays %s history without synthetic ledger rows',
    async (kind) => {
      const connectionString = await databaseAt();
      await withClient(connectionString, async (client) => {
        if (kind === 'adr074-reconciled') {
          await client.query(
            'DELETE FROM public.drizzle_migrations WHERE created_at > $1 AND created_at < $2',
            [1775356800000, 1785368400000]
          );
        }
        const before = await snapshot(client);
        expect(
          await runActualsDraftJournaledMigration({ connectionString, apply: false, stdout: quiet })
        ).toMatchObject({
          preState: { baselineKind: kind, state: 'ready' },
          applied: false,
        });
        expect(await snapshot(client)).toEqual(before);
        expect(
          await runActualsDraftJournaledMigration({
            connectionString,
            apply: true,
            localTestCapability: localTestContext.capability,
            stdout: quiet,
          })
        ).toMatchObject({
          postState: 'complete',
          applied: true,
        });
        const after = await snapshot(client);
        expect(after.ledger.slice(0, -1)).toEqual(before.ledger);
        expect(
          await runActualsDraftJournaledMigration({
            connectionString,
            apply: true,
            localTestCapability: localTestContext.capability,
            stdout: quiet,
          })
        ).toMatchObject({
          preState: { state: 'complete' },
          postState: 'complete',
          applied: false,
        });
        expect(await snapshot(client)).toEqual(after);
      });
    },
    180_000
  );

  it.each([
    ['partial table', 'CREATE TABLE actuals_draft_revisions (id bigint)'],
    [
      'missing predecessor',
      'DELETE FROM public.drizzle_migrations WHERE created_at = 1788235843534',
    ],
    [
      'unknown later history',
      "INSERT INTO public.drizzle_migrations (hash, created_at) VALUES (repeat('f', 64), 1788825600001)",
    ],
  ])(
    'refuses %s without changing database state',
    async (_label, mutation) => {
      const connectionString = await databaseAt();
      await withClient(connectionString, async (client) => {
        await client.query(mutation);
        const before = await snapshot(client);
        await expect(
          runActualsDraftJournaledMigration({
            connectionString,
            apply: true,
            localTestCapability: localTestContext.capability,
            stdout: quiet,
          })
        ).rejects.toThrow();
        expect(await snapshot(client)).toEqual(before);
      });
    },
    180_000
  );

  it.each([
    ['missing', 'DROP TRIGGER actuals_draft_revisions_immutable ON actuals_draft_revisions'],
    [
      'disabled',
      'ALTER TABLE actuals_draft_revisions DISABLE TRIGGER actuals_draft_revisions_immutable',
    ],
    [
      'redefined',
      'CREATE OR REPLACE FUNCTION actuals_draft_revisions_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$',
    ],
  ])(
    'refuses completed history with %s immutability wiring',
    async (_label, mutation) => {
      const connectionString = await databaseAt('0056_actuals_draft_revisions');
      await withClient(connectionString, async (client) => {
        await client.query(mutation);
        const before = await snapshot(client);
        await expect(
          runActualsDraftJournaledMigration({
            connectionString,
            apply: true,
            localTestCapability: localTestContext.capability,
            stdout: quiet,
          })
        ).rejects.toThrow();
        expect(await snapshot(client)).toEqual(before);
      });
    },
    180_000
  );

  it('rolls back earlier DDL and preserves the ledger when later DDL fails', async () => {
    const connectionString = await databaseAt();
    await withClient(connectionString, async (client) => {
      await client.query(`CREATE FUNCTION refuse_test_trigger() RETURNS event_trigger LANGUAGE plpgsql
        AS $$ BEGIN RAISE EXCEPTION 'injected trigger DDL failure'; END; $$;
        CREATE EVENT TRIGGER refuse_test_trigger ON ddl_command_start WHEN TAG IN ('CREATE TRIGGER')
        EXECUTE FUNCTION refuse_test_trigger()`);
      const before = await snapshot(client);
      await expect(
        runActualsDraftJournaledMigration({
          connectionString,
          apply: true,
          localTestCapability: localTestContext.capability,
          stdout: quiet,
        })
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: 'injected trigger DDL failure' }),
      });
      expect(await snapshot(client)).toEqual(before);
    });
  }, 180_000);
});
