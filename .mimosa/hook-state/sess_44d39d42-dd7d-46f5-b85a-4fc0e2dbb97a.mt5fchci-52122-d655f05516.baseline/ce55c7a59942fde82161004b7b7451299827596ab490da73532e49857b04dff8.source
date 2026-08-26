/**
 * Truth-Case Runner -- LP Reporting Metrics (NAV / capital-account aggregation).
 *
 * Independent, hand-derived expected values for computeMetrics().  Each
 * expected number is derived from the financial definitions in the convention
 * matrix (docs/parity/convention-matrix.md), NOT by running the engine, so
 * these cases are a genuine oracle rather than a regression snapshot.
 *
 * @see server/services/lp-reporting/metrics-engine.ts
 */
import { describe, it, expect } from 'vitest';

import {
  computeMetrics,
  type ComputeMetricsInput,
} from '../../../server/services/lp-reporting/metrics-engine';
import lpMetricsCases from '../../../docs/lp-metrics.truth-cases.json';

interface LpMetricsExpected {
  contributionsTotal: string;
  distributionsTotal: string;
  currentNav: string;
  dpi: string | null;
  rvpi: string | null;
  tvpi: string | null;
  moic: string | null;
  markConfidenceMix: { high: number; medium: number; low: number };
  excludedFutureMarks: number[];
  netIrrConverges: boolean;
  warningCodes: string[];
}

interface LpMetricsTruthCase {
  id: string;
  category: string;
  description: string;
  input: ComputeMetricsInput;
  expected: LpMetricsExpected;
  tags: string[];
}

const cases = lpMetricsCases as unknown as LpMetricsTruthCase[];

describe('Truth Cases: LP Metrics (NAV / capital account)', () => {
  cases.forEach((tc) => {
    it(`${tc.id}: ${tc.description}`, () => {
      const { results, diagnostics } = computeMetrics(tc.input);
      const e = tc.expected;

      expect(results.contributionsTotal).toBe(e.contributionsTotal);
      expect(results.distributionsTotal).toBe(e.distributionsTotal);
      expect(results.currentNav).toBe(e.currentNav);
      expect(results.dpi).toBe(e.dpi);
      expect(results.rvpi).toBe(e.rvpi);
      expect(results.tvpi).toBe(e.tvpi);
      expect(results.moic).toBe(e.moic);
      expect(results.markConfidenceMix).toEqual(e.markConfidenceMix);
      expect(diagnostics.excludedFutureMarks).toEqual(e.excludedFutureMarks);

      if (e.netIrrConverges) {
        expect(results.xirrDiagnostic.net.convergence).toBe('converged');
        expect(results.xirrDiagnostic.gross.convergence).toBe('converged');
      }

      const actualWarningCodes = diagnostics.warnings.map((w) => w.code);
      e.warningCodes.forEach((code) => expect(actualWarningCodes).toContain(code));
      if (e.warningCodes.length === 0) {
        expect(actualWarningCodes).not.toContain('ZERO_CONTRIBUTIONS');
      }
    });
  });

  it('LP metrics truth table summary', () => {
    expect(cases.length).toBeGreaterThanOrEqual(7);
    const tagSet = new Set(cases.flatMap((tc) => tc.tags));
    ['baseline', 'recallable', 'edge-case'].forEach((t) => expect(tagSet.has(t)).toBe(true));
  });
});
