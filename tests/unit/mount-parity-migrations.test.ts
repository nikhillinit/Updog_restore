import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

const C1_MOUNTED_TABLES = [
  'cohort_definitions',
  'sector_taxonomy',
  'sector_mappings',
  'company_overrides',
  'investment_overrides',
  'reconciliation_runs',
  'fund_calculation_modes',
  'tasks',
  'vehicles',
  'cash_flow_events',
  'valuation_marks',
  'lp_metric_runs',
  'evidence_records',
  'narrative_runs',
  'lp_report_packages',
  'lp_report_package_exports',
] as const;

const DEFERRED_DOMAIN_LOCKED_TABLES = [
  // Decision-3 / Debate D4 defer rounds storage to the investment-rounds rollout.
  'investment_rounds',
  'investment_round_model_overrides',
] as const;

function migrationSql(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort()
    .map((fileName) => fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf8'))
    .join('\n');
}

function hasCreateTable(sql: string, tableName: string): boolean {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    String.raw`CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?${escaped}"?\b`,
    'i'
  ).test(sql);
}

describe('makeApp mount parity with journaled migrations', () => {
  it('has CREATE TABLE coverage for every C1 mounted table except deferred rounds tables', () => {
    const sql = migrationSql();
    const missingCreateTables = C1_MOUNTED_TABLES.filter(
      (tableName) => !hasCreateTable(sql, tableName)
    );

    expect(missingCreateTables).toEqual([]);
  });

  it('keeps deferred rounds tables documented outside the C1 migration parity assertion', () => {
    expect(DEFERRED_DOMAIN_LOCKED_TABLES).toEqual([
      'investment_rounds',
      'investment_round_model_overrides',
    ]);
  });
});
