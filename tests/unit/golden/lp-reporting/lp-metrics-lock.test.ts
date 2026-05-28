import { describe, expect, it } from 'vitest';

import { computeMetrics } from '../../../../server/services/lp-reporting/metrics-engine';

import { loadGoldenMetricFixtures } from './_loader';

describe('golden LP metrics lock metadata', () => {
  it('keeps each locked fixture input hash and diagnostics aligned with current inputs', () => {
    for (const fx of loadGoldenMetricFixtures()) {
      const out = computeMetrics(fx.input);

      expect(fx.lock, `${fx.scenario_id} should carry lock metadata`).toBeDefined();
      expect(fx.lock?.inputs_hash).toBe(out.inputsHash);
      expect(fx.lock?.diagnostics).toEqual(out.diagnostics);
    }
  });

  it('covers the current deterministic LP metric scenario classes with unique inputs', () => {
    const fixtures = loadGoldenMetricFixtures();

    expect(fixtures.map((fx) => fx.scenario_id).sort()).toEqual([
      'fund_all_realized',
      'fund_full_writeoff',
      'seed_fund_no_recycling',
      'seed_fund_with_follow_on_and_recycling',
    ]);
    expect(new Set(fixtures.map((fx) => fx.lock?.inputs_hash)).size).toBe(fixtures.length);
  });
});
