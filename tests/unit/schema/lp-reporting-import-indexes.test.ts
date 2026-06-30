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

describe('LP reporting partial unique indexes are journaled in the canonical 0014 migration', () => {
  const journal = fs.readFileSync(
    path.join(process.cwd(), 'migrations', '0014_lp_evidence_sprint3_drift.sql'),
    'utf8'
  );

  it('declares the source_hash and metric-run unique indexes (guards a journal-only drop)', () => {
    // Shape assertions above prove shared/schema; this proves the canonical
    // journal still carries the same indexes, so a drop in 0014 without a
    // matching shape change is caught here (the §7 journal==shape proof is
    // Docker-gated and does not auto-run on every PR).
    expect(journal).toMatch(/cash_flow_events_fund_source_hash_unique/);
    expect(journal).toMatch(/valuation_marks_fund_source_hash_unique/);
    expect(journal).toMatch(/lp_metric_runs_fund_run_inputs_unique/);
  });
});
