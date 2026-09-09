import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACTUALS_RESTATEMENT_MIGRATION_IDENTITY,
  createDisposableActualsRestatementMigrationTestContext,
  runActualsRestatementJournaledMigration,
} from '../../scripts/run-actuals-restatement-journaled-migration.mjs';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const databases: string[] = [];
const quiet = { write: () => true };
let admin: Pool;
let localTestContext: Awaited<
  ReturnType<typeof createDisposableActualsRestatementMigrationTestContext>
>;

async function databaseAt(tag = '0056_actuals_draft_revisions') {
  const name = `restatement_migration_${process.pid}_${Date.now()}_${databases.length}`;
  databases.push(name);
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(localTestContext.connectionString);
  url.pathname = `/${name}`;
  await runMigrationsWithConnectionString(url.toString(), tag);
  return url.toString();
}

async function snapshot(pool: Pool) {
  return {
    ledger: (
      await pool.query(
        'SELECT id, hash, created_at FROM public.drizzle_migrations ORDER BY created_at, id'
      )
    ).rows,
    relations: (
      await pool.query(`SELECT c.relname, c.relkind, c.relpersistence,
        c.relrowsecurity, c.relforcerowsecurity, a.attname, a.attnum,
        format_type(a.atttypid, a.atttypmod) AS column_type, a.attnotnull,
        a.attidentity, a.attgenerated, pg_get_expr(d.adbin, d.adrelid) AS column_default
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' ORDER BY c.relname, a.attnum`)
    ).rows,
    constraints: (
      await pool.query(`SELECT t.relname, c.conname, c.contype, c.convalidated,
        c.condeferrable, c.condeferred, pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' ORDER BY t.relname, c.conname`)
    ).rows,
    indexes: (
      await pool.query(`SELECT t.relname AS table_name, i.relname AS index_name,
        x.indisvalid, x.indisready, pg_get_indexdef(i.oid) AS definition
        FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' ORDER BY t.relname, i.relname`)
    ).rows,
    triggers: (
      await pool.query(`SELECT c.relname, t.tgname, t.tgenabled,
        pg_get_triggerdef(t.oid) AS definition
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY c.relname, t.tgname`)
    ).rows,
    functions: (
      await pool.query(`SELECT p.proname, pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN
          ('reject_actuals_restatement_mutation', 'actuals_draft_revisions_forbid_mutation')
        ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)`)
    ).rows,
    sequences: (
      await pool.query(`SELECT c.relname, s.seqtypid::regtype::text AS sequence_type,
        s.seqstart::text, s.seqincrement::text, s.seqmax::text, s.seqmin::text,
        s.seqcache::text, s.seqcycle, owner.relname AS owned_table,
        a.attname AS owned_column, d.deptype
        FROM pg_sequence s JOIN pg_class c ON c.oid = s.seqrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_depend d ON d.objid = c.oid AND d.classid = 'pg_class'::regclass
          AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
        LEFT JOIN pg_class owner ON owner.oid = d.refobjid
        LEFT JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
        WHERE n.nspname = 'public' ORDER BY c.relname`)
    ).rows,
  };
}

async function assertMutationRefused(mutation: string, tag = '0056_actuals_draft_revisions') {
  const connectionString = await databaseAt(tag);
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await pool.query(mutation);
    const before = await snapshot(pool);
    await expect(
      runActualsRestatementJournaledMigration({
        connectionString,
        apply: true,
        localTestCapability: localTestContext.capability,
        stdout: quiet,
      })
    ).rejects.toThrow();
    expect(await snapshot(pool)).toEqual(before);
  } finally {
    await pool.end();
  }
}

