/**
 * Contract tests for the Phase 1.1 metric-run results + diagnostics shapes.
 *
 * Asserts:
 *   - Round-trip parse for a canonical LpMetricRunResultsSchema body.
 *   - .strict() rejects unknown keys on every locked object schema.
 *   - Each XIRR enum accepts every documented value and rejects an unknown.
 *   - DecimalString accept/reject for the metric-run money fields.
 *   - Nullability on dpi/rvpi/tvpi/moic/netIrr/grossIrr (zero-contributions).
 *   - markConfidenceMix integer + non-negative constraints.
 *   - xirrDiagnostic requires both `net` and `gross`.
 *   - Diagnostics defaults: excludedFutureMarks and warnings default to [].
 *   - LpMetricRunCreateSchema now validates resultsJson + diagnosticsJson.
 *
 * All imports come from the lp-reporting barrel per task constraint.
 */
import { describe, expect, it } from 'vitest';

import {
  LpMetricRunCreateSchema,
  LpMetricRunDiagnosticsSchema,
  LpMetricRunResultsSchema,
  MarkConfidenceMixSchema,
  XirrBoundHitSchema,
  XirrConvergenceSchema,
  XirrDiagnosticSchema,
  XirrFailureReasonSchema,
  XirrMethodSchema,
  type LpMetricRunDiagnostics,
  type LpMetricRunResults,
  type XirrDiagnostic,
} from '@shared/contracts/lp-reporting';

const happyDiagnostic: XirrDiagnostic = {
  convergence: 'converged',
  iterations: 12,
  method: 'newton',
  boundHit: null,
  failureReason: null,
};

const happyResults: LpMetricRunResults = {
  asOfDate: '2026-03-31',
  currency: 'USD',
  dpi: '0.500000',
  rvpi: '1.250000',
  tvpi: '1.750000',
  moic: '1.750000',
  netIrr: '0.148700',
  grossIrr: '0.182300',
  xirrDiagnostic: {
    net: happyDiagnostic,
    gross: happyDiagnostic,
  },
  contributionsTotal: '10000000.000000',
  distributionsTotal: '5000000.000000',
  currentNav: '12500000.000000',
  markConfidenceMix: { high: 5, medium: 2, low: 1 },
};

const happyDiagnostics: LpMetricRunDiagnostics = {
  engineVersion: 'lp-reporting-engine@1.1.0',
  decimalPrecision: 6,
  excludedFutureMarks: [],
  warnings: [],
};

describe('LpMetricRunResultsSchema -- canonical round-trip', () => {
  it('parses a fully populated happy-path object', () => {
    const parsed = LpMetricRunResultsSchema.parse(happyResults);
    expect(parsed.asOfDate).toBe('2026-03-31');
    expect(parsed.currency).toBe('USD');
    expect(parsed.xirrDiagnostic.net.convergence).toBe('converged');
    expect(parsed.markConfidenceMix.high).toBe(5);
  });

  it('currency defaults to "USD" when omitted', () => {
    const { currency: _omit, ...rest } = happyResults;
    const parsed = LpMetricRunResultsSchema.parse(rest);
    expect(parsed.currency).toBe('USD');
  });
});

describe('.strict() rejects unknown keys', () => {
  it('rejects unknown top-level key on LpMetricRunResultsSchema', () => {
    expect(() => LpMetricRunResultsSchema.parse({ ...happyResults, bogus: 'x' })).toThrow();
  });

  it('rejects unknown key on XirrDiagnosticSchema', () => {
    expect(() => XirrDiagnosticSchema.parse({ ...happyDiagnostic, extra: 1 })).toThrow();
  });

  it('rejects unknown key on MarkConfidenceMixSchema', () => {
    expect(() =>
      MarkConfidenceMixSchema.parse({ high: 1, medium: 1, low: 1, very_high: 1 })
    ).toThrow();
  });

  it('rejects unknown key on LpMetricRunDiagnosticsSchema', () => {
    expect(() =>
      LpMetricRunDiagnosticsSchema.parse({ ...happyDiagnostics, bogus: true })
    ).toThrow();
  });
});

describe('XIRR enum coverage', () => {
  it.each(['converged', 'bounded_high', 'bounded_low', 'failed'])(
    'XirrConvergenceSchema accepts %s',
    (v) => {
      expect(() => XirrConvergenceSchema.parse(v)).not.toThrow();
    }
  );

  it('XirrConvergenceSchema rejects "partial"', () => {
    expect(() => XirrConvergenceSchema.parse('partial')).toThrow();
  });

  it.each(['newton', 'brent', 'bisection', 'none'])('XirrMethodSchema accepts %s', (v) => {
    expect(() => XirrMethodSchema.parse(v)).not.toThrow();
  });

  it('XirrMethodSchema rejects "secant"', () => {
    expect(() => XirrMethodSchema.parse('secant')).toThrow();
  });

  it.each(['min', 'max'])('XirrBoundHitSchema accepts %s', (v) => {
    expect(() => XirrBoundHitSchema.parse(v)).not.toThrow();
  });

  it('XirrBoundHitSchema (nullable on diagnostic) accepts null', () => {
    expect(() => XirrDiagnosticSchema.parse({ ...happyDiagnostic, boundHit: null })).not.toThrow();
  });

  it('XirrBoundHitSchema rejects "lower"', () => {
    expect(() => XirrBoundHitSchema.parse('lower')).toThrow();
  });

  it.each([
    'INSUFFICIENT_CASH_FLOWS',
    'NO_SIGN_CHANGE',
    'MULTIPLE_ROOTS',
    'OUT_OF_BOUNDS_HIGH',
    'OUT_OF_BOUNDS_LOW',
    'NUMERICAL_INSTABILITY',
  ])('XirrFailureReasonSchema accepts %s', (v) => {
    expect(() => XirrFailureReasonSchema.parse(v)).not.toThrow();
  });

  it('XirrFailureReasonSchema rejects "TIMEOUT"', () => {
    expect(() => XirrFailureReasonSchema.parse('TIMEOUT')).toThrow();
  });
});

