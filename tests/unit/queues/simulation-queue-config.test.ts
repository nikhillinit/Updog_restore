import { describe, expect, it } from 'vitest';

import {
  assertSimulationJobContext,
  buildSimulationRunConfigFromJobData,
  canAccessSimulationJob,
  createSimulationJobId,
} from '../../../server/queues/simulation-queue';

const context = {
  userId: 'user-42',
  orgId: '',
  fundId: '7',
  email: 'user@example.com',
  role: 'partner',
};

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
        context,
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
        context,
      },
      1000
    );

    expect(config).not.toHaveProperty('createdBy');
  });

  it('rejects jobs whose fund does not match the carried tenant context', () => {
    expect(() =>
      assertSimulationJobContext({
        fundId: 7,
        runs: 1000,
        timeHorizonYears: 8,
        context: { ...context, fundId: '8' },
      })
    ).toThrow('Simulation job fund does not match tenant context');
  });

  it('allows only the same verified user and fund context', () => {
    const data = { fundId: 7, runs: 1000, timeHorizonYears: 8, context };

    expect(canAccessSimulationJob(data, context)).toBe(true);
    expect(canAccessSimulationJob(data, { ...context, userId: 'user-99' })).toBe(false);
    expect(canAccessSimulationJob(data, { ...context, fundId: '8' })).toBe(false);
    expect(canAccessSimulationJob({ ...data, context: undefined }, context)).toBe(false);
  });

  it('prevents repeated caller correlation ids from selecting or colliding job ids', () => {
    const requestId = 'caller-correlation';
    const first = { requestId, jobId: createSimulationJobId() };
    const second = { requestId, jobId: createSimulationJobId() };

    expect(first.jobId).toMatch(/^sim-[0-9a-f-]{36}$/);
    expect(second.jobId).not.toBe(first.jobId);
    expect(first.jobId).not.toContain(requestId);
  });
});
