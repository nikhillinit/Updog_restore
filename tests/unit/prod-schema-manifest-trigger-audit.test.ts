/**
 * T-A5 (WP-L3 Phase A, unit tier): `triggerDefinitions` / `functionDefinitions`
 * audit extension of `scripts/reconcile-prod-schema.mjs`, analogous to
 * manifest 0034's `indexDefinitions` mechanism.
 *
 * Trigger and function DDL cannot ride the additive-safe automated apply path
 * (`DROP TRIGGER IF EXISTS` is an unknown DROP for
 * `prod-schema-apply-policy.mjs`), so ANY trigger or function-body drift —
 * missing, disabled, or redefined — must surface as `ACTION_REFUSE_FOR_HUMAN`,
 * and the audit may end `ACTION_SKIP` only once the live
 * `tgenabled`/`pg_get_triggerdef` wiring AND the `pg_proc`-sourced function
 * body both match the manifest-pinned definitions. The real-database
 * counterpart lives in
 * `tests/integration/internal-economics/economics-schema.pg.test.ts`.
 */
// Default import on purpose: node-setup.ts vi.mock('fs') stubs the NAMED
// readFileSync export, but its ...actual spread preserves `default` as the
// real fs module - same pattern as the sibling reconcile/ledger tests.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ACTION_REFUSE_FOR_HUMAN,
  ACTION_SKIP,
  ReconcileError,
  auditManifest,
} from '../../scripts/reconcile-prod-schema.mjs';

const repoRoot = process.cwd();

interface ExpectedDefinition {
  exactDefinition: string;
  orderedFragments: string[];
  stringLiterals: string[];
}

interface TriggerDefinition {
  name: string;
  expectedDefinition: ExpectedDefinition;
}

interface IndexDefinition {
  name: string;
  expectedDefinition: ExpectedDefinition;
}

interface ConstraintDefinition {
  name: string;
  expectedDefinition: ExpectedDefinition;
}

interface ManifestTable {
  name: string;
  sharedTable?: boolean;
  columns?: Array<{
    name: string;
    type?: string;
    nullable: boolean;
    defaultExpression?: string | null;
    expectedDefaultExpression?: string;
    characterMaximumLength?: number | null;
    expectedCharacterMaximumLength?: number;
  }>;
  constraints?: string[];
  constraintDefinitions?: ConstraintDefinition[];
  indexes?: string[];
  indexDefinitions?: IndexDefinition[];
  triggerDefinitions?: TriggerDefinition[];
}

interface Manifest {
  name: string;
  order: number;
  description?: string;
  missingTablePolicy?: string;
  sqlFiles?: string[];
  allowedCreateTables?: string[];
  functionDefinitions?: Array<{ name: string; expectedDefinition: ExpectedDefinition }>;
  expectedTables?: ManifestTable[];
}

function loadManifest22(): Manifest {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        repoRoot,
        'scripts',
        'prod-schema-manifests',
        '22-internal-economics-policy-runs.json'
      ),
      'utf8'
    )
  ) as Manifest;
}

function loadManifest24(): Manifest {
  return JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'scripts', 'prod-schema-manifests', '24-internal-economics-linkage.json'),
      'utf8'
    )
  ) as Manifest;
}

function loadTaskUpdateManifest(): Manifest {
  return JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'scripts/prod-schema-manifests/36-task-update-commands.json'),
      'utf8'
    )
  ) as Manifest;
}

interface TriggerRow {
  table_name: string;
  tgname: string;
  tgenabled: string;
  definition: string;
}

interface FunctionRow {
  proname: string;
  definition: string;
}

interface MockCatalog {
  presentTables?: readonly string[];
  columns?: ReadonlyArray<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name?: string;
    is_nullable: 'YES' | 'NO';
    column_default?: string | null;
    character_maximum_length?: number | null;
  }>;
  constraints?: ReadonlyArray<{ table_name: string; conname: string; definition: string }>;
  indexes?: ReadonlyArray<{ tablename: string; indexname: string; indexdef: string }>;
  triggers?: readonly TriggerRow[];
  functions?: readonly FunctionRow[];
}

