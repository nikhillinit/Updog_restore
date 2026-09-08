import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCurrentForecastJournaledMigrationRecovery } from '../../scripts/run-current-forecast-journaled-migrations.mjs';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const databases: string[] = [];
let admin: Pool;
let startedContainer = false;

function baseConnection(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

async function databaseAt(tag: string): Promise<string> {
  const name = `cf_migration_${process.pid}_${Date.now()}_${databases.length}`.toLowerCase();
  databases.push(name);
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(baseConnection());
  url.pathname = `/${name}`;
  await runMigrationsWithConnectionString(url.toString(), tag);
  return url.toString();
}

async function snapshot(pool: Pool) {
  const ledger = await pool.query(
    'SELECT hash, created_at FROM public.drizzle_migrations ORDER BY created_at'
  );
  const catalog = await pool.query(`
    SELECT c.relname, c.relkind,
           COALESCE(
             array_agg(a.attname ORDER BY a.attnum)
               FILTER (WHERE a.attnum > 0 AND NOT a.attisdropped),
             ARRAY[]::name[]
           ) AS columns
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      LEFT JOIN pg_attribute AS a ON a.attrelid = c.oid
     WHERE n.nspname = 'public'
     GROUP BY c.oid, c.relname, c.relkind
     ORDER BY c.relname
  `);
  return { ledger: ledger.rows, catalog: catalog.rows };
}

async function expectPreBaselineLedgerDamageRefused(
  damage: (pool: Pool) => Promise<unknown>,
  message: RegExp
) {
  const url = await databaseAt('0049_kpi_observations');
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await damage(pool);
    const before = await snapshot(pool);
    await expect(
      runCurrentForecastJournaledMigrationRecovery({ connectionString: url, apply: true })
    ).rejects.toThrow(message);
    expect(await snapshot(pool)).toEqual(before);
  } finally {
    await pool.end();
  }
}

