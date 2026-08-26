import { describe, expect, it } from 'vitest';

import { Decimal } from '@shared/lib/decimal-config';
import { computeMetrics } from '../../../../server/services/lp-reporting/metrics-engine';

import { loadGoldenMetricFixtures } from './_loader';

function expectInvariant(delta: Decimal, tolerance: string, label: string) {
  expect(delta.abs().lte(new Decimal(tolerance)), `${label} delta=${delta.toString()}`).toBe(true);
}

describe('fund math invariants', () => {
  for (const fx of loadGoldenMetricFixtures()) {
    it(`${fx.scenario_id}: locked expected TVPI = DPI + RVPI at 1e-8`, () => {
      if (fx.expected.tvpi === null || fx.expected.dpi === null || fx.expected.rvpi === null) {
        return;
      }

      const lhs = new Decimal(fx.expected.tvpi);
      const rhs = new Decimal(fx.expected.dpi).plus(fx.expected.rvpi);
      expectInvariant(
        lhs.minus(rhs),
        fx.expected.tolerances.requested_metric,
        'fixture TVPI identity'
      );
    });

    it(`${fx.scenario_id}: engine TVPI = DPI + RVPI under current 6dp wire contract`, () => {
      const out = computeMetrics(fx.input);
      if (out.results.tvpi === null || out.results.dpi === null || out.results.rvpi === null) {
        return;
      }

      const lhs = new Decimal(out.results.tvpi);
      const rhs = new Decimal(out.results.dpi).plus(out.results.rvpi);
      expectInvariant(
        lhs.minus(rhs),
        fx.expected.tolerances.current_engine_metric,
        'engine TVPI identity'
      );
    });

    it(`${fx.scenario_id}: total_deployed + remaining_capital = investable_capital at 1e-8`, () => {
      const deployed = new Decimal(fx.derivedCapital.total_deployed_usd);
      const remaining = new Decimal(fx.derivedCapital.remaining_capital_usd);
      const investable = new Decimal(fx.derivedCapital.investable_capital_usd);

      expectInvariant(
        deployed.plus(remaining).minus(investable),
        fx.expected.tolerances.requested_metric,
        'capital conservation'
      );
    });

    it(`${fx.scenario_id}: TVPI >= DPI and NAV is non-negative`, () => {
      const out = computeMetrics(fx.input);
      if (out.results.tvpi !== null && out.results.dpi !== null) {
        expect(new Decimal(out.results.tvpi).gte(out.results.dpi)).toBe(true);
      }
      expect(new Decimal(out.results.currentNav).gte(0)).toBe(true);
    });
  }
});
