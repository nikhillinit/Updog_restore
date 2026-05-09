/**
 * @group integration
 * @group testcontainers
 *
 * Phase 0.2 round-trip migration test for the LP Reporting & Evidence
 * Pack foundation schema.
 *
 * Verifies:
 *   - server/migrations/20260508_lp_reporting_foundation_v1.up.sql creates
 *     the 8 owned tables.
 *   - Each documented CHECK constraint fires on bad input.
 *   - The typed-FK exclusivity CHECK on evidence_records (num_nonnulls = 1)
 *     accepts exactly one of {valuation_mark_id, company_id, metric_run_id,
 *     narrative_run_id} and rejects 0 or 2+.
 *   - server/migrations/20260508_lp_reporting_foundation_v1.down.sql removes
 *     all 8 tables and leaves the prerequisite stubs (funds, users,
 *     portfoliocompanies, limited_partners) untouched.
 *
 * Dual-mode (mirrors phase0-migrated-postgres.test.ts):
 *   - TEST_DATABASE_URL=postgres://... (cloud DB; e.g. Neon)
 *   - RUN_DOCKER_PHASE0_TEST=1 (local Docker via @testcontainers/postgresql)
 *   - Otherwise: the suite is skipped (no DB available).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const STARTUP_TIMEOUT_MS = 60_000;
const cloudDbUrl = process.env.TEST_DATABASE_URL;
const useCloudDb = Boolean(cloudDbUrl);
const useDocker = process.env.RUN_DOCKER_PHASE0_TEST === '1';
const skipTest = !useCloudDb && !useDocker;

const MIGRATIONS_DIR = path.join(process.cwd(), 'server', 'migrations');
const UP_SQL_PATH = path.join(MIGRATIONS_DIR, '20260508_lp_reporting_foundation_v1.up.sql');
const DOWN_SQL_PATH = path.join(MIGRATIONS_DIR, '20260508_lp_reporting_foundation_v1.down.sql');

const PREREQ_STUB_SQL = `
  CREATE TABLE IF NOT EXISTS funds (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS portfoliocompanies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS limited_partners (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );
`;

const LP_TABLE_NAMES = [
  'vehicles',
  'cash_flow_events',
  'valuation_marks',
  'lp_metric_runs',
  'narrative_runs',
  'evidence_records',
  'lp_vehicle_participation',
  'lp_vehicle_participation_history',
] as const;

let pool: Pool;
let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer | null = null;
let connectionString: string;

async function resetSchema(): Promise<void> {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query('GRANT ALL ON SCHEMA public TO public');
}

async function tableExists(name: string): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [name]
  );
  return res.rows[0]!.exists;
}

async function indexExists(name: string): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = $1
     ) AS exists`,
    [name]
  );
  return res.rows[0]!.exists;
}

async function insertFund(): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO funds (name) VALUES ($1) RETURNING id`,
    ['LP Reporting Phase 0.2 Test Fund']
  );
  return res.rows[0]!.id;
}

async function insertCompany(): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO portfoliocompanies (name) VALUES ($1) RETURNING id`,
    ['LP Reporting Phase 0.2 Test Company']
  );
  return res.rows[0]!.id;
}

async function expectQueryFails(sqlStmt: string, params: unknown[]): Promise<void> {
  let threw = false;
  try {
    await pool.query(sqlStmt, params);
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
}

describe.skipIf(skipTest)('Phase 0.2: LP Reporting Foundation migration round-trip', () => {
  beforeAll(async () => {
    if (useCloudDb) {
      connectionString = cloudDbUrl as string;
      pool = new Pool({ connectionString });
    } else {
      const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
      container = await new PostgreSqlContainer('postgres:16-alpine')
        .withStartupTimeout(STARTUP_TIMEOUT_MS)
        .start();
      connectionString = container.getConnectionUri();
      pool = new Pool({ connectionString });
    }
    await resetSchema();
    await pool.query(PREREQ_STUB_SQL);
    const upSql = fs.readFileSync(UP_SQL_PATH, 'utf8');
    await pool.query(upSql);
  }, STARTUP_TIMEOUT_MS + 30_000);

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
    if (container) {
      await container.stop();
    }
  });

  describe('up.sql creates all 8 LP-reporting tables', () => {
    it.each(LP_TABLE_NAMES)('table %s exists', async (name) => {
      expect(await tableExists(name)).toBe(true);
    });
  });

  describe('up.sql creates FK support indexes', () => {
    it.each([
      'idx_narrative_runs_metric_run',
      'idx_evidence_narrative_run',
      'idx_lp_vehicle_participation_vehicle',
      'idx_lp_vehicle_participation_history_parent_changed_at',
    ])('index %s exists', async (name) => {
      expect(await indexExists(name)).toBe(true);
    });
  });

  describe('cash_flow_events CHECK constraints fire', () => {
    it('accepts each documented event_type', async () => {
      const fundId = await insertFund();
      const eventTypes = [
        'lp_capital_call',
        'lp_distribution',
        'fund_expense',
        'portfolio_investment',
        'realized_proceeds',
        'recallable_distribution',
        'reversal',
      ];
      for (const eventType of eventTypes) {
        await pool.query(
          `INSERT INTO cash_flow_events (fund_id, event_type, amount, event_date, perspective)
           VALUES ($1, $2, $3, NOW(), 'fund_gross')`,
          [fundId, eventType, '1000.000000']
        );
      }
    });

    it('rejects unknown event_type', async () => {
      const fundId = await insertFund();
      await expectQueryFails(
        `INSERT INTO cash_flow_events (fund_id, event_type, amount, event_date, perspective)
         VALUES ($1, 'unknown_event_type', '100.0', NOW(), 'fund_gross')`,
        [fundId]
      );
    });

    it('rejects status=locked with NULL locked_at (cash_flow_locked_not_mutable)', async () => {
      const fundId = await insertFund();
      await expectQueryFails(
        `INSERT INTO cash_flow_events
           (fund_id, event_type, amount, event_date, perspective, status, locked_at)
         VALUES ($1, 'fund_expense', '100.0', NOW(), 'fund_gross', 'locked', NULL)`,
        [fundId]
      );
    });

    it('accepts status=locked when locked_at is set', async () => {
      const fundId = await insertFund();
      await pool.query(
        `INSERT INTO cash_flow_events
           (fund_id, event_type, amount, event_date, perspective, status, locked_at)
         VALUES ($1, 'fund_expense', '100.0', NOW(), 'fund_gross', 'locked', NOW())`,
        [fundId]
      );
    });
  });

  describe('valuation_marks CHECK constraints fire', () => {
    it('accepts each documented mark_source', async () => {
      const fundId = await insertFund();
      const companyId = await insertCompany();
      const markSources = [
        'financing_round',
        'signed_loi',
        'revenue_milestone',
        'strategic_partnership',
        'audited_financials',
        'board_update',
        'gp_estimate',
        'third_party_priced',
        'secondary_transaction',
        'impairment',
      ];
      for (const markSource of markSources) {
        await pool.query(
          `INSERT INTO valuation_marks
             (fund_id, company_id, mark_date, as_of_date, fair_value,
              mark_source, confidence_level, valuation_method)
           VALUES ($1, $2, NOW(), NOW(), '1000000.000000',
                   $3, 'medium', 'comparable_companies')`,
          [fundId, companyId, markSource]
        );
      }
    });

    it('rejects unknown mark_source', async () => {
      const fundId = await insertFund();
      const companyId = await insertCompany();
      await expectQueryFails(
        `INSERT INTO valuation_marks
           (fund_id, company_id, mark_date, as_of_date, fair_value,
            mark_source, confidence_level, valuation_method)
         VALUES ($1, $2, NOW(), NOW(), '1000000.0',
                 'unknown_source', 'medium', 'dcf')`,
        [fundId, companyId]
      );
    });

    it('rejects unknown confidence_level', async () => {
      const fundId = await insertFund();
      const companyId = await insertCompany();
      await expectQueryFails(
        `INSERT INTO valuation_marks
           (fund_id, company_id, mark_date, as_of_date, fair_value,
            mark_source, confidence_level, valuation_method)
         VALUES ($1, $2, NOW(), NOW(), '1000000.0',
                 'financing_round', 'extreme', 'dcf')`,
        [fundId, companyId]
      );
    });
  });

  describe('evidence_records typed-FK exclusivity (num_nonnulls = 1)', () => {
    let fundId: number;
    let companyId: number;
    let metricRunId: number;

    beforeAll(async () => {
      fundId = await insertFund();
      companyId = await insertCompany();
      const metricRunInsert = await pool.query<{ id: number }>(
        `INSERT INTO lp_metric_runs
           (fund_id, as_of_date, run_type, perspective, inputs_hash,
            results_json, methodology_version, calculation_version)
         VALUES ($1, NOW(), 'quarterly_report', 'lp_net', 'hash-x',
                 '{}'::jsonb, 'v1.0', 'v1.0')
         RETURNING id`,
        [fundId]
      );
      metricRunId = metricRunInsert.rows[0]!.id;
    });

    it('rejects 0 of {valuation_mark_id, company_id, metric_run_id, narrative_run_id}', async () => {
      await expectQueryFails(
        `INSERT INTO evidence_records
           (fund_id, evidence_source, source_date, confidence_level,
            materiality_level, confidentiality)
         VALUES ($1, 'financing_round', NOW(), 'medium', 'medium', 'internal')`,
        [fundId]
      );
    });

    it('rejects 2 of those 4 set', async () => {
      await expectQueryFails(
        `INSERT INTO evidence_records
           (fund_id, company_id, metric_run_id, evidence_source,
            source_date, confidence_level, materiality_level, confidentiality)
         VALUES ($1, $2, $3, 'financing_round', NOW(),
                 'medium', 'medium', 'internal')`,
        [fundId, companyId, metricRunId]
      );
    });

    it('accepts exactly 1 of those 4 set (company_id only)', async () => {
      await pool.query(
        `INSERT INTO evidence_records
           (fund_id, company_id, evidence_source, source_date,
            confidence_level, materiality_level, confidentiality)
         VALUES ($1, $2, 'financing_round', NOW(),
                 'medium', 'medium', 'internal')`,
        [fundId, companyId]
      );
    });
  });

  describe('lp_metric_runs CHECK constraints fire', () => {
    it('accepts each documented run_type', async () => {
      const fundId = await insertFund();
      const runTypes = ['quarterly_report', 'fundraise_pack', 'internal_review', 'lp_update'];
      for (const runType of runTypes) {
        await pool.query(
          `INSERT INTO lp_metric_runs
             (fund_id, as_of_date, run_type, perspective, inputs_hash,
              results_json, methodology_version, calculation_version)
           VALUES ($1, NOW(), $2, 'lp_net', 'hash', '{}'::jsonb, 'v1', 'v1')`,
          [fundId, runType]
        );
      }
    });

    it('accepts each documented status value', async () => {
      const fundId = await insertFund();
      const statuses = ['draft', 'approved', 'locked', 'exported', 'superseded'];
      for (const status of statuses) {
        await pool.query(
          `INSERT INTO lp_metric_runs
             (fund_id, as_of_date, run_type, perspective, status, inputs_hash,
              results_json, methodology_version, calculation_version)
           VALUES ($1, NOW(), 'quarterly_report', 'lp_net', $2, 'hash',
                   '{}'::jsonb, 'v1', 'v1')`,
          [fundId, status]
        );
      }
    });
  });

  describe('vehicles CHECK and uniqueness', () => {
    it('rejects unknown vehicle_type', async () => {
      const fundId = await insertFund();
      await expectQueryFails(
        `INSERT INTO vehicles (fund_id, vehicle_slug, vehicle_type, name)
         VALUES ($1, 'slug-1', 'unknown_vehicle_type', 'Test')`,
        [fundId]
      );
    });

    it('UNIQUE(fund_id, vehicle_slug) rejects duplicates within a single fund', async () => {
      const fundId = await insertFund();
      await pool.query(
        `INSERT INTO vehicles (fund_id, vehicle_slug, vehicle_type, name)
         VALUES ($1, 'duplicate-slug', 'main_fund', 'A')`,
        [fundId]
      );
      await expectQueryFails(
        `INSERT INTO vehicles (fund_id, vehicle_slug, vehicle_type, name)
         VALUES ($1, 'duplicate-slug', 'spv', 'B')`,
        [fundId]
      );
    });

    it('UNIQUE(fund_id, vehicle_slug) accepts the same slug across different funds', async () => {
      const fundIdA = await insertFund();
      const fundIdB = await insertFund();
      await pool.query(
        `INSERT INTO vehicles (fund_id, vehicle_slug, vehicle_type, name)
         VALUES ($1, 'cross-fund-slug', 'main_fund', 'A')`,
        [fundIdA]
      );
      await pool.query(
        `INSERT INTO vehicles (fund_id, vehicle_slug, vehicle_type, name)
         VALUES ($1, 'cross-fund-slug', 'main_fund', 'B')`,
        [fundIdB]
      );
    });
  });

  describe('lp_vehicle_participation_history requires a parent participation row', () => {
    it('rejects insert with non-existent lp_vehicle_participation_id', async () => {
      await expectQueryFails(
        `INSERT INTO lp_vehicle_participation_history
           (lp_vehicle_participation_id, to_status)
         VALUES (999999, 'spv_only')`,
        []
      );
    });
  });

  describe('down.sql cleanly drops all 8 tables and leaves prerequisites intact', () => {
    it('drops every LP-reporting table and preserves prerequisites', async () => {
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf8');
      await pool.query(downSql);

      for (const name of LP_TABLE_NAMES) {
        expect(await tableExists(name)).toBe(false);
      }

      for (const prereq of ['funds', 'users', 'portfoliocompanies', 'limited_partners']) {
        expect(await tableExists(prereq)).toBe(true);
      }
    });
  });
});
