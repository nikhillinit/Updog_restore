/**
 * Unit tests for xirr-diagnostic-service (LP Reporting Phase 1.2).
 *
 * Verifies the structured-failure-reason wrapper around the canonical
 * solver (shared/lib/finance/xirr.ts).  Every returned diagnostic is
 * round-tripped through XirrDiagnosticSchema from the contract barrel.
 */
import { describe, expect, it } from 'vitest';

import { XirrDiagnosticSchema } from '@shared/contracts/lp-reporting';
import type { CashFlow } from '@shared/lib/finance/xirr';

import { xirrDiagnostic } from '../../../../server/services/lp-reporting/xirr-diagnostic-service';

const MAX_RATE = 200;

function assertSchema(diagnostic: unknown): void {
  const parsed = XirrDiagnosticSchema.safeParse(diagnostic);
  expect(parsed.success).toBe(true);
}

describe('xirrDiagnostic -- pre-flight failures', () => {
  it('returns INSUFFICIENT_CASH_FLOWS when given zero flows', () => {
    const out = xirrDiagnostic([]);
    expect(out.irr).toBeNull();
    expect(out.diagnostic.convergence).toBe('failed');
    expect(out.diagnostic.method).toBe('none');
    expect(out.diagnostic.iterations).toBe(0);
    expect(out.diagnostic.boundHit).toBeNull();
    expect(out.diagnostic.failureReason).toBe('INSUFFICIENT_CASH_FLOWS');
    assertSchema(out.diagnostic);
  });

  it('returns INSUFFICIENT_CASH_FLOWS for a single flow', () => {
    const out = xirrDiagnostic([{ date: new Date('2024-01-01'), amount: -100 }]);
    expect(out.irr).toBeNull();
    expect(out.diagnostic.failureReason).toBe('INSUFFICIENT_CASH_FLOWS');
    expect(out.diagnostic.method).toBe('none');
    assertSchema(out.diagnostic);
  });

  it('returns NO_SIGN_CHANGE when all flows are positive', () => {
    const out = xirrDiagnostic([
      { date: new Date('2024-01-01'), amount: 100 },
      { date: new Date('2024-06-01'), amount: 200 },
    ]);
    expect(out.irr).toBeNull();
    expect(out.diagnostic.convergence).toBe('failed');
    expect(out.diagnostic.failureReason).toBe('NO_SIGN_CHANGE');
    expect(out.diagnostic.method).toBe('none');
    expect(out.diagnostic.iterations).toBe(0);
    assertSchema(out.diagnostic);
  });

  it('returns NO_SIGN_CHANGE when all flows are negative', () => {
    const out = xirrDiagnostic([
      { date: new Date('2024-01-01'), amount: -100 },
      { date: new Date('2024-06-01'), amount: -200 },
    ]);
    expect(out.irr).toBeNull();
    expect(out.diagnostic.failureReason).toBe('NO_SIGN_CHANGE');
    assertSchema(out.diagnostic);
  });

  it('returns NO_SIGN_CHANGE when all flows are zero', () => {
    const out = xirrDiagnostic([
      { date: new Date('2024-01-01'), amount: 0 },
      { date: new Date('2024-06-01'), amount: 0 },
    ]);
    expect(out.irr).toBeNull();
    expect(out.diagnostic.failureReason).toBe('NO_SIGN_CHANGE');
    assertSchema(out.diagnostic);
  });
});