describe('DecimalString constraints in LpMetricRunResultsSchema', () => {
  it.each(['1.234567', '0.000000', '-0.500000'])('accepts decimal string %s', (s) => {
    expect(() => LpMetricRunResultsSchema.parse({ ...happyResults, dpi: s })).not.toThrow();
  });

  it.each(['1.2.3', 'abc', '1.1234567'])('rejects decimal string %s', (s) => {
    expect(() => LpMetricRunResultsSchema.parse({ ...happyResults, dpi: s })).toThrow();
  });
});

describe('Ratio fields accept null (zero-contributions case)', () => {
  it.each(['dpi', 'rvpi', 'tvpi', 'moic', 'netIrr', 'grossIrr'] as const)(
    '%s accepts null',
    (field) => {
      const parsed = LpMetricRunResultsSchema.parse({
        ...happyResults,
        [field]: null,
      });
      expect(parsed[field]).toBeNull();
    }
  );
});

describe('MarkConfidenceMixSchema integer + non-negative', () => {
  it('rejects negative count', () => {
    expect(() => MarkConfidenceMixSchema.parse({ high: -1, medium: 0, low: 0 })).toThrow();
  });

  it('rejects non-integer count', () => {
    expect(() => MarkConfidenceMixSchema.parse({ high: 1.5, medium: 0, low: 0 })).toThrow();
  });

  it('accepts zeros across the board', () => {
    expect(() => MarkConfidenceMixSchema.parse({ high: 0, medium: 0, low: 0 })).not.toThrow();
  });
});

describe('xirrDiagnostic requires both net and gross', () => {
  it('rejects when net is missing', () => {
    const { xirrDiagnostic: _drop, ...rest } = happyResults;
    expect(() =>
      LpMetricRunResultsSchema.parse({
        ...rest,
        xirrDiagnostic: { gross: happyDiagnostic },
      })
    ).toThrow();
  });

  it('rejects when gross is missing', () => {
    const { xirrDiagnostic: _drop, ...rest } = happyResults;
    expect(() =>
      LpMetricRunResultsSchema.parse({
        ...rest,
        xirrDiagnostic: { net: happyDiagnostic },
      })
    ).toThrow();
  });
});

describe('LpMetricRunDiagnosticsSchema defaults', () => {
  it('excludedFutureMarks defaults to [] when omitted', () => {
    const parsed = LpMetricRunDiagnosticsSchema.parse({
      engineVersion: 'lp-reporting-engine@1.1.0',
      decimalPrecision: 6,
    });
    expect(parsed.excludedFutureMarks).toEqual([]);
  });

  it('warnings defaults to [] when omitted', () => {
    const parsed = LpMetricRunDiagnosticsSchema.parse({
      engineVersion: 'lp-reporting-engine@1.1.0',
      decimalPrecision: 6,
    });
    expect(parsed.warnings).toEqual([]);
  });

  it('rejects decimalPrecision <= 0', () => {
    expect(() =>
      LpMetricRunDiagnosticsSchema.parse({
        engineVersion: 'engine@1',
        decimalPrecision: 0,
      })
    ).toThrow();
  });
});

describe('LpMetricRunCreateSchema with locked resultsJson + diagnosticsJson', () => {
  const baseCreate = {
    fundId: 1,
    asOfDate: '2026-03-31',
    runType: 'quarterly_report' as const,
    perspective: 'lp_net' as const,
    inputsHash: 'abc123def456',
    methodologyVersion: 'v1.0.0',
    calculationVersion: 'v1.0.0',
    resultsJson: happyResults,
  };

  it('parses a full request body and resultsJson conforms to LpMetricRunResultsSchema', () => {
    const parsed = LpMetricRunCreateSchema.parse(baseCreate);
    expect(parsed.resultsJson.dpi).toBe('0.500000');
    expect(parsed.resultsJson.xirrDiagnostic.gross.method).toBe('newton');
  });

  it('rejects resultsJson when it does not conform (missing required field)', () => {
    const { contributionsTotal: _drop, ...badResults } = happyResults;
    expect(() =>
      LpMetricRunCreateSchema.parse({ ...baseCreate, resultsJson: badResults })
    ).toThrow();
  });

  it('rejects resultsJson with an unknown top-level key', () => {
    expect(() =>
      LpMetricRunCreateSchema.parse({
        ...baseCreate,
        resultsJson: { ...happyResults, bogus: 1 },
      })
    ).toThrow();
  });

  it('diagnosticsJson is optional (omitting it parses)', () => {
    const parsed = LpMetricRunCreateSchema.parse(baseCreate);
    expect(parsed.diagnosticsJson).toBeUndefined();
  });

  it('diagnosticsJson when provided must conform to LpMetricRunDiagnosticsSchema', () => {
    const parsed = LpMetricRunCreateSchema.parse({
      ...baseCreate,
      diagnosticsJson: happyDiagnostics,
    });
    expect(parsed.diagnosticsJson?.engineVersion).toBe('lp-reporting-engine@1.1.0');
  });

  it('rejects malformed diagnosticsJson', () => {
    expect(() =>
      LpMetricRunCreateSchema.parse({
        ...baseCreate,
        diagnosticsJson: { engineVersion: '', decimalPrecision: 6 },
      })
    ).toThrow();
  });
});
