import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  RailwayWorkersWaitError,
  WAIT_EXIT_CODES,
  evaluateRailwayEvidence,
  parseWaitArgs,
  pollRailwayWorkers,
} from '../../../scripts/release/wait-railway-workers.mjs';

const SHA = 'a'.repeat(40);

function railwayEvidence({ commit = SHA, status = 'SUCCESS' } = {}) {
  const deployment = {
    id: `deployment-${commit}`,
    status,
    deploymentStopped: false,
    meta: { commitHash: commit },
    instances: [{ id: `instance-${commit}`, status: status === 'SUCCESS' ? 'RUNNING' : 'BUILDING' }],
  };
  return {
    projectId: 'project-1',
    environmentId: 'environment-1',
    services: ['fund-scenario-calc', 'capital-call-status'].map((serviceName) => ({
      serviceId: `${serviceName}-id`,
      serviceName,
      numReplicas: 1,
      domains: [],
      latestDeployment: { ...deployment },
      activeDeployments: [{ ...deployment }],
    })),
  };
}

function advancingClock() {
  let current = 0;
  return {
    now: () => current,
    sleep: vi.fn(async (milliseconds) => {
      current += milliseconds;
    }),
  };
}

describe('wait-railway-workers', () => {
  it('parses bounded defaults and explicit durations', () => {
    expect(parseWaitArgs(['--expected-sha', SHA])).toEqual({
      expectedSha: SHA,
      intervalMs: DEFAULT_INTERVAL_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    expect(parseWaitArgs([
      '--expected-sha', SHA,
      '--interval-ms', '25',
      '--timeout-ms', '100',
    ])).toEqual({ expectedSha: SHA, intervalMs: 25, timeoutMs: 100 });
    expect(() => parseWaitArgs(['--expected-sha', SHA, '--timeout-ms', '0'])).toThrow(
      /between 1 and/
    );
  });

  it('evaluates valid topology through the shared verifier', () => {
    expect(evaluateRailwayEvidence(railwayEvidence(), SHA)).toMatchObject({
      status: 'ready',
      skew: false,
      topology: { services: expect.any(Array) },
    });
  });

  it('waits for a matching topology without network calls', async () => {
    const clock = advancingClock();
    const fetchEvidence = vi
      .fn()
      .mockResolvedValueOnce(railwayEvidence({ status: 'BUILDING' }))
      .mockResolvedValueOnce(railwayEvidence());

    await expect(
      pollRailwayWorkers({
        expectedSha: SHA,
        fetchEvidence,
        intervalMs: 10,
        timeoutMs: 100,
        now: clock.now,
        sleep: clock.sleep,
      })
    ).resolves.toMatchObject({ status: 'ready', attempts: 2 });
    expect(fetchEvidence).toHaveBeenCalledTimes(2);
    expect(clock.sleep).toHaveBeenCalledWith(10);
  });

  it('classifies a successful different-commit deployment as skew at timeout', async () => {
    const clock = advancingClock();
    const fetchEvidence = vi.fn().mockResolvedValue(railwayEvidence({ commit: 'b'.repeat(40) }));

    await expect(
      pollRailwayWorkers({
        expectedSha: SHA,
        fetchEvidence,
        intervalMs: 10,
        timeoutMs: 25,
        now: clock.now,
        sleep: clock.sleep,
      })
    ).rejects.toMatchObject({
      name: 'RailwayWorkersWaitError',
      kind: 'skew',
      code: 'RAILWAY_WORKER_SKEW',
      exitCode: WAIT_EXIT_CODES.SKEW,
    });
  });

  it('classifies an otherwise-valid but incomplete deployment as timeout', async () => {
    const clock = advancingClock();
    const fetchEvidence = vi.fn().mockResolvedValue(railwayEvidence({ status: 'BUILDING' }));

    await expect(
      pollRailwayWorkers({
        expectedSha: SHA,
        fetchEvidence,
        intervalMs: 10,
        timeoutMs: 25,
        now: clock.now,
        sleep: clock.sleep,
      })
    ).rejects.toMatchObject({
      name: 'RailwayWorkersWaitError',
      kind: 'timeout',
      code: 'RAILWAY_WORKER_TIMEOUT',
      exitCode: WAIT_EXIT_CODES.TIMEOUT,
    });
  });

  it('keeps malformed or unavailable evidence in timeout classification', async () => {
    const clock = advancingClock();
    const fetchEvidence = vi.fn().mockRejectedValue(new Error('network unavailable'));

    await expect(
      pollRailwayWorkers({
        expectedSha: SHA,
        fetchEvidence,
        intervalMs: 10,
        timeoutMs: 10,
        now: clock.now,
        sleep: clock.sleep,
      })
    ).rejects.toBeInstanceOf(RailwayWorkersWaitError);
    expect(fetchEvidence).toHaveBeenCalledTimes(2);
  });
});
