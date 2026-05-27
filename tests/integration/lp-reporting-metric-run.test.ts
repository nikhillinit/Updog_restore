/**
 * @quarantine flaky-env
 * @owner lp-reporting
 * @reason Default test runs do not provide the isolated PostgreSQL database and LP foundation tables required for metric-run round-trip persistence.
 * @until 2026-08-25
 * @exitCriteria Add a dedicated LP reporting integration profile with TEST_DATABASE_URL and foundation migration setup, then pass this file 5 consecutive times under that profile.
 * @addedDate 2026-05-27
 *
 * @group integration
 *
 * Phase 1.4 round-trip integration test for the LP Reporting metrics engine.
 *
 * Mirrors the dual-mode pattern from
 * tests/integration/lp-reporting-foundation-migration.test.ts:
 *   - TEST_DATABASE_URL set (cloud DB; e.g. Neon)  -> run
 *   - otherwise                                     -> skip
 *
 * Five cases:
 *   1. computeMetrics returns DPI/RVPI/TVPI/MOIC for the truth-case fixture.
 *   2. xirrDiagnostic.net.convergence === 'converged' on well-conditioned input.
 *   3. inputsHash deterministic across consecutive computeMetrics() calls.
 *   4. Future-dated mark excluded from currentNav, surfaced in
 *      diagnostics.excludedFutureMarks.
 *   5. NO_SIGN_CHANGE failureReason on synthesized all-positive flows
 *      (uses xirrDiagnostic directly; does NOT touch the DB).
 *
 * NO mutation of pre-existing test-branch data. afterAll DELETEs only the
 * synthetic fund's rows (and the synthetic portfolio company).
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  computeMetrics,
  type ParsedCashFlowEvent,
  type ParsedValuationMark,
} from '../../server/services/lp-reporting/metrics-engine';
import { xirrDiagnostic } from '../../server/services/lp-reporting/xirr-diagnostic-service';
import type { CashFlow } from '@shared/lib/finance/xirr';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const skipTest = !TEST_DATABASE_URL;
const describeOrSkip = skipTest ? describe.skip : describe;

const FOUNDATION_UP_SQL_PATH = path.join(
  process.cwd(),
  'server',
  'migrations',
  '20260508_lp_reporting_foundation_v1.up.sql'
);

const SYNTHETIC_FUND_NAME = `phase1-metric-run-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

describeOrSkip('lp-reporting metric-run integration round-trip', () => {
  let pool: Pool;
  let fundId: number;
  let companyId: number;
  const markIds: number[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    // The Phase 0.2 migration round-trip test (foundation-migration.test.ts)
    // runs DROP SCHEMA + up.sql + down.sql against the same Neon test branch,
    // so by the time this test executes the foundation tables may or may not
    // exist.  Re-apply the up.sql idempotently (CREATE TABLE IF NOT EXISTS in
    // the migration handles re-runs safely against an already-provisioned
    // branch and re-creates everything against a freshly torn-down one).
    const upSql = fs.readFileSync(FOUNDATION_UP_SQL_PATH, 'utf8');
    await pool.query(upSql);

    // The prerequisite stubs (funds, portfoliocompanies) on the Neon test
    // branch were provisioned during Phase 0.2 with only (id, name) columns
    // -- not the full Drizzle schema.  Insert minimally.
    const fundResult = await pool.query<{ id: number }>(
      `INSERT INTO funds (name) VALUES ($1) RETURNING id`,
      [SYNTHETIC_FUND_NAME]
    );
    fundId = fundResult.rows[0]!.id;

    const companyResult = await pool.query<{ id: number }>(
      `INSERT INTO portfoliocompanies (name) VALUES ($1) RETURNING id`,
      [`${SYNTHETIC_FUND_NAME}-company`]
    );
    companyId = companyResult.rows[0]!.id;

    // 4 events: 3 capital calls (6M total) + 1 distribution (1.5M).
    const events = [
      { event_type: 'lp_capital_call', amount: '1000000.000000', event_date: '2024-01-01' },
      { event_type: 'lp_capital_call', amount: '2000000.000000', event_date: '2024-04-01' },
      { event_type: 'lp_capital_call', amount: '3000000.000000', event_date: '2024-07-01' },
      { event_type: 'lp_distribution', amount: '1500000.000000', event_date: '2024-12-15' },
    ];
    for (const e of events) {
      await pool.query(
        `INSERT INTO cash_flow_events
           (fund_id, event_type, amount, currency, event_date, perspective, status)
         VALUES ($1, $2, $3, 'USD', $4, 'lp_net', 'approved')`,
        [fundId, e.event_type, e.amount, e.event_date]
      );
    }

    // 2 valuation marks: 1 current (2024-09-30, high), 1 future-dated
    // (2025-06-30, low).  Future mark must be excluded from currentNav.
    const marks: Array<{
      fair_value: string;
      mark_date: string;
      as_of_date: string;
      confidence: 'high' | 'medium' | 'low';
    }> = [
      {
        fair_value: '5000000.000000',
        mark_date: '2024-09-30',
        as_of_date: '2024-09-30',
        confidence: 'high',
      },
      {
        fair_value: '7000000.000000',
        mark_date: '2025-06-30',
        as_of_date: '2025-06-30',
        confidence: 'low',
      },
    ];
    for (const m of marks) {
      const r = await pool.query<{ id: number }>(
        `INSERT INTO valuation_marks
           (fund_id, company_id, fair_value, currency, mark_date, as_of_date,
            mark_source, confidence_level, valuation_method, status)
         VALUES ($1, $2, $3, 'USD', $4, $5,
                 'financing_round', $6, 'comparable_companies', 'approved')
         RETURNING id`,
        [fundId, companyId, m.fair_value, m.mark_date, m.as_of_date, m.confidence]
      );
      markIds.push(r.rows[0]!.id);
    }
  }, 60_000);

  afterAll(async () => {
    if (!skipTest && pool) {
      try {
        if (fundId !== undefined) {
          // Delete leaf rows first so FK cascades can't surprise us.
          await pool.query('DELETE FROM cash_flow_events WHERE fund_id = $1', [fundId]);
          await pool.query('DELETE FROM valuation_marks WHERE fund_id = $1', [fundId]);
        }
        if (companyId !== undefined) {
          await pool.query('DELETE FROM portfoliocompanies WHERE id = $1', [companyId]);
        }
        if (fundId !== undefined) {
          await pool.query('DELETE FROM funds WHERE id = $1', [fundId]);
        }
      } finally {
        await pool.end();
      }
    }
  }, 30_000);

  /**
   * Load the synthetic fund's events + marks back from Postgres and shape
   * them into the engine's input contract.  Mirrors what the production
   * route handler will do once Phase 1.5 wires it up.
   */
  async function loadEngineInput(asOfDate: string, perspective: 'lp_net' | 'fund_gross') {
    const eventRows = await pool.query<{
      id: number;
      event_type: string;
      amount: string;
      event_date: Date;
      perspective: string;
      status: string;
    }>(
      `SELECT id, event_type, amount, event_date, perspective, status
         FROM cash_flow_events
        WHERE fund_id = $1
        ORDER BY id ASC`,
      [fundId]
    );

    const markRows = await pool.query<{
      id: number;
      fair_value: string;
      mark_date: string;
      as_of_date: string;
      status: string;
      confidence_level: string;
      company_id: number;
    }>(
      `SELECT id,
              fair_value,
              mark_date::text   AS mark_date,
              as_of_date::text  AS as_of_date,
              status,
              confidence_level,
              company_id
         FROM valuation_marks
        WHERE fund_id = $1
        ORDER BY id ASC`,
      [fundId]
    );

    const cashFlowEvents: ParsedCashFlowEvent[] = eventRows.rows.map((r) => ({
      id: r.id,
      eventType: r.event_type as ParsedCashFlowEvent['eventType'],
      amount: r.amount,
      eventDate: new Date(r.event_date).toISOString().slice(0, 10),
      perspective: r.perspective as ParsedCashFlowEvent['perspective'],
      status: r.status as ParsedCashFlowEvent['status'],
    }));

    const valuationMarks: ParsedValuationMark[] = markRows.rows.map((r) => ({
      id: r.id,
      fairValue: r.fair_value,
      markDate: r.mark_date,
      asOfDate: r.as_of_date,
      status: r.status as ParsedValuationMark['status'],
      confidenceLevel: r.confidence_level as ParsedValuationMark['confidenceLevel'],
      companyId: r.company_id,
    }));

    return { fundId, asOfDate, perspective, cashFlowEvents, valuationMarks } as const;
  }

  it('case 1: returns expected DPI/RVPI/TVPI/MOIC for the truth-case fixture', async () => {
    const input = await loadEngineInput('2024-12-31', 'lp_net');
    const { results } = computeMetrics(input);

    // contributions = 6M, distributions = 1.5M, currentNav = 5M.
    expect(results.contributionsTotal).toBe('6000000.000000');
    expect(results.distributionsTotal).toBe('1500000.000000');
    expect(results.currentNav).toBe('5000000.000000');

    // dpi = 1.5M / 6M = 0.25
    expect(results.dpi).toBe('0.250000');
    // rvpi = 5M / 6M = 0.833333... (Decimal toFixed(6) rounds half-up)
    expect(results.rvpi).toBe('0.833333');
    // tvpi = dpi + rvpi = 1.083333
    expect(results.tvpi).toBe('1.083333');
    // moic = (1.5M + 5M) / 6M = 1.083333
    expect(results.moic).toBe('1.083333');
  }, 30_000);

  it('case 2: xirrDiagnostic.net.convergence === converged', async () => {
    const input = await loadEngineInput('2024-12-31', 'lp_net');
    const { results } = computeMetrics(input);
    expect(results.xirrDiagnostic.net.convergence).toBe('converged');
    expect(results.xirrDiagnostic.net.failureReason).toBeNull();
    expect(results.netIrr).not.toBeNull();
  }, 30_000);

  it('case 3: inputsHash deterministic across consecutive calls', async () => {
    const input = await loadEngineInput('2024-12-31', 'lp_net');
    const a = computeMetrics(input);
    const b = computeMetrics(input);
    expect(a.inputsHash).toBe(b.inputsHash);
    expect(a.inputsHash).toMatch(/^[0-9a-f]{64}$/);
  }, 30_000);

  it('case 4: future-dated mark excluded from currentNav and surfaced in diagnostics', async () => {
    const input = await loadEngineInput('2024-12-31', 'lp_net');
    const { results, diagnostics } = computeMetrics(input);

    const currentMarkId = markIds[0]!;
    const futureMarkId = markIds[1]!;

    // Future mark is in excludedFutureMarks; the on-or-before mark is not.
    expect(diagnostics.excludedFutureMarks).toContain(futureMarkId);
    expect(diagnostics.excludedFutureMarks).not.toContain(currentMarkId);

    // Only the 2024-09-30 mark contributes to currentNav (5M, not 12M).
    expect(results.currentNav).toBe('5000000.000000');
    expect(results.markConfidenceMix.high).toBe(1);
    expect(results.markConfidenceMix.low).toBe(0);
    expect(results.markConfidenceMix.medium).toBe(0);
  }, 30_000);

  it('case 5: xirrDiagnostic surfaces NO_SIGN_CHANGE on all-positive synthesized flows', () => {
    // Pure-function exercise of xirrDiagnostic; no DB required but lives
    // here to keep all metric-run diagnostic cases co-located.
    const allPositiveFlows: CashFlow[] = [
      { date: new Date('2024-01-01'), amount: 100 },
      { date: new Date('2024-06-01'), amount: 200 },
      { date: new Date('2024-12-01'), amount: 300 },
    ];
    const out = xirrDiagnostic(allPositiveFlows);
    expect(out.diagnostic.failureReason).toBe('NO_SIGN_CHANGE');
    expect(out.diagnostic.convergence).toBe('failed');
    expect(out.irr).toBeNull();
  });
});
