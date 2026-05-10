/**
 * Schema/migration checks for Phase 1c import idempotency indexes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('LP reporting import source_hash unique indexes', () => {
  it('adds partial unique indexes in the Phase 1c migration', () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        'server',
        'migrations',
        '20260509_lp_reporting_import_source_hash_unique_v1.up.sql'
      ),
      'utf8'
    );

    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_events_fund_source_hash_unique/i
    );
    expect(migration).toMatch(/ON cash_flow_events\(fund_id, source_hash\)/i);
    expect(migration).toMatch(/WHERE source_hash IS NOT NULL/i);
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS valuation_marks_fund_source_hash_unique/i
    );
    expect(migration).toMatch(/ON valuation_marks\(fund_id, source_hash\)/i);
  });

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
  it('adds the metric-run commit identity unique index in the migration', () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        'server',
        'migrations',
        '20260509_lp_reporting_metric_run_idempotency_v1.up.sql'
      ),
      'utf8'
    );

    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS lp_metric_runs_fund_run_inputs_unique/i
    );
    expect(migration).toMatch(
      /ON lp_metric_runs\(fund_id, run_type, perspective, as_of_date, inputs_hash\)/i
    );
  });

  it('keeps Drizzle schema aligned with the metric-run unique index name', () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), 'shared', 'schema', 'lp-reporting-evidence.ts'),
      'utf8'
    );

    expect(schema).toMatch(/uniqueIndex\('lp_metric_runs_fund_run_inputs_unique'\)/);
  });
});
