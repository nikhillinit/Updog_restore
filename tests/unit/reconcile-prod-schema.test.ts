// Default import on purpose: node-setup.ts vi.mock('fs') stubs the NAMED
// readFileSync export, but its ...actual spread preserves `default` as the
// real fs module - same pattern as the sibling ledger/sentinel tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  ACTION_APPLY_MISSING_DDL,
  ACTION_REFUSE_FOR_HUMAN,
  ACTION_SKIP,
  assertPrepared0053G3ReleaseGateHardeningCapability,
  buildLockTimeApplyVectorV1,
  MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
  MISSING_TABLE_POLICY_EXISTING_REQUIRED,
  ReconcileError,
  RECONCILE_LOCK_ID,
  prepare0053G3ReleaseGateHardeningCapability,
  parseLockTimeApplyVectorV1,
  selectExact0053G3ReleaseGateHardeningApply,
  assertApplyConfirmation,
  assertDirectDatabaseUrl,
  assertExpectedDatabase,
  auditManifest,
  decideObjectAction,
  dropStatements,
  manifestChecksum,
  parseReconcileArgs,
  runReconciliation,
  runReconcileCli,
  statementHashes,
  validateDropObjects,
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
  readonly constraints?: readonly (
    | string
    | {
        table_name: string;
        conname: string;
        definition: string;
      }
  )[];
  readonly indexes?: readonly (
    | string
    | {
        tablename: string;
        indexname: string;
        indexdef: string;
      }
  )[];
  readonly populatedTables?: readonly string[];
  readonly advisoryLockAcquired?: boolean;
  /** When true, DROP statements do NOT mutate mock state - simulates a drop
   * that silently fails to take effect, so the post-apply audit must catch it. */
  readonly dropsHaveNoEffect?: boolean;
}

function createMockClient(options: MockClientOptions = {}) {
  const calls: QueryCall[] = [];
  const presentTables = new Set(options.presentTables ?? []);
  const constraintRows = (options.constraints ?? []).map((constraint) =>
    typeof constraint === 'string'
      ? { table_name: undefined, conname: constraint, definition: undefined }
      : constraint
  );
  const constraints = new Set(constraintRows.map((constraint) => constraint.conname));
  const indexRows = (options.indexes ?? []).map((index) =>
    typeof index === 'string'
      ? {
          tablename: options.presentTables?.[0],
          indexname: index,
          indexdef: undefined,
        }
      : index
  );
  const indexes = new Set(indexRows.map((index) => index.indexname));
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
        const tableNames = params?.[0] as string[];
        const names = params?.[1] as string[];
        return {
          rows: constraintRows
            .filter(
              (constraint) =>
                constraints.has(constraint.conname) &&
                names.includes(constraint.conname) &&
                (constraint.table_name === undefined || tableNames.includes(constraint.table_name))
            )
            .map((constraint) => ({
              table_name: constraint.table_name ?? tableNames[0],
              conname: constraint.conname,
              definition: constraint.definition,
            })),
          rowCount: names.length,
        };
      }

      if (text.includes('FROM pg_indexes')) {
        const names = params?.[0] as string[];
        return {
          rows: indexRows
            .filter((index) => indexes.has(index.indexname) && names.includes(index.indexname))
            .map((index) =>
              text.includes('tablename')
                ? index
                : {
                    indexname: index.indexname,
                  }
            ),
          rowCount: names.length,
        };
      }

      if (text.includes('FROM pg_trigger') || text.includes('FROM pg_proc')) {
        return { rows: [], rowCount: 0 };
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
        return { rows: [{ acquired: options.advisoryLockAcquired ?? true }], rowCount: 1 };
      }

      if (text === 'SELECT pg_advisory_unlock($1)') {
        return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
      }

      const dropIndexMatch = text.match(/^DROP INDEX IF EXISTS "([^"]+)"$/);
      if (dropIndexMatch?.[1]) {
        if (!options.dropsHaveNoEffect) {
          indexes.delete(dropIndexMatch[1]);
        }
        return { rows: [], rowCount: 0 };
      }

      const dropConstraintMatch = text.match(
        /^ALTER TABLE "[^"]+" DROP CONSTRAINT IF EXISTS "([^"]+)"$/
      );
      if (dropConstraintMatch?.[1]) {
        if (!options.dropsHaveNoEffect) {
          constraints.delete(dropConstraintMatch[1]);
        }
        return { rows: [], rowCount: 0 };
      }

      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text) || text.startsWith('SET ')) {
        return { rows: [], rowCount: 0 };
      }

      if (
        text.includes('CREATE TABLE IF NOT EXISTS') ||
        text.includes('CREATE UNIQUE INDEX IF NOT EXISTS')
      ) {
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('"committed_at" IS NOT NULL')) {
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('INSERT INTO')) {
        return { rows: [{ id: 1 }], rowCount: 1 };
      }

      if (text.includes('UPDATE')) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

