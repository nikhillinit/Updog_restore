import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RECONCILE_LOCK_ID, readDatabaseIdentity } from '../../scripts/reconcile-prod-schema.mjs';
import {
  computeTargetFingerprint,
  formatJournaledRangeFailure,
  JournaledRangeTargetError,
  runJournaledRangeMigration,
} from '../../scripts/run-journaled-0050-0061-migrations.mjs';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const databases: string[] = [];
const quiet = { write: () => true };
let admin: Pool;
let startedContainer = false;

function baseConnection(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

async function databaseAt(tag = '0049_kpi_observations'): Promise<string> {
  const name = `journaled_0050_0061_${process.pid}_${Date.now()}_${databases.length}`.toLowerCase();
  databases.push(name);
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(baseConnection());
  url.pathname = `/${name}`;
  await runMigrationsWithConnectionString(url.toString(), tag);
  return url.toString();
}

async function snapshot(pool: Pool) {
  return {
    ledger: (
      await pool.query(
        'SELECT hash, created_at FROM public.drizzle_migrations ORDER BY created_at, id'
      )
    ).rows,
    catalog: (
      await pool.query(`
        SELECT c.relname, c.relkind,
          COALESCE(array_agg(a.attname ORDER BY a.attnum)
            FILTER (WHERE a.attnum > 0 AND NOT a.attisdropped), ARRAY[]::name[]) AS columns
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public'
        GROUP BY c.oid, c.relname, c.relkind
        ORDER BY c.relname
      `)
    ).rows,
    constraints: (
      await pool.query(`
        SELECT t.relname, c.conname, c.contype, pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
        ORDER BY t.relname, c.conname
      `)
    ).rows,
  };
}

async function expectedFingerprint(connectionString: string, pool?: Pool) {
  const ownedPool = pool ?? new Pool({ connectionString, max: 1 });
  try {
    const identity = await readDatabaseIdentity(ownedPool);
    const endpoint = new URL(connectionString);
    return computeTargetFingerprint({
      directHost: endpoint.hostname,
      port: endpoint.port,
      database: identity.database,
      user: identity.user,
    });
  } finally {
    if (!pool) await ownedPool.end();
  }
}

async function apply(connectionString: string, stdout = quiet) {
  return runJournaledRangeMigration({
    connectionString,
    apply: true,
    expectedTargetFingerprint: await expectedFingerprint(connectionString),
    stdout,
  });
}

async function buildProductionShapedDatabase() {
  const connectionString = await databaseAt('0053_g3_release_gate_hardening');
  const pool = new Pool({ connectionString, max: 1 });
  await pool.query(
    'DELETE FROM public.drizzle_migrations WHERE created_at > $1 AND created_at < $2',
    [1775356800000, 1785368400000]
  );
  await pool.query('DELETE FROM public.drizzle_migrations WHERE created_at >= $1', [1785800400000]);
  const ledger = await pool.query(
    'SELECT hash, created_at FROM public.drizzle_migrations ORDER BY created_at'
  );
  expect(ledger.rows).toHaveLength(14);
  return { connectionString, pool };
}

async function seedScenarioData(pool: Pool) {
  const fund = await pool.query<{ id: number }>(
    `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
     VALUES ($1, '1000000.00', '0.0200', '0.2000', 2026) RETURNING id`,
    [`journaled-${randomUUID()}`]
  );
  const fundId = fund.rows[0].id;
  const config = await pool.query<{ id: number }>(
    `INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published)
     VALUES ($1, 1, $2, false, true) RETURNING id`,
    [fundId, { fundName: 'journaled' }]
  );
  const scenarioSetId = randomUUID();
  await pool.query(
    `INSERT INTO fund_scenario_sets
       (id, fund_id, name, source_config_id, source_config_version, created_by_label, updated_by_label)
     VALUES ($1, $2, 'journaled scenario', $3, 1, 'test', 'test')`,
    [scenarioSetId, fundId, config.rows[0].id]
  );
  return { fundId, sourceConfigId: config.rows[0].id, scenarioSetId };
}

async function seedQueuedRun(
  pool: Pool,
  { fundId, sourceConfigId, scenarioSetId }: Awaited<ReturnType<typeof seedScenarioData>>,
  inputHash: string,
  queuedAt: string | null
) {
  const correlationId = randomUUID();
  const run = await pool.query<{ id: string }>(
    `INSERT INTO fund_scenario_calculation_runs
       (fund_id, scenario_set_id, source_config_id, source_config_version,
        calculation_mode, override_type, input_hash, correlation_id, status,
        queued_event_recorded_at)
     VALUES ($1, $2, $3, 1, 'async_reserve_allocation', 'reserve_allocation', $4, $5, 'queued', $6)
     RETURNING id`,
    [fundId, scenarioSetId, sourceConfigId, inputHash, correlationId, queuedAt]
  );
  await pool.query(
    `INSERT INTO fund_scenario_set_events
       (scenario_set_id, fund_id, event_type, change_summary_json)
     VALUES ($1, $2, 'calculation_queued', $3)`,
    [scenarioSetId, fundId, { correlation_id: correlationId }]
  );
  return run.rows[0].id;
}

describe.skipIf(skipIfNoDocker)('journaled 0050-0061 PostgreSQL route', { retry: 0 }, () => {
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
  }, 120_000);

  it('applies canonical 0049, replays complete state, and supports read-only readback', async () => {
    const connectionString = await databaseAt();
    const pool = new Pool({ connectionString, max: 1 });
    try {
      const before = await snapshot(pool);
      await expect(
        runJournaledRangeMigration({ connectionString, apply: false, stdout: quiet })
      ).resolves.toMatchObject({
        preState: { state: 'ready', appliedTargetCount: 0 },
        postState: 'ready',
        applied: false,
      });
      expect(await snapshot(pool)).toEqual(before);
      await expect(apply(connectionString)).resolves.toMatchObject({
        preState: { state: 'ready', appliedTargetCount: 0 },
        postState: 'complete',
        applied: true,
      });
      const applied = await snapshot(pool);
      await expect(apply(connectionString)).resolves.toMatchObject({
        preState: { state: 'complete', appliedTargetCount: 12 },
        postState: 'complete',
        applied: false,
      });
      expect(await snapshot(pool)).toEqual(applied);
    } finally {
      await pool.end();
    }
  }, 180_000);

  it('replays the production-shaped ADR-074 history with fourteen preserved rows', async () => {
    const { connectionString, pool } = await buildProductionShapedDatabase();
    try {
      await expect(apply(connectionString)).resolves.toMatchObject({
        preState: { state: 'ready', appliedTargetCount: 0 },
        baselineKind: 'adr074-reconciled',
        postState: 'complete',
        applied: true,
      });
      const rows = await pool.query(
        'SELECT hash, created_at FROM public.drizzle_migrations ORDER BY created_at'
      );
      expect(rows.rows).toHaveLength(26);
    } finally {
      await pool.end();
    }
  }, 180_000);

  it.each([
    ['0055_current_forecast_recompute_commands', 6],
    ['0056_actuals_draft_revisions', 7],
    ['0057_actuals_restatement_commands', 8],
  ])(
    'applies and replays from tail %s',
    async (tag, appliedTargetCount) => {
      const connectionString = await databaseAt(tag);
      try {
        await expect(apply(connectionString)).resolves.toMatchObject({
          preState: { state: 'ready', appliedTargetCount },
          postState: 'complete',
          applied: true,
        });
        await expect(apply(connectionString)).resolves.toMatchObject({
          preState: { state: 'complete', appliedTargetCount: 12 },
          postState: 'complete',
          applied: false,
        });
      } finally {
        const pool = new Pool({ connectionString, max: 1 });
        await pool.end();
      }
    },
    180_000
  );

  it('refuses a wrong fingerprint before a held advisory lock', async () => {
    const connectionString = await databaseAt();
    const holder = new Pool({ connectionString, max: 1 });
    const target = new Pool({ connectionString, max: 1 });
    try {
      const lock = await holder.query('SELECT pg_try_advisory_lock($1) AS acquired', [
        RECONCILE_LOCK_ID,
      ]);
      expect(lock.rows[0].acquired).toBe(true);
      const before = await snapshot(target);
      const progress = { stage: 'before-connect' as const };
      let error: unknown;
      try {
        await runJournaledRangeMigration({
          connectionString,
          apply: true,
          expectedTargetFingerprint: '0'.repeat(64),
          stdout: quiet,
          progress,
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(JournaledRangeTargetError);
      expect(formatJournaledRangeFailure(error, progress.stage)).toBe(
        'journaled-0050-0061: refused-target: Target fingerprint missing or mismatched'
      );
      expect(await snapshot(target)).toEqual(before);
    } finally {
      await target.end();
      await holder.query('SELECT pg_advisory_unlock($1)', [RECONCILE_LOCK_ID]);
      await holder.end();
    }
  }, 180_000);

  it('rolls back all 0050-0057 work and reports SQLSTATE 23514 for invalid 0058 data', async () => {
    const { connectionString, pool } = await buildProductionShapedDatabase();
    try {
      const seeded = await seedScenarioData(pool);
      const { fundId, sourceConfigId, scenarioSetId } = seeded;
      const eligibleRun = await seedQueuedRun(pool, seeded, 'a'.repeat(64), null);
      await pool.query(
        `INSERT INTO fund_scenario_variants
           (scenario_set_id, name, sort_order, override_type, override_payload)
         VALUES ($1, 'invalid override', 0, 'legacy_invalid', '{}'::jsonb)`,
        [scenarioSetId]
      );
      expect(fundId).toBeGreaterThan(0);
      expect(sourceConfigId).toBeGreaterThan(0);
      const before = await snapshot(pool);
      const progress = { stage: 'before-connect' as const };
      let error: unknown;
      try {
        await runJournaledRangeMigration({
          connectionString,
          apply: true,
          expectedTargetFingerprint: await expectedFingerprint(connectionString),
          stdout: quiet,
          progress,
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeTruthy();
      const failure = error instanceof Error ? error : new Error(String(error));
      expect(formatJournaledRangeFailure(failure, progress.stage)).toContain(
        'failed-sqlstate 23514'
      );
      expect(await snapshot(pool)).toEqual(before);
      const ledger = await pool.query(
        'SELECT created_at FROM public.drizzle_migrations WHERE created_at >= 1785800400000'
      );
      expect(ledger.rows).toHaveLength(0);
      const backfill = await pool.query(
        'SELECT queued_event_recorded_at FROM public.fund_scenario_calculation_runs WHERE id = $1',
        [eligibleRun]
      );
      expect(backfill.rows[0].queued_event_recorded_at).toBeNull();
    } finally {
      await pool.end();
    }
  }, 180_000);

  it('fills only the NULL 0053 backfill row and reports both counts', async () => {
    const { connectionString, pool } = await buildProductionShapedDatabase();
    try {
      const seeded = await seedScenarioData(pool);
      const runs = [
        await seedQueuedRun(pool, seeded, 'a'.repeat(64), null),
        await seedQueuedRun(pool, seeded, 'b'.repeat(64), '2026-01-01T00:00:00Z'),
      ];
      const result = await apply(connectionString);
      expect(result.backfillEligibleBefore).toBe(1);
      expect(result.backfillEligibleAfter).toBe(0);
      const rows = await pool.query(
        `SELECT id, queued_event_recorded_at IS NOT NULL AS recorded
         FROM public.fund_scenario_calculation_runs WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [runs]
      );
      expect(rows.rows.map(({ recorded }) => recorded).sort()).toEqual([true, true]);
    } finally {
      await pool.end();
    }
  }, 180_000);

  it.each([
    [
      35,
      async (pool: Pool) => {
        await pool.query(
          `ALTER TABLE fund_scenario_variants ADD CONSTRAINT fund_scenario_variants_override_type_check CHECK (override_type IN ('fee_profile', 'reserve_allocation', 'allocation', 'sector_profile', 'methodology', 'capital_plan'))`
        );
      },
    ],
    [
      36,
      async (pool: Pool) => {
        await pool.query('CREATE TABLE task_update_commands (id integer)');
      },
    ],
    [
      37,
      async (pool: Pool) => {
        await pool.query('CREATE TABLE fund_workflow_commands (id integer)');
      },
    ],
    [
      38,
      async (pool: Pool) => {
        await pool.query(
          'ALTER TABLE portfoliocompanies ADD COLUMN create_idempotency_key varchar(128)'
        );
      },
    ],
  ])(
    'refuses partial residue for manifest %i without mutation',
    async (_order, damage) => {
      const { connectionString, pool } = await buildProductionShapedDatabase();
      try {
        await damage(pool);
        const before = await snapshot(pool);
        const progress = { stage: 'before-connect' as const };
        let error: unknown;
        try {
          await runJournaledRangeMigration({
            connectionString,
            apply: true,
            expectedTargetFingerprint: await expectedFingerprint(connectionString),
            stdout: quiet,
            progress,
          });
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeTruthy();
        const failure = error instanceof Error ? error : new Error(String(error));
        expect(formatJournaledRangeFailure(failure, progress.stage)).toContain(
          'refused-ledger-or-catalog'
        );
        expect(await snapshot(pool)).toEqual(before);
      } finally {
        await pool.end();
      }
    },
    180_000
  );
});
