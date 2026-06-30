/**
 * Schema/migration checks for Phase 1c import idempotency indexes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../../../shared/schema';

describe('LP reporting import source_hash unique indexes', () => {
  it('keeps Drizzle schema aligned with the partial unique index names', () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), 'shared', 'schema', 'lp-reporting-evidence.ts'),
      'utf8'
    );

    expect(schema).toMatch(/uniqueIndex\('cash_flow_events_fund_source_hash_unique'\)/);
    expect(schema).toMatch(/uniqueIndex\('valuation_marks_fund_source_hash_unique'\)/);
    expect(schema).toMatch(/sourceHash\} IS NOT NULL/);
  });
});

describe('LP reporting metric-run idempotency index', () => {
  it('keeps Drizzle schema aligned with the metric-run unique index name', () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), 'shared', 'schema', 'lp-reporting-evidence.ts'),
      'utf8'
    );

    expect(schema).toMatch(/uniqueIndex\('lp_metric_runs_fund_run_inputs_unique'\)/);
  });
});

describe('LP reporting metric-run lifecycle columns', () => {
  it('declares version, updated_at, and locked_by on lp_metric_runs in the Drizzle shape', () => {
    const config = getTableConfig(schema.lpMetricRuns);
    const columns = config.columns.map((col) => col.name);
    expect(columns).toContain('version');
    expect(columns).toContain('updated_at');
    expect(columns).toContain('locked_by');
  });
});

describe('LP reporting unique indexes are journaled in the canonical 0014 migration', () => {
  const journal = fs.readFileSync(
    path.join(process.cwd(), 'migrations', '0014_lp_evidence_sprint3_drift.sql'),
    'utf8'
  );
  const compactJournal = journal.replace(/\s+/g, ' ');

  function expectJournalUniqueIndex(
    name: string,
    table: string,
    columns: readonly string[],
    predicate?: string
  ): void {
    const columnList = columns.map((column) => `"${column}"`).join(',');
    expect(compactJournal).toContain(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${name}" ON "${table}" USING btree (${columnList})`
    );
    if (predicate) {
      expect(compactJournal).toContain(predicate);
    }
  }

  it('declares source-hash, idempotency, narrative, and package unique indexes', () => {
    // Shape assertions above prove shared/schema; this proves the canonical
    // journal still carries the same indexes, so a journal-only drop is caught
    // here without relying on the Docker-gated journal==shape proof.
    expectJournalUniqueIndex(
      'cash_flow_events_fund_source_hash_unique',
      'cash_flow_events',
      ['fund_id', 'source_hash'],
      '"cash_flow_events"."source_hash" IS NOT NULL'
    );
    expectJournalUniqueIndex(
      'valuation_marks_fund_source_hash_unique',
      'valuation_marks',
      ['fund_id', 'source_hash'],
      '"valuation_marks"."source_hash" IS NOT NULL'
    );
    expectJournalUniqueIndex('lp_metric_runs_fund_run_inputs_unique', 'lp_metric_runs', [
      'fund_id',
      'run_type',
      'perspective',
      'as_of_date',
      'inputs_hash',
    ]);
    expectJournalUniqueIndex(
      'evidence_records_metric_run_idempotency_unique',
      'evidence_records',
      ['fund_id', 'metric_run_id', 'idempotency_key'],
      '"evidence_records"."idempotency_key" IS NOT NULL'
    );
    expectJournalUniqueIndex('narrative_runs_metric_run_type_unique', 'narrative_runs', [
      'metric_run_id',
      'narrative_type',
    ]);
    expectJournalUniqueIndex(
      'lp_report_package_exports_package_format_version_unique',
      'lp_report_package_exports',
      ['report_package_id', 'format', 'export_version']
    );
  });
});
