import { describe, expect, it } from 'vitest';
import { moicActionabilityBlocksTotal, register } from '../../../server/metrics';

describe('povc_fund_moic_actionability_blocks_total', () => {
  it('is registered with surface + blocker_code labels', async () => {
    moicActionabilityBlocksTotal.inc({
      surface: 'render_model',
      blocker_code: 'h9_not_actionable',
    });
    const metrics = await register.getMetricsAsJSON();
    const found = metrics.find((m) => m.name === 'povc_fund_moic_actionability_blocks_total');
    expect(found).toBeDefined();
    const sample = found?.values.find(
      (v) => v.labels.surface === 'render_model' && v.labels.blocker_code === 'h9_not_actionable'
    );
    expect(sample?.value).toBeGreaterThanOrEqual(1);
  });
});