describe.skipIf(skipIfNoDocker)(
  'Current Forecast journaled migration recovery',
  { retry: 0 },
  () => {
    beforeAll(async () => {
      if (!process.env.TEST_DATABASE_URL) {
        await setupTestContainers();
        startedContainer = true;
      }
      admin = new Pool({ connectionString: baseConnection(), max: 1 });
    }, 120_000);

    afterAll(async () => {
      for (const name of databases.reverse()) {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      }
      await admin.end();
      if (startedContainer) await cleanupTestContainers();
    }, 120_000);

    it('audits 0050-0055 without writes', async () => {
      const url = await databaseAt('0049_kpi_observations');
      const pool = new Pool({ connectionString: url, max: 1 });
      try {
        const before = await snapshot(pool);
        await expect(
          runCurrentForecastJournaledMigrationRecovery({
            connectionString: url,
            apply: false,
          })
        ).resolves.toMatchObject({
          preState: { state: 'ready', appliedTargetCount: 0 },
          applied: false,
        });
        expect(await snapshot(pool)).toEqual(before);
      } finally {
        await pool.end();
      }
    }, 180_000);

    it('applies six migrations from exact 0049 baseline and replays complete state', async () => {
      const url = await databaseAt('0049_kpi_observations');
      const first = await runCurrentForecastJournaledMigrationRecovery({
        connectionString: url,
        apply: true,
      });
      expect(first).toMatchObject({
        preState: { state: 'ready', appliedTargetCount: 0 },
        postState: 'complete',
        applied: true,
      });
      await expect(
        runCurrentForecastJournaledMigrationRecovery({
          connectionString: url,
          apply: true,
        })
      ).resolves.toMatchObject({
        preState: { state: 'complete', appliedTargetCount: 6 },
        postState: 'complete',
        applied: false,
      });
      const pool = new Pool({ connectionString: url, max: 1 });
      try {
        const rows = await pool.query(
          `SELECT hash, created_at FROM public.drizzle_migrations
            WHERE created_at >= 1785800400000 ORDER BY created_at`
        );
        expect(rows.rows).toHaveLength(6);
        expect(rows.rows.map(({ created_at }) => Number(created_at))).toEqual([
          1785800400000, 1785886800000, 1785973200000, 1786059600000, 1788161773455, 1788235843534,
        ]);
      } finally {
        await pool.end();
      }
    }, 180_000);

  it('preserves the ADR-074 sparse baseline while journaled target apply remains replay-safe', async () => {
    const url = await databaseAt('0049_kpi_observations');
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      // Reproduce the accepted recovery history in this disposable test fixture.
      await pool.query(
        'DELETE FROM public.drizzle_migrations WHERE created_at > $1 AND created_at < $2',
        [1775356800000, 1785368400000]
      );
      const original = await snapshot(pool);
      expect(original.ledger).toHaveLength(14);
      await expect(
        runCurrentForecastJournaledMigrationRecovery({ connectionString: url, apply: true })
      ).resolves.toMatchObject({
        preState: { state: 'ready', appliedTargetCount: 0 },
        postState: 'complete',
        applied: true,
      });
      const applied = await snapshot(pool);
      expect(applied.ledger).toHaveLength(20);
      expect(applied.ledger.slice(0, 14)).toEqual(original.ledger);
      await expect(
        runCurrentForecastJournaledMigrationRecovery({ connectionString: url, apply: true })
      ).resolves.toMatchObject({ postState: 'complete', applied: false });
      expect(await snapshot(pool)).toEqual(applied);
    } finally {
      await pool.end();
    }
  }, 180_000);

  it.each([
      ['0050_g3_portfolio_and_calculation_schema', 1],
      ['0051_g3_canary_schema', 2],
      ['0052_g3_capital_call_notification_outbox', 3],
      ['0053_g3_release_gate_hardening', 4],
      ['0054_operating_decisions_spine', 5],
    ])(
      'resumes contiguous prefix %s',
      async (tag, appliedTargetCount) => {
        const url = await databaseAt(tag);
        await expect(
          runCurrentForecastJournaledMigrationRecovery({
            connectionString: url,
            apply: true,
          })
        ).resolves.toMatchObject({
          preState: { state: 'ready', appliedTargetCount },
          postState: 'complete',
          applied: true,
        });
      },
      180_000
    );

    it('refuses ledger hash mismatch before writes', async () => {
      const url = await databaseAt('0049_kpi_observations');
      const pool = new Pool({ connectionString: url, max: 1 });
      try {
        await pool.query(
          `UPDATE public.drizzle_migrations SET hash = repeat('0', 64)
            WHERE created_at = 1785714000000`
        );
        const before = await snapshot(pool);
        await expect(
          runCurrentForecastJournaledMigrationRecovery({
            connectionString: url,
            apply: true,
          })
        ).rejects.toThrow(/hash mismatch/);
        expect(await snapshot(pool)).toEqual(before);
      } finally {
        await pool.end();
      }
    }, 180_000);

    it('refuses missing pre-0049 ledger history before writes', async () => {
      await expectPreBaselineLedgerDamageRefused(
        (pool) =>
          pool.query(
            'DELETE FROM public.drizzle_migrations WHERE created_at = (SELECT MIN(created_at) FROM public.drizzle_migrations)'
          ),
        /missing|gap|reorder/i
      );
    }, 180_000);

    it('refuses tampered pre-0049 ledger hash before writes', async () => {
      await expectPreBaselineLedgerDamageRefused(
        (pool) =>
          pool.query(
            `UPDATE public.drizzle_migrations
              SET hash = repeat('0', 64)
            WHERE created_at = (SELECT MIN(created_at) FROM public.drizzle_migrations)`
          ),
        /hash mismatch/i
      );
    }, 180_000);

    it.each([
      ['portfolio_company_update_receipts', '0049_kpi_observations'],
      ['release_canary_runs', '0049_kpi_observations'],
      ['capital_call_notification_outbox', '0049_kpi_observations'],
      ['fund_scenario_calculation_commands', '0049_kpi_observations'],
      ['operating_decisions', '0053_g3_release_gate_hardening'],
    ])(
      'refuses partial %s before migrate with unchanged snapshots',
      async (table, tag) => {
        const url = await databaseAt(tag);
        const pool = new Pool({ connectionString: url, max: 1 });
        try {
          await pool.query(`CREATE TABLE "${table}" (id integer)`);
          const before = await snapshot(pool);
          await expect(
            runCurrentForecastJournaledMigrationRecovery({
              connectionString: url,
              apply: true,
            })
          ).rejects.toThrow(/partial|sentinel|unsafe/i);
          expect(await snapshot(pool)).toEqual(before);
        } finally {
          await pool.end();
        }
      },
      180_000
    );

    it('refuses ledgered-but-damaged 0054 before migrate', async () => {
      const url = await databaseAt('0054_operating_decisions_spine');
      const pool = new Pool({ connectionString: url, max: 1 });
      try {
        await pool.query('ALTER TABLE operating_decisions DROP COLUMN title');
        const before = await snapshot(pool);
        await expect(
          runCurrentForecastJournaledMigrationRecovery({
            connectionString: url,
            apply: true,
          })
        ).rejects.toThrow(/catalog|partial|sentinel|unsafe/i);
        expect(await snapshot(pool)).toEqual(before);
      } finally {
        await pool.end();
      }
    }, 180_000);

    it.each([
      [
        'constraint',
        async (pool: Pool) => {
          await pool.query(`
          ALTER TABLE capital_call_notification_outbox
            DROP CONSTRAINT capital_call_notification_outbox_status_check
        `);
          await pool.query(`
          ALTER TABLE capital_call_notification_outbox
            ADD CONSTRAINT capital_call_notification_outbox_status_check CHECK (true)
        `);
        },
      ],
      [
        'index',
        async (pool: Pool) => {
          await pool.query('DROP INDEX portfolio_company_update_receipts_fund_company_created_idx');
          await pool.query(`
          CREATE INDEX portfolio_company_update_receipts_fund_company_created_idx
            ON portfolio_company_update_receipts (fund_id)
        `);
        },
      ],
    ])(
      'refuses same-named %s with different definition',
      async (_kind, damage) => {
        const url = await databaseAt('0052_g3_capital_call_notification_outbox');
        const pool = new Pool({ connectionString: url, max: 1 });
        try {
          await damage(pool);
          const before = await snapshot(pool);
          await expect(
            runCurrentForecastJournaledMigrationRecovery({
              connectionString: url,
              apply: true,
            })
          ).rejects.toThrow(/definition|catalog|sentinel|unsafe/i);
          expect(await snapshot(pool)).toEqual(before);
        } finally {
          await pool.end();
        }
      },
      180_000
    );

    it('serializes concurrent recovery attempts and remains replayable', async () => {
      const url = await databaseAt('0049_kpi_observations');
      const outcomes = await Promise.allSettled([
        runCurrentForecastJournaledMigrationRecovery({ connectionString: url, apply: true }),
        runCurrentForecastJournaledMigrationRecovery({ connectionString: url, apply: true }),
      ]);
      expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
      await expect(
        runCurrentForecastJournaledMigrationRecovery({
          connectionString: url,
          apply: true,
        })
      ).resolves.toMatchObject({
        preState: { state: 'complete', appliedTargetCount: 6 },
        applied: false,
      });
    }, 180_000);

    it('refuses pooled URLs before connecting', async () => {
      await expect(
        runCurrentForecastJournaledMigrationRecovery({
          connectionString: 'postgres://u:p@ep-pooler.example/db',
          apply: false,
        })
      ).rejects.toThrow(/pooled/i);
    });
  }
);