function createMockClient(catalog: MockCatalog) {
  return {
    query(text: string): Promise<{ rows: unknown[] }> {
      if (text.includes('information_schema.tables')) {
        return Promise.resolve({
          rows: (catalog.presentTables ?? []).map((table_name) => ({ table_name })),
        });
      }
      if (text.includes('information_schema.columns')) {
        return Promise.resolve({ rows: [...(catalog.columns ?? [])] });
      }
      if (text.includes('pg_get_triggerdef')) {
        return Promise.resolve({ rows: [...(catalog.triggers ?? [])] });
      }
      if (text.includes('pg_get_functiondef')) {
        return Promise.resolve({ rows: [...(catalog.functions ?? [])] });
      }
      if (text.includes('pg_get_constraintdef')) {
        return Promise.resolve({ rows: [...(catalog.constraints ?? [])] });
      }
      if (text.includes('FROM pg_indexes')) {
        return Promise.resolve({ rows: [...(catalog.indexes ?? [])] });
      }
      if (text.includes('SELECT EXISTS')) {
        return Promise.resolve({ rows: [{ populated: false }] });
      }
      throw new Error(`Unexpected mock query: ${text.slice(0, 120)}`);
    },
  };
}

function dataTypeFor(manifestType: string): { data_type: string; udt_name: string } {
  if (manifestType === 'varchar') {
    return { data_type: 'character varying', udt_name: 'varchar' };
  }
  if (manifestType === 'timestamptz') {
    return { data_type: 'timestamp with time zone', udt_name: 'timestamptz' };
  }
  return { data_type: manifestType, udt_name: manifestType };
}

/** A synthetic catalog in full agreement with manifest 22's declarations. */
function matchingCatalog(manifest: Manifest): Required<MockCatalog> {
  const tables = manifest.expectedTables ?? [];
  return {
    presentTables: tables.map((table) => table.name),
    columns: tables.flatMap((table) =>
      (table.columns ?? []).map((column) => ({
        table_name: table.name,
        column_name: column.name,
        ...dataTypeFor(column.type ?? 'text'),
        is_nullable: column.nullable ? ('YES' as const) : ('NO' as const),
        column_default: column.expectedDefaultExpression ?? column.defaultExpression ?? null,
        character_maximum_length:
          column.expectedCharacterMaximumLength ?? column.characterMaximumLength ?? null,
      }))
    ),
    constraints: tables.flatMap((table) =>
      (table.constraints ?? []).map((conname) => ({
        table_name: table.name,
        conname,
        definition:
          table.constraintDefinitions?.find((definition) => definition.name === conname)
            ?.expectedDefinition.exactDefinition ?? '',
      }))
    ),
    indexes: tables.flatMap((table) =>
      (table.indexes ?? []).map((indexname) => ({
        tablename: table.name,
        indexname,
        indexdef:
          table.indexDefinitions?.find((definition) => definition.name === indexname)
            ?.expectedDefinition.exactDefinition ?? '',
      }))
    ),
    triggers: tables.flatMap((table) =>
      (table.triggerDefinitions ?? []).map((trigger) => ({
        table_name: table.name,
        tgname: trigger.name,
        tgenabled: 'O',
        definition: trigger.expectedDefinition.exactDefinition,
      }))
    ),
    functions: (manifest.functionDefinitions ?? []).map((fn) => ({
      proname: fn.name,
      definition: fn.expectedDefinition.exactDefinition,
    })),
  };
}

