import { describe, expect, it } from 'vitest';

import { Decimal } from '@shared/lib/decimal-config';
import { LpMetricRunResultsSchema } from '@shared/contracts/lp-reporting';
import { computeMetrics } from '../../../../server/services/lp-reporting/metrics-engine';

import { loadGoldenMetricFixtures } from './_loader';

function expectDecimalWithin(
  actual: string | null,
  expected: string | null,
  tolerance: string,
  label: string
) {
  expect(actual, `${label} should not be null`).not.toBeNull();
  expect(expected, `${label} expected should not be null`).not.toBeNull();

  const delta = new Decimal(actual as string).minus(expected as string).abs();
  expect(
    delta.lte(new Decimal(tolerance)),
    `${label} delta ${delta.toString()} exceeded tolerance ${tolerance}`
  ).toBe(true);
}

describe('golden LP metrics parity', () => {
  for (const fx of loadGoldenMetricFixtures()) {
    it(`${fx.scenario_id}: current engine output matches locked contract decimals`, () => {
      const out = computeMetrics(fx.input);
      const expected = fx.expected.engine_decimal_strings;

      expect(out.results.contributionsTotal).toBe(expected.contributionsTotal);
      expect(out.results.distributionsTotal).toBe(expected.distributionsTotal);
      expect(out.results.currentNav).toBe(expected.currentNav);

      expect(out.results.dpi).toBe(expected.dpi);
      expect(out.results.rvpi).toBe(expected.rvpi);
      expect(out.results.tvpi).toBe(expected.tvpi);
      expect(out.results.netIrr).toBe(expected.netIrr);
      expect(out.results.grossIrr).toBe(expected.grossIrr);

      expect(LpMetricRunResultsSchema.safeParse(out.results).success).toBe(true);
    });

    it(`${fx.scenario_id}: engine remains within documented current contract tolerance`, () => {
      const out = computeMetrics(fx.input);
      const tol = fx.expected.tolerances.current_engine_metric;

      expectDecimalWithin(out.results.dpi, fx.expected.dpi, tol, 'DPI');
      expectDecimalWithin(out.results.rvpi, fx.expected.rvpi, tol, 'RVPI');
      expectDecimalWithin(out.results.tvpi, fx.expected.tvpi, tol, 'TVPI');
      expectDecimalWithin(out.results.netIrr, fx.expected.irr, tol, 'net IRR');
    });

    it(`${fx.scenario_id}: LP proceeds equals distributions + NAV`, () => {
      const out = computeMetrics(fx.input);
      const lpProceeds = new Decimal(out.results.distributionsTotal).plus(out.results.currentNav);
      const delta = lpProceeds.minus(fx.expected.lp_proceeds_usd).abs();

      expect(
        delta.lte(new Decimal(fx.expected.tolerances.money)),
        `LP proceeds delta ${delta.toString()} exceeded money tolerance`
      ).toBe(true);
    });
  }
});
