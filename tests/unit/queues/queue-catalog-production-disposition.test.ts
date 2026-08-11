import { describe, expect, it } from 'vitest';
import { QUEUE_CATALOG } from '../../../server/queues/registry.js';

describe('QUEUE_CATALOG production dispositions', () => {
  it('locks every discovered queue to its reviewed deployment disposition', () => {
    expect(
      Object.fromEntries(QUEUE_CATALOG.map((entry) => [entry.key, entry.productionDisposition]))
    ).toEqual({
      simulation: { mode: 'local-only' },
      report: { mode: 'local-only' },
      backtesting: { mode: 'local-only' },
      'reserve-calc': { mode: 'inline-fallback' },
      'fund-scenario-calc': {
        mode: 'railway-worker',
        deployment: 'railway-worker-fund-scenario-calc',
      },
      'pacing-calc': { mode: 'inline-fallback' },
      'cohort-calc': { mode: 'local-only' },
      'capital-call-status': {
        mode: 'railway-worker',
        deployment: 'railway-worker-capital-call-status',
      },
      'economics-calc': { mode: 'quarantined' },
      'scenario-generation': { mode: 'local-only' },
      'lp-view-refresh': { mode: 'quarantined' },
    });
  });
});
