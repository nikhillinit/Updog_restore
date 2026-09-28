import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
