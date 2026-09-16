/**
 * Unit tests for metrics-engine (LP Reporting Phase 1.2).
 *
 * Truth-case fixture validation, edge cases (zero contributions,
 * future-only marks), and schema round-trips through the locked
 * Phase 1.1 contracts.
 */
import { describe, expect, it } from 'vitest';

import {
  LpMetricRunDiagnosticsSchema,
  LpMetricRunResultsSchema,
} from '@shared/contracts/lp-reporting';

import {
  computeInputsHash,
  computeMetrics,
  type ComputeMetricsInput,
  type ParsedCashFlowEvent,
} from '../../../../server/services/lp-reporting/metrics-engine';

// ---------------------------------------------------------------------------
// TRUTH CASE
// ---------------------------------------------------------------------------

const truthCase: ComputeMetricsInput = {
  fundId: 1,
  asOfDate: '2024-12-31',
  perspective: 'lp_net',
  cashFlowEvents: [
    {
      id: 1,
      eventType: 'lp_capital_call',
      amount: '1000000.000000',
      eventDate: '2024-01-01',
      perspective: 'lp_net',
      status: 'approved',
    },
    {
      id: 2,
      eventType: 'lp_capital_call',
      amount: '2000000.000000',
      eventDate: '2024-04-01',
      perspective: 'lp_net',
      status: 'approved',
    },
    {
      id: 3,
      eventType: 'lp_capital_call',
      amount: '3000000.000000',
      eventDate: '2024-07-01',
      perspective: 'lp_net',
      status: 'approved',
    },
    {
      id: 4,
      eventType: 'lp_distribution',
      amount: '1500000.000000',
      eventDate: '2024-12-15',
      perspective: 'lp_net',
      status: 'approved',
    },
  ],
  valuationMarks: [
    {
      id: 10,
      fairValue: '5000000.000000',
      markDate: '2024-09-30',
      asOfDate: '2024-09-30',
      status: 'approved',
      confidenceLevel: 'high',
    },
    {
      id: 11,
      fairValue: '7000000.000000',
      markDate: '2025-06-30',
      asOfDate: '2025-06-30',
      status: 'approved',
      confidenceLevel: 'low',
    },
  ],
};