describe('actuals restatement 0057 bounded PostgreSQL migration', { retry: 0 }, () => {
  beforeAll(async () => {
    localTestContext = await createDisposableActualsRestatementMigrationTestContext();
    admin = new Pool({ connectionString: localTestContext.connectionString, max: 1 });
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

  it('refuses missing, copied, and wrong-target capabilities without changing PostgreSQL', async () => {
    const connectionString = await databaseAt();
    const pool = new Pool({ connectionString, max: 1 });
    try {
      const before = await snapshot(pool);
      const wrongTarget = new URL(connectionString);
      wrongTarget.port = String(Number(wrongTarget.port) + 1);
      for (const input of [
        { connectionString },
        { connectionString, localTestCapability: { ...localTestContext.capability } },
        {
          connectionString: wrongTarget.toString(),
          localTestCapability: localTestContext.capability,
        },
      ]) {
        await expect(
          runActualsRestatementJournaledMigration({ ...input, apply: true, stdout: quiet })
        ).rejects.toMatchObject({ details: { kind: 'production-mutation-blocked' } });
      }
      expect(await snapshot(pool)).toEqual(before);
    } finally {
      await pool.end();
    }
  }, 180_000);

  it.each(['canonical', 'adr074-reconciled'])(
    'dry-runs, applies and exactly replays %s history without replacing predecessor rows',
    async (kind) => {
      const connectionString = await databaseAt();
      const pool = new Pool({ connectionString, max: 1 });
      try {
        if (kind === 'adr074-reconciled') {
          await pool.query(
            'DELETE FROM public.drizzle_migrations WHERE created_at > $1 AND created_at < $2',
            [1775356800000, 1785368400000]
          );
        }
        const before = await snapshot(pool);
        expect(
          await runActualsRestatementJournaledMigration({
            connectionString,
            apply: false,
            stdout: quiet,
          })
        ).toMatchObject({
          preState: { baselineKind: kind, state: 'ready', appliedTargetCount: 0 },
          postState: 'ready',
          applied: false,
          migration: ACTUALS_RESTATEMENT_MIGRATION_IDENTITY,
        });
        expect(await snapshot(pool)).toEqual(before);
        const applied = await runActualsRestatementJournaledMigration({
          connectionString,
          apply: true,
          localTestCapability: localTestContext.capability,
          stdout: quiet,
          clientFactory: () => {
            throw new Error('Apply must use the client bound to the owned container');
          },
        });
        expect(applied).toMatchObject({
          preState: { baselineKind: kind, state: 'ready' },
          postState: 'complete',
          applied: true,
          migration: ACTUALS_RESTATEMENT_MIGRATION_IDENTITY,
        });
        const after = await snapshot(pool);
        expect(after.ledger.slice(0, -1)).toEqual(before.ledger);
        expect(after.ledger.at(-1)).toMatchObject({
          hash: ACTUALS_RESTATEMENT_MIGRATION_IDENTITY.hash,
          created_at: String(ACTUALS_RESTATEMENT_MIGRATION_IDENTITY.when),
        });
        expect(
          await runActualsRestatementJournaledMigration({
            connectionString,
            apply: true,
            localTestCapability: localTestContext.capability,
            stdout: quiet,
          })
        ).toMatchObject({
          preState: { baselineKind: kind, state: 'complete', appliedTargetCount: 1 },
          postState: 'complete',
          applied: false,
          targetFingerprint: applied.targetFingerprint,
        });
        expect(await snapshot(pool)).toEqual(after);
      } finally {
        await pool.end();
      }
    },
    180_000
  );

  it.each([
    [
      'missing 0056 predecessor',
      'DELETE FROM public.drizzle_migrations WHERE created_at = 1788825600000',
    ],
    [
      'wrong 0056 predecessor hash',
      "UPDATE public.drizzle_migrations SET hash = repeat('f', 64) WHERE created_at = 1788825600000",
    ],
    [
      'duplicate 0056 predecessor',
      'INSERT INTO public.drizzle_migrations (hash, created_at) SELECT hash, created_at FROM public.drizzle_migrations WHERE created_at = 1788825600000',
    ],
    [
      'unknown later history',
      "INSERT INTO public.drizzle_migrations (hash, created_at) VALUES (repeat('f', 64), 1788912000001)",
    ],
    ['partial command table', 'CREATE TABLE actuals_restatement_commands (id bigint)'],
    [
      'preinstalled cash identity constraint',
      'ALTER TABLE cash_flow_events ADD CONSTRAINT cash_flow_events_id_fund_unique UNIQUE (id, fund_id)',
    ],
    [
      'preinstalled mark identity constraint',
      'ALTER TABLE valuation_marks ADD CONSTRAINT valuation_marks_id_fund_unique UNIQUE (id, fund_id)',
    ],
    ['orphan serial sequence', 'CREATE SEQUENCE actuals_restatement_items_id_seq'],
  ])(
    'refuses %s without changing PostgreSQL',
    async (_label, mutation) => {
      await assertMutationRefused(mutation);
    },
    180_000
  );

  it.each([
    [
      'wrong 0057 hash',
      "UPDATE public.drizzle_migrations SET hash = repeat('f', 64) WHERE created_at = 1788912000000",
    ],
    [
      'missing item immutability trigger',
      'DROP TRIGGER actuals_restatement_items_immutable ON actuals_restatement_items',
    ],
    [
      'disabled command immutability trigger',
      'ALTER TABLE actuals_restatement_commands DISABLE TRIGGER actuals_restatement_commands_immutable',
    ],
    [
      'redefined immutability function',
      'CREATE OR REPLACE FUNCTION reject_actuals_restatement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$',
    ],
    [
      'weakened same-fund foreign key',
      'ALTER TABLE actuals_restatement_items DROP CONSTRAINT actuals_restatement_items_target_cash_fk; ALTER TABLE actuals_restatement_items ADD CONSTRAINT actuals_restatement_items_target_cash_fk FOREIGN KEY (target_cash_flow_event_id) REFERENCES cash_flow_events(id)',
    ],
    [
      'changed hash column width',
      'ALTER TABLE actuals_restatement_commands ALTER COLUMN operation_hash TYPE varchar(65)',
    ],
    [
      'detached serial sequence ownership',
      'ALTER SEQUENCE actuals_restatement_items_id_seq OWNED BY NONE',
    ],
  ])(
    'refuses completed history with %s',
    async (_label, mutation) => {
      await assertMutationRefused(mutation, '0057_actuals_restatement_commands');
    },
    180_000
  );

  it('rolls back parent constraints, new schema objects and ledger on a late DDL failure', async () => {
    const connectionString = await databaseAt();
    const pool = new Pool({ connectionString, max: 1 });
    try {
      await pool.query(`CREATE FUNCTION refuse_restatement_test_trigger() RETURNS event_trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected restatement trigger DDL failure'; END; $$;
        CREATE EVENT TRIGGER refuse_restatement_test_trigger ON ddl_command_start
          WHEN TAG IN ('CREATE TRIGGER') EXECUTE FUNCTION refuse_restatement_test_trigger()`);
      const before = await snapshot(pool);
      await expect(
        runActualsRestatementJournaledMigration({
          connectionString,
          apply: true,
          localTestCapability: localTestContext.capability,
          stdout: quiet,
        })
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: 'injected restatement trigger DDL failure' }),
      });
      expect(await snapshot(pool)).toEqual(before);
    } finally {
      await pool.end();
    }
  }, 180_000);
});
