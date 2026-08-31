/**
 * PostgreSQL proofs for migration 0054 (F_1.8.0 / issue #1289).
 *
 * Exercises the journaled SQL against real PostgreSQL: apply-twice
 * convergence, drift-refusing preflights (columns, defaults, serial
 * sequences, indexes, triggers), the lifecycle trigger, supersession,
 * outcome immutability, evidence-link coupling, and the idempotent
 * decision/link/task command services.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../../helpers/testcontainers';
import {
  getMigrationStateFromConnectionString,
  runMigrationsWithConnectionString,
} from '../../helpers/testcontainers-migration';
import {
  createDecision,
  loadDecision,
  recordOutcome,
  supersedeDecision,
  transitionDecision,
} from '../../../server/services/operating-objects/decision-service';
import {
  createDecisionEvidenceLink,
  listDecisionEvidenceLinks,
} from '../../../server/services/operating-objects/decision-evidence-link-service';
import {
  createTask,
  loadTask,
  updateTask,
} from '../../../server/services/operating-objects/task-service';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const createdDatabases: string[] = [];

const PRE_SPINE_MIGRATION_TAG = '0053_g3_release_gate_hardening';
const SPINE_MIGRATION_TAG = '0054_operating_decisions_spine';
const SPINE_MIGRATION_FILE = path.join(
  process.cwd(),
  'migrations',
  `${SPINE_MIGRATION_TAG}.sql`
);

let adminPool: Pool | undefined;
let fundIdCounter = 228_400_000;
let databaseCounter = 0;
let startedTestContainers = false;

interface DriftScenario {
  name: string;
  mutate: (pool: Pool) => Promise<void>;
  pattern: RegExp;
}

const DRIFT_SCENARIOS: readonly DriftScenario[] = [
  {
    name: 'missing deferred follow-up CHECK',
    mutate: async (pool) => {
      await pool.query(
        'ALTER TABLE operating_decisions DROP CONSTRAINT operating_decisions_deferred_follow_up_check'
      );
    },
    pattern: /operating_decisions_spine_all_present_catalog_drift/,
  },
  {
    name: 'wrong status column default',
    mutate: async (pool) => {
      await pool.query(
        "ALTER TABLE operating_decisions ALTER COLUMN status SET DEFAULT 'accepted'"
      );
    },
    pattern: /operating_decisions_spine_all_present_catalog_drift/,
  },
  {
    name: 'id serial default repointed at an alternate sequence',
    mutate: async (pool) => {
      await pool.query('CREATE SEQUENCE public.operating_decisions_alternate_id_seq');
      await pool.query(`
        ALTER TABLE operating_decisions
        ALTER COLUMN id SET DEFAULT nextval('public.operating_decisions_alternate_id_seq'::regclass)
      `);
    },
    pattern: /operating_decisions_spine_all_present_catalog_drift/,
  },
  {
    name: 'canonical id default without canonical sequence ownership',
    mutate: async (pool) => {
      await pool.query('ALTER SEQUENCE public.operating_decisions_id_seq OWNED BY NONE');
    },
    pattern: /operating_decisions_spine_all_present_catalog_drift/,
  },
  {
    name: 'missing created_at default on decision evidence',
    mutate: async (pool) => {
      await pool.query(
        'ALTER TABLE decision_evidence_links ALTER COLUMN created_at DROP DEFAULT'
      );
    },
    pattern: /operating_decisions_spine_all_present_catalog_drift/,
  },
  {
    name: 'extra column on operating_decisions',
    mutate: async (pool) => {
      await pool.query('ALTER TABLE operating_decisions ADD COLUMN replay_probe integer');
    },
    pattern: /operating_decisions_spine_all_present_catalog_drift/,
  },
  {
    name: 'tasks request_hash missing while idempotency_key present',
    mutate: async (pool) => {
      await pool.query('ALTER TABLE tasks DROP COLUMN request_hash');
    },
    pattern: /operating_decisions_spine_partial_catalog_state/,
  },
  {
    name: 'tasks idempotency_key with the wrong length',
    mutate: async (pool) => {
      await pool.query('ALTER TABLE tasks ALTER COLUMN idempotency_key TYPE varchar(64)');
    },
    pattern: /operating_decisions_spine_tasks_column_drift/,
  },
  {
    name: 'same-named tasks idempotency index without the NOT NULL predicate',
    mutate: async (pool) => {
      await pool.query('DROP INDEX tasks_fund_idempotency_unique');
      await pool.query(
        'CREATE UNIQUE INDEX tasks_fund_idempotency_unique ON tasks (fund_id, idempotency_key)'
      );
    },
    pattern: /operating_decisions_spine_index_drift: tasks_fund_idempotency_unique/,
  },
  {
    // A failed CREATE INDEX CONCURRENTLY leaves a same-named index whose
    // indexdef is byte-identical but whose pg_index validity flags are false;
    // CREATE INDEX IF NOT EXISTS would keep it, so the preflight must refuse.
    // The flag flip simulates that leftover directly (constructing a real
    // failed CONCURRENTLY build needs duplicate fixture rows and non-
    // transactional statements); requires the container's superuser role.
    name: 'invalid same-named tasks idempotency index (failed CONCURRENTLY leftover)',
    mutate: async (pool) => {
      await pool.query(
        "UPDATE pg_index SET indisvalid = false WHERE indexrelid = 'tasks_fund_idempotency_unique'::regclass"
      );
    },
    pattern: /operating_decisions_spine_index_drift: tasks_fund_idempotency_unique/,
  },
  {
    // Would pass a marker-text-only preflight: the marker survives in a
    // comment while the rewrite never raises. The exact-definition check
    // must refuse before the trigger attach reuses the defanged function.
    name: 'no-op rewrite of internal_economics_forbid_update retaining the marker text',
    mutate: async (pool) => {
      await pool.query(`
        CREATE OR REPLACE FUNCTION internal_economics_forbid_update() RETURNS trigger
        LANGUAGE plpgsql
        AS $noop$
        BEGIN
          -- immutable_row_update_forbidden marker kept, behavior removed
          RETURN NEW;
        END;
        $noop$
      `);
    },
    pattern: /operating_decisions_spine_dependency_drift: internal_economics_forbid_update definition changed/,
  },
  {
    name: 'unexpected user index on operating_decisions',
    mutate: async (pool) => {
      await pool.query(
        'CREATE INDEX operating_decisions_replay_probe_idx ON operating_decisions (request_hash)'
      );
    },
    pattern: /operating_decisions_spine_partial_catalog_state: unexpected operating_decisions indexes/,
  },
  {
    name: 'lifecycle trigger with the wrong timing',
    mutate: async (pool) => {
      await pool.query(
        'DROP TRIGGER operating_decisions_enforce_lifecycle_trigger ON operating_decisions'
      );
      await pool.query(`
        CREATE TRIGGER operating_decisions_enforce_lifecycle_trigger
        AFTER UPDATE ON operating_decisions
        FOR EACH ROW EXECUTE FUNCTION operating_decisions_enforce_lifecycle()
      `);
    },
    pattern: /operating_decisions_spine_trigger_drift/,
  },
  {
    name: 'decision tables present only in part',
    mutate: async (pool) => {
      await pool.query('DROP TABLE decision_evidence_links');
    },
    pattern: /operating_decisions_spine_partial_catalog_state/,
  },
];

describe.skipIf(skipIfNoDocker)('operating decisions spine PostgreSQL proof', () => {
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

  it('applies 0054 through the migrator and raw-replays to an identical catalog', async () => {
    const { connectionString, state } = await createMigratedDatabase('replay');
    expect(state.applied.map((entry) => entry.name)).toContain(SPINE_MIGRATION_TAG);

    await withPool(connectionString, async (pool) => {
      const before = await spineCatalogSnapshot(pool);
      expect(before.decisionColumns.map((column) => column.column_name)).toContain('status');
      expect(before.taskColumns).toEqual([
        { column_name: 'idempotency_key', data_type: 'character varying' },
        { column_name: 'request_hash', data_type: 'character varying' },
      ]);
      expect(before.triggers.map((trigger) => trigger.tgname)).toEqual([
        'decision_evidence_links_forbid_update_trigger',
        'operating_decisions_enforce_lifecycle_trigger',
      ]);

      await pool.query(await readFile(SPINE_MIGRATION_FILE, 'utf8'));

      const after = await spineCatalogSnapshot(pool);
      expect(after).toEqual(before);
    });
  }, 180_000);

  it('refuses drifted same-named catalogs on raw replay', async () => {
    const migrationSql = await readFile(SPINE_MIGRATION_FILE, 'utf8');

    for (const scenario of DRIFT_SCENARIOS) {
      const { connectionString } = await createMigratedDatabase(
        `drift-${scenario.name.replaceAll(/[^a-z0-9]+/gi, '-').slice(0, 24)}`
      );
      await withPool(connectionString, async (pool) => {
        await scenario.mutate(pool);
        const client = await pool.connect();
        try {
          await expect(client.query(migrationSql)).rejects.toThrow(scenario.pattern);
          await client.query('ROLLBACK').catch(() => undefined);
        } finally {
          client.release();
        }
      });
    }
  }, 600_000);

  it('refuses via the Drizzle migrator when a bare same-named table pre-exists', async () => {
    const { connectionString } = await createMigratedDatabase(
      'drizzle-partial',
      PRE_SPINE_MIGRATION_TAG
    );

    await withPool(connectionString, async (pool) => {
      await pool.query('CREATE TABLE operating_decisions (id integer NOT NULL)');
    });

    await expect(
      runMigrationsWithConnectionString(connectionString, SPINE_MIGRATION_TAG)
    ).rejects.toThrow(/operating_decisions_spine_partial_catalog_state/);
    const migrationState = await getMigrationStateFromConnectionString(connectionString);
    expect(migrationState.applied.map((entry) => entry.name)).not.toContain(
      SPINE_MIGRATION_TAG
    );
  }, 180_000);

  it('enforces lifecycle, immutability, coupling, and supersession constraints at the SQL level', async () => {
    const { connectionString } = await createMigratedDatabase('constraints');

    await withPool(connectionString, async (pool) => {
      const basis = await seedSpineBasis(pool, 'constraints');
      const other = await seedSpineBasis(pool, 'constraints-other');
      const failedRunId = await insertRun(pool, basis, 'constraints-run');

      // Legal transitions: proposed -> accepted / rejected / deferred, and
      // deferred -> accepted with follow-up preserved.
      const acceptedId = await insertDecision(pool, basis.fundId, { key: 'sql-accepted' });
      await pool.query(`UPDATE operating_decisions SET status = 'accepted' WHERE id = $1`, [
        acceptedId,
      ]);
      const rejectedId = await insertDecision(pool, basis.fundId, { key: 'sql-rejected' });
      await pool.query(`UPDATE operating_decisions SET status = 'rejected' WHERE id = $1`, [
        rejectedId,
      ]);
      const deferredId = await insertDecision(pool, basis.fundId, { key: 'sql-deferred' });
      await pool.query(
        `UPDATE operating_decisions
         SET status = 'deferred', follow_up_owner_id = $2, follow_up_date = '2026-10-01'
         WHERE id = $1`,
        [deferredId, basis.userId]
      );
      await pool.query(
        `UPDATE operating_decisions SET follow_up_date = '2026-11-01' WHERE id = $1`,
        [deferredId]
      );
      await pool.query(`UPDATE operating_decisions SET status = 'accepted' WHERE id = $1`, [
        deferredId,
      ]);

      // Terminal immutability and illegal transitions.
      await expect(
        pool.query(`UPDATE operating_decisions SET status = 'deferred' WHERE id = $1`, [
          acceptedId,
        ])
      ).rejects.toThrow(/operating_decision_lifecycle_violation/);
      await expect(
        pool.query(`UPDATE operating_decisions SET status = 'proposed' WHERE id = $1`, [
          acceptedId,
        ])
      ).rejects.toThrow(/operating_decision_lifecycle_violation/);
      await expect(
        pool.query(`UPDATE operating_decisions SET status = 'deferred' WHERE id = $1`, [
          rejectedId,
        ])
      ).rejects.toThrow(/operating_decision_lifecycle_violation/);

      // Frozen columns refuse edits in every status.
      await expect(
        pool.query(`UPDATE operating_decisions SET title = 'tampered' WHERE id = $1`, [
          acceptedId,
        ])
      ).rejects.toThrow(/operating_decision_immutable_field_update_forbidden/);
      const proposedFrozenId = await insertDecision(pool, basis.fundId, {
        key: 'sql-proposed-frozen',
      });
      await expect(
        pool.query(`UPDATE operating_decisions SET recommendation = 'edited' WHERE id = $1`, [
          proposedFrozenId,
        ])
      ).rejects.toThrow(/operating_decision_immutable_field_update_forbidden/);

      // CHECK constraints: status domain, deferred follow-up, outcome coupling
      // and outcome-status gating.
      await expect(
        insertDecision(pool, basis.fundId, { key: 'sql-bad-status', status: 'archived' })
      ).rejects.toThrow(/operating_decisions_status_check/);
      await expect(
        insertDecision(pool, basis.fundId, { key: 'sql-deferred-bare', status: 'deferred' })
      ).rejects.toThrow(/operating_decisions_deferred_follow_up_check/);
      await expect(
        pool.query(
          `INSERT INTO operating_decisions (
             fund_id, title, recommendation, status, outcome, outcome_recorded_at,
             outcome_recorded_by, idempotency_key, request_hash
           ) VALUES ($1, 'x', 'y', 'proposed', 'done', NOW(), $2, 'sql-outcome-proposed', $3)`,
          [basis.fundId, basis.userId, hex64('sql-outcome-proposed')]
        )
      ).rejects.toThrow(/operating_decisions_outcome_status_check/);

      // Outcome writes once, then never again; partial outcome writes refuse.
      await pool.query(
        `UPDATE operating_decisions
         SET outcome = 'shipped', outcome_recorded_at = NOW(), outcome_recorded_by = $2
         WHERE id = $1`,
        [acceptedId, basis.userId]
      );
      await expect(
        pool.query(`UPDATE operating_decisions SET outcome = 'rewritten' WHERE id = $1`, [
          acceptedId,
        ])
      ).rejects.toThrow(/operating_decision_lifecycle_violation/);
      await expect(
        pool.query(`UPDATE operating_decisions SET outcome = 'partial' WHERE id = $1`, [
          rejectedId,
        ])
      ).rejects.toThrow(
        /operating_decision_lifecycle_violation|operating_decisions_outcome_coupling_check/
      );

      // Supersession: cross-fund composite FK and single-superseder partial unique.
      await expect(
        insertDecision(pool, other.fundId, {
          key: 'sql-cross-fund-supersede',
          supersedesDecisionId: acceptedId,
        })
      ).rejects.toThrow(/operating_decisions_supersedes_decision_fund_fk/);
      await insertDecision(pool, basis.fundId, {
        key: 'sql-superseder-1',
        supersedesDecisionId: acceptedId,
      });
      await expect(
        insertDecision(pool, basis.fundId, {
          key: 'sql-superseder-2',
          supersedesDecisionId: acceptedId,
        })
      ).rejects.toThrow(/operating_decisions_supersedes_decision_unique/);

      // Evidence links: exactly-one-target coupling, cross-fund FKs, and the
      // forbid-update trigger.
      const evidenceId = await insertEvidence(pool, basis.fundId, rejectedId, {
        key: 'sql-evidence',
        targetKind: 'analysis_reference',
        analysisReferenceId: basis.referenceId,
        economicsRunId: null,
      });
      await expect(
        insertEvidence(pool, basis.fundId, rejectedId, {
          key: 'sql-evidence-zero',
          targetKind: 'analysis_reference',
          analysisReferenceId: null,
          economicsRunId: null,
        })
      ).rejects.toThrow(/decision_evidence_links_target_coupling_check/);
      await expect(
        insertEvidence(pool, basis.fundId, rejectedId, {
          key: 'sql-evidence-two',
          targetKind: 'analysis_reference',
          analysisReferenceId: basis.referenceId,
          economicsRunId: failedRunId,
        })
      ).rejects.toThrow(/decision_evidence_links_target_coupling_check/);
      await expect(
        insertEvidence(pool, basis.fundId, rejectedId, {
          key: 'sql-evidence-mismatch',
          targetKind: 'internal_economics_run',
          analysisReferenceId: basis.referenceId,
          economicsRunId: null,
        })
      ).rejects.toThrow(/decision_evidence_links_target_coupling_check/);
      await expect(
        insertEvidence(pool, basis.fundId, rejectedId, {
          key: 'sql-evidence-bad-kind',
          targetKind: 'unknown',
          analysisReferenceId: basis.referenceId,
          economicsRunId: null,
        })
      ).rejects.toThrow(/decision_evidence_links_target_(?:kind|coupling)_check/);
      await expect(
        insertEvidence(pool, basis.fundId, rejectedId, {
          key: 'sql-evidence-cross-ref',
          targetKind: 'analysis_reference',
          analysisReferenceId: other.referenceId,
          economicsRunId: null,
        })
      ).rejects.toThrow(/decision_evidence_links_analysis_reference_fund_fk/);
      const otherRunId = await insertRun(pool, other, 'constraints-other-run');
      await expect(
        insertEvidence(pool, basis.fundId, rejectedId, {
          key: 'sql-evidence-cross-run',
          targetKind: 'internal_economics_run',
          analysisReferenceId: null,
          economicsRunId: otherRunId,
        })
      ).rejects.toThrow(/decision_evidence_links_economics_run_fund_fk/);
      const otherDecisionId = await insertDecision(pool, other.fundId, {
        key: 'sql-other-decision',
      });
      await expect(
        insertEvidence(pool, basis.fundId, otherDecisionId, {
          key: 'sql-evidence-cross-decision',
          targetKind: 'analysis_reference',
          analysisReferenceId: basis.referenceId,
          economicsRunId: null,
        })
      ).rejects.toThrow(/decision_evidence_links_decision_fund_fk/);
      await expect(
        pool.query(`UPDATE decision_evidence_links SET request_hash = $2 WHERE id = $1`, [
          evidenceId,
          hex64('tampered'),
        ])
      ).rejects.toThrow(/immutable_row_update_forbidden: decision_evidence_links/);
    });
  }, 180_000);

  it('guard: decision links are decision-sourced only and task evidence semantics are untouched', async () => {
    const { connectionString } = await createMigratedDatabase('guard');

    await withPool(connectionString, async (pool) => {
      const decisionLinkColumns = await pool.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'decision_evidence_links'
        ORDER BY ordinal_position
      `);
      expect(decisionLinkColumns.rows.map((row) => row.column_name)).toEqual([
        'id',
        'fund_id',
        'decision_id',
        'target_kind',
        'analysis_reference_id',
        'economics_run_id',
        'idempotency_key',
        'request_hash',
        'created_by',
        'created_at',
      ]);
      expect(decisionLinkColumns.rows.map((row) => row.column_name)).not.toContain('task_id');

      // task_evidence_links keeps its 0047 constraint set and delete actions.
      const taskEvidence = await pool.query<{ conname: string; confdeltype: string | null }>(`
        SELECT conname, CASE WHEN contype = 'f' THEN confdeltype::text ELSE NULL END AS confdeltype
        FROM pg_constraint
        WHERE conrelid = 'public.task_evidence_links'::regclass
        ORDER BY conname
      `);
      expect(taskEvidence.rows).toEqual([
        { conname: 'task_evidence_links_analysis_reference_fund_fk', confdeltype: 'r' },
        { conname: 'task_evidence_links_created_by_fk', confdeltype: 'a' },
        { conname: 'task_evidence_links_economics_run_fund_fk', confdeltype: 'r' },
        { conname: 'task_evidence_links_fund_id_funds_id_fk', confdeltype: 'c' },
        { conname: 'task_evidence_links_fund_task_idempotency_unique', confdeltype: null },
        { conname: 'task_evidence_links_pkey', confdeltype: null },
        { conname: 'task_evidence_links_target_coupling_check', confdeltype: null },
        { conname: 'task_evidence_links_target_kind_check', confdeltype: null },
        { conname: 'task_evidence_links_task_fund_fk', confdeltype: 'c' },
      ]);
    });
  }, 180_000);

  it('decision service: idempotent create, xmin lifecycle, and immutable outcomes', async () => {
    const { connectionString } = await createMigratedDatabase('decision-service');

    await withPool(connectionString, async (pool) => {
      const basis = await seedSpineBasis(pool, 'decision-service');
      const database = drizzle(pool, { logger: false }) as never;
      const options = { database } as const;
      const fields = {
        fundId: basis.fundId,
        title: 'Adopt reserve pacing v2',
        recommendation: 'Roll out the v2 pacing model.',
      };

      const created = await createDecision(
        { ...fields, actorId: basis.userId, idempotencyKey: 'decision-create' },
        options
      );
      expect(created.replayed).toBe(false);
      expect(created.row.status).toBe('proposed');

      // Cross-actor replay: the actor is excluded from the request hash.
      const replay = await createDecision(
        { ...fields, actorId: null, idempotencyKey: 'decision-create' },
        options
      );
      expect(replay.replayed).toBe(true);
      expect(replay.row.id).toBe(created.row.id);

      await expect(
        createDecision(
          {
            ...fields,
            title: 'A different title',
            actorId: basis.userId,
            idempotencyKey: 'decision-create',
          },
          options
        )
      ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });

      // Parallel same-key creates converge on exactly one row.
      const concurrent = await Promise.all(
        Array.from({ length: 8 }, () =>
          createDecision(
            { ...fields, actorId: basis.userId, idempotencyKey: 'decision-concurrent' },
            options
          )
        )
      );
      expect(new Set(concurrent.map((result) => result.row.id)).size).toBe(1);
      expect(concurrent.filter((result) => !result.replayed)).toHaveLength(1);

      // Stale-token transition refuses; a fresh token succeeds.
      await expect(
        transitionDecision(
          {
            fundId: basis.fundId,
            decisionId: created.row.id,
            expectedXmin: '999999',
            transition: { status: 'accepted' },
          },
          options
        )
      ).rejects.toMatchObject({ statusCode: 412, code: 'PRECONDITION_FAILED' });
      const accepted = await transitionDecision(
        {
          fundId: basis.fundId,
          decisionId: created.row.id,
          expectedXmin: created.xmin,
          transition: { status: 'accepted' },
        },
        options
      );
      expect(accepted.row.status).toBe('accepted');

      // Terminal decisions refuse further transitions.
      await expect(
        transitionDecision(
          {
            fundId: basis.fundId,
            decisionId: created.row.id,
            expectedXmin: accepted.xmin,
            transition: { status: 'rejected' },
          },
          options
        )
      ).rejects.toMatchObject({ statusCode: 409, code: 'DECISION_LIFECYCLE_CONFLICT' });

      // Deferred transitions require a follow-up owner and date (contract).
      const deferredSeed = await createDecision(
        { ...fields, actorId: basis.userId, idempotencyKey: 'decision-deferred' },
        options
      );
      await expect(
        transitionDecision(
          {
            fundId: basis.fundId,
            decisionId: deferredSeed.row.id,
            expectedXmin: deferredSeed.xmin,
            transition: { status: 'deferred' },
          },
          options
        )
      ).rejects.toThrow(/follow-up owner and date/);
      const deferred = await transitionDecision(
        {
          fundId: basis.fundId,
          decisionId: deferredSeed.row.id,
          expectedXmin: deferredSeed.xmin,
          transition: {
            status: 'deferred',
            followUpOwnerId: basis.userId,
            followUpDate: '2026-10-15',
          },
        },
        options
      );
      expect(deferred.row.status).toBe('deferred');
      expect(deferred.row.followUpDate).toBe('2026-10-15');

      // Outcome: only terminal rows, numeric actor required, recorded once.
      await expect(
        recordOutcome(
          {
            fundId: basis.fundId,
            decisionId: deferred.row.id,
            expectedXmin: deferred.xmin,
            outcome: 'too early',
            actorId: basis.userId,
          },
          options
        )
      ).rejects.toMatchObject({ statusCode: 409, code: 'DECISION_OUTCOME_NOT_ALLOWED' });
      await expect(
        recordOutcome(
          {
            fundId: basis.fundId,
            decisionId: created.row.id,
            expectedXmin: accepted.xmin,
            outcome: 'shipped',
            actorId: null,
          },
          options
        )
      ).rejects.toMatchObject({ statusCode: 403, code: 'ACTOR_REQUIRED' });
      const recorded = await recordOutcome(
        {
          fundId: basis.fundId,
          decisionId: created.row.id,
          expectedXmin: accepted.xmin,
          outcome: 'shipped',
          actorId: basis.userId,
        },
        options
      );
      expect(recorded.row.outcome).toBe('shipped');
      expect(recorded.row.outcomeRecordedBy).toBe(basis.userId);
      await expect(
        recordOutcome(
          {
            fundId: basis.fundId,
            decisionId: created.row.id,
            expectedXmin: recorded.xmin,
            outcome: 'rewritten',
            actorId: basis.userId,
          },
          options
        )
      ).rejects.toMatchObject({ statusCode: 409, code: 'DECISION_OUTCOME_ALREADY_RECORDED' });

      // Two xmin-pinned transitions from the same snapshot: one wins, one 412.
      const raceSeed = await createDecision(
        { ...fields, actorId: basis.userId, idempotencyKey: 'decision-race' },
        options
      );
      const raceResults = await Promise.allSettled([
        transitionDecision(
          {
            fundId: basis.fundId,
            decisionId: raceSeed.row.id,
            expectedXmin: raceSeed.xmin,
            transition: { status: 'accepted' },
          },
          options
        ),
        transitionDecision(
          {
            fundId: basis.fundId,
            decisionId: raceSeed.row.id,
            expectedXmin: raceSeed.xmin,
            transition: { status: 'rejected' },
          },
          options
        ),
      ]);
      const raceWinners = raceResults.filter((result) => result.status === 'fulfilled');
      const raceLosers = raceResults.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      expect(raceWinners).toHaveLength(1);
      expect(raceLosers).toHaveLength(1);
      expect(raceLosers[0]!.reason).toMatchObject({
        statusCode: 412,
        code: 'PRECONDITION_FAILED',
      });
      const raceRow = await loadDecision(basis.fundId, raceSeed.row.id, options);
      expect(['accepted', 'rejected']).toContain(raceRow?.row.status);
    });
  }, 180_000);

  it('decision supersession: proposed sources refuse, one superseder wins, replays converge', async () => {
    const { connectionString } = await createMigratedDatabase('supersession');

    await withPool(connectionString, async (pool) => {
      const basis = await seedSpineBasis(pool, 'supersession');
      const database = drizzle(pool, { logger: false }) as never;
      const options = { database } as const;
      const fields = {
        fundId: basis.fundId,
        title: 'Replace pacing decision',
        recommendation: 'Supersede with updated assumptions.',
      };

      const source = await createDecision(
        { ...fields, actorId: basis.userId, idempotencyKey: 'supersession-source' },
        options
      );

      // Explicit rejection: a proposed source must transition in place.
      await expect(
        supersedeDecision(
          {
            ...fields,
            supersedesDecisionId: source.row.id,
            actorId: basis.userId,
            idempotencyKey: 'supersede-proposed',
          },
          options
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'DECISION_PROPOSED_CANNOT_BE_SUPERSEDED',
      });

      await transitionDecision(
        {
          fundId: basis.fundId,
          decisionId: source.row.id,
          expectedXmin: source.xmin,
          transition: { status: 'accepted' },
        },
        options
      );

      const superseder = await supersedeDecision(
        {
          ...fields,
          supersedesDecisionId: source.row.id,
          actorId: basis.userId,
          idempotencyKey: 'supersede-accepted',
        },
        options
      );
      expect(superseder.replayed).toBe(false);
      expect(superseder.row.status).toBe('proposed');
      expect(superseder.row.supersedesDecisionId).toBe(source.row.id);

      const supersederReplay = await supersedeDecision(
        {
          ...fields,
          supersedesDecisionId: source.row.id,
          actorId: null,
          idempotencyKey: 'supersede-accepted',
        },
        options
      );
      expect(supersederReplay.replayed).toBe(true);
      expect(supersederReplay.row.id).toBe(superseder.row.id);

      await expect(
        supersedeDecision(
          {
            ...fields,
            supersedesDecisionId: source.row.id,
            actorId: basis.userId,
            idempotencyKey: 'supersede-second',
          },
          options
        )
      ).rejects.toMatchObject({ statusCode: 409, code: 'DECISION_ALREADY_SUPERSEDED' });

      await expect(
        supersedeDecision(
          {
            ...fields,
            supersedesDecisionId: 999_999_999,
            actorId: basis.userId,
            idempotencyKey: 'supersede-missing',
          },
          options
        )
      ).rejects.toMatchObject({ statusCode: 404, code: 'DECISION_NOT_FOUND' });

      // Parallel supersedes with distinct keys: exactly one wins.
      const raceSource = await createDecision(
        {
          ...fields,
          actorId: basis.userId,
          idempotencyKey: 'supersession-race-source',
        },
        options
      );
      await transitionDecision(
        {
          fundId: basis.fundId,
          decisionId: raceSource.row.id,
          expectedXmin: raceSource.xmin,
          transition: { status: 'rejected' },
        },
        options
      );
      const raceResults = await Promise.allSettled([
        supersedeDecision(
          {
            ...fields,
            supersedesDecisionId: raceSource.row.id,
            actorId: basis.userId,
            idempotencyKey: 'supersede-race-a',
          },
          options
        ),
        supersedeDecision(
          {
            ...fields,
            supersedesDecisionId: raceSource.row.id,
            actorId: basis.userId,
            idempotencyKey: 'supersede-race-b',
          },
          options
        ),
      ]);
      expect(raceResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const raceLoser = raceResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      expect(raceLoser?.reason).toMatchObject({
        statusCode: 409,
        code: 'DECISION_ALREADY_SUPERSEDED',
      });
    });
  }, 180_000);

  it('decision evidence links: same-fund idempotent creation under replay, conflict, and races', async () => {
    const { connectionString } = await createMigratedDatabase('evidence-service');

    await withPool(connectionString, async (pool) => {
      const basis = await seedSpineBasis(pool, 'evidence-service');
      const other = await seedSpineBasis(pool, 'evidence-service-other');
      const runId = await insertRun(pool, basis, 'evidence-service-run');
      const database = drizzle(pool, { logger: false }) as never;
      const options = { database } as const;
      const decisionId = await insertDecision(pool, basis.fundId, { key: 'evidence-decision' });
      const common = {
        fundId: basis.fundId,
        decisionId,
        target: { kind: 'analysis_reference' as const, id: basis.referenceId },
        actorId: basis.userId,
        idempotencyKey: 'link-create',
      };

      const created = await createDecisionEvidenceLink(common, options);
      const crossActorReplay = await createDecisionEvidenceLink(
        { ...common, actorId: null },
        options
      );
      expect(created.replayed).toBe(false);
      expect(crossActorReplay).toEqual({ ...created, replayed: true });

      await expect(
        createDecisionEvidenceLink(
          { ...common, target: { kind: 'internal_economics_run', id: runId } },
          options
        )
      ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });

      const concurrent = await Promise.all(
        Array.from({ length: 8 }, () =>
          createDecisionEvidenceLink({ ...common, idempotencyKey: 'link-concurrent' }, options)
        )
      );
      expect(new Set(concurrent.map((result) => result.evidenceLink.linkId)).size).toBe(1);
      expect(concurrent.filter((result) => !result.replayed)).toHaveLength(1);

      // Same-fund enforcement through the service surface.
      await expect(
        createDecisionEvidenceLink(
          {
            ...common,
            idempotencyKey: 'link-cross-ref',
            target: { kind: 'analysis_reference', id: other.referenceId },
          },
          options
        )
      ).rejects.toMatchObject({ statusCode: 404, code: 'EVIDENCE_TARGET_NOT_FOUND' });
      const otherRunId = await insertRun(pool, other, 'evidence-service-other-run');
      await expect(
        createDecisionEvidenceLink(
          {
            ...common,
            idempotencyKey: 'link-cross-run',
            target: { kind: 'internal_economics_run', id: otherRunId },
          },
          options
        )
      ).rejects.toMatchObject({ statusCode: 404, code: 'EVIDENCE_TARGET_NOT_FOUND' });
      const otherDecisionId = await insertDecision(pool, other.fundId, {
        key: 'evidence-other-decision',
      });
      await expect(
        createDecisionEvidenceLink(
          { ...common, decisionId: otherDecisionId, idempotencyKey: 'link-cross-decision' },
          options
        )
      ).rejects.toMatchObject({ statusCode: 404, code: 'DECISION_NOT_FOUND' });

      const economics = await createDecisionEvidenceLink(
        {
          ...common,
          idempotencyKey: 'link-economics',
          target: { kind: 'internal_economics_run', id: runId },
        },
        options
      );
      const listed = await listDecisionEvidenceLinks(basis.fundId, decisionId, options);
      expect(listed.map((link) => link.linkId)).toEqual([
        created.evidenceLink.linkId,
        concurrent[0]!.evidenceLink.linkId,
        economics.evidenceLink.linkId,
      ]);
      expect(
        listed.every(
          (link) =>
            Object.keys(link).sort().join(',') ===
            ['contractVersion', 'createdAt', 'decisionId', 'fundId', 'linkId', 'target']
              .sort()
              .join(',')
        )
      ).toBe(true);
    });
  }, 180_000);

  it('task create: idempotent replay, key conflict, races, and untouched NULL-key rows', async () => {
    const { connectionString } = await createMigratedDatabase('task-service');

    await withPool(connectionString, async (pool) => {
      const basis = await seedSpineBasis(pool, 'task-service');
      const database = drizzle(pool, { logger: false }) as never;
      const options = { database } as const;

      const created = await createTask(
        {
          fundId: basis.fundId,
          title: 'Prepare LP letter',
          createdBy: basis.userId,
          idempotencyKey: 'task-create',
        },
        options
      );
      expect(created?.replayed).toBe(false);

      const crossActorReplay = await createTask(
        {
          fundId: basis.fundId,
          title: 'Prepare LP letter',
          createdBy: null,
          idempotencyKey: 'task-create',
        },
        options
      );
      expect(crossActorReplay?.replayed).toBe(true);
      expect(crossActorReplay?.row.id).toBe(created?.row.id);

      await expect(
        createTask(
          {
            fundId: basis.fundId,
            title: 'A different title',
            createdBy: basis.userId,
            idempotencyKey: 'task-create',
          },
          options
        )
      ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });

      const concurrent = await Promise.all(
        Array.from({ length: 8 }, () =>
          createTask(
            {
              fundId: basis.fundId,
              title: 'Concurrent task',
              createdBy: basis.userId,
              idempotencyKey: 'task-concurrent',
            },
            options
          )
        )
      );
      expect(new Set(concurrent.map((result) => result?.row.id)).size).toBe(1);
      expect(concurrent.filter((result) => result?.replayed === false)).toHaveLength(1);

      // A second key creates a distinct row (keys, not titles, dedupe).
      const secondKey = await createTask(
        {
          fundId: basis.fundId,
          title: 'Prepare LP letter',
          createdBy: basis.userId,
          idempotencyKey: 'task-create-2',
        },
        options
      );
      expect(secondKey?.row.id).not.toBe(created?.row.id);

      // Pre-existing NULL-key rows stay readable and xmin-updatable.
      const legacyId = await insertedId(
        pool,
        `INSERT INTO tasks (fund_id, title) VALUES ($1, 'Legacy task') RETURNING id`,
        [basis.fundId]
      );
      const legacy = await loadTask(basis.fundId, legacyId, options);
      expect(legacy?.row.idempotencyKey).toBeNull();
      const stale = await updateTask(
        {
          fundId: basis.fundId,
          taskId: legacyId,
          expectedXmin: '999999',
          patch: { title: 'Should not apply' },
        },
        options
      );
      expect(stale).toBeUndefined();
      const updated = await updateTask(
        {
          fundId: basis.fundId,
          taskId: legacyId,
          expectedXmin: legacy!.xmin,
          patch: { title: 'Legacy task edited' },
        },
        options
      );
      expect(updated?.row.title).toBe('Legacy task edited');
      expect(updated?.xmin).not.toBe(legacy!.xmin);
    });
  }, 180_000);
});

interface SpineBasis {
  fundId: number;
  userId: number;
  referenceId: number;
  policyId: number;
  factsSnapshotId: number;
  planVersionId: number;
  forecastSnapshotId: number;
  resultSnapshotId: number;
}

function testDatabaseConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

async function createMigratedDatabase(
  suffix: string,
  targetVersion: string = SPINE_MIGRATION_TAG
): Promise<{ connectionString: string; state: { applied: Array<{ name: string }> } }> {
  if (!adminPool) throw new Error('Admin pool not initialized.');
  const normalizedSuffix = suffix
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]/g, '_')
    .slice(0, 24);
  databaseCounter += 1;
  const databaseName = `od_spine_${normalizedSuffix}_${process.pid}_${Date.now()}_${databaseCounter}`;
  createdDatabases.push(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const base = new URL(testDatabaseConnectionString());
  base.pathname = `/${databaseName}`;
  const connectionString = base.toString();
  const state = await runMigrationsWithConnectionString(connectionString, targetVersion);
  return { connectionString, state };
}

async function withPool<T>(
  connectionString: string,
  callback: (pool: Pool) => Promise<T>
): Promise<T> {
  const pool = new Pool({ connectionString, max: 8 });
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

async function insertedId(pool: Pool, sql: string, values: unknown[]): Promise<number> {
  const result = await pool.query(sql, values);
  const id = result.rows[0]?.id;
  if (typeof id !== 'number') throw new Error('Expected inserted id.');
  return id;
}

interface SpineCatalogSnapshot {
  decisionColumns: Array<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>;
  taskColumns: Array<{ column_name: string; data_type: string }>;
  constraints: Array<{ table_name: string; conname: string; definition: string }>;
  indexes: Array<{ table_name: string; indexname: string; indexdef: string }>;
  triggers: Array<{ table_name: string; tgname: string; definition: string }>;
}

async function spineCatalogSnapshot(pool: Pool): Promise<SpineCatalogSnapshot> {
  const decisionColumns = await pool.query<SpineCatalogSnapshot['decisionColumns'][number]>(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('operating_decisions', 'decision_evidence_links')
    ORDER BY table_name, ordinal_position
  `);
  const taskColumns = await pool.query<SpineCatalogSnapshot['taskColumns'][number]>(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name IN ('idempotency_key', 'request_hash')
    ORDER BY column_name
  `);
  const constraints = await pool.query<SpineCatalogSnapshot['constraints'][number]>(`
    SELECT relation_catalog.relname AS table_name,
           constraint_catalog.conname,
           pg_get_constraintdef(constraint_catalog.oid) AS definition
    FROM pg_constraint AS constraint_catalog
    JOIN pg_class AS relation_catalog ON relation_catalog.oid = constraint_catalog.conrelid
    JOIN pg_namespace AS namespace_catalog
      ON namespace_catalog.oid = relation_catalog.relnamespace
    WHERE namespace_catalog.nspname = 'public'
      AND relation_catalog.relname IN ('operating_decisions', 'decision_evidence_links')
    ORDER BY relation_catalog.relname, constraint_catalog.conname
  `);
  const indexes = await pool.query<SpineCatalogSnapshot['indexes'][number]>(`
    SELECT tablename AS table_name, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND (
        tablename IN ('operating_decisions', 'decision_evidence_links')
        OR indexname = 'tasks_fund_idempotency_unique'
      )
    ORDER BY tablename, indexname
  `);
  const triggers = await pool.query<SpineCatalogSnapshot['triggers'][number]>(`
    SELECT relation_catalog.relname AS table_name,
           trigger_catalog.tgname,
           pg_get_triggerdef(trigger_catalog.oid) AS definition
    FROM pg_trigger AS trigger_catalog
    JOIN pg_class AS relation_catalog ON relation_catalog.oid = trigger_catalog.tgrelid
    WHERE NOT trigger_catalog.tgisinternal
      AND relation_catalog.relname IN ('operating_decisions', 'decision_evidence_links')
    ORDER BY relation_catalog.relname, trigger_catalog.tgname
  `);
  return {
    decisionColumns: decisionColumns.rows,
    taskColumns: taskColumns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    triggers: triggers.rows,
  };
}

/**
 * Minimal fund basis for decision and evidence tests: a fund, a user, one
 * analysis reference, and the policy chain an economics run requires.
 */
