/**
 * PostgreSQL proofs for migration 0047 (Trust-Spine PR4 / issue #1272).
 *
 * This intentionally exercises the journaled SQL against real PostgreSQL:
 * locks before preflight, all-or-nothing rollback, composite ownership FKs,
 * target coupling, delete actions, and immutable task evidence.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ACTION_REFUSE_FOR_HUMAN,
  ACTION_SKIP,
  auditManifest,
  loadManifests,
} from '../../../scripts/reconcile-prod-schema.mjs';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import { exercisePostgresReplayDriftScenario } from '../../helpers/postgres-replay-drift';
import {
  getMigrationStateFromConnectionString,
  runMigrationsWithConnectionString,
} from '../../helpers/testcontainers-migration';
import {
  createAnalysisCheckpointPorts,
  replaceDraftEconomicsReference,
} from '../../../server/services/internal-analysis/analysis-checkpoint-service';
import {
  createTaskEvidenceLink,
  listTaskEvidenceLinks,
} from '../../../server/services/operating-objects/task-evidence-link-service';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const createdDatabases: string[] = [];

const PRE_LINKAGE_MIGRATION_TAG = '0046_internal_economics_certification';
const LINKAGE_MIGRATION_TAG = '0047_internal_economics_linkage';
const LINKAGE_MIGRATION_FILE = path.join(
  process.cwd(),
  'migrations',
  `${LINKAGE_MIGRATION_TAG}.sql`
);

let adminPool: Pool | undefined;
let fundIdCounter = 227_200_000;
let databaseCounter = 0;
let startedTestContainers = false;

describe.skipIf(skipIfNoDocker)('internal economics linkage PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    adminPool = new Pool({ connectionString: testDatabaseConnectionString(), max: 1 });
  }, 120_000);

  afterAll(async () => {
    if (adminPool) {
      for (const databaseName of createdDatabases.reverse()) {
        await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      }
      await adminPool.end();
    }
    if (startedTestContainers) {
      await cleanupTestContainers();
    }
  });

  it('applies 0047 through the migrator, asserts its own journal tag, and raw-replays safely', async () => {
    const { connectionString, state } = await createMigratedDatabase('replay');

    expect(state.applied.map((entry) => entry.name)).toContain(LINKAGE_MIGRATION_TAG);

    await withPool(connectionString, async (pool) => {
      await pool.query(await readFile(LINKAGE_MIGRATION_FILE, 'utf8'));

      const catalog = await pool.query<{ conname: string }>(
        `
        SELECT conname
        FROM pg_constraint
        WHERE conname = ANY($1::text[])
        ORDER BY conname
      `,
        [
          [
            'tasks_id_fund_unique',
            'internal_analysis_drafts_economics_reference_fund_fk',
            'internal_analysis_references_economics_reference_fund_fk',
            'task_evidence_links_fund_task_idempotency_unique',
          ],
        ]
      );
      expect(catalog.rows.map((row) => row.conname)).toEqual([
        'internal_analysis_drafts_economics_reference_fund_fk',
        'internal_analysis_references_economics_reference_fund_fk',
        'task_evidence_links_fund_task_idempotency_unique',
        'tasks_id_fund_unique',
      ]);

      const trigger = await pool.query<{ definition: string }>(`
        SELECT pg_get_triggerdef(t.oid) AS definition
        FROM pg_trigger t
        WHERE t.tgname = 'task_evidence_links_forbid_update_trigger'
          AND t.tgrelid = 'public.task_evidence_links'::regclass
          AND NOT t.tgisinternal
      `);
      expect(trigger.rows[0]?.definition).toContain('BEFORE UPDATE ON public.task_evidence_links');
    });
  }, 120_000);

  it('raw-replays after same-fund failed-run pins become legal and preserves both pins', async () => {
    const { connectionString } = await createMigratedDatabase('failed-pin-replay');

    await withPool(connectionString, async (pool) => {
      const basis = await seedLinkageBasis(pool, 'failed-pin-replay');
      const failedRunId = await insertRun(pool, basis, {
        idempotencyKey: 'failed-pin-replay-run',
        runState: 'failed',
      });
      await pool.query(
        `UPDATE internal_analysis_drafts SET economics_reference_id = $2 WHERE id = $1`,
        [basis.draftId, failedRunId]
      );
      await pool.query(
        `UPDATE internal_analysis_references SET economics_reference_id = $2 WHERE id = $1`,
        [basis.referenceId, failedRunId]
      );

      await expect(
        pool.query(await readFile(LINKAGE_MIGRATION_FILE, 'utf8'))
      ).resolves.toBeDefined();
      await expect(
        economicsReferenceIdForPin(pool, {
          table: 'internal_analysis_drafts',
          id: basis.draftId,
          economicsReferenceId: failedRunId,
        })
      ).resolves.toBe(failedRunId);
      await expect(
        economicsReferenceIdForPin(pool, {
          table: 'internal_analysis_references',
          id: basis.referenceId,
          economicsReferenceId: failedRunId,
        })
      ).resolves.toBe(failedRunId);
    });
  }, 120_000);

  it('Drizzle replays an exact canonical catalog with same-fund failed-run pins', async () => {
    const { connectionString } = await createMigratedDatabase(
      'canonical-drizzle-replay',
      PRE_LINKAGE_MIGRATION_TAG
    );

    await withPool(connectionString, async (pool) => {
      const basis = await seedLinkageBasis(pool, 'canonical-drizzle-replay');
      await seedCanonicalLinkageCatalog(pool);
      const failedRunId = await insertRun(pool, basis, {
        idempotencyKey: 'canonical-drizzle-replay-failed-run',
        runState: 'failed',
      });
      await pool.query(
        `UPDATE internal_analysis_drafts SET economics_reference_id = $2 WHERE id = $1`,
        [basis.draftId, failedRunId]
      );
      await pool.query(
        `UPDATE internal_analysis_references SET economics_reference_id = $2 WHERE id = $1`,
        [basis.referenceId, failedRunId]
      );

      const ledgerBefore = await drizzleMigrationLedgerSnapshot(pool);
      const migrationStateBefore = await getMigrationStateFromConnectionString(connectionString);
      await seedCanonicalEvidenceIndex(pool);
      const catalogWithIndex = await linkageReplayCatalogSnapshot(pool);
      expect(
        catalogWithIndex.indexes
          .filter((index) => index.indexname === 'idx_task_evidence_links_fund_task_id')
          .map((index) => index.indexname)
      ).toEqual(['idx_task_evidence_links_fund_task_id']);
      expect(catalogWithIndex.triggers).toEqual([]);
      expect(migrationStateBefore.applied.map((entry) => entry.name)).not.toContain(
        LINKAGE_MIGRATION_TAG
      );

      await expect(
        runMigrationsWithConnectionString(connectionString, LINKAGE_MIGRATION_TAG)
      ).resolves.toBeDefined();

      const catalogAfter = await linkageReplayCatalogSnapshot(pool);
      expect(catalogAfter.taskEvidenceRelation).toEqual(catalogWithIndex.taskEvidenceRelation);
      expect(catalogAfter.taskEvidenceColumns).toEqual(catalogWithIndex.taskEvidenceColumns);
      expect(catalogAfter.taskEvidenceSerialIdentity).toEqual(
        catalogWithIndex.taskEvidenceSerialIdentity
      );
      expect(catalogAfter.taskEvidenceSequences).toEqual(catalogWithIndex.taskEvidenceSequences);
      expect(catalogAfter.constraints).toEqual(catalogWithIndex.constraints);
      expect(
        catalogAfter.indexes
          .filter((index) => index.indexname === 'idx_task_evidence_links_fund_task_id')
          .map((index) => index.indexname)
      ).toEqual(['idx_task_evidence_links_fund_task_id']);
      expect(catalogAfter.triggers.map((trigger) => trigger.tgname)).toEqual([
        'task_evidence_links_forbid_update_trigger',
      ]);
      expect(await drizzleMigrationLedgerSnapshot(pool)).not.toEqual(ledgerBefore);

      const pins = await pool.query<{ table_name: string; economics_reference_id: number }>(
        `
          SELECT 'internal_analysis_drafts' AS table_name, economics_reference_id
          FROM internal_analysis_drafts
          WHERE id = $1
          UNION ALL
          SELECT 'internal_analysis_references', economics_reference_id
          FROM internal_analysis_references
          WHERE id = $2
          ORDER BY table_name
        `,
        [basis.draftId, basis.referenceId]
      );
      expect(pins.rows).toEqual([
        { table_name: 'internal_analysis_drafts', economics_reference_id: failedRunId },
        { table_name: 'internal_analysis_references', economics_reference_id: failedRunId },
      ]);

      const migrationState = await getMigrationStateFromConnectionString(connectionString);
      expect(migrationState.applied.map((entry) => entry.name)).toContain(LINKAGE_MIGRATION_TAG);
    });
  }, 120_000);

  it('locks draft/reference pins and economics runs before preflight', async () => {
    const { connectionString } = await createMigratedDatabase('lock', PRE_LINKAGE_MIGRATION_TAG);
    const migrationStatements = splitMigrationStatements(
      await readFile(LINKAGE_MIGRATION_FILE, 'utf8')
    );
    const { lock, remaining } = migrationStatementPhases(migrationStatements);

    await withPool(connectionString, async (pool) => {
      const basis = await seedLinkageBasis(pool, 'lock');
      const completedRunId = await insertRun(pool, basis, {
        idempotencyKey: 'lock-completed-run',
        runState: 'completed',
      });
      const migrationClient = await pool.connect();
      const writerClient = await pool.connect();

      try {
        // Drizzle supplies this transaction in production. The dedicated test
        // transaction holds the migration's extracted lock long enough to
        // prove concurrent pin writes and run deletion cannot race preflight.
        await migrationClient.query('BEGIN');
        const backend = await migrationClient.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid'
        );
        const migrationBackendPid = backend.rows[0]?.pid;
        if (typeof migrationBackendPid !== 'number') {
          throw new Error('Expected migration backend pid.');
        }
        await migrationClient.query(lock);

        const locks = await pool.query<{ relname: string; mode: string }>(
          `
            SELECT c.relname, l.mode
            FROM pg_locks l
            JOIN pg_class c ON c.oid = l.relation
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE l.pid = $1
              AND n.nspname = 'public'
              AND c.relname = ANY($2::text[])
              AND l.mode = 'ShareRowExclusiveLock'
            ORDER BY c.relname
          `,
          [
            migrationBackendPid,
            [
              'internal_analysis_drafts',
              'internal_analysis_references',
              'internal_lp_economics_runs',
              'tasks',
            ],
          ]
        );
        expect(locks.rows.map((row) => row.relname)).toEqual([
          'internal_analysis_drafts',
          'internal_analysis_references',
          'internal_lp_economics_runs',
          'tasks',
        ]);

        await writerClient.query("SET statement_timeout = '150ms'");
        await expect(
          writerClient.query(
            `
              UPDATE internal_analysis_drafts
              SET economics_reference_id = $2
              WHERE id = $1
            `,
            [basis.draftId, completedRunId]
          )
        ).rejects.toThrow(/statement timeout/);
        await expect(
          writerClient.query(`DELETE FROM internal_lp_economics_runs WHERE id = $1`, [
            completedRunId,
          ])
        ).rejects.toThrow(/statement timeout/);
        await writerClient.query('SET statement_timeout = DEFAULT');

        for (const statement of remaining) {
          await migrationClient.query(statement);
        }
        await migrationClient.query('COMMIT');
      } finally {
        await writerClient.query('SET statement_timeout = DEFAULT').catch(() => undefined);
        writerClient.release();
        await migrationClient.query('ROLLBACK').catch(() => undefined);
        migrationClient.release();
      }
    });
  }, 120_000);

  it('rejects every legacy orphan, cross-fund, or failed draft/reference pin before DDL', async () => {
    const scenarios: readonly PreflightScenario[] = [
      {
        name: 'draft orphan',
        arrange: async (pool, basis) => {
          const economicsReferenceId = 2147480000;
          await pool.query(
            `UPDATE internal_analysis_drafts SET economics_reference_id = $2 WHERE id = $1`,
            [basis.draftId, economicsReferenceId]
          );
          return {
            table: 'internal_analysis_drafts',
            id: basis.draftId,
            economicsReferenceId,
          };
        },
      },
      {
        name: 'reference orphan',
        arrange: async (pool, basis) => {
          const economicsReferenceId = 2147480001;
          await pool.query(
            `UPDATE internal_analysis_references SET economics_reference_id = $2 WHERE id = $1`,
            [basis.referenceId, economicsReferenceId]
          );
          return {
            table: 'internal_analysis_references',
            id: basis.referenceId,
            economicsReferenceId,
          };
        },
      },
      {
        name: 'draft cross-fund completed run',
        arrange: async (pool, basis) => {
          const other = await seedLinkageBasis(pool, 'draft-cross-fund');
          const economicsReferenceId = await insertRun(pool, other, {
            idempotencyKey: 'draft-cross-fund-completed-run',
            runState: 'completed',
          });
          await pool.query(
            `UPDATE internal_analysis_drafts SET economics_reference_id = $2 WHERE id = $1`,
            [basis.draftId, economicsReferenceId]
          );
          return {
            table: 'internal_analysis_drafts',
            id: basis.draftId,
            economicsReferenceId,
          };
        },
      },
      {
        name: 'reference cross-fund completed run',
        arrange: async (pool, basis) => {
          const other = await seedLinkageBasis(pool, 'reference-cross-fund');
          const economicsReferenceId = await insertRun(pool, other, {
            idempotencyKey: 'reference-cross-fund-completed-run',
            runState: 'completed',
          });
          await pool.query(
            `UPDATE internal_analysis_references SET economics_reference_id = $2 WHERE id = $1`,
            [basis.referenceId, economicsReferenceId]
          );
          return {
            table: 'internal_analysis_references',
            id: basis.referenceId,
            economicsReferenceId,
          };
        },
      },
      {
        name: 'draft failed same-fund run',
        arrange: async (pool, basis) => {
          const economicsReferenceId = await insertRun(pool, basis, {
            idempotencyKey: 'draft-preflight-failed-run',
            runState: 'failed',
          });
          await pool.query(
            `UPDATE internal_analysis_drafts SET economics_reference_id = $2 WHERE id = $1`,
            [basis.draftId, economicsReferenceId]
          );
          return {
            table: 'internal_analysis_drafts',
            id: basis.draftId,
            economicsReferenceId,
          };
        },
      },
      {
        name: 'reference failed same-fund run',
        arrange: async (pool, basis) => {
          const economicsReferenceId = await insertRun(pool, basis, {
            idempotencyKey: 'reference-preflight-failed-run',
            runState: 'failed',
          });
          await pool.query(
            `UPDATE internal_analysis_references SET economics_reference_id = $2 WHERE id = $1`,
            [basis.referenceId, economicsReferenceId]
          );
          return {
            table: 'internal_analysis_references',
            id: basis.referenceId,
            economicsReferenceId,
          };
        },
      },
    ];

    for (const scenario of scenarios) {
      const { connectionString } = await createMigratedDatabase(
        `preflight-${scenario.name.replaceAll(/[^a-z]+/g, '-')}`,
        PRE_LINKAGE_MIGRATION_TAG
      );
      await withPool(connectionString, async (pool) => {
        const basis = await seedLinkageBasis(pool, scenario.name);
        const expectedPin = await scenario.arrange(pool, basis);
        const dataBefore = await linkageDataCounts(pool);

        const client = await pool.connect();
        try {
          await expect(
            client.query(await readFile(LINKAGE_MIGRATION_FILE, 'utf8'))
          ).rejects.toThrow(/internal_economics_linkage_preflight_failed/);
          await client.query('ROLLBACK');
        } finally {
          client.release();
        }

        const partialCatalog = await pool.query<{
          task_evidence_links: string | null;
          conname: string;
        }>(
          `
            SELECT to_regclass('public.task_evidence_links')::text AS task_evidence_links,
                   coalesce(conname, '') AS conname
            FROM pg_constraint
            WHERE conname = ANY($1::text[])
            UNION ALL
            SELECT to_regclass('public.task_evidence_links')::text, ''
            WHERE NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname = ANY($1::text[])
            )
          `,
          [
            [
              'tasks_id_fund_unique',
              'internal_analysis_drafts_economics_reference_fund_fk',
              'internal_analysis_references_economics_reference_fund_fk',
            ],
          ]
        );
        expect(partialCatalog.rows.every((row) => row.task_evidence_links === null)).toBe(true);
        expect(partialCatalog.rows.map((row) => row.conname).filter(Boolean)).toEqual([]);
        expect(await linkageDataCounts(pool)).toEqual(dataBefore);
        expect(await economicsReferenceIdForPin(pool, expectedPin)).toBe(
          expectedPin.economicsReferenceId
        );
      });
    }
  }, 120_000);

  it('fails closed before DDL when exactly one linkage FK is present', async () => {
    const { connectionString } = await createMigratedDatabase(
      'partial-linkage-state',
      PRE_LINKAGE_MIGRATION_TAG
    );

    await withPool(connectionString, async (pool) => {
      await pool.query(`
        ALTER TABLE internal_analysis_drafts
        ADD CONSTRAINT internal_analysis_drafts_economics_reference_fund_fk
        FOREIGN KEY (economics_reference_id, fund_id)
        REFERENCES internal_lp_economics_runs(id, fund_id)
        ON DELETE RESTRICT
      `);

      const client = await pool.connect();
      try {
        await expect(client.query(await readFile(LINKAGE_MIGRATION_FILE, 'utf8'))).rejects.toThrow(
          /internal_economics_linkage_partial_catalog_state/
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      const catalog = await pool.query<{ task_evidence_links: string | null; conname: string }>(
        `
          SELECT to_regclass('public.task_evidence_links')::text AS task_evidence_links,
                 coalesce(conname, '') AS conname
          FROM pg_constraint
          WHERE conname = ANY($1::text[])
          UNION ALL
          SELECT to_regclass('public.task_evidence_links')::text, ''
          WHERE NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = ANY($1::text[])
          )
        `,
        [['tasks_id_fund_unique', 'internal_analysis_references_economics_reference_fund_fk']]
      );
      expect(catalog.rows.every((row) => row.task_evidence_links === null)).toBe(true);
      expect(catalog.rows.map((row) => row.conname).filter(Boolean)).toEqual([]);
    });
  }, 120_000);

  it('refuses a pre-existing partial task-evidence table before later index or trigger DDL', async () => {
    const { connectionString } = await createMigratedDatabase(
      'partial-task-evidence',
      PRE_LINKAGE_MIGRATION_TAG
    );

    await withPool(connectionString, async (pool) => {
      await pool.query(`
        CREATE TABLE task_evidence_links (
          id integer NOT NULL,
          fund_id integer NOT NULL,
          task_id integer NOT NULL
        )
      `);

      const client = await pool.connect();
      try {
        await expect(client.query(await readFile(LINKAGE_MIGRATION_FILE, 'utf8'))).rejects.toThrow(
          /internal_economics_linkage_partial_task_evidence_state/
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      const columns = await pool.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'task_evidence_links'
        ORDER BY ordinal_position
      `);
      expect(columns.rows.map((row) => row.column_name)).toEqual(['id', 'fund_id', 'task_id']);

      const laterCatalog = await pool.query<{
        list_index: string | null;
        trigger_count: string;
      }>(`
        SELECT
          to_regclass('public.idx_task_evidence_links_fund_task_id')::text AS list_index,
          (
            SELECT count(*)::text
            FROM pg_trigger trigger_catalog
            WHERE trigger_catalog.tgrelid = 'public.task_evidence_links'::regclass
              AND trigger_catalog.tgname = 'task_evidence_links_forbid_update_trigger'
              AND NOT trigger_catalog.tgisinternal
          ) AS trigger_count
      `);
      expect(laterCatalog.rows).toEqual([{ list_index: null, trigger_count: '0' }]);
    });
  }, 120_000);

  it('treats only an absent or exact-canonical 0047 catalog as migratable through Drizzle', async () => {
    const scenarios: readonly DrizzleCatalogScenario[] = [
      {
        name: 'missing 0047 objects for canonical first apply',
        outcome: 'applies',
        seed: async () => undefined,
      },
      {
        name: 'partial analysis linkage catalog with only one FK',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool) => {
          await pool.query(`
            ALTER TABLE internal_analysis_drafts
            ADD CONSTRAINT internal_analysis_drafts_economics_reference_fund_fk
            FOREIGN KEY (economics_reference_id, fund_id)
            REFERENCES internal_lp_economics_runs(id, fund_id)
            ON DELETE RESTRICT
          `);
        },
      },
      {
        name: 'partial task evidence table',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await pool.query(`
            CREATE TABLE task_evidence_links (
              id integer NOT NULL,
              fund_id integer NOT NULL,
              task_id integer NOT NULL
            )
          `);
        },
      },
      {
        name: 'partial structural bundle with exact analysis linkage FKs only',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: seedCanonicalAnalysisLinkageForeignKeys,
      },
      {
        name: 'partial structural bundle with exact tasks unique only',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: seedTasksIdFundUnique,
      },
      {
        name: 'partial structural bundle with linkage FKs and tasks unique but no task evidence',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool) => {
          await seedTasksIdFundUnique(pool);
          await seedCanonicalAnalysisLinkageForeignKeys(pool);
        },
      },
      {
        name: 'partial structural bundle with canonical task evidence but no linkage FKs',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: seedCanonicalTaskEvidenceTable,
      },
      {
        name: 'partial structural bundle with task evidence but no 0047 unique or linkage FKs',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: seedTaskEvidenceTableWithout0047TasksUnique,
      },
      {
        name: 'partial structural bundle with linkage FKs and task evidence but no 0047 unique',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool) => {
          await seedTaskEvidenceTableWithout0047TasksUnique(pool);
          await seedCanonicalAnalysisLinkageForeignKeys(pool);
        },
      },
      {
        name: 'same-named analysis linkage FK with wrong delete action',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool) => {
          await pool.query(`
            ALTER TABLE internal_analysis_drafts
            ADD CONSTRAINT internal_analysis_drafts_economics_reference_fund_fk
            FOREIGN KEY (economics_reference_id, fund_id)
            REFERENCES internal_lp_economics_runs(id, fund_id)
            ON DELETE CASCADE
          `);
          await pool.query(`
            ALTER TABLE internal_analysis_references
            ADD CONSTRAINT internal_analysis_references_economics_reference_fund_fk
            FOREIGN KEY (economics_reference_id, fund_id)
            REFERENCES internal_lp_economics_runs(id, fund_id)
            ON DELETE RESTRICT
          `);
        },
      },
      {
        name: 'task evidence with wrong id type',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await createTaskEvidenceTableForCatalogDrift(pool, {
            idColumn: 'bigint PRIMARY KEY NOT NULL',
            fundIdColumn: 'integer NOT NULL',
            targetCoupling: 'canonical',
          });
        },
      },
      {
        name: 'task evidence with wrong fund nullability',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await createTaskEvidenceTableForCatalogDrift(pool, {
            idColumn: 'serial PRIMARY KEY NOT NULL',
            fundIdColumn: 'integer',
            targetCoupling: 'canonical',
          });
        },
      },
      {
        name: 'task evidence with wrong created-at default',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await seedCanonicalTaskEvidenceTable(pool);
          await pool.query(`
            ALTER TABLE task_evidence_links
            ALTER COLUMN created_at SET DEFAULT statement_timestamp()
          `);
        },
      },
      {
        name: 'task evidence with alternate id default but canonical sequence ownership',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await seedCanonicalTaskEvidenceTable(pool);
          await pool.query('CREATE SEQUENCE public.task_evidence_links_alternate_id_seq');
          await pool.query(`
            ALTER TABLE task_evidence_links
            ALTER COLUMN id SET DEFAULT nextval('public.task_evidence_links_alternate_id_seq'::regclass)
          `);
        },
        assertBeforeRefusal: (catalog) => {
          expect(catalog.taskEvidenceSerialIdentity).toEqual({
            default_expression: "nextval('task_evidence_links_alternate_id_seq'::regclass)",
            owned_sequence: 'public.task_evidence_links_id_seq',
            canonical_sequence_owned_by: 'public.task_evidence_links.id',
          });
        },
      },
      {
        name: 'task evidence with canonical id default but no canonical sequence ownership',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await seedCanonicalTaskEvidenceTable(pool);
          await pool.query('ALTER SEQUENCE public.task_evidence_links_id_seq OWNED BY NONE');
        },
        assertBeforeRefusal: (catalog) => {
          expect(catalog.taskEvidenceSerialIdentity).toEqual({
            default_expression: "nextval('task_evidence_links_id_seq'::regclass)",
            owned_sequence: null,
            canonical_sequence_owned_by: null,
          });
        },
      },
      {
        name: 'task evidence same-named fund FK with wrong delete action',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await seedCanonicalTaskEvidenceTable(pool);
          await pool.query(`
            ALTER TABLE task_evidence_links
            DROP CONSTRAINT task_evidence_links_fund_id_funds_id_fk
          `);
          await pool.query(`
            ALTER TABLE task_evidence_links
            ADD CONSTRAINT task_evidence_links_fund_id_funds_id_fk
            FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE RESTRICT
          `);
        },
      },
      {
        name: 'task evidence same-named created-by FK with wrong target',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await seedCanonicalTaskEvidenceTable(pool);
          await pool.query(`
            ALTER TABLE task_evidence_links
            DROP CONSTRAINT task_evidence_links_created_by_fk
          `);
          await pool.query(`
            ALTER TABLE task_evidence_links
            ADD CONSTRAINT task_evidence_links_created_by_fk
            FOREIGN KEY (created_by) REFERENCES tasks(id)
          `);
        },
      },
      {
        name: 'same-named tasks unique with wrong column order',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool) => {
          await pool.query(`
            ALTER TABLE tasks
            ADD CONSTRAINT tasks_id_fund_unique UNIQUE (fund_id, id)
          `);
        },
      },
      {
        name: 'task evidence same-named unique with wrong key',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await seedCanonicalTaskEvidenceTable(pool);
          await pool.query(`
            ALTER TABLE task_evidence_links
            DROP CONSTRAINT task_evidence_links_fund_task_idempotency_unique
          `);
          await pool.query(`
            ALTER TABLE task_evidence_links
            ADD CONSTRAINT task_evidence_links_fund_task_idempotency_unique
            UNIQUE (fund_id, task_id, request_hash)
          `);
        },
      },
      {
        name: 'task evidence same-named coupling check with wrong semantics',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await createTaskEvidenceTableForCatalogDrift(pool, {
            idColumn: 'serial PRIMARY KEY NOT NULL',
            fundIdColumn: 'integer NOT NULL',
            targetCoupling: 'wrong',
          });
        },
      },
      {
        name: 'task evidence with an extra column',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await pool.query('ALTER TABLE task_evidence_links ADD COLUMN replay_probe integer');
        },
        assertBeforeRefusal: (catalog) => {
          expect(catalog.taskEvidenceColumns).toContainEqual(
            expect.objectContaining({ column_name: 'replay_probe', data_type: 'integer' })
          );
        },
      },
      {
        name: 'task evidence with an extra table constraint',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_task_evidence_state/,
        seed: async (pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await pool.query(`
            ALTER TABLE task_evidence_links
            ADD CONSTRAINT task_evidence_links_replay_probe_check
            CHECK (request_hash <> '')
          `);
        },
        assertBeforeRefusal: (catalog) => {
          expect(catalog.constraints).toContainEqual(
            expect.objectContaining({ conname: 'task_evidence_links_replay_probe_check' })
          );
        },
      },
    ];

    for (const scenario of scenarios) {
      await exerciseDrizzleCatalogScenario(scenario);
    }
  }, 120_000);

  it('closes the complete index and trigger replay-equivalence class', async () => {
    const scenarios: readonly DrizzleCatalogScenario[] = [
      {
        name: 'canonical core with absent required index',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: seedCanonicalLinkageCatalog,
      },
      {
        name: 'exact canonical index and trigger replay',
        outcome: 'applies',
        seed: async (pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await seedCanonicalEvidenceIndexAndTrigger(pool);
        },
      },
      {
        name: 'same-named index on wrong relation',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await pool.query(
            'CREATE INDEX idx_task_evidence_links_fund_task_id ON tasks (fund_id, id)'
          );
        },
        assertBeforeRefusal: (catalog) => {
          expect(catalog.indexes).toContainEqual(
            expect.objectContaining({
              schema_name: 'public',
              table_name: 'tasks',
              indexname: 'idx_task_evidence_links_fund_task_id',
            })
          );
        },
      },
      ...[
        ['wrong keys, order, and direction', '(task_id, fund_id, id DESC)'],
        ['wrong uniqueness', '(fund_id, task_id, id)', 'UNIQUE '],
        ['wrong predicate', '(fund_id, task_id, id) WHERE fund_id > 0'],
        ['wrong access method', 'USING hash (fund_id)'],
        ['unexpected INCLUDE column', '(fund_id, task_id, id) INCLUDE (request_hash)'],
      ].map(([variant, definition, prefix = '']) => ({
        name: `same-named index with ${variant}`,
        outcome: 'refuses' as const,
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool: Pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await pool.query(
            `CREATE ${prefix}INDEX idx_task_evidence_links_fund_task_id ON task_evidence_links ${definition}`
          );
        },
      })),
      {
        name: 'same-named index as wrong object kind',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await pool.query(
            'CREATE VIEW idx_task_evidence_links_fund_task_id AS SELECT id FROM task_evidence_links'
          );
        },
      },
      {
        name: 'unexpected user index on task evidence',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await seedCanonicalEvidenceIndex(pool);
          await pool.query(
            'CREATE INDEX task_evidence_links_replay_probe_idx ON task_evidence_links (request_hash)'
          );
        },
        assertBeforeRefusal: (catalog) => {
          expect(catalog.indexes).toContainEqual(
            expect.objectContaining({
              schema_name: 'public',
              table_name: 'task_evidence_links',
              indexname: 'task_evidence_links_replay_probe_idx',
            })
          );
        },
      },
      {
        name: 'same-named trigger on wrong relation',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await seedCanonicalEvidenceIndex(pool);
          await pool.query(`
            CREATE TRIGGER task_evidence_links_forbid_update_trigger
            BEFORE UPDATE ON tasks
            FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update()
          `);
        },
        assertBeforeRefusal: (catalog) => {
          expect(catalog.triggers).toContainEqual(
            expect.objectContaining({
              schema_name: 'public',
              table_name: 'tasks',
              tgname: 'task_evidence_links_forbid_update_trigger',
            })
          );
        },
      },
      {
        name: 'unexpected user trigger on task evidence',
        outcome: 'refuses',
        expectedError: /internal_economics_linkage_partial_catalog_state/,
        seed: async (pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await seedCanonicalEvidenceIndex(pool);
          await pool.query(`
            CREATE TRIGGER task_evidence_links_replay_probe_trigger
            BEFORE UPDATE ON task_evidence_links
            FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update()
          `);
        },
        assertBeforeRefusal: (catalog) => {
          expect(catalog.triggers).toContainEqual(
            expect.objectContaining({
              schema_name: 'public',
              table_name: 'task_evidence_links',
              tgname: 'task_evidence_links_replay_probe_trigger',
            })
          );
        },
      },
      ...[
        ['wrong timing', 'AFTER UPDATE', 'internal_economics_forbid_update'],
        ['wrong event set', 'BEFORE DELETE', 'internal_economics_forbid_update'],
        ['wrong level', 'BEFORE UPDATE', 'internal_economics_forbid_update', 'FOR EACH STATEMENT'],
        ['wrong function', 'BEFORE UPDATE', 'task_evidence_links_replay_wrong_trigger'],
      ].map(([variant, eventClause, functionName, level = 'FOR EACH ROW']) => ({
        name: `replaceable named trigger with ${variant}`,
        outcome: 'applies' as const,
        seed: async (pool: Pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await seedCanonicalEvidenceIndex(pool);
          if (functionName === 'task_evidence_links_replay_wrong_trigger') {
            await pool.query(`
              CREATE FUNCTION task_evidence_links_replay_wrong_trigger()
              RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$
            `);
          }
          await pool.query(`
            CREATE TRIGGER task_evidence_links_forbid_update_trigger
            ${eventClause} ON task_evidence_links
            ${level} EXECUTE FUNCTION ${functionName}()
          `);
        },
      })),
      {
        name: 'replaceable named trigger disabled',
        outcome: 'applies',
        seed: async (pool) => {
          await seedCanonicalLinkageCatalog(pool);
          await seedCanonicalEvidenceIndex(pool);
          await seedCanonicalEvidenceTrigger(pool);
          await pool.query(
            'ALTER TABLE task_evidence_links DISABLE TRIGGER task_evidence_links_forbid_update_trigger'
          );
        },
      },
    ];

    for (const scenario of scenarios) {
      await exerciseDrizzleCatalogScenario(scenario);
    }
  }, 120_000);

  it('rolls back every 0047 catalog change when raw full-file replay fails late', async () => {
    const { connectionString } = await createMigratedDatabase(
      'atomic-failure',
      PRE_LINKAGE_MIGRATION_TAG
    );

    await withPool(connectionString, async (pool) => {
      const basis = await seedLinkageBasis(pool, 'atomic-failure');
      const migrationSql = await readFile(LINKAGE_MIGRATION_FILE, 'utf8');
      const failingMigrationSql = migrationSql.replace(
        'EXECUTE FUNCTION "internal_economics_forbid_update"();',
        'EXECUTE FUNCTION "missing_internal_economics_linkage_trigger_function"();'
      );
      expect(failingMigrationSql).not.toBe(migrationSql);

      const client = await pool.connect();
      try {
        await expect(client.query(failingMigrationSql)).rejects.toThrow(
          /missing_internal_economics_linkage_trigger_function/
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      const rollbackCatalog = await pool.query<{ relation: string | null; conname: string }>(
        `
          SELECT to_regclass('public.task_evidence_links')::text AS relation,
                 coalesce(conname, '') AS conname
          FROM pg_constraint
          WHERE conname = ANY($1::text[])
          UNION ALL
          SELECT to_regclass('public.task_evidence_links')::text, ''
          WHERE NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = ANY($1::text[])
          )
        `,
        [
          [
            'tasks_id_fund_unique',
            'internal_analysis_drafts_economics_reference_fund_fk',
            'internal_analysis_references_economics_reference_fund_fk',
          ],
        ]
      );
      expect(rollbackCatalog.rows.every((row) => row.relation === null)).toBe(true);
      expect(rollbackCatalog.rows.map((row) => row.conname).filter(Boolean)).toEqual([]);

      const preserved = await pool.query<{ id: number }>(
        `SELECT id FROM internal_analysis_drafts WHERE id = $1`,
        [basis.draftId]
      );
      expect(preserved.rows).toEqual([{ id: basis.draftId }]);
    });
  }, 120_000);

  it('enforces preflight-completed analysis pins, typed evidence coupling, ownership, actions, idempotency, and immutability', async () => {
    const { connectionString } = await createMigratedDatabase('constraints');

    await withPool(connectionString, async (pool) => {
      const basis = await seedLinkageBasis(pool, 'constraints');
      const completedRunId = await insertRun(pool, basis, {
        idempotencyKey: 'completed-analysis-pin',
        runState: 'completed',
      });
      const failedRunId = await insertRun(pool, basis, {
        idempotencyKey: 'failed-evidence-target',
        runState: 'failed',
      });
      const other = await seedLinkageBasis(pool, 'constraints-other');
      const otherCompletedRunId = await insertRun(pool, other, {
        idempotencyKey: 'other-completed-analysis-pin',
        runState: 'completed',
      });
      const otherFailedRunId = await insertRun(pool, other, {
        idempotencyKey: 'other-failed-evidence-target',
        runState: 'failed',
      });

      // Preflight accepts only completed legacy pins. The resulting composite
      // FKs intentionally enforce ownership only: #1273's completion service
      // owns the future-state rule, while the database keeps cross-fund pins
      // impossible without adding an unstated cross-table trigger.
      await expect(
        pool.query(
          `UPDATE internal_analysis_drafts SET economics_reference_id = $2 WHERE id = $1`,
          [basis.draftId, completedRunId]
        )
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        pool.query(
          `UPDATE internal_analysis_references SET economics_reference_id = $2 WHERE id = $1`,
          [basis.referenceId, completedRunId]
        )
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        pool.query(
          `UPDATE internal_analysis_drafts SET economics_reference_id = $2 WHERE id = $1`,
          [basis.draftId, failedRunId]
        )
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        pool.query(
          `UPDATE internal_analysis_references SET economics_reference_id = $2 WHERE id = $1`,
          [basis.referenceId, failedRunId]
        )
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        pool.query(
          `UPDATE internal_analysis_drafts SET economics_reference_id = $2 WHERE id = $1`,
          [basis.draftId, otherCompletedRunId]
        )
      ).rejects.toThrow(/internal_analysis_drafts_economics_reference_fund_fk/);
      await expect(
        pool.query(
          `UPDATE internal_analysis_drafts SET economics_reference_id = NULL WHERE id = $1`,
          [basis.draftId]
        )
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        pool.query(
          `UPDATE internal_analysis_references SET economics_reference_id = NULL WHERE id = $1`,
          [basis.referenceId]
        )
      ).resolves.toMatchObject({ rowCount: 1 });

      const analysisEvidenceId = await insertEvidence(pool, basis, {
        idempotencyKey: 'analysis-evidence',
        targetKind: 'analysis_reference',
        analysisReferenceId: basis.referenceId,
        economicsRunId: null,
      });
      const failedRunEvidenceId = await insertEvidence(pool, basis, {
        idempotencyKey: 'failed-run-evidence',
        targetKind: 'internal_economics_run',
        analysisReferenceId: null,
        economicsRunId: failedRunId,
      });
      expect(analysisEvidenceId).toEqual(expect.any(Number));
      expect(failedRunEvidenceId).toEqual(expect.any(Number));

      // The target-kind and target-coupling CHECKs jointly reject unknown,
      // zero, two, and mismatched target shapes.
      await expect(
        insertEvidence(pool, basis, {
          idempotencyKey: 'unknown-target',
          targetKind: 'unknown',
          analysisReferenceId: basis.referenceId,
          economicsRunId: null,
        })
      ).rejects.toThrow(/task_evidence_links_target_(?:kind|coupling)_check/);
      await expect(
        insertEvidence(pool, basis, {
          idempotencyKey: 'zero-targets',
          targetKind: 'analysis_reference',
          analysisReferenceId: null,
          economicsRunId: null,
        })
      ).rejects.toThrow(/task_evidence_links_target_coupling_check/);
      await expect(
        insertEvidence(pool, basis, {
          idempotencyKey: 'two-targets',
          targetKind: 'analysis_reference',
          analysisReferenceId: basis.referenceId,
          economicsRunId: failedRunId,
        })
      ).rejects.toThrow(/task_evidence_links_target_coupling_check/);
      await expect(
        insertEvidence(pool, basis, {
          idempotencyKey: 'analysis-kind-run-target',
          targetKind: 'analysis_reference',
          analysisReferenceId: null,
          economicsRunId: failedRunId,
        })
      ).rejects.toThrow(/task_evidence_links_target_coupling_check/);
      await expect(
        insertEvidence(pool, basis, {
          idempotencyKey: 'run-kind-analysis-target',
          targetKind: 'internal_economics_run',
          analysisReferenceId: basis.referenceId,
          economicsRunId: null,
        })
      ).rejects.toThrow(/task_evidence_links_target_coupling_check/);

      await expect(
        insertEvidence(pool, basis, {
          idempotencyKey: 'cross-fund-reference',
          targetKind: 'analysis_reference',
          analysisReferenceId: other.referenceId,
          economicsRunId: null,
        })
      ).rejects.toThrow(/task_evidence_links_analysis_reference_fund_fk/);
      await expect(
        insertEvidence(pool, basis, {
          idempotencyKey: 'cross-fund-run',
          targetKind: 'internal_economics_run',
          analysisReferenceId: null,
          economicsRunId: otherFailedRunId,
        })
      ).rejects.toThrow(/task_evidence_links_economics_run_fund_fk/);
      await expect(
        insertEvidence(pool, basis, {
          idempotencyKey: 'cross-fund-task',
          targetKind: 'analysis_reference',
          analysisReferenceId: basis.referenceId,
          economicsRunId: null,
          taskId: other.taskId,
        })
      ).rejects.toThrow(/task_evidence_links_task_fund_fk/);

      await insertEvidence(pool, basis, {
        idempotencyKey: 'scoped-idempotency',
        targetKind: 'analysis_reference',
        analysisReferenceId: basis.referenceId,
        economicsRunId: null,
      });
      await expect(
        insertEvidence(pool, basis, {
          idempotencyKey: 'scoped-idempotency',
          targetKind: 'analysis_reference',
          analysisReferenceId: basis.referenceId,
          economicsRunId: null,
        })
      ).rejects.toThrow(/task_evidence_links_fund_task_idempotency_unique/);
      const secondTaskId = await insertTask(pool, basis.fundId, 'Second evidence task');
      await expect(
        insertEvidence(pool, basis, {
          idempotencyKey: 'scoped-idempotency',
          targetKind: 'analysis_reference',
          analysisReferenceId: basis.referenceId,
          economicsRunId: null,
          taskId: secondTaskId,
        })
      ).resolves.toEqual(expect.any(Number));

      const actions = await pool.query<{ conname: string; confdeltype: string }>(
        `
          SELECT conname, confdeltype
          FROM pg_constraint
          WHERE conname = ANY($1::text[])
          ORDER BY conname
        `,
        [
          [
            'internal_analysis_drafts_economics_reference_fund_fk',
            'internal_analysis_references_economics_reference_fund_fk',
            'task_evidence_links_fund_id_funds_id_fk',
            'task_evidence_links_task_fund_fk',
            'task_evidence_links_analysis_reference_fund_fk',
            'task_evidence_links_economics_run_fund_fk',
            'task_evidence_links_created_by_fk',
          ],
        ]
      );
      expect(actions.rows).toEqual([
        { conname: 'internal_analysis_drafts_economics_reference_fund_fk', confdeltype: 'r' },
        { conname: 'internal_analysis_references_economics_reference_fund_fk', confdeltype: 'r' },
        { conname: 'task_evidence_links_analysis_reference_fund_fk', confdeltype: 'r' },
        { conname: 'task_evidence_links_created_by_fk', confdeltype: 'a' },
        { conname: 'task_evidence_links_economics_run_fund_fk', confdeltype: 'r' },
        { conname: 'task_evidence_links_fund_id_funds_id_fk', confdeltype: 'c' },
        { conname: 'task_evidence_links_task_fund_fk', confdeltype: 'c' },
      ]);

      const index = await pool.query<{ definition: string }>(`
        SELECT pg_get_indexdef('public.idx_task_evidence_links_fund_task_id'::regclass) AS definition
      `);
      expect(index.rows[0]?.definition).toBe(
        'CREATE INDEX idx_task_evidence_links_fund_task_id ON public.task_evidence_links USING btree (fund_id, task_id, id)'
      );

      await expect(
        pool.query(`UPDATE task_evidence_links SET request_hash = $2 WHERE id = $1`, [
          analysisEvidenceId,
          hex64('tampered'),
        ])
      ).rejects.toThrow(/immutable_row_update_forbidden: task_evidence_links/);
      await expect(
        pool.query(`DELETE FROM internal_analysis_references WHERE id = $1`, [basis.referenceId])
      ).rejects.toThrow(/task_evidence_links_analysis_reference_fund_fk/);
      await expect(
        pool.query(`DELETE FROM internal_lp_economics_runs WHERE id = $1`, [failedRunId])
      ).rejects.toThrow(/task_evidence_links_economics_run_fund_fk/);
      await expect(
        pool.query(`DELETE FROM task_evidence_links WHERE id = $1`, [analysisEvidenceId])
      ).resolves.toMatchObject({
        rowCount: 1,
      });

      const cascadeEvidenceId = await insertEvidence(pool, basis, {
        idempotencyKey: 'task-cascade',
        targetKind: 'internal_economics_run',
        analysisReferenceId: null,
        economicsRunId: failedRunId,
      });
      await pool.query(`DELETE FROM tasks WHERE id = $1`, [basis.taskId]);
      const cascade = await pool.query<{ id: number }>(
        `SELECT id FROM task_evidence_links WHERE id = $1`,
        [cascadeEvidenceId]
      );
      expect(cascade.rows).toEqual([]);
    });
  }, 120_000);

  it('manifest 24 REFUSES before manual replay and SKIPs when linkage catalog matches', async () => {
    const { connectionString } = await createMigratedDatabase(
      'manifest',
      PRE_LINKAGE_MIGRATION_TAG
    );
    const manifests = await loadManifests();
    const manifest = manifests.find(
      (candidate: { name: string }) => candidate.name === 'internal-economics-linkage'
    );
    if (!manifest) {
      throw new Error('Missing internal-economics-linkage manifest.');
    }

    await withPool(connectionString, async (pool) => {
      const before = await auditManifest(pool, manifest);
      expect(before.action).toBe(ACTION_REFUSE_FOR_HUMAN);
      expect(
        before.objects.some((object: { deltas: Array<{ kind: string }> }) =>
          object.deltas.some((delta) => delta.kind === 'missing-trigger')
        )
      ).toBe(true);

      await pool.query(await readFile(LINKAGE_MIGRATION_FILE, 'utf8'));
      const after = await auditManifest(pool, manifest);
      expect(after.action).toBe(ACTION_SKIP);
      expect(
        after.objects.every((object: { deltas: unknown[] }) => object.deltas.length === 0)
      ).toBe(true);
    });
  }, 120_000);

  it('pins only completed same-fund economics runs with guarded version rotation', async () => {
    const { connectionString } = await createMigratedDatabase('pin_service');

    await withPool(connectionString, async (pool) => {
      const basis = await seedLinkageBasis(pool, 'pin-service');
      const completedRunId = await insertRun(pool, basis, {
        idempotencyKey: 'pin-completed',
        runState: 'completed',
      });
      const failedRunId = await insertRun(pool, basis, {
        idempotencyKey: 'pin-failed',
        runState: 'failed',
      });
      const database = drizzle(pool, { logger: false }) as never;
      const ports = createAnalysisCheckpointPorts(database);

      const attached = await replaceDraftEconomicsReference(ports, {
        fundId: basis.fundId,
        draftId: basis.draftId,
        expectedVersion: 1,
        economicsReferenceId: completedRunId,
      });
      const sameValue = await replaceDraftEconomicsReference(ports, {
        fundId: basis.fundId,
        draftId: basis.draftId,
        expectedVersion: 2,
        economicsReferenceId: completedRunId,
      });

      expect(attached).toMatchObject({ economicsReferenceId: completedRunId, version: 2 });
      expect(sameValue).toMatchObject({ economicsReferenceId: completedRunId, version: 3 });
      await expect(
        replaceDraftEconomicsReference(ports, {
          fundId: basis.fundId,
          draftId: basis.draftId,
          expectedVersion: 2,
          economicsReferenceId: null,
        })
      ).rejects.toMatchObject({ statusCode: 412, code: 'DRAFT_VERSION_CONFLICT' });
      await expect(
        replaceDraftEconomicsReference(ports, {
          fundId: basis.fundId,
          draftId: basis.draftId,
          expectedVersion: 3,
          economicsReferenceId: failedRunId,
        })
      ).rejects.toMatchObject({ statusCode: 409, code: 'ECONOMICS_RUN_NOT_COMPLETED' });
      await expect(
        replaceDraftEconomicsReference(ports, {
          fundId: basis.fundId,
          draftId: basis.draftId,
          expectedVersion: 3,
          economicsReferenceId: completedRunId + 1_000_000,
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'ECONOMICS_RUN_NOT_FOUND' });

      expect(
        await ports.readComponentBasis({
          fundId: basis.fundId,
          component: 'economics',
          id: completedRunId,
        })
      ).toBe(basis.factsSnapshotId);

      await pool.query('UPDATE internal_analysis_drafts SET saved_at = NOW() WHERE id = $1', [
        basis.draftId,
      ]);
      await expect(
        replaceDraftEconomicsReference(ports, {
          fundId: basis.fundId,
          draftId: basis.draftId,
          expectedVersion: 3,
          economicsReferenceId: null,
        })
      ).rejects.toMatchObject({ statusCode: 409, code: 'DRAFT_ALREADY_SAVED' });
    });
  }, 120_000);

  it('creates task evidence once under replay, conflict, concurrency, and cross-actor retry', async () => {
    const { connectionString } = await createMigratedDatabase('evidence_service');

    await withPool(connectionString, async (pool) => {
      const basis = await seedLinkageBasis(pool, 'evidence-service');
      const runId = await insertRun(pool, basis, {
        idempotencyKey: 'evidence-run',
        runState: 'failed',
      });
      const database = drizzle(pool, { logger: false }) as never;
      const common = {
        fundId: basis.fundId,
        taskId: basis.taskId,
        target: { kind: 'analysis_reference' as const, id: basis.referenceId },
        actorId: basis.userId,
        idempotencyKey: 'evidence-create',
      };

      const created = await createTaskEvidenceLink(common, { database });
      const crossActorReplay = await createTaskEvidenceLink(
        { ...common, actorId: null },
        { database }
      );

      expect(created.replayed).toBe(false);
      expect(crossActorReplay).toEqual({ ...created, replayed: true });
      expect(Object.keys(created.evidenceLink).sort()).toEqual(
        ['contractVersion', 'createdAt', 'fundId', 'linkId', 'target', 'taskId'].sort()
      );
      await expect(
        createTaskEvidenceLink(
          {
            ...common,
            target: { kind: 'internal_economics_run', id: runId },
          },
          { database }
        )
      ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });

      const concurrent = await Promise.all(
        Array.from({ length: 8 }, () =>
          createTaskEvidenceLink({ ...common, idempotencyKey: 'evidence-concurrent' }, { database })
        )
      );
      expect(new Set(concurrent.map((result) => result.evidenceLink.linkId)).size).toBe(1);
      expect(concurrent.filter((result) => !result.replayed)).toHaveLength(1);

      const economics = await createTaskEvidenceLink(
        {
          ...common,
          target: { kind: 'internal_economics_run', id: runId },
          idempotencyKey: 'evidence-economics',
        },
        { database }
      );
      const listed = await listTaskEvidenceLinks(basis.fundId, basis.taskId, { database });
      expect(listed.map((link) => link.linkId)).toEqual([
        created.evidenceLink.linkId,
        concurrent[0]!.evidenceLink.linkId,
        economics.evidenceLink.linkId,
      ]);
      expect(listed.map((link) => link.target)).toEqual([
        { kind: 'analysis_reference', id: basis.referenceId },
        { kind: 'analysis_reference', id: basis.referenceId },
        { kind: 'internal_economics_run', id: runId },
      ]);
      expect(
        listed.every(
          (link) =>
            Object.keys(link).sort().join(',') ===
            ['contractVersion', 'createdAt', 'fundId', 'linkId', 'target', 'taskId']
              .sort()
              .join(',')
        )
      ).toBe(true);

      const persisted = await pool.query<{
        count: number;
        created_by: number | null;
        idempotency_key: string;
      }>(
        'SELECT count(*) OVER ()::integer AS count, created_by, idempotency_key ' +
          'FROM task_evidence_links WHERE fund_id = $1 AND task_id = $2 ORDER BY id',
        [basis.fundId, basis.taskId]
      );
      expect(persisted.rows).toHaveLength(3);
      expect(persisted.rows[0]).toMatchObject({
        count: 3,
        created_by: basis.userId,
        idempotency_key: 'evidence-create',
      });

      await expect(
        createTaskEvidenceLink(
          { ...common, fundId: basis.fundId + 1, idempotencyKey: 'cross-fund' },
          { database }
        )
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  }, 120_000);
});

interface LinkageBasis {
  fundId: number;
  userId: number;
  vehicleId: number;
  sourceArtifactId: number;
  factsSnapshotId: number;
  planVersionId: number;
  forecastSnapshotId: number;
  resultSnapshotId: number;
  policyId: number;
  draftId: number;
  referenceId: number;
  taskId: number;
}

interface RunInput {
  idempotencyKey: string;
  runState: 'completed' | 'failed';
}

interface EvidenceInput {
  idempotencyKey: string;
  targetKind: string;
  analysisReferenceId: number | null;
  economicsRunId: number | null;
  taskId?: number;
}

interface PreflightScenario {
  name: string;
  arrange: (pool: Pool, basis: LinkageBasis) => Promise<PreflightPin>;
}

interface PreflightPin {
  table: 'internal_analysis_drafts' | 'internal_analysis_references';
  id: number;
  economicsReferenceId: number;
}

interface DrizzleCatalogScenarioBase {
  name: string;
  seed: (pool: Pool) => Promise<void>;
}

interface DrizzleCatalogApplyScenario extends DrizzleCatalogScenarioBase {
  outcome: 'applies';
}

interface DrizzleCatalogRefuseScenario extends DrizzleCatalogScenarioBase {
  outcome: 'refuses';
  expectedError: RegExp;
  assertBeforeRefusal?: (catalog: LinkageReplayCatalogSnapshot) => void;
}

type DrizzleCatalogScenario = DrizzleCatalogApplyScenario | DrizzleCatalogRefuseScenario;

interface TaskEvidenceCatalogDriftOptions {
  idColumn: 'serial PRIMARY KEY NOT NULL' | 'bigint PRIMARY KEY NOT NULL';
  fundIdColumn: 'integer NOT NULL' | 'integer';
  targetCoupling: 'canonical' | 'wrong';
}

type TaskCompositeUniqueConstraintName = 'tasks_id_fund_unique' | 'tasks_id_fund_supporting_unique';

interface LinkageReplayCatalogSnapshot {
  taskEvidenceRelation: string | null;
  taskEvidenceColumns: Array<{
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    character_maximum_length: number | null;
    column_default: string | null;
  }>;
  taskEvidenceSerialIdentity: {
    default_expression: string | null;
    owned_sequence: string | null;
    canonical_sequence_owned_by: string | null;
  } | null;
  taskEvidenceSequences: Array<{
    sequence_name: string;
    owned_by: string | null;
  }>;
  constraints: Array<{ table_name: string; conname: string; definition: string }>;
  indexes: Array<{
    schema_name: string;
    table_name: string;
    indexname: string;
    indexdef: string;
  }>;
  triggers: Array<{
    schema_name: string;
    table_name: string;
    tgname: string;
    definition: string;
    enabled: string;
  }>;
}

const LINKAGE_CONSTRAINT_NAMES = [
  'tasks_id_fund_unique',
  'tasks_id_fund_supporting_unique',
  'internal_analysis_drafts_economics_reference_fund_fk',
  'internal_analysis_references_economics_reference_fund_fk',
  'task_evidence_links_pkey',
  'task_evidence_links_fund_id_funds_id_fk',
  'task_evidence_links_task_fund_fk',
  'task_evidence_links_analysis_reference_fund_fk',
  'task_evidence_links_economics_run_fund_fk',
  'task_evidence_links_created_by_fk',
  'task_evidence_links_fund_task_idempotency_unique',
  'task_evidence_links_target_kind_check',
  'task_evidence_links_target_coupling_check',
] as const;

async function createTaskEvidenceTableForCatalogDrift(
  pool: Pool,
  options: TaskEvidenceCatalogDriftOptions,
  taskCompositeUniqueConstraint: TaskCompositeUniqueConstraintName = 'tasks_id_fund_unique'
): Promise<void> {
  const targetCoupling =
    options.targetCoupling === 'canonical'
      ? `
          (
            "target_kind" = 'analysis_reference'
            AND "analysis_reference_id" IS NOT NULL
            AND "economics_run_id" IS NULL
          )
          OR (
            "target_kind" = 'internal_economics_run'
            AND "economics_run_id" IS NOT NULL
            AND "analysis_reference_id" IS NULL
          )
        `
      : `
          (
            "target_kind" = 'analysis_reference'
            AND "analysis_reference_id" IS NOT NULL
            AND "economics_run_id" IS NULL
          )
          OR (
            "target_kind" = 'internal_economics_run'
            AND "economics_run_id" IS NOT NULL
            AND "analysis_reference_id" IS NOT NULL
          )
        `;

  await pool.query(`
    ALTER TABLE tasks
    ADD CONSTRAINT ${taskCompositeUniqueConstraint} UNIQUE (id, fund_id)
  `);
  await pool.query(`
    CREATE TABLE task_evidence_links (
      "id" ${options.idColumn},
      "fund_id" ${options.fundIdColumn},
      "task_id" integer NOT NULL,
      "target_kind" varchar NOT NULL,
      "analysis_reference_id" integer,
      "economics_run_id" integer,
      "idempotency_key" varchar(128) NOT NULL,
      "request_hash" varchar(64) NOT NULL,
      "created_by" integer,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "task_evidence_links_fund_id_funds_id_fk"
        FOREIGN KEY ("fund_id") REFERENCES funds(id) ON DELETE CASCADE,
      CONSTRAINT "task_evidence_links_task_fund_fk"
        FOREIGN KEY ("task_id", "fund_id")
        REFERENCES tasks(id, fund_id) ON DELETE CASCADE,
      CONSTRAINT "task_evidence_links_analysis_reference_fund_fk"
        FOREIGN KEY ("analysis_reference_id", "fund_id")
        REFERENCES internal_analysis_references(id, fund_id) ON DELETE RESTRICT,
      CONSTRAINT "task_evidence_links_economics_run_fund_fk"
        FOREIGN KEY ("economics_run_id", "fund_id")
        REFERENCES internal_lp_economics_runs(id, fund_id) ON DELETE RESTRICT,
      CONSTRAINT "task_evidence_links_created_by_fk"
        FOREIGN KEY ("created_by") REFERENCES users(id),
      CONSTRAINT "task_evidence_links_fund_task_idempotency_unique"
        UNIQUE ("fund_id", "task_id", "idempotency_key"),
      CONSTRAINT "task_evidence_links_target_kind_check"
        CHECK ("target_kind" IN ('analysis_reference', 'internal_economics_run')),
      CONSTRAINT "task_evidence_links_target_coupling_check"
        CHECK (${targetCoupling})
    )
  `);
}

async function seedCanonicalTaskEvidenceTable(pool: Pool): Promise<void> {
  await createTaskEvidenceTableForCatalogDrift(pool, {
    idColumn: 'serial PRIMARY KEY NOT NULL',
    fundIdColumn: 'integer NOT NULL',
    targetCoupling: 'canonical',
  });
}

async function seedTasksIdFundUnique(pool: Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE tasks
    ADD CONSTRAINT tasks_id_fund_unique UNIQUE (id, fund_id)
  `);
}

async function seedTaskEvidenceTableWithout0047TasksUnique(pool: Pool): Promise<void> {
  await createTaskEvidenceTableForCatalogDrift(
    pool,
    {
      idColumn: 'serial PRIMARY KEY NOT NULL',
      fundIdColumn: 'integer NOT NULL',
      targetCoupling: 'canonical',
    },
    'tasks_id_fund_supporting_unique'
  );
}

async function seedCanonicalAnalysisLinkageForeignKeys(pool: Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE internal_analysis_drafts
    ADD CONSTRAINT internal_analysis_drafts_economics_reference_fund_fk
    FOREIGN KEY (economics_reference_id, fund_id)
    REFERENCES internal_lp_economics_runs(id, fund_id)
    ON DELETE RESTRICT
  `);
  await pool.query(`
    ALTER TABLE internal_analysis_references
    ADD CONSTRAINT internal_analysis_references_economics_reference_fund_fk
    FOREIGN KEY (economics_reference_id, fund_id)
    REFERENCES internal_lp_economics_runs(id, fund_id)
    ON DELETE RESTRICT
  `);
}

async function seedCanonicalLinkageCatalog(pool: Pool): Promise<void> {
  await seedCanonicalTaskEvidenceTable(pool);
  await seedCanonicalAnalysisLinkageForeignKeys(pool);
}

async function seedCanonicalEvidenceIndexAndTrigger(pool: Pool): Promise<void> {
  await seedCanonicalEvidenceIndex(pool);
  await seedCanonicalEvidenceTrigger(pool);
}

async function seedCanonicalEvidenceIndex(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE INDEX idx_task_evidence_links_fund_task_id
    ON task_evidence_links (fund_id, task_id, id)
  `);
}

async function seedCanonicalEvidenceTrigger(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TRIGGER task_evidence_links_forbid_update_trigger
    BEFORE UPDATE ON task_evidence_links
    FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update()
  `);
}

async function linkageReplayCatalogSnapshot(pool: Pool): Promise<LinkageReplayCatalogSnapshot> {
  const relation = await pool.query<{ relation: string | null }>(`
    SELECT to_regclass('public.task_evidence_links')::text AS relation
  `);
  const columns = await pool.query<LinkageReplayCatalogSnapshot['taskEvidenceColumns'][number]>(`
    SELECT
      column_name,
      data_type,
      udt_name,
      is_nullable,
      character_maximum_length,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_evidence_links'
    ORDER BY ordinal_position
  `);
  const serialIdentity = await pool.query<
    NonNullable<LinkageReplayCatalogSnapshot['taskEvidenceSerialIdentity']>
  >(`
    SELECT
      column_catalog.column_default AS default_expression,
      pg_get_serial_sequence('public.task_evidence_links', 'id') AS owned_sequence,
      (
        SELECT format(
          '%I.%I.%I',
          owner_namespace.nspname,
          owner_table.relname,
          owner_attribute.attname
        )
        FROM pg_depend AS ownership_dependency
        JOIN pg_class AS owned_sequence_relation
          ON owned_sequence_relation.oid = ownership_dependency.objid
        JOIN pg_class AS owner_table
          ON owner_table.oid = ownership_dependency.refobjid
        JOIN pg_namespace AS owner_namespace
          ON owner_namespace.oid = owner_table.relnamespace
        JOIN pg_attribute AS owner_attribute
          ON owner_attribute.attrelid = owner_table.oid
          AND owner_attribute.attnum = ownership_dependency.refobjsubid
        WHERE ownership_dependency.classid = 'pg_class'::regclass
          AND ownership_dependency.refclassid = 'pg_class'::regclass
          AND ownership_dependency.deptype = 'a'
          AND owned_sequence_relation.oid = to_regclass('public.task_evidence_links_id_seq')
      ) AS canonical_sequence_owned_by
    FROM information_schema.columns AS column_catalog
    WHERE column_catalog.table_schema = 'public'
      AND column_catalog.table_name = 'task_evidence_links'
      AND column_catalog.column_name = 'id'
  `);
  const sequences = await pool.query<
    LinkageReplayCatalogSnapshot['taskEvidenceSequences'][number]
  >(`
    SELECT
      sequence_catalog.relname AS sequence_name,
      (
        SELECT format(
          '%I.%I.%I',
          owner_namespace.nspname,
          owner_table.relname,
          owner_attribute.attname
        )
        FROM pg_depend AS ownership_dependency
        JOIN pg_class AS owner_table
          ON owner_table.oid = ownership_dependency.refobjid
        JOIN pg_namespace AS owner_namespace
          ON owner_namespace.oid = owner_table.relnamespace
        JOIN pg_attribute AS owner_attribute
          ON owner_attribute.attrelid = owner_table.oid
          AND owner_attribute.attnum = ownership_dependency.refobjsubid
        WHERE ownership_dependency.classid = 'pg_class'::regclass
          AND ownership_dependency.refclassid = 'pg_class'::regclass
          AND ownership_dependency.deptype = 'a'
          AND ownership_dependency.objid = sequence_catalog.oid
      ) AS owned_by
    FROM pg_class AS sequence_catalog
    JOIN pg_namespace AS namespace_catalog
      ON namespace_catalog.oid = sequence_catalog.relnamespace
    WHERE namespace_catalog.nspname = 'public'
      AND sequence_catalog.relkind = 'S'
      AND sequence_catalog.relname IN (
        'task_evidence_links_id_seq',
        'task_evidence_links_alternate_id_seq'
      )
    ORDER BY sequence_catalog.relname
  `);
  const constraints = await pool.query<LinkageReplayCatalogSnapshot['constraints'][number]>(
    `
      SELECT
        relation_catalog.relname AS table_name,
        constraint_catalog.conname,
        pg_get_constraintdef(constraint_catalog.oid) AS definition
      FROM pg_constraint AS constraint_catalog
      JOIN pg_class AS relation_catalog ON relation_catalog.oid = constraint_catalog.conrelid
      JOIN pg_namespace AS namespace_catalog ON namespace_catalog.oid = relation_catalog.relnamespace
      WHERE namespace_catalog.nspname = 'public'
        AND (
          relation_catalog.relname = 'task_evidence_links'
          OR (
            relation_catalog.relname = ANY($1::text[])
            AND constraint_catalog.conname = ANY($2::text[])
          )
        )
      ORDER BY relation_catalog.relname, constraint_catalog.conname
    `,
    [
      ['internal_analysis_drafts', 'internal_analysis_references', 'tasks'],
      LINKAGE_CONSTRAINT_NAMES,
    ]
  );
  const indexes = await pool.query<LinkageReplayCatalogSnapshot['indexes'][number]>(`
    SELECT schemaname AS schema_name, tablename AS table_name, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND (
        tablename = 'task_evidence_links'
        OR indexname = 'idx_task_evidence_links_fund_task_id'
      )
    ORDER BY schemaname, tablename, indexname
  `);
  const triggers = await pool.query<LinkageReplayCatalogSnapshot['triggers'][number]>(`
    SELECT
      namespace_catalog.nspname AS schema_name,
      relation_catalog.relname AS table_name,
      trigger_catalog.tgname,
      pg_get_triggerdef(trigger_catalog.oid) AS definition,
      trigger_catalog.tgenabled AS enabled
    FROM pg_trigger AS trigger_catalog
    JOIN pg_class AS relation_catalog ON relation_catalog.oid = trigger_catalog.tgrelid
    JOIN pg_namespace AS namespace_catalog ON namespace_catalog.oid = relation_catalog.relnamespace
    WHERE NOT trigger_catalog.tgisinternal
      AND (
        (
          namespace_catalog.nspname = 'public'
          AND relation_catalog.relname = 'task_evidence_links'
        )
        OR trigger_catalog.tgname = 'task_evidence_links_forbid_update_trigger'
      )
    ORDER BY namespace_catalog.nspname, relation_catalog.relname, trigger_catalog.tgname
  `);

  return {
    taskEvidenceRelation: relation.rows[0]?.relation ?? null,
    taskEvidenceColumns: columns.rows,
    taskEvidenceSerialIdentity: serialIdentity.rows[0] ?? null,
    taskEvidenceSequences: sequences.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    triggers: triggers.rows,
  };
}

async function drizzleMigrationLedgerSnapshot(
  pool: Pool
): Promise<Array<{ hash: string; created_at: string }>> {
  const result = await pool.query<{ hash: string; created_at: string }>(`
    SELECT hash, created_at::text AS created_at
    FROM drizzle_migrations
    ORDER BY created_at, hash
  `);
  return result.rows;
}

async function exerciseDrizzleCatalogScenario(scenario: DrizzleCatalogScenario): Promise<void> {
  await exercisePostgresReplayDriftScenario({
    scenario,
    createDatabase: (name) => createMigratedDatabase(name, PRE_LINKAGE_MIGRATION_TAG),
    withPool,
    captureCatalog: linkageReplayCatalogSnapshot,
    captureLedger: drizzleMigrationLedgerSnapshot,
    runMigration: (connectionString) =>
      runMigrationsWithConnectionString(connectionString, LINKAGE_MIGRATION_TAG),
    assertApplied: async (pool, connectionString) => {
      const catalogAfter = await linkageReplayCatalogSnapshot(pool);
      expect(catalogAfter.taskEvidenceRelation).toBe('task_evidence_links');
      expect(catalogAfter.indexes).toHaveLength(3);
      expect(catalogAfter.indexes).toContainEqual({
        schema_name: 'public',
        table_name: 'task_evidence_links',
        indexname: 'idx_task_evidence_links_fund_task_id',
        indexdef:
          'CREATE INDEX idx_task_evidence_links_fund_task_id ON public.task_evidence_links USING btree (fund_id, task_id, id)',
      });
      expect(catalogAfter.triggers).toEqual([
        {
          schema_name: 'public',
          table_name: 'task_evidence_links',
          tgname: 'task_evidence_links_forbid_update_trigger',
          definition:
            'CREATE TRIGGER task_evidence_links_forbid_update_trigger BEFORE UPDATE ON public.task_evidence_links FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update()',
          enabled: 'O',
        },
      ]);
      const migrationState = await getMigrationStateFromConnectionString(connectionString);
      expect(migrationState.applied.map((entry) => entry.name)).toContain(LINKAGE_MIGRATION_TAG);
    },
    assertRefused: async (_pool, connectionString) => {
      const migrationState = await getMigrationStateFromConnectionString(connectionString);
      expect(migrationState.applied.map((entry) => entry.name)).not.toContain(
        LINKAGE_MIGRATION_TAG
      );
    },
  });
}

async function seedLinkageBasis(pool: Pool, label: string): Promise<LinkageBasis> {
  const fundId = nextFundId();
  await pool.query(
    `
      INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, $2, 10000000, '0.0200', '0.2000', 2026)
    `,
    [fundId, `Linkage Fund ${fundId}`]
  );
  const userId = await insertedId(
    pool,
    `INSERT INTO users (username, password) VALUES ($1, 'x') RETURNING id`,
    [`linkage-${fundId}`]
  );
  const vehicleId = await insertedId(
    pool,
    `
      INSERT INTO vehicles (fund_id, vehicle_slug, vehicle_type, name)
      VALUES ($1, $2, 'main_fund', $3)
      RETURNING id
    `,
    [fundId, `main-${fundId}`, `Main Fund ${fundId}`]
  );
  const sourceArtifactId = await insertedId(
    pool,
    `
      INSERT INTO source_artifacts (
        fund_id, source_type, media_type, byte_count, payload_sha256, payload,
        purge_after, idempotency_key, request_hash
      ) VALUES ($1, 'manual', 'text/csv', 1, $2, $3, NOW() + INTERVAL '30 days', $4, $5)
      RETURNING id
    `,
    [
      fundId,
      hex64(`artifact-${fundId}`),
      Buffer.from('a'),
      `artifact-${fundId}`,
      hex64(`artifact-request-${fundId}`),
    ]
  );
  const factsSnapshotId = await insertedId(
    pool,
    `
      INSERT INTO financial_facts_snapshots (
        fund_id, policy_version, payload_schema_id, as_of_date, knowledge_cutoff,
        vehicle_scope, vehicle_ids, selection_set_hash, source_facts_input_hash,
        snapshot_input_hash, payload, consumer_evaluations, idempotency_key, request_hash
      ) VALUES (
        $1, 'financial-facts-policy/1.2.0', 'financial-facts-payload/3', '2026-06-30', NOW(),
        'fund_all', '[]'::jsonb, $2, $3, $4, '{}'::jsonb, '[]'::jsonb, $5, $6
      )
      RETURNING id
    `,
    [
      fundId,
      hex64(`selection-${fundId}`),
      hex64(`source-${fundId}`),
      hex64(`snapshot-${fundId}`),
      `facts-${fundId}`,
      hex64(`facts-request-${fundId}`),
    ]
  );
  const planVersionId = await insertedId(
    pool,
    `
      INSERT INTO current_plan_versions (
        fund_id, version, source_config_id, source_config_version,
        source_facts_snapshot_id, deployable_capital_usd, plan_transformation_version,
        allocations, pacing_assumptions, cohort_assumptions, reserve_policy_version,
        assumptions_hash, idempotency_key, request_hash
      ) VALUES (
        $1, 1, 1, 1, $2, '10000000.000000', 'plan-transformation/1.0.0',
        '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'reserve-policy/1.0.0',
        $3, $4, $5
      )
      RETURNING id
    `,
    [
      fundId,
      factsSnapshotId,
      hex64(`plan-${fundId}`),
      `plan-${fundId}`,
      hex64(`plan-request-${fundId}`),
    ]
  );
  const forecastSnapshotId = await seedFundSnapshot(pool, fundId, 'CURRENT_FORECAST_V2');
  const resultSnapshotId = await seedFundSnapshot(pool, fundId, 'INTERNAL_LP_ECONOMICS');
  const envelopeId = await insertedId(
    pool,
    `
      INSERT INTO internal_capital_envelope_versions (
        fund_id, version, main_fund_vehicle_id, lp_commitment_usd, gp_commitment_usd,
        total_commitment_usd, currency, effective_at, source_artifact_id,
        source_config_id, source_config_version, source_config_hash, attested_by,
        attested_at, envelope_hash, idempotency_key, request_hash
      ) VALUES (
        $1, 1, $2, '10000000.000000', '0.000000', '10000000.000000', 'USD', NOW(), $3,
        1, 1, $4, $5, NOW(), $6, $7, $8
      )
      RETURNING id
    `,
    [
      fundId,
      vehicleId,
      sourceArtifactId,
      hex64(`config-${fundId}`),
      userId,
      hex64(`envelope-${fundId}`),
      `envelope-${fundId}`,
      hex64(`envelope-request-${fundId}`),
    ]
  );
  const policyId = await insertedId(
    pool,
    `
      INSERT INTO internal_economics_policy_versions (
        fund_id, version, policy_schema_version, policy_body, terminal_period_end,
        terminal_resolution_methodology_version, capital_envelope_version_id,
        assumptions_hash, source_config_id, source_config_version, created_by,
        idempotency_key, request_hash
      ) VALUES (
        $1, 1, 'internal-economics-policy/1.0.0', '{}'::jsonb, '2036-12-31',
        'terminal-resolution/1.0.0', $2, $3, 1, 1, $4, $5, $6
      )
      RETURNING id
    `,
    [
      fundId,
      envelopeId,
      hex64(`policy-assumptions-${fundId}`),
      userId,
      `policy-${fundId}`,
      hex64(`policy-request-${fundId}`),
    ]
  );
  const draftId = await insertedId(
    pool,
    `
      INSERT INTO internal_analysis_drafts (
        fund_id, period_kind, period_start, period_end, knowledge_cutoff,
        financial_facts_snapshot_id, forecast_fund_snapshot_id, created_by,
        idempotency_key, request_hash
      ) VALUES ($1, 'manual', '2026-01-01', '2026-03-31', NOW(), $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [
      fundId,
      factsSnapshotId,
      forecastSnapshotId,
      userId,
      `draft-${label}-${fundId}`,
      hex64(`draft-${label}-${fundId}`),
    ]
  );
  const referenceId = await insertedId(
    pool,
    `
      INSERT INTO internal_analysis_references (
        fund_id, period_kind, period_start, period_end, knowledge_cutoff,
        financial_facts_snapshot_id, forecast_fund_snapshot_id, created_by,
        idempotency_key, request_hash
      ) VALUES ($1, 'manual', '2026-01-01', '2026-03-31', NOW(), $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [
      fundId,
      factsSnapshotId,
      forecastSnapshotId,
      userId,
      `reference-${label}-${fundId}`,
      hex64(`reference-${label}-${fundId}`),
    ]
  );
  const taskId = await insertTask(pool, fundId, `Evidence task ${label}`);

  return {
    fundId,
    userId,
    vehicleId,
    sourceArtifactId,
    factsSnapshotId,
    planVersionId,
    forecastSnapshotId,
    resultSnapshotId,
    policyId,
    draftId,
    referenceId,
    taskId,
  };
}

interface LinkageDataCounts {
  draftCount: number;
  referenceCount: number;
  runCount: number;
  taskCount: number;
}

async function linkageDataCounts(pool: Pool): Promise<LinkageDataCounts> {
  const result = await pool.query<LinkageDataCounts>(`
    SELECT
      (SELECT count(*) FROM internal_analysis_drafts)::integer AS "draftCount",
      (SELECT count(*) FROM internal_analysis_references)::integer AS "referenceCount",
      (SELECT count(*) FROM internal_lp_economics_runs)::integer AS "runCount",
      (SELECT count(*) FROM tasks)::integer AS "taskCount"
  `);
  const counts = result.rows[0];
  if (!counts) throw new Error('Expected linkage data counts.');
  return counts;
}

async function economicsReferenceIdForPin(pool: Pool, pin: PreflightPin): Promise<number | null> {
  const tableName =
    pin.table === 'internal_analysis_drafts'
      ? 'internal_analysis_drafts'
      : 'internal_analysis_references';
  const result = await pool.query<{ economics_reference_id: number | null }>(
    `SELECT economics_reference_id FROM ${tableName} WHERE id = $1`,
    [pin.id]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Missing preflight pin ${pin.table}:${pin.id}.`);
  return row.economics_reference_id;
}

function insertRun(pool: Pool, basis: LinkageBasis, input: RunInput): Promise<number> {
  const completed = input.runState === 'completed';
  return insertedId(
    pool,
    `
      INSERT INTO internal_lp_economics_runs (
        fund_id, policy_version_id, facts_snapshot_id, plan_version_id,
        forecast_snapshot_id, forecast_snapshot_type, result_snapshot_id,
        result_snapshot_type, run_state, result_status, failure_code,
        failure_context, evaluation_clock, terminal_mode, engine_version,
        methodology_version, input_hash, result_hash, created_by,
        idempotency_key, request_hash
      ) VALUES (
        $1, $2, $3, $4, $5, 'CURRENT_FORECAST_V2', $6, $7, $8, $9, $10,
        $11::jsonb, NOW(), 'liquidate_at_horizon', 'cash-assembly-period-loop/1.0.0',
        'lp-economics/1.0.0', $12, $13, $14, $15, $16
      )
      RETURNING id
    `,
    [
      basis.fundId,
      basis.policyId,
      basis.factsSnapshotId,
      basis.planVersionId,
      basis.forecastSnapshotId,
      completed ? basis.resultSnapshotId : null,
      completed ? 'INTERNAL_LP_ECONOMICS' : null,
      input.runState,
      completed ? 'indicative' : null,
      completed ? null : 'CORE_ROW_MAPPING_MISMATCH',
      completed ? null : '{}',
      hex64(`run-input-${input.idempotencyKey}`),
      completed ? hex64(`run-result-${input.idempotencyKey}`) : null,
      basis.userId,
      input.idempotencyKey,
      hex64(`run-request-${input.idempotencyKey}`),
    ]
  );
}

function insertEvidence(pool: Pool, basis: LinkageBasis, input: EvidenceInput): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO task_evidence_links (
        fund_id, task_id, target_kind, analysis_reference_id, economics_run_id,
        idempotency_key, request_hash, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      basis.fundId,
      input.taskId ?? basis.taskId,
      input.targetKind,
      input.analysisReferenceId,
      input.economicsRunId,
      input.idempotencyKey,
      hex64(`evidence-request-${input.idempotencyKey}`),
      basis.userId,
    ]
  );
}

function insertTask(pool: Pool, fundId: number, title: string): Promise<number> {
  return insertedId(pool, `INSERT INTO tasks (fund_id, title) VALUES ($1, $2) RETURNING id`, [
    fundId,
    title,
  ]);
}

async function seedFundSnapshot(pool: Pool, fundId: number, type: string): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO fund_snapshots (
        fund_id, type, payload, calc_version, correlation_id, snapshot_time
      ) VALUES ($1, $2, '{}'::jsonb, 'lp-economics/1.0.0', $3, NOW())
      RETURNING id
    `,
    [fundId, type, `00000000-0000-4000-8000-${String(fundId).padStart(12, '0')}`]
  );
}

function splitMigrationStatements(migrationSql: string): string[] {
  return migrationSql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function migrationStatementPhases(statements: readonly string[]): {
  lock: string;
  remaining: readonly string[];
} {
  const [lock, ...remaining] = statements;
  if (
    !lock?.includes('LOCK TABLE') ||
    statements.some((statement) => /^\s*(?:BEGIN|COMMIT);\s*$/m.test(statement))
  ) {
    throw new Error('0047 must begin with LOCK TABLE and leave transaction control to Drizzle.');
  }
  return { lock, remaining };
}

async function createMigratedDatabase(
  suffix: string,
  targetVersion: string = LINKAGE_MIGRATION_TAG
): Promise<{ connectionString: string; state: { applied: Array<{ name: string }> } }> {
  if (!adminPool) throw new Error('Admin pool not initialized.');
  const normalizedSuffix = suffix
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]/g, '_')
    .slice(0, 16);
  databaseCounter += 1;
  const databaseName = `ie_linkage_${normalizedSuffix}_${process.pid}_${Date.now()}_${databaseCounter}`;
  createdDatabases.push(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const connectionString = databaseConnectionString(databaseName);
  const state = await runMigrationsWithConnectionString(connectionString, targetVersion);
  return { connectionString, state };
}

function databaseConnectionString(databaseName: string): string {
  const base = new URL(testDatabaseConnectionString());
  base.pathname = `/${databaseName}`;
  return base.toString();
}

function testDatabaseConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

async function insertedId(pool: Pool, sql: string, values: unknown[]): Promise<number> {
  const result = await pool.query(sql, values);
  const id = result.rows[0]?.id;
  if (typeof id !== 'number') throw new Error('Expected inserted id.');
  return id;
}

async function withPool<T>(
  connectionString: string,
  callback: (pool: Pool) => Promise<T>
): Promise<T> {
  const pool = new Pool({ connectionString, max: 4 });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Deterministic 64-char hex filler for provenance hash columns. */
function hex64(seed: string): string {
  let value = '';
  for (let index = 0; value.length < 64; index += 1) {
    value += (seed.charCodeAt(index % seed.length) + index).toString(16).padStart(2, '0');
  }
  return value.slice(0, 64);
}

function nextFundId(): number {
  fundIdCounter += 1;
  return fundIdCounter;
}