describe('computeMetrics -- truth case fixture', () => {
  const out = computeMetrics(truthCase);

  it('contributions / distributions / NAV totals match the fixture', () => {
    expect(out.results.contributionsTotal).toBe('6000000.000000');
    expect(out.results.distributionsTotal).toBe('1500000.000000');
    expect(out.results.currentNav).toBe('5000000.000000');
  });

  it('DPI = 0.25 (exact at 6dp)', () => {
    expect(out.results.dpi).toBe('0.250000');
  });

  it('RVPI = 5/6 rounded to 6dp', () => {
    expect(out.results.rvpi).toBe('0.833333');
  });

  it('TVPI = DPI + RVPI', () => {
    expect(out.results.tvpi).toBe('1.083333');
  });

  it('MOIC = (distributions + NAV) / contributions', () => {
    expect(out.results.moic).toBe('1.083333');
  });

  it('excludedFutureMarks contains the future-dated mark id and only that id', () => {
    expect(out.diagnostics.excludedFutureMarks).toContain(11);
    expect(out.diagnostics.excludedFutureMarks).not.toContain(10);
    expect(out.diagnostics.excludedFutureMarks).toEqual([11]);
  });

  it('markConfidenceMix counts only the live (non-future) marks', () => {
    expect(out.results.markConfidenceMix).toEqual({ high: 1, medium: 0, low: 0 });
  });

  it('xirrDiagnostic.net converges with a real solver method', () => {
    expect(out.results.xirrDiagnostic.net.convergence).toBe('converged');
    expect(['newton', 'brent', 'bisection']).toContain(out.results.xirrDiagnostic.net.method);
    expect(out.results.xirrDiagnostic.net.failureReason).toBeNull();
    expect(out.results.xirrDiagnostic.net.boundHit).toBeNull();
  });

  it('xirrDiagnostic.gross is populated (the contract requires both diagnostics)', () => {
    // For this fixture there are no portfolio_investment / realized_proceeds
    // events, so gross flows are identical to net flows and gross also
    // converges.
    expect(out.results.xirrDiagnostic.gross.convergence).toBe('converged');
    expect(['newton', 'brent', 'bisection']).toContain(out.results.xirrDiagnostic.gross.method);
  });

  it('netIrr is a non-null decimal string', () => {
    expect(out.results.netIrr).not.toBeNull();
    expect(out.results.netIrr).toMatch(/^-?\d+(\.\d{1,6})?$/);
  });

  it('grossIrr is a non-null decimal string', () => {
    expect(out.results.grossIrr).not.toBeNull();
    expect(out.results.grossIrr).toMatch(/^-?\d+(\.\d{1,6})?$/);
  });

  it('inputsHash matches sha256-hex format', () => {
    expect(out.inputsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('inputsHash is deterministic across consecutive calls', () => {
    const a = computeMetrics(truthCase).inputsHash;
    const b = computeMetrics(truthCase).inputsHash;
    expect(a).toBe(b);
  });

  it('inputsHash is namespaced by the engine version', () => {
    // The commit service's idempotent lookup keys on inputsHash, so a version
    // bump must produce a new hash or stale runs would be replayed.
    const current = computeMetrics(truthCase);
    expect(computeInputsHash(truthCase, current.diagnostics.engineVersion)).toBe(
      current.inputsHash
    );
    expect(computeInputsHash(truthCase, '0.0.0')).not.toBe(current.inputsHash);
  });

  it('engine version + decimal precision are pinned for downstream auditing', () => {
    expect(out.diagnostics.engineVersion).toBe('1.1.0');
    expect(out.diagnostics.decimalPrecision).toBe(6);
  });

  it('warnings is empty for the truth case', () => {
    expect(out.diagnostics.warnings).toEqual([]);
  });

  it('results round-trip through LpMetricRunResultsSchema', () => {
    const parsed = LpMetricRunResultsSchema.safeParse(out.results);
    expect(parsed.success).toBe(true);
  });

  it('diagnostics round-trip through LpMetricRunDiagnosticsSchema', () => {
    const parsed = LpMetricRunDiagnosticsSchema.safeParse(out.diagnostics);
    expect(parsed.success).toBe(true);
  });

  it('asOfDate is normalized to a calendar day', () => {
    expect(out.results.asOfDate).toBe('2024-12-31');
  });

  it('currency is the USD literal', () => {
    expect(out.results.currency).toBe('USD');
  });
});

// ---------------------------------------------------------------------------
// ZERO-CONTRIBUTIONS
// ---------------------------------------------------------------------------

describe('computeMetrics -- zero contributions', () => {
  it('returns null DPI/RVPI/TVPI/MOIC and pushes ZERO_CONTRIBUTIONS warning when no events', () => {
    const out = computeMetrics({
      fundId: 1,
      asOfDate: '2024-12-31',
      perspective: 'lp_net',
      cashFlowEvents: [],
      valuationMarks: [],
    });

    expect(out.results.dpi).toBeNull();
    expect(out.results.rvpi).toBeNull();
    expect(out.results.tvpi).toBeNull();
    expect(out.results.moic).toBeNull();
    expect(out.results.contributionsTotal).toBe('0.000000');
    expect(out.results.distributionsTotal).toBe('0.000000');
    expect(out.results.currentNav).toBe('0.000000');
    expect(out.diagnostics.warnings.some((w) => w.code === 'ZERO_CONTRIBUTIONS')).toBe(true);

    // Engine never throws, never NaN.
    const parsedResults = LpMetricRunResultsSchema.safeParse(out.results);
    expect(parsedResults.success).toBe(true);
  });

  it('returns null DPI/RVPI/TVPI/MOIC when capital calls and recallables cancel', () => {
    const out = computeMetrics({
      fundId: 1,
      asOfDate: '2024-12-31',
      perspective: 'lp_net',
      cashFlowEvents: [
        {
          id: 1,
          eventType: 'lp_capital_call',
          amount: '1000000.000000',
          eventDate: '2024-01-01',
          perspective: 'lp_net',
          status: 'approved',
        },
        {
          id: 2,
          eventType: 'recallable_distribution',
          amount: '1000000.000000',
          eventDate: '2024-06-01',
          perspective: 'lp_net',
          status: 'approved',
        },
      ],
      valuationMarks: [],
    });

    expect(out.results.contributionsTotal).toBe('0.000000');
    expect(out.results.dpi).toBeNull();
    expect(out.results.rvpi).toBeNull();
    expect(out.results.tvpi).toBeNull();
    expect(out.results.moic).toBeNull();
    expect(out.diagnostics.warnings.map((w) => w.code)).toContain('ZERO_CONTRIBUTIONS');
  });
});

// ---------------------------------------------------------------------------
// FUTURE-MARK-ONLY
// ---------------------------------------------------------------------------

describe('computeMetrics -- future-mark-only fixture', () => {
  it('excludes the future mark, leaves NAV at zero, and zeros out the confidence mix', () => {
    const out = computeMetrics({
      fundId: 1,
      asOfDate: '2024-12-31',
      perspective: 'lp_net',
      cashFlowEvents: [
        {
          id: 1,
          eventType: 'lp_capital_call',
          amount: '1000000.000000',
          eventDate: '2024-01-01',
          perspective: 'lp_net',
          status: 'approved',
        },
      ],
      valuationMarks: [
        {
          id: 99,
          fairValue: '5000000.000000',
          markDate: '2025-06-30',
          asOfDate: '2025-06-30',
          status: 'approved',
          confidenceLevel: 'high',
        },
      ],
    });

    expect(out.results.currentNav).toBe('0.000000');
    expect(out.diagnostics.excludedFutureMarks).toContain(99);
    expect(out.results.markConfidenceMix).toEqual({ high: 0, medium: 0, low: 0 });
  });
});

// ---------------------------------------------------------------------------
// NON-LIVE EVENTS (status gate)
// ---------------------------------------------------------------------------

describe('computeMetrics -- non-live events', () => {
  const baseline = computeMetrics(truthCase);

  function withEvents(extra: ParsedCashFlowEvent[]): ComputeMetricsInput {
    return { ...truthCase, cashFlowEvents: [...truthCase.cashFlowEvents, ...extra] };
  }

  it('excludes a draft capital call from contributions and both IRR flows, and discloses it', () => {
    const out = computeMetrics(
      withEvents([
        {
          id: 5,
          eventType: 'lp_capital_call',
          amount: '4000000.000000',
          eventDate: '2024-10-01',
          perspective: 'lp_net',
          status: 'draft',
        },
      ])
    );

    expect(out.results.contributionsTotal).toBe('6000000.000000');
    expect(out.results.dpi).toBe(baseline.results.dpi);
    expect(out.results.netIrr).toBe(baseline.results.netIrr);
    expect(out.results.grossIrr).toBe(baseline.results.grossIrr);
    expect(out.diagnostics.warnings).toEqual([
      {
        code: 'EXCLUDED_NON_LIVE_EVENTS',
        message:
          '1 cash flow events excluded because their status is not approved or locked: ids 5',
      },
    ]);
    expect(LpMetricRunDiagnosticsSchema.safeParse(out.diagnostics).success).toBe(true);
  });

  it('fails closed on a missing status and lists excluded ids sorted', () => {
    const out = computeMetrics(
      withEvents([
        {
          id: 9,
          eventType: 'lp_distribution',
          amount: '250000.000000',
          eventDate: '2024-11-01',
          perspective: 'lp_net',
          status: 'draft',
        },
        {
          id: 7,
          eventType: 'lp_capital_call',
          amount: '500000.000000',
          eventDate: '2024-11-01',
          perspective: 'lp_net',
        },
      ])
    );

    expect(out.results.contributionsTotal).toBe('6000000.000000');
    expect(out.results.distributionsTotal).toBe('1500000.000000');
    expect(out.diagnostics.warnings.map((w) => w.code)).toEqual(['EXCLUDED_NON_LIVE_EVENTS']);
    expect(out.diagnostics.warnings[0]?.message).toBe(
      '2 cash flow events excluded because their status is not approved or locked: ids 7, 9'
    );
  });

  it('counts locked events and excludes reversal rows without a status warning', () => {
    const out = computeMetrics(
      withEvents([
        {
          id: 6,
          eventType: 'lp_capital_call',
          amount: '1000000.000000',
          eventDate: '2024-10-01',
          perspective: 'lp_net',
          status: 'locked',
        },
        {
          id: 8,
          eventType: 'reversal',
          amount: '1000000.000000',
          eventDate: '2024-10-02',
          perspective: 'lp_net',
          status: 'approved',
        },
      ])
    );

    expect(out.results.contributionsTotal).toBe('7000000.000000');
    expect(out.diagnostics.warnings).toEqual([]);
  });

  it('excludes a reversed-status event by design without a warning', () => {
    const out = computeMetrics(
      withEvents([
        {
          id: 12,
          eventType: 'lp_capital_call',
          amount: '1000000.000000',
          eventDate: '2024-10-01',
          perspective: 'lp_net',
          status: 'reversed',
        },
      ])
    );

    expect(out.results.contributionsTotal).toBe('6000000.000000');
    expect(out.diagnostics.warnings).toEqual([]);
  });
});
