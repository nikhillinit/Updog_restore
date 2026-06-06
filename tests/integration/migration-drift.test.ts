import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as coreSchema from '../../shared/schema';
import * as lpReportingSchema from '../../shared/schema-lp-reporting';
import * as lpSprint3Schema from '../../shared/schema-lp-sprint3';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;

const ISSUE_781_SCHEMA_TABLES = [
  'fund_scenario_set_events',
  'fund_scenario_calculation_runs',
  'scenario_matrices',
  'optimization_sessions',
  'shares',
  'share_snapshots',
  'share_analytics',
  'sensitivity_runs',
  'snapshot_versions',
  'sector_taxonomy',
  'sector_mappings',
  'company_overrides',
  'investment_overrides',
  'cohort_definitions',
  'variance_planner_leader',
  'limited_partners',
  'lp_fund_commitments',
  'capital_activities',
  'lp_distributions',
  'lp_capital_accounts',
  'lp_performance_snapshots',
  'lp_reports',
  'report_templates',
  'lp_audit_log',
  'vehicles',
  'cash_flow_events',
  'valuation_marks',
  'lp_metric_runs',
  'narrative_runs',
  'evidence_records',
  'lp_report_packages',
  'lp_report_package_exports',
  'lp_vehicle_participation',
  'lp_vehicle_participation_history',
  'lp_capital_calls',
  'lp_payment_submissions',
  'lp_distribution_details',
  'lp_documents',
  'lp_notifications',
  'lp_notification_preferences',
] as const;

const skipIfNoDocker = !process.env.CI && process.platform === 'win32';

let postgres: StartedPostgreSqlContainer | undefined;
let pool: Pool | undefined;

function schemaTableNames(): Set<string> {
  const tableNames = new Set<string>();
  for (const schemaModule of [coreSchema, lpReportingSchema, lpSprint3Schema]) {
    for (const exportedValue of Object.values(schemaModule)) {
      if (is(exportedValue, PgTable)) {
        tableNames.add(getTableName(exportedValue));
      }
    }
  }
  return tableNames;
}

async function publicTables(activePool: Pool): Promise<Set<string>> {
  const result = await activePool.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])
    `,
    [ISSUE_781_SCHEMA_TABLES]
  );

  return new Set(result.rows.map((row) => row.table_name));
}

describe.skipIf(skipIfNoDocker)('migration drift guard', () => {
  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .withStartupTimeout(STARTUP_TIMEOUT_MS)
      .start();

    const connectionString = postgres.getConnectionUri();
    await runMigrationsWithConnectionString(connectionString);
    pool = new Pool({ connectionString, max: 1 });
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    await pool?.end();
    if (process.env.CI === 'true') {
      console.warn('[migration-drift] Postgres container left for CI cleanup after pg pool close');
      return;
    }
    await postgres?.stop();
  });

  it('keeps issue #781 schema tables present in the journaled migration stream', async () => {
    expect(pool).toBeDefined();

    const declaredTables = schemaTableNames();
    const undeclaredIssueTables = ISSUE_781_SCHEMA_TABLES.filter(
      (tableName) => !declaredTables.has(tableName)
    );
    expect(undeclaredIssueTables).toEqual([]);

    const migratedTables = await publicTables(pool!);
    const missingTables = ISSUE_781_SCHEMA_TABLES.filter(
      (tableName) => !migratedTables.has(tableName)
    );

    expect(missingTables).toEqual([]);
  });
});
