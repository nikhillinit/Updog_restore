import { describe, expect, it } from 'vitest';

import { buildSimulationRunConfigFromJobData } from '../../../server/queues/simulation-queue';

describe('buildSimulationRunConfigFromJobData', () => {
  it('propagates queued user id as Monte Carlo createdBy', () => {
    const config = buildSimulationRunConfigFromJobData(
      {
        fundId: 7,
        runs: 10_000,
        timeHorizonYears: 8,
        baselineId: '8f758532-a544-4a7e-b6c2-80fa30a6018b',
        portfolioSize: 24,
        userId: 42,
        requestId: 'sim-1',
      },
      1000
    );

    expect(config).toEqual({
      fundId: 7,
      runs: 1000,
      timeHorizonYears: 8,
      baselineId: '8f758532-a544-4a7e-b6c2-80fa30a6018b',
      portfolioSize: 24,
      createdBy: 42,
    });
  });

  it('omits createdBy when the queue job has no user id', () => {
    const config = buildSimulationRunConfigFromJobData(
      {
        fundId: 7,
        runs: 10_000,
        timeHorizonYears: 8,
      },
      1000
    );

    expect(config).not.toHaveProperty('createdBy');
  });
});
