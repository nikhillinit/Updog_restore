/** Real PostgreSQL catalog and enforcement proof for migration 0059. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { escapeIdentifier, Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  TaskCreateSchema,
  TaskResponseSchema,
} from '../../../shared/contracts/operating-objects/task.contract';
import {
  ACTION_REFUSE_FOR_HUMAN,
  ACTION_SKIP,
  auditManifest,
  loadManifests,
} from '../../../scripts/reconcile-prod-schema.mjs';
import { createIsolatedDatabasePool } from '../../helpers/isolated-postgres-database';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../../helpers/testcontainers-migration';

const migrationTag = '0059_task_update_commands';
const fundId = 229_059_001;
const otherFundId = fundId + 1;
const userId = 229_059_001;
const taskId = 229_059_001;
const otherTaskId = taskId + 1;
const otherFundTaskId = taskId + 2;
const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';

let adminPool: Pool | undefined;
let databaseName: string | undefined;
let isolatedDatabase: ReturnType<typeof createIsolatedDatabasePool> | undefined;
let manifest: Awaited<ReturnType<typeof loadManifests>>[number];
let migrationSql = '';
let startedTestContainers = false;

describe.skipIf(skipIfNoDocker)('task update command migration PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    const adminConnectionString = process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
    adminPool = new Pool({ connectionString: adminConnectionString, max: 1 });
    databaseName = `task_update_0059_${process.pid}_${Date.now()}`;
    await adminPool.query(`CREATE DATABASE ${escapeIdentifier(databaseName)}`);
    const databaseUrl = new URL(adminConnectionString);
    databaseUrl.pathname = `/${databaseName}`;
    isolatedDatabase = createIsolatedDatabasePool(databaseUrl.toString());

    const state = await runMigrationsWithConnectionString(databaseUrl.toString(), migrationTag);
    expect(state.applied.map((entry) => entry.name)).toContain(migrationTag);
    manifest = (await loadManifests()).find((entry) => entry.name === 'task-update-commands');
    expect(manifest).toBeDefined();
    migrationSql = await readFile(
      path.join(process.cwd(), 'migrations', `${migrationTag}.sql`),
      'utf8'
    );

    const database = requiredPool();
    await database.query(
      `INSERT INTO users (id, username, password, role, is_active)
       VALUES ($1, 'task-update-schema-proof', 'synthetic-schema-only', 'partner', true)`,
      [userId]
    );
    await database.query(
      `INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
       VALUES ($1, '0059 receipt proof', 10000000, '0.0200', '0.2000', 2026),
              ($2, '0059 other fund', 10000000, '0.0200', '0.2000', 2026)`,
      [fundId, otherFundId]
    );
    await database.query(
      `INSERT INTO tasks (id, fund_id, title, created_by)
       VALUES ($1, $4, 'Receipt task', $6),
              ($2, $4, 'Other task', $6),
              ($3, $5, 'Other fund task', $6)`,
      [taskId, otherTaskId, otherFundTaskId, fundId, otherFundId, userId]
    );
    await insertReceipt(database, { key: 'original-command' });
  }, 180_000);

  afterAll(async () => {
    try {
      if (isolatedDatabase && adminPool && databaseName) {
        await isolatedDatabase.dropDatabase(adminPool, databaseName);
      }
    } finally {
      await adminPool?.end();
      if (startedTestContainers) await cleanupTestContainers();
    }
  });

  it('matches the manifest after journaled apply', async () => {
    await expectMatchingCatalog(requiredPool());
  });

  it('raw replay preserves stored receipts and the manifest catalog', async () => {
    const database = requiredPool();
    const before = await database.query('SELECT * FROM task_update_commands ORDER BY id');

    await database.query(migrationSql);

    await expectMatchingCatalog(database);
    expect((await database.query('SELECT * FROM task_update_commands ORDER BY id')).rows).toEqual(
      before.rows
    );
  });

  it('allows the same key on other tasks and rejects a duplicate within one task', async () => {
    await inTransaction(async (client) => {
      await insertReceipt(client, { taskId: otherTaskId, key: 'original-command' });
      await insertReceipt(client, {
        fundId: otherFundId,
        taskId: otherFundTaskId,
        key: 'original-command',
      });
      await expect(insertReceipt(client, { key: 'original-command' })).rejects.toMatchObject({
        code: '23505',
        constraint: 'task_update_commands_scope_unique',
      });
    });
  });

  it.each([
    { column: 'id', populated: true },
    { column: 'created_at', populated: true },
    { column: 'id', populated: false },
    { column: 'created_at', populated: false },
  ])(
    'refuses a missing $column default with populated=$populated before receipt inserts fail',
    async ({ column, populated }) => {
      await inTransaction(async (client) => {
        if (!populated) await client.query('DELETE FROM task_update_commands');
        await client.query(
          `ALTER TABLE task_update_commands ALTER COLUMN ${escapeIdentifier(column)} DROP DEFAULT`
        );
        const audit = await auditManifest(client, manifest);

        await expect(
          insertReceipt(client, { key: `without-${column}-default` })
        ).rejects.toMatchObject({ code: '23502', column });
        expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
        expect(
          audit.objects.find((object) => object.table === 'task_update_commands')?.populated
        ).toBe(populated);
        expect(audit.objects.flatMap((object) => object.deltas)).toContainEqual(
          expect.objectContaining({
            kind: 'column-default-mismatch',
            name: `task_update_commands.${column}`,
            actual: null,
            additiveSafe: false,
          })
        );
      });
    }
  );

  it.each([
    { column: 'idempotency_key', expected: 128 },
    { column: 'request_hash', expected: 64 },
  ])(
    'refuses narrowed $column and insertion of valid receipt widths',
    async ({ column, expected }) => {
      await inTransaction(async (client) => {
        await client.query('DELETE FROM task_update_commands');
        await client.query(
          `ALTER TABLE task_update_commands ALTER COLUMN ${escapeIdentifier(column)} TYPE varchar(16)`
        );
        const audit = await auditManifest(client, manifest);

        await expect(insertReceipt(client, { key: 'k'.repeat(128) })).rejects.toMatchObject({
          code: '22001',
        });
        expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
        const table = audit.objects.find((object) => object.table === 'task_update_commands');
        expect(table?.populated).toBe(false);
        expect(table?.deltas).toContainEqual({
          kind: 'column-length-mismatch',
          name: `task_update_commands.${column}`,
          expected,
          actual: 16,
          additiveSafe: false,
          humanReviewRequired: true,
        });
      });
    }
  );

  it.each([
    { name: 'a task from another fund', input: { fundId: otherFundId } },
    { name: 'a missing task', input: { taskId: 229_059_999 } },
    { name: 'a missing fund', input: { fundId: 229_059_999 } },
    { name: 'a missing actor', input: { createdBy: 229_059_999 } },
  ])('rejects a receipt referencing $name', async ({ input }) => {
    await inTransaction(async (client) => {
      await expect(insertReceipt(client, input)).rejects.toMatchObject({ code: '23503' });
    });
  });

  it.each([
    {
      name: 'unlisted required column',
      sql: 'ALTER TABLE task_update_commands ADD COLUMN receipt_source text NOT NULL',
      code: '23502',
      delta: 'unexpected-column',
    },
    {
      name: 'nullable actor made required',
      sql: 'ALTER TABLE task_update_commands ALTER COLUMN created_by SET NOT NULL',
      code: '23502',
      delta: 'column-nullability-mismatch',
    },
    {
      name: 'omitted nullable domain rejects NULL',
      sql: `CREATE DOMAIN receipt_nonnull AS integer CHECK (VALUE IS NOT NULL);
        ALTER TABLE task_update_commands ADD COLUMN receipt_extra receipt_nonnull`,
      code: '23514',
      delta: 'unexpected-column',
    },
    {
      name: 'supplied actor domain rejects supported NULL',
      sql: `CREATE DOMAIN receipt_actor AS integer CHECK (VALUE IS NOT NULL);
        ALTER TABLE task_update_commands ALTER COLUMN created_by TYPE receipt_actor`,
      code: '23514',
      delta: 'column-domain-mismatch',
    },
    {
      name: 'nondeterministic hash collation rejects regex validation',
      sql: `CREATE COLLATION receipt_hash_collation
        (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
        ALTER TABLE task_update_commands ALTER COLUMN request_hash
        TYPE varchar(64) COLLATE receipt_hash_collation`,
      code: '0A000',
      delta: 'column-collation-mismatch',
    },
    {
      name: 'omitted required generated NULL',
      sql: `ALTER TABLE task_update_commands ADD COLUMN receipt_extra integer
        GENERATED ALWAYS AS (NULL::integer) STORED NOT NULL`,
      code: '23502',
      delta: 'unexpected-column',
    },
    {
      name: 'omitted nullable generated expression rejects INSERT',
      sql: `ALTER TABLE task_update_commands ADD COLUMN receipt_extra integer GENERATED ALWAYS AS
        (1 / (CASE WHEN idempotency_key = 'candidate-command' THEN 0 ELSE 1 END)) STORED`,
      code: '22012',
      delta: 'unexpected-column',
    },
    {
      name: 'omitted nullable default rejects INSERT',
      sql: `CREATE FUNCTION receipt_reject_default() RETURNS integer LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'receipt_default_rejected'; END $$;
        ALTER TABLE task_update_commands ADD COLUMN receipt_extra integer;
        ALTER TABLE task_update_commands ALTER COLUMN receipt_extra SET DEFAULT receipt_reject_default()`,
      code: 'P0001',
      delta: 'unexpected-column',
    },
    {
      name: 'supplied actor made generated',
      sql: `ALTER TABLE task_update_commands DROP COLUMN created_by;
        ALTER TABLE task_update_commands ADD COLUMN created_by integer GENERATED ALWAYS AS (${userId}) STORED;
        ALTER TABLE task_update_commands ADD CONSTRAINT task_update_commands_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id)`,
      code: '428C9',
      delta: 'column-generation-mismatch',
    },
    {
      name: 'narrowed serial sequence capacity',
      sql: 'ALTER SEQUENCE task_update_commands_id_seq RESTART WITH 2 MAXVALUE 2',
      code: '2200H',
      delta: 'column-sequence-mismatch',
    },
    {
      name: 'unexpected rejecting CHECK',
      sql: 'ALTER TABLE task_update_commands ADD CONSTRAINT receipt_disabled CHECK (false)',
      code: '23514',
      delta: 'unexpected-constraint',
    },
    {
      name: 'unexpected rejecting INSERT trigger',
      sql: `CREATE TRIGGER receipt_reject_insert BEFORE INSERT ON task_update_commands
        FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update()`,
      code: 'P0001',
      delta: 'unexpected-trigger',
    },
    {
      name: 'unexpected uniqueness restriction',
      sql: 'CREATE UNIQUE INDEX receipt_one_per_task ON task_update_commands(task_id)',
      code: '23505',
      delta: 'unexpected-index',
    },
    {
      name: 'unique index borrowing a CHECK constraint name',
      sql: 'CREATE UNIQUE INDEX task_update_commands_request_hash_check ON task_update_commands(task_id)',
      code: '23505',
      delta: 'unexpected-index',
    },
    {
      name: 'unexpected expression index that rejects valid inserts',
      sql: `CREATE INDEX receipt_failing_expression ON task_update_commands
        ((1 / (CASE WHEN idempotency_key = 'candidate-command' THEN 0 ELSE 1 END)))`,
      code: '22012',
      delta: 'unexpected-index',
    },
  ])('refuses insert-breaking catalog drift: $name', async ({ sql, code, delta }) => {
    await inTransaction(async (client) => {
      await client.query('DELETE FROM task_update_commands');
      await client.query(sql);
      if (code === '2200H' || code === '23505') {
        await insertReceipt(client, { key: 'first-command' });
      }
      const audit = await auditManifest(client, manifest);
      await expect(insertReceipt(client, { createdBy: null })).rejects.toMatchObject({ code });
      expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(audit.objects.flatMap((object) => object.deltas)).toContainEqual(
        expect.objectContaining({ kind: delta, additiveSafe: false, humanReviewRequired: true })
      );
    });
  });

  it('refuses an INSERT suppression trigger even when PostgreSQL reports no error', async () => {
    await inTransaction(async (client) => {
      await client.query(`CREATE FUNCTION receipt_suppress_insert() RETURNS trigger LANGUAGE plpgsql
        AS $$ BEGIN RETURN NULL; END; $$;
        CREATE TRIGGER receipt_skip_insert BEFORE INSERT ON task_update_commands
        FOR EACH ROW EXECUTE FUNCTION receipt_suppress_insert()`);
      const audit = await auditManifest(client, manifest);
      await insertReceipt(client, { key: 'suppressed-command' });
      expect(
        (
          await client.query(
            "SELECT count(*)::integer AS count FROM task_update_commands WHERE idempotency_key = 'suppressed-command'"
          )
        ).rows[0].count
      ).toBe(0);
      expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(audit.objects.flatMap((object) => object.deltas)).toContainEqual(
        expect.objectContaining({
          kind: 'unexpected-trigger',
          additiveSafe: false,
          humanReviewRequired: true,
        })
      );
    });
  });

  it('accepts an omitted nullable column and an ordinary nonunique index', async () => {
    await inTransaction(async (client) => {
      await client.query(`ALTER TABLE task_update_commands ADD COLUMN optional_note text;
        CREATE INDEX receipt_created_at_search ON task_update_commands(created_at)`);
      await expectMatchingCatalog(client);
      await insertReceipt(client, { key: 'harmless-extra-objects' });
      const result = await client.query(
        "SELECT optional_note FROM task_update_commands WHERE idempotency_key = 'harmless-extra-objects'"
      );
      expect(result.rows).toEqual([{ optional_note: null }]);
    });
  });

  it.each(['integer DEFAULT 42', 'integer NOT NULL DEFAULT 42'])(
    'requires review of an unlisted default even when compatible: %s',
    async (definition) => {
      await inTransaction(async (client) => {
        await client.query(
          `ALTER TABLE task_update_commands ADD COLUMN receipt_extra ${definition}`
        );
        const audit = await auditManifest(client, manifest);
        await insertReceipt(client);
        expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
        expect(audit.objects.flatMap((object) => object.deltas)).toContainEqual(
          expect.objectContaining({ kind: 'unexpected-column', humanReviewRequired: true })
        );
      });
    }
  );

  it.each(['(response_body)', '(task_id) INCLUDE (response_body)'])(
    'refuses a nonunique index that rejects a valid receipt by size: %s',
    async (columns) => {
      await inTransaction(async (client) => {
        await client.query(`CREATE INDEX receipt_body_search ON task_update_commands ${columns}`);
        const input = TaskCreateSchema.parse({
          fundId,
          title: 'Valid receipt',
          description: Array.from({ length: 2000 }, (_, i) =>
            String.fromCharCode(0x4e00 + ((i * 7919) % 20000))
          ).join(''),
        });
        const responseBody = TaskResponseSchema.parse({
          ...input,
          id: taskId,
          status: 'open',
          ownerId: null,
          dueDate: null,
          createdAt: '2026-09-14T00:00:00.000Z',
          updatedAt: '2026-09-14T00:00:00.000Z',
          etag: '"1"',
        });
        const audit = await auditManifest(client, manifest);
        await expect(insertReceipt(client, { responseBody })).rejects.toMatchObject({
          code: '54000',
        });
        expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
        expect(audit.objects.flatMap((object) => object.deltas)).toContainEqual(
          expect.objectContaining({ kind: 'unexpected-index', humanReviewRequired: true })
        );
      });
    }
  );

  it('refuses a collation that merges case-distinct idempotency keys', async () => {
    await inTransaction(async (client) => {
      await client.query(`CREATE COLLATION receipt_key_collation
        (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
        ALTER TABLE task_update_commands ALTER COLUMN idempotency_key
        TYPE varchar(128) COLLATE receipt_key_collation`);
      const audit = await auditManifest(client, manifest);
      await insertReceipt(client, { key: 'Case-Key' });
      await expect(insertReceipt(client, { key: 'case-key' })).rejects.toMatchObject({
        code: '23505',
      });
      expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(audit.objects.flatMap((object) => object.deltas)).toContainEqual(
        expect.objectContaining({ kind: 'column-collation-mismatch', humanReviewRequired: true })
      );
    });
  });

  it.each([
    { name: 'an empty key', input: { key: '' }, constraint: 'key_nonempty' },
    { name: 'a malformed hash', input: { hash: 'invalid' }, constraint: 'request_hash' },
    {
      name: 'a response for another task',
      input: { responseBody: { id: otherTaskId, fundId } },
      constraint: 'response_identity',
    },
    {
      name: 'a response for another fund',
      input: { responseBody: { id: taskId, fundId: otherFundId } },
      constraint: 'response_identity',
    },
    {
      name: 'a response without identity',
      input: { responseBody: {} },
      constraint: 'response_identity',
    },
  ])('rejects $name', async ({ input, constraint }) => {
    await inTransaction(async (client) => {
      await expect(insertReceipt(client, input)).rejects.toMatchObject({
        code: '23514',
        constraint: `task_update_commands_${constraint}_check`,
      });
    });
  });

  it('forbids receipt updates and preserves the committed command', async () => {
    const database = requiredPool();
    const before = await database.query('SELECT * FROM task_update_commands ORDER BY id');

    await expect(
      database.query('UPDATE task_update_commands SET request_hash = $1', ['b'.repeat(64)])
    ).rejects.toThrow('immutable_row_update_forbidden: task_update_commands');

    expect((await database.query('SELECT * FROM task_update_commands ORDER BY id')).rows).toEqual(
      before.rows
    );
  });

  it.each([
    {
      name: 'missing receipt table',
      sql: 'DROP TABLE task_update_commands',
      delta: 'missing-table',
    },
    {
      name: 'weakened same-named uniqueness',
      sql: `ALTER TABLE task_update_commands DROP CONSTRAINT task_update_commands_scope_unique;
            ALTER TABLE task_update_commands ADD CONSTRAINT task_update_commands_scope_unique
            UNIQUE (fund_id, task_id, idempotency_key, created_by)`,
      delta: 'constraint-definition-mismatch',
    },
    {
      name: 'receipt ID default using another table sequence',
      sql: "ALTER TABLE task_update_commands ALTER COLUMN id SET DEFAULT nextval('tasks_id_seq'::regclass)",
      delta: 'column-default-mismatch',
    },
    {
      name: 'receipt timestamp default fixed in the past',
      sql: "ALTER TABLE task_update_commands ALTER COLUMN created_at SET DEFAULT '2000-01-01 00:00:00+00'::timestamptz",
      delta: 'column-default-mismatch',
    },
    {
      name: 'task foreign key without fund scope',
      sql: `ALTER TABLE task_update_commands DROP CONSTRAINT task_update_commands_task_fund_fk;
            ALTER TABLE task_update_commands ADD CONSTRAINT task_update_commands_task_fund_fk
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE`,
      delta: 'constraint-definition-mismatch',
    },
    {
      name: 'fund foreign key pointing at users',
      sql: `ALTER TABLE task_update_commands DROP CONSTRAINT task_update_commands_fund_id_funds_id_fk;
            ALTER TABLE task_update_commands ADD CONSTRAINT task_update_commands_fund_id_funds_id_fk
            FOREIGN KEY (fund_id) REFERENCES users(id) ON DELETE CASCADE`,
      delta: 'constraint-definition-mismatch',
    },
    {
      name: 'actor foreign key pointing at funds',
      sql: `ALTER TABLE task_update_commands DROP CONSTRAINT task_update_commands_created_by_users_id_fk;
            ALTER TABLE task_update_commands ADD CONSTRAINT task_update_commands_created_by_users_id_fk
            FOREIGN KEY (created_by) REFERENCES funds(id)`,
      delta: 'constraint-definition-mismatch',
    },
    {
      name: 'disabled immutability trigger',
      sql: 'ALTER TABLE task_update_commands DISABLE TRIGGER task_update_commands_forbid_update_trigger',
      delta: 'trigger-disabled',
    },
    {
      name: 'missing immutability trigger',
      sql: 'DROP TRIGGER task_update_commands_forbid_update_trigger ON task_update_commands',
      delta: 'missing-trigger',
    },
    {
      name: 'changed immutability trigger',
      sql: `DROP TRIGGER task_update_commands_forbid_update_trigger ON task_update_commands;
            CREATE TRIGGER task_update_commands_forbid_update_trigger
            AFTER UPDATE ON task_update_commands FOR EACH ROW
            EXECUTE FUNCTION internal_economics_forbid_update()`,
      delta: 'trigger-definition-mismatch',
    },
    {
      name: 'same-named function permitting updates',
      sql: `CREATE OR REPLACE FUNCTION public.internal_economics_forbid_update()
            RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN RETURN NEW; END; $function$`,
      delta: 'function-definition-mismatch',
    },
  ])('refuses local catalog drift: $name', async ({ sql, delta }) => {
    await inTransaction(async (client) => {
      await client.query(sql);
      const audit = await auditManifest(client, manifest);

      expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(audit.objects.flatMap((object) => object.deltas)).toContainEqual(
        expect.objectContaining({ kind: delta })
      );
    });
  });
});

function requiredPool(): Pool {
  if (!isolatedDatabase) throw new Error('Task update PostgreSQL proof pool not initialized.');
  return isolatedDatabase.pool;
}

async function expectMatchingCatalog(client: Pool | PoolClient): Promise<void> {
  const audit = await auditManifest(client, manifest);
  expect(audit.action, JSON.stringify(audit.objects, null, 2)).toBe(ACTION_SKIP);
  expect(audit.objects.every((object) => object.deltas.length === 0)).toBe(true);
}

async function inTransaction(run: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await requiredPool().connect();
  try {
    await client.query('BEGIN');
    await run(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

interface ReceiptInput {
  fundId?: number;
  taskId?: number;
  key?: string;
  hash?: string;
  createdBy?: number | null;
  responseBody?: unknown;
}

async function insertReceipt(client: Pool | PoolClient, input: ReceiptInput = {}): Promise<void> {
  const receiptFundId = input.fundId ?? fundId;
  const receiptTaskId = input.taskId ?? taskId;
  await client.query(
    `INSERT INTO task_update_commands
     (fund_id, task_id, idempotency_key, request_hash, response_body, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      receiptFundId,
      receiptTaskId,
      input.key ?? 'candidate-command',
      input.hash ?? 'a'.repeat(64),
      JSON.stringify(input.responseBody ?? { id: receiptTaskId, fundId: receiptFundId }),
      input.createdBy === undefined ? userId : input.createdBy,
    ]
  );
}