async function seedSpineBasis(pool: Pool, label: string): Promise<SpineBasis> {
  const fundId = nextFundId();
  await pool.query(
    `
      INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, $2, 10000000, '0.0200', '0.2000', 2026)
    `,
    [fundId, `Spine Fund ${fundId}`]
  );
  const userId = await insertedId(
    pool,
    `INSERT INTO users (username, password) VALUES ($1, 'x') RETURNING id`,
    [`spine-${fundId}`]
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

  return {
    fundId,
    userId,
    referenceId,
    policyId,
    factsSnapshotId,
    planVersionId,
    forecastSnapshotId,
    resultSnapshotId,
  };
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

/** Failed run: provenance-valid evidence target without result snapshots. */
function insertRun(pool: Pool, basis: SpineBasis, idempotencyKey: string): Promise<number> {
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
        $1, $2, $3, $4, $5, 'CURRENT_FORECAST_V2', NULL, NULL, 'failed', NULL,
        'CORE_ROW_MAPPING_MISMATCH', '{}'::jsonb, NOW(), 'liquidate_at_horizon',
        'cash-assembly-period-loop/1.0.0', 'lp-economics/1.0.0', $6, NULL, $7, $8, $9
      )
      RETURNING id
    `,
    [
      basis.fundId,
      basis.policyId,
      basis.factsSnapshotId,
      basis.planVersionId,
      basis.forecastSnapshotId,
      hex64(`run-input-${idempotencyKey}`),
      basis.userId,
      idempotencyKey,
      hex64(`run-request-${idempotencyKey}`),
    ]
  );
}

interface InsertDecisionInput {
  key: string;
  status?: string;
  supersedesDecisionId?: number;
}

function insertDecision(
  pool: Pool,
  fundId: number,
  input: InsertDecisionInput
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO operating_decisions (
        fund_id, title, recommendation, status, supersedes_decision_id,
        idempotency_key, request_hash
      ) VALUES ($1, $2, 'Do the thing.', $3, $4, $5, $6)
      RETURNING id
    `,
    [
      fundId,
      `Decision ${input.key}`,
      input.status ?? 'proposed',
      input.supersedesDecisionId ?? null,
      input.key,
      hex64(`decision-request-${input.key}`),
    ]
  );
}

interface InsertEvidenceInput {
  key: string;
  targetKind: string;
  analysisReferenceId: number | null;
  economicsRunId: number | null;
}

function insertEvidence(
  pool: Pool,
  fundId: number,
  decisionId: number,
  input: InsertEvidenceInput
): Promise<number> {
  return insertedId(
    pool,
    `
      INSERT INTO decision_evidence_links (
        fund_id, decision_id, target_kind, analysis_reference_id, economics_run_id,
        idempotency_key, request_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [
      fundId,
      decisionId,
      input.targetKind,
      input.analysisReferenceId,
      input.economicsRunId,
      input.key,
      hex64(`evidence-request-${input.key}`),
    ]
  );
}