describe('task update command catalog audit', () => {
  const manifest = loadTaskUpdateManifest();
  const tableName = 'task_update_commands';

  it('audits SKIP only when the receipt table, constraints, trigger, and function match', async () => {
    const audit = await auditManifest(createMockClient(matchingCatalog(manifest)), manifest);

    expect(audit.action).toBe(ACTION_SKIP);
    expect(audit.objects.every((object) => object.deltas.length === 0)).toBe(true);
  });

  it('reports a missing receipt table and refuses automated trigger creation', async () => {
    const catalog = matchingCatalog(manifest);
    const audit = await auditManifest(
      createMockClient({
        ...catalog,
        presentTables: [],
        columns: [],
        constraints: [],
        triggers: [],
      }),
      manifest
    );

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(audit.objects.find((object) => object.table === tableName)?.deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'missing-table', name: tableName }),
        expect.objectContaining({
          kind: 'missing-trigger',
          name: 'task_update_commands_forbid_update_trigger',
        }),
      ])
    );
  });

  it.each([
    { column: 'id', actual: null },
    { column: 'id', actual: "nextval('tasks_id_seq'::regclass)" },
    { column: 'created_at', actual: null },
    { column: 'created_at', actual: "'2000-01-01 00:00:00+00'::timestamp with time zone" },
  ])(
    'refuses receipt $column default drift to $actual on an empty table',
    async ({ column, actual }) => {
      const catalog = matchingCatalog(manifest);
      const audit = await auditManifest(
        createMockClient({
          ...catalog,
          columns: catalog.columns.map((entry) =>
            entry.column_name === column ? { ...entry, column_default: actual } : entry
          ),
        }),
        manifest
      );

      expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(audit.objects.find((object) => object.table === tableName)?.populated).toBe(false);
      expect(audit.objects.find((object) => object.table === tableName)?.deltas).toContainEqual({
        kind: 'column-default-mismatch',
        name: `${tableName}.${column}`,
        expected: manifest.expectedTables![0]!.columns!.find((entry) => entry.name === column)!
          .expectedDefaultExpression,
        actual,
        additiveSafe: false,
        humanReviewRequired: true,
      });
    }
  );

  it.each([
    { column: 'idempotency_key', actual: 16, expected: 128 },
    { column: 'request_hash', actual: 16, expected: 64 },
    { column: 'idempotency_key', actual: null, expected: 128 },
    { column: 'request_hash', actual: null, expected: 64 },
    { column: 'idempotency_key', actual: 256, expected: 128 },
    { column: 'request_hash', actual: 128, expected: 64 },
  ])(
    'refuses receipt $column width drift to $actual on an empty table',
    async ({ column, actual, expected }) => {
      const catalog = matchingCatalog(manifest);
      const audit = await auditManifest(
        createMockClient({
          ...catalog,
          columns: catalog.columns.map((entry) =>
            entry.column_name === column ? { ...entry, character_maximum_length: actual } : entry
          ),
        }),
        manifest
      );

      expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(audit.objects.find((object) => object.table === tableName)?.populated).toBe(false);
      expect(audit.objects.find((object) => object.table === tableName)?.deltas).toContainEqual({
        kind: 'column-length-mismatch',
        name: `${tableName}.${column}`,
        expected,
        actual,
        additiveSafe: false,
        humanReviewRequired: true,
      });
    }
  );

  it.each([null, 0, -1, 1.5, '128', Number.MAX_SAFE_INTEGER + 1])(
    'rejects malformed expectedCharacterMaximumLength %j on a column without a default pin',
    async (value) => {
      const malformed = {
        ...manifest,
        expectedTables: manifest.expectedTables!.map((table) => ({
          ...table,
          columns: table.columns!.map((column) =>
            column.name === 'idempotency_key'
              ? { ...column, expectedCharacterMaximumLength: value }
              : column
          ),
        })),
      };

      await expect(auditManifest(createMockClient({}), malformed)).rejects.toThrow(
        /expectedCharacterMaximumLength/
      );
    }
  );

  it.each([null, '', ' ', 42, {}])(
    'rejects malformed expectedDefaultExpression %j',
    async (value) => {
      const malformed = {
        ...manifest,
        expectedTables: manifest.expectedTables!.map((table) => ({
          ...table,
          columns: table.columns!.map((column) =>
            column.name === 'id' ? { ...column, expectedDefaultExpression: value } : column
          ),
        })),
      };

      await expect(auditManifest(createMockClient({}), malformed)).rejects.toThrow(
        /expectedDefaultExpression/
      );
    }
  );

  it.each([
    '22-internal-economics-policy-runs.json',
    '33-actuals-draft-revisions.json',
    '34-actuals-restatement-commands.json',
  ])(
    'preserves audits without opt-in defaults or widths, including legacy metadata in %s',
    async (file) => {
      const legacyManifest = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'scripts/prod-schema-manifests', file), 'utf8')
      ) as Manifest;
      const catalog = matchingCatalog(legacyManifest);
      expect(
        legacyManifest
          .expectedTables!.flatMap((table) => table.columns ?? [])
          .every(
            (column) =>
              column.expectedDefaultExpression === undefined &&
              column.expectedCharacterMaximumLength === undefined
          )
      ).toBe(true);
      const audit = await auditManifest(
        createMockClient({
          ...catalog,
          columns: catalog.columns.map((column) => ({
            ...column,
            column_default: 'legacy_default_not_audited()',
            character_maximum_length: column.data_type === 'character varying' ? 1 : null,
          })),
        }),
        legacyManifest
      );

      expect(audit.action).toBe(ACTION_SKIP);
      expect(audit.objects.every((object) => object.deltas.length === 0)).toBe(true);
    }
  );

  it.each(manifest.expectedTables![0]!.constraints!)(
    'reports missing receipt constraint %s',
    async (name) => {
      const catalog = matchingCatalog(manifest);
      const audit = await auditManifest(
        createMockClient({
          ...catalog,
          constraints: catalog.constraints.filter((constraint) => constraint.conname !== name),
        }),
        manifest
      );

      expect(audit.action).not.toBe(ACTION_SKIP);
      expect(audit.objects.find((object) => object.table === tableName)?.deltas).toContainEqual(
        expect.objectContaining({ kind: 'missing-constraint', name })
      );
    }
  );

  it.each([
    {
      name: 'task_update_commands_scope_unique',
      definition: 'UNIQUE (fund_id, task_id, idempotency_key, created_by)',
    },
    {
      name: 'task_update_commands_task_fund_fk',
      definition: 'FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE',
    },
    {
      name: 'task_update_commands_fund_id_funds_id_fk',
      definition: 'FOREIGN KEY (fund_id) REFERENCES users(id) ON DELETE CASCADE',
    },
    {
      name: 'task_update_commands_created_by_users_id_fk',
      definition: 'FOREIGN KEY (created_by) REFERENCES funds(id)',
    },
  ])(
    'refuses changed receipt constraint $name under the same name',
    async ({ name, definition }) => {
      const catalog = matchingCatalog(manifest);
      const audit = await auditManifest(
        createMockClient({
          ...catalog,
          constraints: catalog.constraints.map((constraint) =>
            constraint.conname === name ? { ...constraint, definition } : constraint
          ),
        }),
        manifest
      );

      expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(audit.objects.find((object) => object.table === tableName)?.deltas).toContainEqual(
        expect.objectContaining({ kind: 'constraint-definition-mismatch', name })
      );
    }
  );

  it.each(['missing', 'disabled', 'changed'] as const)(
    'refuses a %s receipt immutability trigger',
    async (state) => {
      const catalog = matchingCatalog(manifest);
      const triggers =
        state === 'missing'
          ? []
          : catalog.triggers.map((trigger) => ({
              ...trigger,
              tgenabled: state === 'disabled' ? 'D' : trigger.tgenabled,
              definition:
                state === 'changed'
                  ? trigger.definition.replace('BEFORE UPDATE', 'AFTER UPDATE')
                  : trigger.definition,
            }));
      const audit = await auditManifest(createMockClient({ ...catalog, triggers }), manifest);

      expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(audit.objects.find((object) => object.table === tableName)?.deltas).toContainEqual(
        expect.objectContaining({
          kind:
            state === 'missing'
              ? 'missing-trigger'
              : state === 'disabled'
                ? 'trigger-disabled'
                : 'trigger-definition-mismatch',
        })
      );
    }
  );

  it('refuses a same-named immutability function that permits updates', async () => {
    const catalog = matchingCatalog(manifest);
    const audit = await auditManifest(
      createMockClient({
        ...catalog,
        functions: [
          {
            proname: 'internal_economics_forbid_update',
            definition:
              'CREATE OR REPLACE FUNCTION public.internal_economics_forbid_update() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN RETURN NEW; END; $function$',
          },
        ],
      }),
      manifest
    );

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(
      audit.objects.find((object) => object.table === 'function:internal_economics_forbid_update')
        ?.deltas
    ).toContainEqual(expect.objectContaining({ kind: 'function-definition-mismatch' }));
  });
});