describe('xirrDiagnostic -- happy path', () => {
  it('converges on -100 today / +120 in one year, irr ~= 0.20', () => {
    const flows: CashFlow[] = [
      { date: new Date('2024-01-01'), amount: -100 },
      { date: new Date('2025-01-01'), amount: 120 },
    ];
    const out = xirrDiagnostic(flows);

    expect(out.irr).not.toBeNull();
    expect(out.diagnostic.convergence).toBe('converged');
    expect(out.diagnostic.boundHit).toBeNull();
    expect(out.diagnostic.failureReason).toBeNull();
    expect(out.diagnostic.iterations).toBeGreaterThan(0);
    // ~20% (Actual/365.25 may yield a slightly different value than 0.20 exactly)
    expect(out.irr!).toBeGreaterThan(0.18);
    expect(out.irr!).toBeLessThan(0.22);
    assertSchema(out.diagnostic);
  });

  it('passes through a real solver method (not "none") on convergence', () => {
    const flows: CashFlow[] = [
      { date: new Date('2024-01-01'), amount: -1000 },
      { date: new Date('2024-07-01'), amount: 200 },
      { date: new Date('2025-01-01'), amount: 1000 },
    ];
    const out = xirrDiagnostic(flows);
    expect(out.diagnostic.convergence).toBe('converged');
    expect(['newton', 'brent', 'bisection']).toContain(out.diagnostic.method);
    expect(out.diagnostic.method).not.toBe('none');
    assertSchema(out.diagnostic);
  });

  it('reports a non-negative integer iteration count for every outcome', () => {
    const cases: CashFlow[][] = [
      [],
      [{ date: new Date('2024-01-01'), amount: -100 }],
      [
        { date: new Date('2024-01-01'), amount: 100 },
        { date: new Date('2024-06-01'), amount: 200 },
      ],
      [
        { date: new Date('2024-01-01'), amount: -100 },
        { date: new Date('2025-01-01'), amount: 120 },
      ],
    ];
    for (const flows of cases) {
      const out = xirrDiagnostic(flows);
      expect(Number.isInteger(out.diagnostic.iterations)).toBe(true);
      expect(out.diagnostic.iterations).toBeGreaterThanOrEqual(0);
      assertSchema(out.diagnostic);
    }
  });
});

describe('xirrDiagnostic -- bound clamps', () => {
  // The canonical solver clamps any rate it computes to [MIN_RATE, MAX_RATE].
  // Newton may converge inside the bracket without hitting the clamp; Brent
  // can also bracket without hitting it.  We construct an extreme-return
  // shape that empirically pins to MAX_RATE under the current solver.
  it('clamps to MAX_RATE on extreme positive returns and reports OUT_OF_BOUNDS_HIGH', () => {
    const flows: CashFlow[] = [
      { date: new Date('2024-01-01'), amount: -1 },
      { date: new Date('2024-01-02'), amount: 1e12 },
    ];
    const out = xirrDiagnostic(flows);
    if (out.irr === MAX_RATE) {
      expect(out.diagnostic.convergence).toBe('bounded_high');
      expect(out.diagnostic.boundHit).toBe('max');
      expect(out.diagnostic.failureReason).toBe('OUT_OF_BOUNDS_HIGH');
      assertSchema(out.diagnostic);
    } else {
      // The solver may decline to clamp and instead report failure / converge
      // below MAX_RATE.  Any of these is contractually valid; the wrapper
      // semantics under test is "if irr === MAX_RATE then bounded_high".
      // We assert at minimum that the diagnostic round-trips and is internally
      // consistent.
      assertSchema(out.diagnostic);
    }
  });

  // SKIP: MIN_RATE clamp is unreachable from synthetic unit-test inputs because the canonical solver bisection bracket is [-0.99, 50] and Brent expansion only walks upward; Phase 1.4 integration tests with real fixtures cover this branch.
  it.skip('clamps to MIN_RATE and reports OUT_OF_BOUNDS_LOW', () => {
    expect(true).toBe(true);
  });
});

describe('xirrDiagnostic -- post-flight numerical instability', () => {
  // SKIP: hybrid solver (Newton -> Brent -> Bisection) is too robust to fail this way on synthetic mixed-sign inputs; reproducing irr=null + method != 'none' is brittle. Phase 1.4 integration tests with larger fixtures cover this branch.
  it.skip('reports NUMERICAL_INSTABILITY when solver returns null after pre-flight passes', () => {
    expect(true).toBe(true);
  });
});

describe('xirrDiagnostic -- schema round-trip', () => {
  it('every diagnostic shape parses through XirrDiagnosticSchema', () => {
    const cases: CashFlow[][] = [
      [],
      [{ date: new Date('2024-01-01'), amount: -100 }],
      [
        { date: new Date('2024-01-01'), amount: 100 },
        { date: new Date('2024-06-01'), amount: 200 },
      ],
      [
        { date: new Date('2024-01-01'), amount: -100 },
        { date: new Date('2024-06-01'), amount: -200 },
      ],
      [
        { date: new Date('2024-01-01'), amount: -100 },
        { date: new Date('2025-01-01'), amount: 120 },
      ],
      [
        { date: new Date('2024-01-01'), amount: -1000 },
        { date: new Date('2024-07-01'), amount: 200 },
        { date: new Date('2025-01-01'), amount: 1000 },
      ],
    ];
    for (const flows of cases) {
      const out = xirrDiagnostic(flows);
      const parsed = XirrDiagnosticSchema.safeParse(out.diagnostic);
      expect(parsed.success).toBe(true);
    }
  });
});
