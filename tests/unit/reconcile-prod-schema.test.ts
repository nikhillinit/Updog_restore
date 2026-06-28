import { describe, expect, it } from 'vitest';

import {
  ACTION_APPLY_MISSING_DDL,
  ACTION_REFUSE_FOR_HUMAN,
  ACTION_SKIP,
  ReconcileError,
  assertApplyConfirmation,
  assertDirectDatabaseUrl,
  assertExpectedDatabase,
  auditManifest,
  decideObjectAction,
  parseReconcileArgs,
  runReconciliation,
  validateManifestSql,
  extractCreateTableNames,
} from '../../scripts/reconcile-prod-schema.mjs';

interface QueryCall {
  readonly text: string;
  readonly params?: readonly unknown[];
}

interface MockClientOptions {
  readonly database?: string;
  readonly presentTables?: readonly string[];
  readonly columns?: readonly {
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name?: string;
    is_nullable: 'YES' | 'NO';
  }[];
  readonly constraints?: readonly string[];
  readonly indexes?: readonly string[];
  readonly populatedTables?: readonly string[];
}

function createMockClient(options: MockClientOptions = {}) {
  const calls: QueryCall[] = [];
  const presentTables = new Set(options.presentTables ?? []);
  const constraints = new Set(options.constraints ?? []);
  const indexes = new Set(options.indexes ?? []);
  const populatedTables = new Set(options.populatedTables ?? []);

  return {
    calls,
    async query(text: string, params?: readonly unknown[]) {
      calls.push({ text, params });

      if (text.includes('has_database_privilege')) {
        return {
          rows: [
            {
              canCreateDatabaseObjects: true,
              canCreatePublicSchemaObjects: true,
              canCreateExtension: true,
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes('current_database()')) {
        return {
          rows: [
            {
              database: options.database ?? 'updog_test',
              user: 'tester',
              host: '127.0.0.1',
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes('information_schema.tables')) {
        const names = params?.[0] as string[];
        return {
          rows: names
            .filter((name) => presentTables.has(name))
            .map((table_name) => ({ table_name })),
          rowCount: names.length,
        };
      }

      if (text.includes('information_schema.columns')) {
        return {
          rows: [...(options.columns ?? [])],
          rowCount: options.columns?.length ?? 0,
        };
      }

      if (text.includes('FROM pg_constraint')) {
        const names = params?.[1] as string[];
        return {
          rows: names.filter((conname) => constraints.has(conname)).map((conname) => ({ conname })),
          rowCount: names.length,
        };
      }

      if (text.includes('FROM pg_indexes')) {
        const names = params?.[0] as string[];
        return {
          rows: names
            .filter((indexname) => indexes.has(indexname))
            .map((indexname) => ({ indexname })),
          rowCount: names.length,
        };
      }

      if (text.includes('SELECT EXISTS')) {
        const match = text.match(/FROM "([^"]+)"/);
        const tableName = match?.[1] ?? '';
        return {
          rows: [{ populated: populatedTables.has(tableName) }],
          rowCount: 1,
        };
      }

      if (text === 'SELECT pg_try_advisory_lock($1) AS acquired') {
        return { rows: [{ acquired: true }], rowCount: 1 };
      }

      if (text === 'SELECT pg_advisory_unlock($1)') {
        return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
      }

      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

const manifest = {
  name: 'fixture',
  expectedTables: [
    {
      name: 'tasks',
      columns: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'fund_id', type: 'integer', nullable: false },
        { name: 'title', type: 'varchar', nullable: false },
      ],
      constraints: ['tasks_fund_id_funds_id_fk'],
      indexes: ['idx_tasks_fund_created'],
    },
  ],
};

function fullShapeClient() {
  return createMockClient({
    presentTables: ['tasks'],
    columns: [
      {
        table_name: 'tasks',
        column_name: 'id',
        data_type: 'integer',
        udt_name: 'int4',
        is_nullable: 'NO',
      },
      {
        table_name: 'tasks',
        column_name: 'fund_id',
        data_type: 'integer',
        udt_name: 'int4',
        is_nullable: 'NO',
      },
      {
        table_name: 'tasks',
        column_name: 'title',
        data_type: 'character varying',
        udt_name: 'varchar',
        is_nullable: 'NO',
      },
    ],
    constraints: ['tasks_fund_id_funds_id_fk'],
    indexes: ['idx_tasks_fund_created'],
  });
}

describe('reconcile-prod-schema runner helpers', () => {
  it('defaults to audit-only mode', () => {
    expect(parseReconcileArgs([])).toMatchObject({
      apply: false,
      yes: false,
      manifestDir: 'scripts/prod-schema-manifests',
    });
  });

  it('requires --yes for apply mode', () => {
    expect(() => assertApplyConfirmation({ apply: true, yes: false })).toThrow(ReconcileError);
    expect(() => assertApplyConfirmation({ apply: true, yes: true })).not.toThrow();
  });

  it('refuses pooled database URLs', () => {
    expect(() =>
      assertDirectDatabaseUrl(
        'postgres://u:p@ep-snowy-boat-ad1z3h07-pooler.us-east-1.aws.neon.tech/db'
      )
    ).toThrow(/pooled database URL/);
  });

  it('asserts the expected database identity before apply', () => {
    expect(() =>
      assertExpectedDatabase({ database: 'wrong', user: 'u', host: null }, 'expected')
    ).toThrow(/identity mismatch/);
  });

  it('blocks undeclared CREATE TABLE statements in manifest SQL', () => {
    expect(() =>
      validateManifestSql({ name: 'fixture', allowedCreateTables: ['tasks'], expectedTables: [] }, [
        {
          path: 'fixture.sql',
          sql: '-- @drift-patch\nCREATE TABLE IF NOT EXISTS "unexpected_table" (id serial primary key);',
        },
      ])
    ).toThrow(/not declared/);
  });

  it('extracts CREATE TABLE IF NOT EXISTS names without treating IF as the table', () => {
    expect(
      extractCreateTableNames(
        '-- Replay safety: CREATE TABLE IF NOT EXISTS.\n-- @drift-patch\nCREATE TABLE IF NOT EXISTS "fund_calculation_modes" (id serial);'
      )
    ).toEqual(['fund_calculation_modes']);
  });

  it('blocks forbidden schema-management targets in manifest SQL', () => {
    expect(() =>
      validateManifestSql({ name: 'fixture', allowedCreateTables: ['tasks'], expectedTables: [] }, [
        { path: 'fixture.sql', sql: '-- @drift-patch\nSELECT * FROM drizzle_migrations;' },
      ])
    ).toThrow(/forbidden/);
  });

  it('requires generated or drift-patch markers on manifest SQL', () => {
    expect(() =>
      validateManifestSql({ name: 'fixture', allowedCreateTables: ['tasks'], expectedTables: [] }, [
        { path: 'fixture.sql', sql: 'CREATE TABLE IF NOT EXISTS "tasks" (id serial primary key);' },
      ])
    ).toThrow(/missing -- @generated or -- @drift-patch marker/);
  });
});

describe('reconcile-prod-schema shape decisions', () => {
  it('skips objects with full table, column, constraint, and index shape', async () => {
    const client = fullShapeClient();
    const audit = await auditManifest(client, manifest);

    expect(audit.action).toBe(ACTION_SKIP);
    expect(audit.objects[0]?.deltas).toEqual([]);
  });

  it('applies missing DDL when the table is absent', async () => {
    const client = createMockClient();
    const audit = await auditManifest(client, manifest);

    expect(audit.action).toBe(ACTION_APPLY_MISSING_DDL);
    expect(audit.objects[0]?.deltas.map((delta) => delta.kind)).toContain('missing-table');
  });

  it('applies additive-safe missing constraints and indexes regardless of row count', async () => {
    const client = createMockClient({
      presentTables: ['tasks'],
      populatedTables: ['tasks'],
      columns: [
        {
          table_name: 'tasks',
          column_name: 'id',
          data_type: 'integer',
          is_nullable: 'NO',
        },
        {
          table_name: 'tasks',
          column_name: 'fund_id',
          data_type: 'integer',
          is_nullable: 'NO',
        },
        {
          table_name: 'tasks',
          column_name: 'title',
          data_type: 'character varying',
          udt_name: 'varchar',
          is_nullable: 'NO',
        },
      ],
    });
    const audit = await auditManifest(client, manifest);

    expect(audit.action).toBe(ACTION_APPLY_MISSING_DDL);
    expect(audit.objects[0]?.deltas.map((delta) => delta.kind)).toEqual([
      'missing-constraint',
      'missing-index',
    ]);
  });

  it('refuses non-additive deltas on populated tables', () => {
    expect(
      decideObjectAction({
        tablePresent: true,
        populated: true,
        deltas: [{ kind: 'column-type-mismatch', name: 'tasks.title', additiveSafe: false }],
      })
    ).toBe(ACTION_REFUSE_FOR_HUMAN);
  });

  it('audit-only mode does not issue mutation queries', async () => {
    const client = fullShapeClient();
    const output: string[] = [];

    await runReconciliation({
      client,
      manifests: [manifest],
      apply: false,
      stdout: { write: (chunk: string) => output.push(chunk) },
    });

    expect(output.join('')).toContain('Audit-only mode');
    expect(
      client.calls.some((call) => /\bBEGIN\b|INSERT INTO|CREATE TABLE|COMMIT/.test(call.text))
    ).toBe(false);
  });

  it('apply mode performs no mutation when all manifest shapes already match', async () => {
    const client = fullShapeClient();
    const output: string[] = [];

    await runReconciliation({
      client,
      manifests: [manifest],
      apply: true,
      stdout: { write: (chunk: string) => output.push(chunk) },
    });

    expect(output.join('')).toContain('no DDL applied');
    expect(
      client.calls.some((call) => /\bBEGIN\b|INSERT INTO|CREATE TABLE|COMMIT/.test(call.text))
    ).toBe(false);
  });
});