describe('manifest 22 trigger/function audit (T-A5)', () => {
  const manifest = loadManifest22();

  it('declares all four triggers and the shared function body', () => {
    const triggerNames = (manifest.expectedTables ?? []).flatMap((table) =>
      (table.triggerDefinitions ?? []).map((trigger) => trigger.name)
    );
    expect(triggerNames.sort()).toEqual(
      [
        'internal_capital_envelope_versions_forbid_update_trigger',
        'internal_economics_policy_versions_forbid_update_trigger',
        'internal_lp_economics_runs_forbid_update_trigger',
        'fund_snapshots_internal_economics_forbid_update_trigger',
      ].sort()
    );
    expect(manifest.functionDefinitions?.map((fn) => fn.name)).toEqual([
      'internal_economics_forbid_update',
    ]);
    expect(manifest.missingTablePolicy).toBe('create_or_repair');
    expect(manifest.allowedCreateTables).toEqual([
      'internal_capital_envelope_versions',
      'internal_economics_policy_versions',
      'internal_lp_economics_runs',
    ]);
  });

  it('types every declared column (G9 audit-SKIP lesson)', () => {
    const missing = (manifest.expectedTables ?? []).flatMap((table) =>
      (table.columns ?? [])
        .filter((column) => !column.type?.trim())
        .map((column) => `${table.name}.${column.name}`)
    );
    expect(missing).toEqual([]);
  });

  it('audits SKIP when tables, triggers, and function body all match', async () => {
    const client = createMockClient(matchingCatalog(manifest));
    const audit = await auditManifest(client, manifest);

    expect(audit.action).toBe(ACTION_SKIP);
    for (const object of audit.objects) {
      expect(object.deltas, `${object.table} deltas`).toEqual([]);
      expect(object.action, `${object.table} action`).toBe(ACTION_SKIP);
    }
  });

  it('REFUSES-FOR-HUMAN pre-reconciliation (tables and triggers absent)', async () => {
    const catalog = matchingCatalog(manifest);
    const client = createMockClient({
      // fund_snapshots exists in prod; the three new tables and all four
      // triggers do not until the operator applies 0045.
      presentTables: ['fund_snapshots'],
      columns: [],
      constraints: [],
      indexes: [],
      triggers: [],
      functions: [],
    });
    const audit = await auditManifest(client, manifest);

    expect(catalog.triggers.length).toBe(4);
    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    const fundSnapshotsObject = audit.objects.find((object) => object.table === 'fund_snapshots');
    expect(fundSnapshotsObject?.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(
      fundSnapshotsObject?.deltas.some(
        (delta: { kind: string }) => delta.kind === 'missing-trigger'
      )
    ).toBe(true);
  });

  it('REFUSES-FOR-HUMAN when a trigger definition drifts from the manifest pin', async () => {
    const catalog = matchingCatalog(manifest);
    const drifted = catalog.triggers.map((trigger) =>
      trigger.tgname === 'fund_snapshots_internal_economics_forbid_update_trigger'
        ? {
            ...trigger,
            definition: trigger.definition.replace(
              /WHEN \(.*\) EXECUTE/,
              "WHEN ((old.type)::text = 'INTERNAL_LP_ECONOMICS'::text) EXECUTE"
            ),
          }
        : trigger
    );
    const client = createMockClient({ ...catalog, triggers: drifted });
    const audit = await auditManifest(client, manifest);

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    const fundSnapshotsObject = audit.objects.find((object) => object.table === 'fund_snapshots');
    expect(
      fundSnapshotsObject?.deltas.some(
        (delta: { kind: string }) => delta.kind === 'trigger-definition-mismatch'
      )
    ).toBe(true);
  });

  it('REFUSES-FOR-HUMAN when a trigger is present but disabled', async () => {
    const catalog = matchingCatalog(manifest);
    const disabled = catalog.triggers.map((trigger) =>
      trigger.tgname === 'internal_lp_economics_runs_forbid_update_trigger'
        ? { ...trigger, tgenabled: 'D' }
        : trigger
    );
    const client = createMockClient({ ...catalog, triggers: disabled });
    const audit = await auditManifest(client, manifest);

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    const runsObject = audit.objects.find(
      (object) => object.table === 'internal_lp_economics_runs'
    );
    expect(
      runsObject?.deltas.some((delta: { kind: string }) => delta.kind === 'trigger-disabled')
    ).toBe(true);
  });

  it('REFUSES-FOR-HUMAN when the shared function body is redefined', async () => {
    const catalog = matchingCatalog(manifest);
    const client = createMockClient({
      ...catalog,
      functions: [
        {
          proname: 'internal_economics_forbid_update',
          definition:
            'CREATE OR REPLACE FUNCTION public.internal_economics_forbid_update() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN RETURN NEW; END; $function$',
        },
      ],
    });
    const audit = await auditManifest(client, manifest);

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    const functionObject = audit.objects.find(
      (object) => object.table === 'function:internal_economics_forbid_update'
    );
    expect(functionObject?.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(
      functionObject?.deltas.some(
        (delta: { kind: string }) => delta.kind === 'function-definition-mismatch'
      )
    ).toBe(true);
  });

  it('REFUSES-FOR-HUMAN when the shared function is missing entirely', async () => {
    const catalog = matchingCatalog(manifest);
    const client = createMockClient({ ...catalog, functions: [] });
    const audit = await auditManifest(client, manifest);

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    const functionObject = audit.objects.find(
      (object) => object.table === 'function:internal_economics_forbid_update'
    );
    expect(
      functionObject?.deltas.some((delta: { kind: string }) => delta.kind === 'missing-function')
    ).toBe(true);
  });

  it('rejects malformed triggerDefinitions instead of silently skipping them', async () => {
    const malformed: Manifest = {
      name: 'malformed-trigger-fixture',
      order: 999,
      missingTablePolicy: 'create_or_repair',
      expectedTables: [
        {
          name: 'internal_lp_economics_runs',
          columns: [],
          triggerDefinitions: [
            {
              name: 'internal_lp_economics_runs_forbid_update_trigger',
              // orderedFragments empty: must be rejected, mirroring the
              // indexDefinitions validation contract.
              expectedDefinition: {
                exactDefinition: 'CREATE TRIGGER x',
                orderedFragments: [],
                stringLiterals: [],
              },
            },
          ],
        },
      ],
    };
    const client = createMockClient({ presentTables: ['internal_lp_economics_runs'] });

    await expect(auditManifest(client, malformed)).rejects.toThrow(ReconcileError);
  });

  it('rejects malformed functionDefinitions', async () => {
    const malformed: Manifest = {
      name: 'malformed-function-fixture',
      order: 998,
      missingTablePolicy: 'create_or_repair',
      functionDefinitions: [
        {
          name: 'internal_economics_forbid_update',
          expectedDefinition: {
            exactDefinition: '',
            orderedFragments: ['CREATE'],
            stringLiterals: [],
          },
        },
      ],
      expectedTables: [{ name: 'internal_lp_economics_runs', columns: [] }],
    };
    const client = createMockClient({ presentTables: ['internal_lp_economics_runs'] });

    await expect(auditManifest(client, malformed)).rejects.toThrow(ReconcileError);
  });

  it('rejects duplicate trigger names within one table declaration', async () => {
    const duplicate: Manifest = {
      name: 'duplicate-trigger-fixture',
      order: 997,
      missingTablePolicy: 'create_or_repair',
      expectedTables: [
        {
          name: 'internal_lp_economics_runs',
          columns: [],
          triggerDefinitions: [
            {
              name: 'internal_lp_economics_runs_forbid_update_trigger',
              expectedDefinition: {
                exactDefinition: 'CREATE TRIGGER a',
                orderedFragments: ['CREATE TRIGGER'],
                stringLiterals: [],
              },
            },
            {
              name: 'internal_lp_economics_runs_forbid_update_trigger',
              expectedDefinition: {
                exactDefinition: 'CREATE TRIGGER b',
                orderedFragments: ['CREATE TRIGGER'],
                stringLiterals: [],
              },
            },
          ],
        },
      ],
    };
    const client = createMockClient({ presentTables: ['internal_lp_economics_runs'] });

    await expect(auditManifest(client, duplicate)).rejects.toThrow(ReconcileError);
  });
});

describe('manifest 24 economics-linkage trigger/function audit', () => {
  const manifest = loadManifest24();

  it('pins the reused immutable function and task-evidence update trigger', () => {
    const evidence = manifest.expectedTables?.find((table) => table.name === 'task_evidence_links');
    expect(evidence?.triggerDefinitions).toEqual([
      expect.objectContaining({
        name: 'task_evidence_links_forbid_update_trigger',
        expectedDefinition: expect.objectContaining({
          exactDefinition:
            'CREATE TRIGGER task_evidence_links_forbid_update_trigger BEFORE UPDATE ON public.task_evidence_links FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update()',
        }),
      }),
    ]);
    expect(manifest.functionDefinitions?.map((definition) => definition.name)).toEqual([
      'internal_economics_forbid_update',
    ]);
  });

  it('pins every linkage constraint definition', () => {
    for (const table of manifest.expectedTables ?? []) {
      expect(
        table.constraintDefinitions?.map((definition) => definition.name).sort(),
        `${table.name} constraint definitions`
      ).toEqual([...(table.constraints ?? [])].sort());
    }
  });

  it('REFUSES-FOR-HUMAN before the migrator-owned trigger migration and SKIPs once catalog pins match', async () => {
    const catalog = matchingCatalog(manifest);
    const before = await auditManifest(
      createMockClient({
        ...catalog,
        presentTables: ['internal_analysis_drafts', 'internal_analysis_references', 'tasks'],
        triggers: [],
      }),
      manifest
    );

    expect(before.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    const evidenceBefore = before.objects.find((object) => object.table === 'task_evidence_links');
    expect(
      evidenceBefore?.deltas.some((delta: { kind: string }) => delta.kind === 'missing-trigger')
    ).toBe(true);

    const after = await auditManifest(createMockClient(catalog), manifest);
    expect(after.action).toBe(ACTION_SKIP);
    expect(after.objects.every((object) => object.action === ACTION_SKIP)).toBe(true);
  });
});