const manifest = {
  name: 'fixture',
  missingTablePolicy: MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
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

const activeDedupeIndexName = 'fund_scenario_calc_runs_active_dedup_idx';
const activeDedupeExactDefinition =
  "CREATE UNIQUE INDEX fund_scenario_calc_runs_active_dedup_idx ON public.fund_scenario_calculation_runs USING btree (scenario_set_id, source_config_id, source_config_version, COALESCE(hash_kind, 'scenario-input-hash-v1'::character varying), input_hash) WHERE ((status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying, 'completed'::character varying])::text[]))";
const activeDedupeExpectedDefinition = {
  exactDefinition: activeDedupeExactDefinition,
  orderedFragments: [
    'CREATE UNIQUE INDEX',
    'ON public.fund_scenario_calculation_runs',
    'scenario_set_id',
    'source_config_id',
    'source_config_version',
    'COALESCE(hash_kind',
    'input_hash',
    'WHERE',
    'status',
  ],
  stringLiterals: ['scenario-input-hash-v1', 'queued', 'running', 'completed'],
};
const definitionAwareIndexManifest = {
  name: 'definition-aware-index-fixture',
  missingTablePolicy: MISSING_TABLE_POLICY_EXISTING_REQUIRED,
  expectedTables: [
    {
      name: 'fund_scenario_calculation_runs',
      columns: [{ name: 'id', type: 'uuid', nullable: false }],
      constraints: [],
      indexes: [activeDedupeIndexName],
      indexDefinitions: [
        {
          name: activeDedupeIndexName,
          expectedDefinition: activeDedupeExpectedDefinition,
        },
      ],
    },
  ],
};

const linkageForeignKeyExpectedDefinition = {
  exactDefinition:
    'FOREIGN KEY (economics_reference_id, fund_id) REFERENCES internal_lp_economics_runs(id, fund_id) ON DELETE RESTRICT',
  orderedFragments: [
    'FOREIGN KEY',
    '(economics_reference_id, fund_id)',
    'REFERENCES internal_lp_economics_runs(id, fund_id)',
    'ON DELETE RESTRICT',
  ],
  stringLiterals: [],
};
const taskOwnershipUniqueExpectedDefinition = {
  exactDefinition: 'UNIQUE (id, fund_id)',
  orderedFragments: ['UNIQUE', '(id, fund_id)'],
  stringLiterals: [],
};
const targetCouplingExpectedDefinition = {
  exactDefinition:
    "CHECK ((target_kind = 'analysis_reference' AND analysis_reference_id IS NOT NULL AND economics_run_id IS NULL) OR (target_kind = 'internal_economics_run' AND economics_run_id IS NOT NULL AND analysis_reference_id IS NULL))",
  orderedFragments: [
    'CHECK',
    "target_kind = 'analysis_reference'",
    'analysis_reference_id IS NOT NULL',
    'economics_run_id IS NULL',
    "target_kind = 'internal_economics_run'",
    'economics_run_id IS NOT NULL',
    'analysis_reference_id IS NULL',
  ],
  stringLiterals: ['analysis_reference', 'internal_economics_run'],
};

function definitionAwareConstraintManifest(
  table: string,
  name: string,
  expectedDefinition: {
    exactDefinition: string;
    orderedFragments: string[];
    stringLiterals: string[];
  }
) {
  return {
    name: 'definition-aware-constraint-fixture',
    missingTablePolicy: MISSING_TABLE_POLICY_EXISTING_REQUIRED,
    expectedTables: [
      {
        name: table,
        columns: [],
        constraints: [name],
        constraintDefinitions: [{ name, expectedDefinition }],
        indexes: [],
      },
    ],
  };
}

describe('reconcile-prod-schema runner helpers', () => {
  it('pins 0053 capability to canonical manifest and raw migration bytes', async () => {
    await expect(prepare0053G3ReleaseGateHardeningCapability()).resolves.toMatchObject({
      manifestPath: 'scripts/prod-schema-manifests/30-g3-release-gate-hardening.json',
      manifestName: 'g3-release-gate-hardening',
      sqlPath: 'migrations/0053_g3_release_gate_hardening.sql',
      migrationSha256: '0a4c00cea6e20982db391be88f143bf4e1d4bc529b68e6b986530fc3354c9ea5',
    });
  });

  it('rejects a post-binding replacement of selected 0053 SQL bytes', async () => {
    const capability = await prepare0053G3ReleaseGateHardeningCapability();
    const manifest = capability.manifests.find(
      (candidate) => candidate.name === capability.manifestName
    );
    await expect(
      assertPrepared0053G3ReleaseGateHardeningCapability({
        capability,
        prepared: {
          manifest,
          sqlFiles: [{ path: capability.sqlPath, checksum: '0'.repeat(64) }],
          dropStatements: [],
        },
      })
    ).rejects.toThrow(/pinned canonical bytes/i);
  });

  it('selects only target from complete exact lock-time audit vector', async () => {
    const target = await prepare0053G3ReleaseGateHardeningCapability();
    const preparedManifests = target.manifests.map((manifest) => ({
      manifest,
      dropStatements: [],
    }));
    const targetPrepared = preparedManifests.find(
      (prepared) => prepared.manifest.name === target.manifestName
    );
    const audits = target.manifests.map((manifest) => ({
      manifest: manifest.name,
      action: manifest.name === target.manifestName ? ACTION_APPLY_MISSING_DDL : ACTION_SKIP,
      objects:
        manifest.name === target.manifestName
          ? [
              {
                table: 'fixture_target',
                present: false,
                populated: false,
                action: ACTION_APPLY_MISSING_DDL,
                deltas: [],
              },
            ]
          : [],
    }));
    expect(
      selectExact0053G3ReleaseGateHardeningApply({
        preparedManifests,
        audits,
        target,
      })
    ).toBe(targetPrepared);
    expect(() =>
      selectExact0053G3ReleaseGateHardeningApply({
        preparedManifests: [...preparedManifests].reverse(),
        audits,
        target,
      })
    ).toThrow(/complete audit vector|canonical/i);
  });

  it('rejects malformed per-object audit action even when top-level vector is valid', async () => {
    const target = await prepare0053G3ReleaseGateHardeningCapability();
    const preparedManifests = target.manifests.map((manifest) => ({
      manifest,
      dropStatements: [],
    }));
    const audits = target.manifests.map((manifest) => ({
      manifest: manifest.name,
      action: manifest.name === target.manifestName ? ACTION_APPLY_MISSING_DDL : ACTION_SKIP,
      objects:
        manifest.name === target.manifestName ? [{ action: 'UNRECOGNIZED', deltas: [] }] : [],
    }));

    expect(() =>
      selectExact0053G3ReleaseGateHardeningApply({
        preparedManifests,
        audits,
        target,
      })
    ).toThrow(/malformed audit vector/i);
  });

  it('rejects every non-exact lock-time selector vector', async () => {
    const target = await prepare0053G3ReleaseGateHardeningCapability();
    const preparedManifests = target.manifests.map((manifest) => ({
      manifest,
      dropStatements: [],
    }));
    const exactAudits = target.manifests.map((manifest) => ({
      manifest: manifest.name,
      action: manifest.name === target.manifestName ? ACTION_APPLY_MISSING_DDL : ACTION_SKIP,
      objects:
        manifest.name === target.manifestName
          ? [
              {
                table: 'fixture_target',
                present: false,
                populated: false,
                action: ACTION_APPLY_MISSING_DDL,
                deltas: [],
              },
            ]
          : [],
    }));
    const validObject = {
      table: 'fixture_table',
      present: true,
      populated: false,
      action: ACTION_SKIP,
      deltas: [],
    };
    const cases = [
      ['missing', () => exactAudits.slice(1)],
      ['duplicate', () => [...exactAudits, exactAudits[0]]],
      [
        'unknown',
        () =>
          exactAudits.map((audit, index) =>
            index === 0 ? { ...audit, manifest: 'unknown' } : audit
          ),
      ],
      [
        'malformed object action',
        () =>
          exactAudits.map((audit, index) =>
            index === 0
              ? { ...audit, objects: [{ ...validObject, action: 'UNRECOGNIZED' }] }
              : audit
          ),
      ],
      [
        'malformed delta',
        () =>
          exactAudits.map((audit, index) =>
            index === 0 ? { ...audit, objects: [{ ...validObject, deltas: [{ kind: 7 }] }] } : audit
          ),
      ],
      [
        'extra apply',
        () =>
          exactAudits.map((audit) =>
            audit.manifest === target.manifestName
              ? audit
              : { ...audit, action: ACTION_APPLY_MISSING_DDL }
          ),
      ],
      [
        'refusal',
        () =>
          exactAudits.map((audit) =>
            audit.manifest === target.manifestName
              ? { ...audit, action: ACTION_REFUSE_FOR_HUMAN }
              : audit
          ),
      ],
      [
        'target skip',
        () =>
          exactAudits.map((audit) =>
            audit.manifest === target.manifestName ? { ...audit, action: ACTION_SKIP } : audit
          ),
      ],
      [
        'destructive object state',
        () =>
          exactAudits.map((audit, index) =>
            index === 0
              ? {
                  ...audit,
                  objects: [
                    { ...validObject, deltas: [{ kind: 'drop-object', additiveSafe: true }] },
                  ],
                }
              : audit
          ),
      ],
    ];

    for (const [name, makeAudits] of cases) {
      expect(
        () =>
          selectExact0053G3ReleaseGateHardeningApply({
            preparedManifests,
            audits: makeAudits(),
            target,
          }),
        name
      ).toThrow(`0053 exact target-only`);
    }
  });

  it('rejects contradictory aggregate object actions and governs non-array objects', async () => {
    const target = await prepare0053G3ReleaseGateHardeningCapability();
    const preparedManifests = target.manifests.map((manifest) => ({
      manifest,
      dropStatements: [],
    }));
    const exactAudits = target.manifests.map((manifest) => ({
      manifest: manifest.name,
      action: manifest.name === target.manifestName ? ACTION_APPLY_MISSING_DDL : ACTION_SKIP,
      objects:
        manifest.name === target.manifestName
          ? [
              {
                table: 'fixture_target',
                present: false,
                populated: false,
                action: ACTION_APPLY_MISSING_DDL,
                deltas: [],
              },
            ]
          : [],
    }));
    const object = {
      table: 'fixture_table',
      present: true,
      populated: false,
      action: ACTION_SKIP,
      deltas: [],
    };

    const cases = [
      [
        'target APPLY with object SKIP',
        exactAudits.map((audit) =>
          audit.manifest === target.manifestName ? { ...audit, objects: [object] } : audit
        ),
      ],
      [
        'non-target SKIP with object APPLY',
        exactAudits.map((audit) =>
          audit.manifest === target.manifestName
            ? audit
            : { ...audit, objects: [{ ...object, action: ACTION_APPLY_MISSING_DDL }] }
        ),
      ],
      [
        'non-array objects',
        exactAudits.map((audit) =>
          audit.manifest === target.manifestName ? { ...audit, objects: {} } : audit
        ),
      ],
    ];

    for (const [name, audits] of cases) {
      expect(
        () =>
          selectExact0053G3ReleaseGateHardeningApply({
            preparedManifests,
            audits,
            target,
          }),
        name
      ).toThrow(ReconcileError);
    }
  });

  it('builds and parses canonical lock-time apply marker without sensitive fields', async () => {
    const target = await prepare0053G3ReleaseGateHardeningCapability();
    const preparedManifests = target.manifests.map((manifest) => ({
      manifest,
      dropStatements: [],
    }));
    const audits = target.manifests.map((manifest) => ({
      manifest: manifest.name,
      action: manifest.name === target.manifestName ? ACTION_APPLY_MISSING_DDL : ACTION_SKIP,
      objects: [],
    }));
    const marker = buildLockTimeApplyVectorV1({ preparedManifests, audits, target });
    expect(marker).toMatch(/^PROD_SCHEMA_LOCK_TIME_VECTOR_V1=\{/);
    expect(parseLockTimeApplyVectorV1(marker, { preparedManifests, target })).toMatchObject({
      schemaVersion: 1,
      source: 'lock-time-audit',
      lockId: RECONCILE_LOCK_ID,
    });
  });

  it('rejects every non-canonical lock-time marker', async () => {
    const target = await prepare0053G3ReleaseGateHardeningCapability();
    const preparedManifests = target.manifests.map((manifest) => ({
      manifest,
      dropStatements: [],
    }));
    const audits = target.manifests.map((manifest) => ({
      manifest: manifest.name,
      action: manifest.name === target.manifestName ? ACTION_APPLY_MISSING_DDL : ACTION_SKIP,
      objects: [],
    }));
    const marker = buildLockTimeApplyVectorV1({ preparedManifests, audits, target });
    const prefix = 'PROD_SCHEMA_LOCK_TIME_VECTOR_V1=';
    const vector = JSON.parse(marker.slice(prefix.length));
    const cases = [
      ['absent', 'ordinary reconciler output'],
      ['duplicate', `${marker}\n${marker}`],
      ['malformed JSON', `${prefix}{`],
      [
        'reordered decisions',
        `${prefix}${JSON.stringify({ ...vector, decisions: [...vector.decisions].reverse() })}`,
      ],
      ['extra key', `${prefix}${JSON.stringify({ ...vector, extra: 'no' })}`],
      [
        'target mismatch',
        `${prefix}${JSON.stringify({
          ...vector,
          target: { ...vector.target, manifestName: 'not-g3-release-gate-hardening' },
        })}`,
      ],
      [
        'pin mismatch',
        `${prefix}${JSON.stringify({
          ...vector,
          target: { ...vector.target, migrationSha256: '0'.repeat(64) },
        })}`,
      ],
      [
        'sensitive extra content',
        `${prefix}${JSON.stringify({ ...vector, databaseUrl: 'postgres://x' })}`,
      ],
    ];

    for (const [name, output] of cases) {
      expect(() => parseLockTimeApplyVectorV1(output, { preparedManifests, target }), name).toThrow(
        /lock-time apply vector/i
      );
    }
  });

  it('does not unlock or mutate after lock contention', async () => {
    const target = await prepare0053G3ReleaseGateHardeningCapability();
    const client = createMockClient({ advisoryLockAcquired: false });
    const output: string[] = [];

    await expect(
      runReconciliation({
        client,
        manifests: target.manifests,
        apply: true,
        capability: target,
        stdout: { write: (chunk: string) => output.push(chunk) },
      })
    ).rejects.toMatchObject({ details: { kind: 'advisory-lock-contended' } });

    const queries = client.calls.map((call) => call.text);
    expect(queries.filter((text) => text === 'SELECT pg_advisory_unlock($1)')).toHaveLength(0);
    expect(
      queries.some(
        (text) =>
          text.startsWith('SET ') ||
          /^(BEGIN|COMMIT|ROLLBACK)$/.test(text) ||
          /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(text)
      )
    ).toBe(false);
    expect(output.join('')).not.toContain('PROD_SCHEMA_LOCK_TIME_VECTOR_V1=');
  });

  it('unlocks exactly once without marker or durable mutation after acquired-lock rejection', async () => {
    const target = await prepare0053G3ReleaseGateHardeningCapability();
    const client = createMockClient();
    const output: string[] = [];

    await expect(
      runReconciliation({
        client,
        manifests: target.manifests,
        apply: true,
        capability: target,
        stdout: { write: (chunk: string) => output.push(chunk) },
      })
    ).rejects.toMatchObject({ details: { kind: expect.any(String) } });

    const queries = client.calls.map((call) => call.text);
    expect(queries.filter((text) => text === 'SELECT pg_advisory_unlock($1)')).toHaveLength(1);
    expect(
      queries.some(
        (text) =>
          text.startsWith('SET ') ||
          /^(BEGIN|COMMIT|ROLLBACK)$/.test(text) ||
          /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(text)
      )
    ).toBe(false);
    expect(output.join('')).not.toContain('PROD_SCHEMA_LOCK_TIME_VECTOR_V1=');
  });

  it('admits only exact 0053 action-specific apply capability', () => {
    expect(() =>
      parseReconcileArgs(['--apply', '--yes', '--apply-0053-g3-release-gate-hardening'])
    ).not.toThrow();
    expect(() => parseReconcileArgs(['--apply', '--yes'])).toThrow(
      /production schema mutation mechanically blocked/i
    );
    expect(() =>
      parseReconcileArgs([
        '--apply',
        '--yes',
        '--apply-0053-g3-release-gate-hardening',
        '--manifest-dir=tmp',
      ])
    ).toThrow(/production schema mutation mechanically blocked/i);
  });

  it('constructs client only after valid 0053 capability admission', async () => {
    const clientFactory = vi.fn(() => ({
      connect: vi.fn().mockRejectedValue(new Error('test connection refusal')),
      end: vi.fn().mockResolvedValue(undefined),
    }));
    await expect(
      runReconcileCli({
        argv: ['--apply', '--yes', '--apply-0053-g3-release-gate-hardening'],
        env: { DATABASE_URL: 'postgres://operator:secret@localhost/updog' },
        clientFactory,
      })
    ).resolves.toBe(1);
    expect(clientFactory).toHaveBeenCalledWith({
      connectionString: 'postgres://operator:secret@localhost/updog',
    });
  });

  it.each([
    [['--apply', '--yes']],
    [['--apply', '--yes', '--apply-0053-g3-release-gate-hardening', '--apply']],
    [['--apply', '--yes', '--apply-0053-g3-release-gate-hardening', '--yes']],
    [['--apply', '--yes', '--apply-0053-g3-release-gate-hardening', '--unknown']],
    [['--apply', '--yes', '--apply-0053-g3-release-gate-hardening', '--manifest-dir', 'tmp']],
    [['--apply', '--yes', '--apply-0053-g3-release-gate-hardening', '--manifest-dir=tmp']],
    [['--apply', '--yes', '--apply-0053-g3-release-gate-hardening', '--manifest-dir']],
  ])('rejects invalid apply argv before client construction: %o', async (argv) => {
    const clientFactory = vi.fn();
    await expect(
      runReconcileCli({
        argv,
        env: { DATABASE_URL: 'postgres://operator:secret@localhost/updog' },
        clientFactory,
      })
    ).rejects.toMatchObject({ details: { kind: 'production-mutation-blocked' } });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it.each([[''], [undefined], ['tmp']])(
    'rejects own manifest-dir environment property before client construction: %o',
    async (manifestDir) => {
      const clientFactory = vi.fn();
      await expect(
        runReconcileCli({
          argv: ['--apply', '--yes', '--apply-0053-g3-release-gate-hardening'],
          env: {
            DATABASE_URL: 'postgres://operator:secret@localhost/updog',
            UPDOG_SCHEMA_MANIFEST_DIR: manifestDir,
          },
          clientFactory,
        })
      ).rejects.toMatchObject({ details: { kind: 'production-mutation-blocked' } });
      expect(clientFactory).not.toHaveBeenCalled();
    }
  );

  it('defaults to audit-only mode', () => {
    expect(parseReconcileArgs([])).toMatchObject({
      apply: false,
      yes: false,
      manifestDir: 'scripts/prod-schema-manifests',
    });
  });

  it('mechanically blocks apply mode regardless of confirmation', () => {
    expect(() => assertApplyConfirmation({ apply: true, yes: false })).toThrow(
      /production schema mutation is mechanically blocked/i
    );
    expect(() => assertApplyConfirmation({ apply: true, yes: true })).toThrow(
      /production schema mutation is mechanically blocked/i
    );
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

  it('requires index definitions to target a named expected index', () => {
    expect(() =>
      validateManifestSql(
        {
          name: 'bad-index-definition-fixture',
          expectedTables: [
            {
              name: 'tasks',
              indexes: [],
              indexDefinitions: [
                {
                  name: 'idx_tasks_fund_created',
                  expectedDefinition: {
                    orderedFragments: ['CREATE INDEX'],
                    stringLiterals: [],
                  },
                },
              ],
            },
          ],
        },
        []
      )
    ).toThrow(ReconcileError);
  });

  it('requires constraint definitions to target a named expected constraint exactly once', () => {
    expect(() =>
      validateManifestSql(
        {
          name: 'bad-constraint-definition-fixture',
          expectedTables: [
            {
              name: 'tasks',
              constraints: ['tasks_id_fund_unique'],
              constraintDefinitions: [
                {
                  name: 'other_constraint',
                  expectedDefinition: taskOwnershipUniqueExpectedDefinition,
                },
              ],
            },
          ],
        },
        []
      )
    ).toThrow(ReconcileError);

    expect(() =>
      validateManifestSql(
        {
          name: 'duplicate-constraint-definition-fixture',
          expectedTables: [
            {
              name: 'tasks',
              constraints: ['tasks_id_fund_unique'],
              constraintDefinitions: [
                {
                  name: 'tasks_id_fund_unique',
                  expectedDefinition: taskOwnershipUniqueExpectedDefinition,
                },
                {
                  name: 'tasks_id_fund_unique',
                  expectedDefinition: taskOwnershipUniqueExpectedDefinition,
                },
              ],
            },
          ],
        },
        []
      )
    ).toThrow(ReconcileError);
  });
});

describe('reconcile-prod-schema shape decisions', () => {
  it('skips objects with full table, column, constraint, and index shape', async () => {
    const client = fullShapeClient();
    const audit = await auditManifest(client, manifest);

    expect(audit.action).toBe(ACTION_SKIP);
    expect(audit.missingTablePolicy).toBe(MISSING_TABLE_POLICY_CREATE_OR_REPAIR);
    expect(audit.objects[0]?.deltas).toEqual([]);
  });

  it('finds indexes stored under PostgreSQL-truncated identifiers', async () => {
    const expectedIndexName = 'substrate_shadow_reconciliations_fund_key_input_null_hash_unique';
    const storedIndexName = expectedIndexName.slice(0, 63);
    expect(expectedIndexName).toHaveLength(64);

    const client = createMockClient({
      presentTables: ['tasks'],
      columns: [
        {
          table_name: 'tasks',
          column_name: 'id',
          data_type: 'integer',
          udt_name: 'int4',
          is_nullable: 'NO',
        },
      ],
      indexes: [storedIndexName],
    });
    const audit = await auditManifest(client, {
      name: 'long-index-fixture',
      missingTablePolicy: MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
      expectedTables: [
        {
          name: 'tasks',
          columns: [{ name: 'id', type: 'integer', nullable: false }],
          constraints: [],
          indexes: [expectedIndexName],
        },
      ],
    });

    expect(audit.action).toBe(ACTION_SKIP);
    expect(audit.objects[0]?.deltas).toEqual([]);
    expect(client.calls.find((call) => call.text.includes('FROM pg_indexes'))?.params).toEqual([
      [storedIndexName],
    ]);
  });

  it('skips a matching definition-aware unique index', async () => {
    const formattingVariant = activeDedupeExactDefinition
      .replace(activeDedupeIndexName, `"${activeDedupeIndexName}"`)
      .replace(
        'public.fund_scenario_calculation_runs',
        '"public" . "fund_scenario_calculation_runs"'
      )
      .replace(/, /g, ' ,   ');
    const client = createMockClient({
      presentTables: ['fund_scenario_calculation_runs'],
      columns: [
        {
          table_name: 'fund_scenario_calculation_runs',
          column_name: 'id',
          data_type: 'uuid',
          udt_name: 'uuid',
          is_nullable: 'NO',
        },
      ],
      indexes: [
        {
          tablename: 'fund_scenario_calculation_runs',
          indexname: activeDedupeIndexName,
          indexdef: formattingVariant,
        },
      ],
    });

    const audit = await auditManifest(client, definitionAwareIndexManifest);

    expect(audit.action).toBe(ACTION_SKIP);
    expect(audit.objects[0]?.deltas).toEqual([]);
  });

  it('refuses a populated table with the legacy same-name four-key index', async () => {
    const legacyDefinition =
      "CREATE UNIQUE INDEX fund_scenario_calc_runs_active_dedup_idx ON public.fund_scenario_calculation_runs USING btree (scenario_set_id, source_config_id, source_config_version, input_hash) WHERE ((status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying, 'completed'::character varying])::text[]))";
    const client = createMockClient({
      presentTables: ['fund_scenario_calculation_runs'],
      populatedTables: ['fund_scenario_calculation_runs'],
      columns: [
        {
          table_name: 'fund_scenario_calculation_runs',
          column_name: 'id',
          data_type: 'uuid',
          udt_name: 'uuid',
          is_nullable: 'NO',
        },
      ],
      indexes: [
        {
          tablename: 'fund_scenario_calculation_runs',
          indexname: activeDedupeIndexName,
          indexdef: legacyDefinition,
        },
      ],
    });

    const audit = await auditManifest(client, definitionAwareIndexManifest);

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(audit.objects[0]?.populated).toBe(true);
    expect(audit.objects[0]?.deltas).toEqual([
      {
        kind: 'index-definition-mismatch',
        name: activeDedupeIndexName,
        expected: activeDedupeExpectedDefinition,
        actual: legacyDefinition,
        additiveSafe: false,
      },
    ]);
  });

  it('refuses a NOT IN predicate with the expected literals', async () => {
    const notInDefinition =
      "CREATE UNIQUE INDEX fund_scenario_calc_runs_active_dedup_idx ON public.fund_scenario_calculation_runs USING btree (scenario_set_id, source_config_id, source_config_version, COALESCE(hash_kind, 'scenario-input-hash-v1'::character varying), input_hash) WHERE status NOT IN ('queued', 'running', 'completed')";
    const client = createMockClient({
      presentTables: ['fund_scenario_calculation_runs'],
      populatedTables: ['fund_scenario_calculation_runs'],
      columns: [
        {
          table_name: 'fund_scenario_calculation_runs',
          column_name: 'id',
          data_type: 'uuid',
          udt_name: 'uuid',
          is_nullable: 'NO',
        },
      ],
      indexes: [
        {
          tablename: 'fund_scenario_calculation_runs',
          indexname: activeDedupeIndexName,
          indexdef: notInDefinition,
        },
      ],
    });

    const audit = await auditManifest(client, definitionAwareIndexManifest);

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(audit.objects[0]?.deltas.map((delta) => delta.kind)).toEqual([
      'index-definition-mismatch',
    ]);
  });

  it('refuses an extra OR TRUE predicate', async () => {
    const orTrueDefinition = `${activeDedupeExactDefinition} OR true`;
    const client = createMockClient({
      presentTables: ['fund_scenario_calculation_runs'],
      populatedTables: ['fund_scenario_calculation_runs'],
      columns: [
        {
          table_name: 'fund_scenario_calculation_runs',
          column_name: 'id',
          data_type: 'uuid',
          udt_name: 'uuid',
          is_nullable: 'NO',
        },
      ],
      indexes: [
        {
          tablename: 'fund_scenario_calculation_runs',
          indexname: activeDedupeIndexName,
          indexdef: orTrueDefinition,
        },
      ],
    });

    const audit = await auditManifest(client, definitionAwareIndexManifest);

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(audit.objects[0]?.deltas.map((delta) => delta.kind)).toEqual([
      'index-definition-mismatch',
    ]);
  });

  it('refuses a schema-global same-name index owned by another table', async () => {
    const client = createMockClient({
      presentTables: ['fund_scenario_calculation_runs'],
      columns: [
        {
          table_name: 'fund_scenario_calculation_runs',
          column_name: 'id',
          data_type: 'uuid',
          udt_name: 'uuid',
          is_nullable: 'NO',
        },
      ],
      indexes: [
        {
          tablename: 'archived_calculation_runs',
          indexname: activeDedupeIndexName,
          indexdef: activeDedupeExactDefinition.replace(
            'public.fund_scenario_calculation_runs',
            'public.archived_calculation_runs'
          ),
        },
      ],
    });

    const audit = await auditManifest(client, definitionAwareIndexManifest);

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(audit.objects[0]?.populated).toBe(false);
    expect(audit.objects[0]?.deltas).toEqual([
      {
        kind: 'index-table-mismatch',
        name: activeDedupeIndexName,
        expectedTable: 'fund_scenario_calculation_runs',
        actualTable: 'archived_calculation_runs',
        additiveSafe: false,
        humanReviewRequired: true,
      },
      { kind: 'missing-index', name: activeDedupeIndexName, additiveSafe: true },
    ]);
  });

  it('keeps a missing definition-aware index as additive missing DDL', async () => {
    const client = createMockClient({
      presentTables: ['fund_scenario_calculation_runs'],
      populatedTables: ['fund_scenario_calculation_runs'],
      columns: [
        {
          table_name: 'fund_scenario_calculation_runs',
          column_name: 'id',
          data_type: 'uuid',
          udt_name: 'uuid',
          is_nullable: 'NO',
        },
      ],
    });

    const audit = await auditManifest(client, definitionAwareIndexManifest);

    expect(audit.action).toBe(ACTION_APPLY_MISSING_DDL);
    expect(audit.objects[0]?.populated).toBe(false);
    expect(audit.objects[0]?.deltas).toEqual([
      { kind: 'missing-index', name: activeDedupeIndexName, additiveSafe: true },
    ]);
  });

  it('does not let a same-named constraint on another table satisfy the target table', async () => {
    const sameName = 'ledger_rows_state_check';
    const client = createMockClient({
      presentTables: ['ledger_rows', 'ledger_archive_rows'],
      columns: [
        {
          table_name: 'ledger_rows',
          column_name: 'id',
          data_type: 'integer',
          udt_name: 'int4',
          is_nullable: 'NO',
        },
        {
          table_name: 'ledger_archive_rows',
          column_name: 'id',
          data_type: 'integer',
          udt_name: 'int4',
          is_nullable: 'NO',
        },
      ],
      constraints: [
        {
          table_name: 'ledger_archive_rows',
          conname: sameName,
          definition: "CHECK (state = 'ready')",
        },
      ],
    });
    const audit = await auditManifest(client, {
      name: 'table-scoped-constraint-fixture',
      missingTablePolicy: MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
      expectedTables: [
        {
          name: 'ledger_rows',
          columns: [{ name: 'id', type: 'integer', nullable: false }],
          constraints: [sameName],
          indexes: [],
        },
        {
          name: 'ledger_archive_rows',
          columns: [{ name: 'id', type: 'integer', nullable: false }],
          constraints: [],
          indexes: [],
        },
      ],
    });

    expect(audit.action).toBe(ACTION_APPLY_MISSING_DDL);
    expect(audit.objects.find((object) => object.table === 'ledger_rows')?.deltas).toEqual([
      { kind: 'missing-constraint', name: sameName, additiveSafe: true },
    ]);
  });

  it.each([
    [
      'a same-named FK with the wrong target',
      'FOREIGN KEY (economics_reference_id, fund_id) REFERENCES archived_economics_runs(id, fund_id) ON DELETE RESTRICT',
    ],
    [
      'a same-named FK with the wrong delete action',
      'FOREIGN KEY (economics_reference_id, fund_id) REFERENCES internal_lp_economics_runs(id, fund_id) ON DELETE CASCADE',
    ],
  ])('REFUSES-FOR-HUMAN for %s', async (_case, actualDefinition) => {
    const table = 'internal_analysis_drafts';
    const name = 'internal_analysis_drafts_economics_reference_fund_fk';
    const audit = await auditManifest(
      createMockClient({
        presentTables: [table],
        constraints: [{ table_name: table, conname: name, definition: actualDefinition }],
      }),
      definitionAwareConstraintManifest(table, name, linkageForeignKeyExpectedDefinition)
    );

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(audit.objects[0]?.deltas).toEqual([
      {
        kind: 'constraint-definition-mismatch',
        name,
        expected: linkageForeignKeyExpectedDefinition,
        actual: actualDefinition,
        additiveSafe: false,
        humanReviewRequired: true,
      },
    ]);
  });

  it('REFUSES-FOR-HUMAN for a same-named unique constraint with wrong column order', async () => {
    const table = 'tasks';
    const name = 'tasks_id_fund_unique';
    const actualDefinition = 'UNIQUE (fund_id, id)';
    const audit = await auditManifest(
      createMockClient({
        presentTables: [table],
        constraints: [{ table_name: table, conname: name, definition: actualDefinition }],
      }),
      definitionAwareConstraintManifest(table, name, taskOwnershipUniqueExpectedDefinition)
    );

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(audit.objects[0]?.deltas.map((delta) => delta.kind)).toEqual([
      'constraint-definition-mismatch',
    ]);
  });

  it('REFUSES-FOR-HUMAN for a same-named task-evidence coupling check with wrong semantics', async () => {
    const table = 'task_evidence_links';
    const name = 'task_evidence_links_target_coupling_check';
    const actualDefinition =
      "CHECK ((target_kind = 'analysis_reference' AND analysis_reference_id IS NULL AND economics_run_id IS NULL) OR (target_kind = 'internal_economics_run' AND economics_run_id IS NOT NULL AND analysis_reference_id IS NULL))";
    const audit = await auditManifest(
      createMockClient({
        presentTables: [table],
        constraints: [{ table_name: table, conname: name, definition: actualDefinition }],
      }),
      definitionAwareConstraintManifest(table, name, targetCouplingExpectedDefinition)
    );

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(audit.objects[0]?.deltas.map((delta) => delta.kind)).toEqual([
      'constraint-definition-mismatch',
    ]);
  });

  it('applies a declared replacement when a same-named check definition is stale', async () => {
    const constraintName = 'investment_lots_lot_type_check';
    const expectedDefinition = {
      requiredFragments: ['lot_type'],
      stringLiterals: ['initial', 'follow_on', 'secondary', 'conversion'],
    };
    const client = createMockClient({
      presentTables: ['investment_lots'],
      columns: [
        {
          table_name: 'investment_lots',
          column_name: 'lot_type',
          data_type: 'text',
          udt_name: 'text',
          is_nullable: 'NO',
        },
      ],
      constraints: [
        {
          table_name: 'investment_lots',
          conname: constraintName,
          definition:
            "CHECK ((lot_type = ANY (ARRAY['initial'::text, 'follow_on'::text, 'secondary'::text])))",
        },
      ],
    });
    const audit = await auditManifest(client, {
      name: 'definition-aware-constraint-fixture',
      missingTablePolicy: MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
      applyPolicy: {
        allowConstraintReplacements: [
          {
            table: 'investment_lots',
            name: constraintName,
            expectedDefinition,
          },
        ],
      },
      expectedTables: [
        {
          name: 'investment_lots',
          columns: [{ name: 'lot_type', type: 'text', nullable: false }],
          constraints: [constraintName],
          indexes: [],
        },
      ],
    });

    expect(audit.action).toBe(ACTION_APPLY_MISSING_DDL);
    expect(audit.objects[0]?.deltas).toEqual([
      {
        kind: 'constraint-definition-mismatch',
        name: constraintName,
        expected: expectedDefinition,
        actual:
          "CHECK ((lot_type = ANY (ARRAY['initial'::text, 'follow_on'::text, 'secondary'::text])))",
        additiveSafe: true,
      },
    ]);
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

  it('allows an explicitly declared missing NOT NULL column on a populated table', async () => {
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
      ],
    });
    const audit = await auditManifest(client, {
      ...manifest,
      applyPolicy: {
        allowNonNullColumnAdds: [{ table: 'tasks', column: 'title' }],
      },
      expectedTables: [
        {
          ...manifest.expectedTables[0],
          constraints: [],
          indexes: [],
        },
      ],
    });

    expect(audit.action).toBe(ACTION_APPLY_MISSING_DDL);
    expect(audit.objects[0]?.populated).toBe(false);
    expect(audit.objects[0]?.deltas).toEqual([
      {
        kind: 'missing-column',
        name: 'tasks.title',
        additiveSafe: true,
      },
    ]);
  });

  it('refuses an undeclared missing NOT NULL column on a populated table', async () => {
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
      ],
    });
    const audit = await auditManifest(client, {
      ...manifest,
      expectedTables: [
        {
          ...manifest.expectedTables[0],
          constraints: [],
          indexes: [],
        },
      ],
    });

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(audit.objects[0]?.populated).toBe(true);
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

  it('treats NOT NULL to nullable as additive-safe on populated tables', async () => {
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
    const audit = await auditManifest(client, {
      ...manifest,
      expectedTables: [
        {
          ...manifest.expectedTables[0],
          columns: [
            { name: 'id', type: 'integer', nullable: false },
            { name: 'fund_id', type: 'integer', nullable: false },
            { name: 'title', type: 'varchar', nullable: true },
          ],
          constraints: [],
          indexes: [],
        },
      ],
    });

    expect(audit.action).toBe(ACTION_APPLY_MISSING_DDL);
    expect(audit.objects[0]?.populated).toBe(false);
    expect(audit.objects[0]?.deltas).toMatchObject([
      {
        kind: 'column-nullability-mismatch',
        name: 'tasks.title',
        expected: true,
        actual: false,
        additiveSafe: true,
      },
    ]);
  });

  it('refuses nullable to NOT NULL tightening on populated tables', async () => {
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
          is_nullable: 'YES',
        },
      ],
    });
    const audit = await auditManifest(client, {
      ...manifest,
      expectedTables: [
        {
          ...manifest.expectedTables[0],
          constraints: [],
          indexes: [],
        },
      ],
    });

    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    expect(audit.objects[0]?.populated).toBe(true);
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
    expect(output.join('')).toContain('missingTablePolicy=create_or_repair');
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

  it.each([
    [
      'missing DEFAULT',
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(32) NOT NULL;',
    ],
    [
      'missing NOT NULL',
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(32) DEFAULT 'viewer';`,
    ],
    [
      'DEFAULT NULL',
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(32) NOT NULL DEFAULT NULL;',
    ],
    [
      'unmatched table quote',
      `ALTER TABLE "users ADD COLUMN IF NOT EXISTS "role" varchar(32) NOT NULL DEFAULT 'viewer';`,
    ],
    [
      'unmatched column quote',
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role varchar(32) NOT NULL DEFAULT 'viewer';`,
    ],
  ])('apply rejects a declared non-null add with %s before mutation', async (_case, sql) => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-schema-policy-'));
    const sqlFile = 'fixture.sql';
    fs.writeFileSync(path.join(rootDir, sqlFile), `-- @drift-patch\n${sql}`);
    const client = createMockClient();

    try {
      await expect(
        runReconciliation({
          client,
          manifests: [
            {
              name: 'runner-policy-fixture',
              missingTablePolicy: MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
              sqlFiles: [sqlFile],
              applyPolicy: {
                allowNonNullColumnAdds: [{ table: 'users', column: 'role' }],
              },
              expectedTables: [
                {
                  name: 'users',
                  columns: [{ name: 'role', type: 'varchar', nullable: false }],
                },
              ],
            },
          ],
          rootDir,
          apply: true,
          stdout: { write: () => undefined },
        })
      ).rejects.toMatchObject({
        details: { kind: 'invalid-non-null-column-add-policy' },
      });
      expect(
        client.calls.some((call) => /\bBEGIN\b|INSERT INTO|ALTER TABLE|COMMIT/.test(call.text))
      ).toBe(false);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe('missing-table policy', () => {
  it('refuses a missing base table for existing_table_required', () => {
    expect(
      decideObjectAction({
        tablePresent: false,
        deltas: [],
        populated: false,
        missingTablePolicy: MISSING_TABLE_POLICY_EXISTING_REQUIRED,
      })
    ).toBe(ACTION_REFUSE_FOR_HUMAN);
  });

  it('applies an additive create for create_or_repair', () => {
    expect(
      decideObjectAction({
        tablePresent: false,
        deltas: [],
        populated: false,
        missingTablePolicy: MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
      })
    ).toBe(ACTION_APPLY_MISSING_DDL);
  });

  it('defaults absent policy to create_or_repair with a deprecation warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const audit = await auditManifest(createMockClient(), {
        name: 'missing-policy-fixture',
        expectedTables: [{ name: 'tasks', columns: [] }],
      });

      expect(
        decideObjectAction({
          tablePresent: false,
          deltas: [],
          populated: false,
        })
      ).toBe(ACTION_APPLY_MISSING_DDL);
      expect(audit.missingTablePolicy).toBe(MISSING_TABLE_POLICY_CREATE_OR_REPAIR);
      expect(audit.action).toBe(ACTION_APPLY_MISSING_DDL);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing-policy-fixture'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('defaulting to create_or_repair'));
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects an unknown policy value', async () => {
    await expect(
      auditManifest(createMockClient(), {
        name: 'bad-policy-fixture',
        missingTablePolicy: 'nonsense',
        expectedTables: [],
      })
    ).rejects.toMatchObject({
      details: { kind: 'invalid-missing-table-policy' },
    });
  });

  it('rejects an unknown manifest key', () => {
    expect(() =>
      validateManifestSql(
        {
          name: 'bad-key-fixture',
          missingTablePolicy: MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
          expectedTables: [],
          unexpectedKey: true,
        },
        []
      )
    ).toThrow(ReconcileError);
  });

  it('rejects malformed apply policy targets', () => {
    const badPolicies = [
      {
        applyPolicy: {
          allowDropNotNull: [{ table: 'tasks', column: 'bad;column' }],
        },
      },
      {
        applyPolicy: {
          allowDropNotNull: [{ table: 'tasks', column: 'title' }],
        },
      },
      {
        applyPolicy: {
          allowNonNullColumnAdds: [{ table: 'tasks', column: 'bad;column' }],
        },
      },
      {
        applyPolicy: {
          allowNonNullColumnAdds: [{ table: 'tasks', column: 'missing' }],
        },
      },
      {
        applyPolicy: {
          allowNonNullColumnAdds: [{ table: 'tasks', column: 'title' }],
        },
        expectedTables: [
          {
            ...manifest.expectedTables[0],
            columns: [{ name: 'title', type: 'varchar', nullable: true }],
          },
        ],
      },
      {
        applyPolicy: {
          allowNonNullColumnAdds: [
            { table: 'tasks', column: 'title' },
            { table: 'tasks', column: 'title' },
          ],
        },
      },
      {
        applyPolicy: {
          allowConstraintReplacements: [{ table: 'tasks', name: 'missing_check' }],
        },
      },
      {
        applyPolicy: {
          allowConstraintReplacements: [{ table: 'tasks', name: 'tasks_fund_id_funds_id_fk' }],
        },
      },
      {
        applyPolicy: {
          unexpectedKey: true,
        },
      },
      {
        applyPolicy: {
          allowConstraintReplacements: [
            {
              table: 'tasks',
              name: 'tasks_fund_id_funds_id_fk',
              expectedDefinition: {
                requiredFragments: ['fund_id'],
                stringLiterals: ['unused'],
              },
            },
            {
              table: 'tasks',
              name: 'tasks_fund_id_funds_id_fk',
              expectedDefinition: {
                requiredFragments: ['fund_id'],
                stringLiterals: ['unused'],
              },
            },
          ],
        },
      },
    ];

    for (const badPolicy of badPolicies) {
      expect(() =>
        validateManifestSql(
          {
            ...manifest,
            ...badPolicy,
          },
          []
        )
      ).toThrow(ReconcileError);
    }
  });
});

describe('reconcile-prod-schema dropObjects path (s8.1 slice 3.5)', () => {
  const dropManifest = {
    name: 'seam-fixture',
    missingTablePolicy: MISSING_TABLE_POLICY_CREATE_OR_REPAIR,
    dropObjects: [
      {
        kind: 'index',
        name: 'legacy_global_idx',
        reason: 'stale global unique replaced by scoped design',
        reverseSql: 'CREATE UNIQUE INDEX "legacy_global_idx" ON "t" ("k")',
      },
      {
        kind: 'constraint',
        table: 'jobs',
        name: 'jobs_legacy_check',
        reason: 'stale check',
        reverseSql: 'ALTER TABLE "jobs" ADD CONSTRAINT "jobs_legacy_check" CHECK (true)',
      },
    ],
  };

  it('manifest checksum changes when a drop entry changes (red-team F3)', () => {
    const base = manifestChecksum(dropManifest, []);
    const identical = manifestChecksum({ ...dropManifest }, []);
    const reverseSqlChanged = manifestChecksum(
      {
        ...dropManifest,
        dropObjects: [
          { ...dropManifest.dropObjects[0]!, reverseSql: 'CREATE INDEX "other" ON "t" ("k")' },
          dropManifest.dropObjects[1]!,
        ],
      },
      []
    );
    const entryRemoved = manifestChecksum(
      { ...dropManifest, dropObjects: [dropManifest.dropObjects[0]!] },
      []
    );

    expect(identical).toBe(base);
    expect(reverseSqlChanged).not.toBe(base);
    expect(entryRemoved).not.toBe(base);
  });

  it('manifest checksum changes when apply policy changes', () => {
    const base = manifestChecksum({ ...dropManifest, applyPolicy: {} }, []);
    const changed = manifestChecksum(
      {
        ...dropManifest,
        applyPolicy: {
          allowDropNotNull: [{ table: 'jobs', column: 'state' }],
        },
      },
      []
    );

    expect(changed).not.toBe(base);
  });

  it('manifest checksum changes when an expected index definition changes', () => {
    const base = manifestChecksum(definitionAwareIndexManifest, []);
    const changed = manifestChecksum(
      {
        ...definitionAwareIndexManifest,
        expectedTables: [
          {
            ...definitionAwareIndexManifest.expectedTables[0],
            indexDefinitions: [
              {
                name: activeDedupeIndexName,
                expectedDefinition: {
                  ...activeDedupeExpectedDefinition,
                  orderedFragments: [...activeDedupeExpectedDefinition.orderedFragments, 'extra'],
                },
              },
            ],
          },
        ],
      },
      []
    );

    expect(changed).not.toBe(base);
  });

  it('statement hashes include generated drop statements', () => {
    const hashes = statementHashes([], dropStatements(dropManifest));
    expect(hashes).toHaveLength(2);
    expect(hashes.every((entry) => entry.file === '<dropObjects>')).toBe(true);
  });

  it('generates guarded drop statements per kind', () => {
    expect(dropStatements(dropManifest)).toEqual([
      'DROP INDEX IF EXISTS "legacy_global_idx"',
      'ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_legacy_check"',
    ]);
  });

  it('rejects malformed drop objects', () => {
    const bad = [
      { kind: 'table', name: 'x', reason: 'r', reverseSql: 's' },
      { kind: 'index', name: 'x; DROP TABLE users', reason: 'r', reverseSql: 's' },
      { kind: 'constraint', name: 'x', reason: 'r', reverseSql: 's' },
      { kind: 'index', name: 'x', reason: 'r', reverseSql: '   ' },
      { kind: 'index', name: 'x', reason: '', reverseSql: 's' },
      { kind: 'index', name: `x${'y'.repeat(70)}`, reason: 'r', reverseSql: 's' },
    ];
    for (const drop of bad) {
      expect(() => validateDropObjects({ name: 'm', dropObjects: [drop] })).toThrow(ReconcileError);
    }
    expect(() => validateDropObjects(dropManifest)).not.toThrow();
  });

  it('audits a present drop target as APPLY and an absent one as SKIP', async () => {
    const presentClient = createMockClient({
      indexes: ['legacy_global_idx'],
      constraints: ['jobs_legacy_check'],
    });
    const presentAudit = await auditManifest(presentClient, dropManifest);
    expect(presentAudit.action).toBe(ACTION_APPLY_MISSING_DDL);
    expect(
      presentAudit.objects.flatMap((object) => object.deltas.map((delta) => delta.kind))
    ).toEqual(['extra-object-present', 'extra-object-present']);

    const absentClient = createMockClient();
    const absentAudit = await auditManifest(absentClient, dropManifest);
    expect(absentAudit.action).toBe(ACTION_SKIP);
  });

  it('apply executes drops in the guarded flow and post-apply audit passes', async () => {
    const client = createMockClient({
      indexes: ['legacy_global_idx'],
      constraints: ['jobs_legacy_check'],
    });
    const output: string[] = [];

    const result = await runReconciliation({
      client,
      manifests: [dropManifest],
      apply: true,
      stdout: { write: (chunk: string) => output.push(chunk) },
    });

    expect(result.applied).toEqual(['seam-fixture']);
    expect(client.calls.map((call) => call.text)).toContain(
      'DROP INDEX IF EXISTS "legacy_global_idx"'
    );
    expect(client.calls.map((call) => call.text)).toContain(
      'ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_legacy_check"'
    );
    expect(client.calls.map((call) => call.text)).toContain('COMMIT');
  });

  it('a legacy wrong-shape limited_partners table does NOT audit clean (review 4a-1)', async () => {
    // The loose 001_lp_reporting_schema.sql created limited_partners with a
    // UUID id; canonical 0013 uses serial/integer. The real M4 manifest must
    // surface that shape divergence instead of treating any same-named table
    // as satisfied - name-only sentinels false-SKIP legacy tables.
    const m4 = JSON.parse(
      fs.readFileSync('scripts/prod-schema-manifests/04-lp-reporting.json', 'utf8')
    ) as { expectedTables: Array<{ name: string }> };

    const legacyShapeClient = createMockClient({
      presentTables: ['limited_partners'],
      populatedTables: ['limited_partners'],
      columns: [
        {
          table_name: 'limited_partners',
          column_name: 'id',
          data_type: 'uuid',
          udt_name: 'uuid',
          is_nullable: 'NO',
        },
      ],
    });

    const audit = await auditManifest(legacyShapeClient, m4);
    expect(audit.action).toBe(ACTION_REFUSE_FOR_HUMAN);
    const lpObject = audit.objects.find((object) => object.table === 'limited_partners');
    expect(lpObject?.deltas.map((delta) => delta.kind)).toContain('column-type-mismatch');
  });

  it('post-apply audit fails and rolls back when a drop does not take effect', async () => {
    const client = createMockClient({
      indexes: ['legacy_global_idx'],
      constraints: ['jobs_legacy_check'],
      dropsHaveNoEffect: true,
    });
    const output: string[] = [];

    await expect(
      runReconciliation({
        client,
        manifests: [dropManifest],
        apply: true,
        stdout: { write: (chunk: string) => output.push(chunk) },
      })
    ).rejects.toThrow(/Post-apply shape audit failed/);
    expect(client.calls.map((call) => call.text)).toContain('ROLLBACK');
  });
});
