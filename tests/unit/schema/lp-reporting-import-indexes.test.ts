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
