import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  classifyMigrationSqlFile,
  findLooseMigrationSql,
  LEGACY_JOURNALED_UNMARKED_ALLOWLIST,
  readDrizzleJournal,
  readJournaledMigrationFiles,
  validateMigrationLedger,
  type JournalFile,
} from '../../scripts/migration-ledger';

const repoRoot = process.cwd();
const tempRoots: string[] = [];

const expectedLooseFiles = [
  '0001_create_portfolio_tables.sql',
  '0001_portfolio_schema_hardening.sql',
  '0001_portfolio_schema_hardening_ROLLBACK.sql',
  '0002_add_organizations.sql',
  '0002_multi_tenant_rls_setup.sql',
  '0002_multi_tenant_rls_setup_ROLLBACK.sql',
  '0008_demo_profile_import_rows_rollback.sql',
  '001_lp_reporting_schema.sql',
  '002_lp_reporting_indexes.sql',
  '003_lp_dashboard_materialized_view.sql',
  '004_lp_sprint3_tables.sql',
  '20251030_stage_normalization_log.sql',
  '20251031_add_agent_memories.sql',
  '999_fix_materialized_view.sql',
  'manual-migration.sql',
].sort();

const expectedJournaledDriftPatchFiles = [
  '0012_sector_variance_drift.sql',
  '0014_lp_evidence_sprint3_drift.sql',
  '0016_reconciliation_runs.sql',
  '0017_moic_exit_probability_modes.sql',
  '0020_operating_tasks_drift.sql',
  '0021_version_columns_bigint_drift.sql',
  '0022_planning_fmv_override_requests_drift.sql',
  '0023_version_default_resync_drift.sql',
  '0024_idempotency_cursor_resync_drift.sql',
  '0025_allocation_scenarios_promote_drift.sql',
].sort();

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe('migration ledger helpers', () => {
  it('reads journaled migration files in journal order and throws when a journal tag has no file', () => {
    const root = makeFixtureRoot();
    writeJournal(root, [
      { idx: 0, when: 1, tag: '0002_second', breakpoints: true },
      { idx: 1, when: 2, tag: '0001_first', breakpoints: true },
    ]);
    writeSql(root, '0002_second.sql', 'SELECT 2;');
    writeSql(root, '0001_first.sql', 'SELECT 1;');

    expect(readJournaledMigrationFiles(root).map((file) => file.tag)).toEqual([
      '0002_second',
      '0001_first',
    ]);

    fs.rmSync(path.join(root, 'migrations', '0001_first.sql'));

    expect(() => readJournaledMigrationFiles(root)).toThrow(/0001_first/);
  });

  it('finds the known loose migration SQL files and never includes journaled files', () => {
    const looseFiles = findLooseMigrationSql(repoRoot)
      .map((file) => file.file)
      .sort();
    const journaledFiles = new Set(readJournaledMigrationFiles(repoRoot).map((file) => file.file));

    expect(looseFiles).toEqual(expectedLooseFiles);
    expect(looseFiles).toHaveLength(15);
    expect(looseFiles.some((file) => journaledFiles.has(file))).toBe(false);
  });

  it('classifies materialized-view, RLS, and rollback loose files', () => {
    const journalTags = new Set(readDrizzleJournal(repoRoot).entries.map((entry) => entry.tag));

    expect(classifyRealFile('003_lp_dashboard_materialized_view.sql', journalTags).class).toBe(
      'loose-materialized-view'
    );
    expect(classifyRealFile('0002_multi_tenant_rls_setup.sql', journalTags).class).toBe(
      'loose-rls'
    );
    expect(classifyRealFile('0002_multi_tenant_rls_setup_ROLLBACK.sql', journalTags).class).toBe(
      'loose-rollback'
    );
  });

  it('validates the real migration tree with grandfathered unmarked files and marked drift patches', () => {
    const result = validateMigrationLedger(repoRoot);
    const errors = result.findings.filter((finding) => finding.severity === 'error');
    const journalTags = new Set(readDrizzleJournal(repoRoot).entries.map((entry) => entry.tag));
    const markedJournaled = readJournaledMigrationFiles(repoRoot)
      .map((file) => classifyMigrationSqlFile(file.file, file.sql, journalTags))
      .filter((classification) => classification.class === 'journaled-drift-patch');

    expect(result.ok).toBe(true);
    expect(errors).toEqual([]);
    expect(
      result.findings.filter((finding) => finding.code === 'legacy-journaled-unmarked-allowlisted')
    ).toHaveLength(LEGACY_JOURNALED_UNMARKED_ALLOWLIST.length);
    expect(markedJournaled.map((classification) => classification.file).sort()).toEqual(
      expectedJournaledDriftPatchFiles
    );
  });

  it('keeps the Planning FMV drift patch aligned to the canonical portfolio company table', () => {
    const sql = fs.readFileSync(
      path.join(repoRoot, 'migrations', '0022_planning_fmv_override_requests_drift.sql'),
      'utf8'
    );

    expect(sql).toMatch(/REFERENCES\s+"public"\."portfoliocompanies"\("id"\)\s+ON DELETE cascade/i);
    expect(sql).not.toMatch(/REFERENCES\s+portfolio_companies\(id\)/i);
    expect(sql).toMatch(/ADD CONSTRAINT "planning_fmv_override_requests_fund_id_funds_id_fk"/);
    expect(sql).toMatch(
      /ADD CONSTRAINT "planning_fmv_override_requests_company_id_portfoliocompanies_id_fk"/
    );
    expect(sql).toMatch(
      /ADD CONSTRAINT "planning_fmv_override_requests_valuation_mark_id_valuation_marks_id_fk"/
    );
  });

  it('errors when a synthetic new journaled migration has no marker', () => {
    const root = makeFixtureRoot();
    writeJournal(root, [{ idx: 0, when: 1, tag: '9999_new_unmarked', breakpoints: true }]);
    writeSql(root, '9999_new_unmarked.sql', 'CREATE TABLE new_unmarked (id integer);');

    const result = validateMigrationLedger(root);

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'journaled-sql-missing-marker',
          file: '9999_new_unmarked.sql',
          message: expect.stringContaining(
            'new/edited journaled SQL needs -- @generated or -- @drift-patch marker'
          ),
        }),
      ])
    );
  });

  it('errors when a journal tag has no matching SQL file', () => {
    const root = makeFixtureRoot();
    writeJournal(root, [{ idx: 0, when: 1, tag: '9999_missing_file', breakpoints: true }]);

    const result = validateMigrationLedger(root);

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'journal-tag-missing-file',
          file: '9999_missing_file.sql',
        }),
      ])
    );
  });

  it('errors when a drift patch has no Reason line after the marker', () => {
    const root = makeFixtureRoot();
    writeJournal(root, [{ idx: 0, when: 1, tag: '9999_drift_without_reason', breakpoints: true }]);
    writeSql(
      root,
      '9999_drift_without_reason.sql',
      '-- @drift-patch\nCREATE TABLE drift_without_reason (id integer);'
    );

    const result = validateMigrationLedger(root);

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'drift-patch-missing-reason',
          file: '9999_drift_without_reason.sql',
        }),
      ])
    );
  });

  it('errors when synthetic loose root SQL is unmarked and not grandfathered', () => {
    const root = makeFixtureRoot();
    writeJournal(root, []);
    writeSql(root, '9999_new_loose_root.sql', 'CREATE TABLE new_loose_root (id integer);');

    const result = validateMigrationLedger(root);

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'loose-migration-sql-missing-marker',
          file: '9999_new_loose_root.sql',
        }),
      ])
    );
  });
});

function classifyRealFile(file: string, journalTags: ReadonlySet<string>) {
  const sql = fs.readFileSync(path.join(repoRoot, 'migrations', file), 'utf-8');
  return classifyMigrationSqlFile(file, sql, journalTags);
}

function makeFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-ledger-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'migrations', 'meta'), { recursive: true });
  return root;
}

function writeJournal(root: string, entries: JournalFile['entries']): void {
  const journal: JournalFile = { version: '7', dialect: 'postgresql', entries };
  fs.writeFileSync(
    path.join(root, 'migrations', 'meta', '_journal.json'),
    `${JSON.stringify(journal, null, 2)}\n`
  );
}

function writeSql(root: string, file: string, sql: string): void {
  fs.writeFileSync(path.join(root, 'migrations', file), `${sql}\n`);
}
