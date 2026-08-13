import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  RailwayWorkersWaitError,
  WAIT_EXIT_CODES,
  evaluateRailwayEvidence,
  fetchRailwayEvidence,
  parseWaitArgs,
  pollRailwayWorkers,
} from '../../../scripts/release/wait-railway-workers.mjs';

const SHA = 'a'.repeat(40);
const TOPOLOGY = {
  projectId: 'project-1',
  environmentId: 'environment-1',
  services: {
    'fund-scenario-calc': 'fund-scenario-calc-id',
    'capital-call-status': 'capital-call-status-id',
  },
};

const TOPOLOGY_ARGS = [
  '--expected-railway-project-id', TOPOLOGY.projectId,
  '--expected-railway-environment-id', TOPOLOGY.environmentId,
  '--expected-fund-scenario-service-id', TOPOLOGY.services['fund-scenario-calc'],
  '--expected-capital-call-service-id', TOPOLOGY.services['capital-call-status'],
];

function railwayEvidence({
  commit = SHA,
  status = 'SUCCESS',
  projectId = TOPOLOGY.projectId,
  environmentId = TOPOLOGY.environmentId,
  services,
} = {}) {
  const deployment = {
    id: `deployment-${commit}`,
    status,
    deploymentStopped: false,
    meta: { commitHash: commit },
    instances: [{ id: `instance-${commit}`, status: status === 'SUCCESS' ? 'RUNNING' : 'BUILDING' }],
  };
  return {
    projectId,
    environmentId,
    services: services ?? ['fund-scenario-calc', 'capital-call-status'].map((serviceName) => ({
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
    expect(parseWaitArgs(['--expected-sha', SHA, ...TOPOLOGY_ARGS])).toEqual({
      expectedSha: SHA,
      protectedTopology: TOPOLOGY,
      intervalMs: DEFAULT_INTERVAL_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    expect(parseWaitArgs([
      '--expected-sha', SHA,
      ...TOPOLOGY_ARGS,
      '--interval-ms', '25',
      '--timeout-ms', '100',
    ])).toEqual({ expectedSha: SHA, protectedTopology: TOPOLOGY, intervalMs: 25, timeoutMs: 100 });
    expect(() => parseWaitArgs(['--expected-sha', SHA, ...TOPOLOGY_ARGS, '--timeout-ms', '0'])).toThrow(
      /between 1 and/
    );
  });

  it('evaluates valid topology through the shared verifier', { retry: 0 }, () => {
    expect(evaluateRailwayEvidence(railwayEvidence(), SHA, TOPOLOGY)).toMatchObject({
      status: 'ready',
      skew: false,
      topology: { services: expect.any(Array) },
    });
  });

  it('waits for a matching topology without network calls', { retry: 0 }, async () => {
    const clock = advancingClock();
    const fetchEvidence = vi
      .fn()
      .mockResolvedValueOnce(railwayEvidence({ status: 'BUILDING' }))
      .mockResolvedValueOnce(railwayEvidence());

    await expect(
      pollRailwayWorkers({
        expectedSha: SHA,
        protectedTopology: TOPOLOGY,
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

  it('classifies a successful different-commit deployment as skew at timeout', { retry: 0 }, async () => {
    const clock = advancingClock();
    const fetchEvidence = vi.fn().mockResolvedValue(railwayEvidence({ commit: 'b'.repeat(40) }));

    await expect(
      pollRailwayWorkers({
        expectedSha: SHA,
        protectedTopology: TOPOLOGY,
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

  it('classifies an otherwise-valid but incomplete deployment as timeout', { retry: 0 }, async () => {
    const clock = advancingClock();
    const fetchEvidence = vi.fn().mockResolvedValue(railwayEvidence({ status: 'BUILDING' }));

    await expect(
      pollRailwayWorkers({
        expectedSha: SHA,
        protectedTopology: TOPOLOGY,
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

  it('keeps malformed or unavailable evidence in timeout classification', { retry: 0 }, async () => {
    const clock = advancingClock();
    const fetchEvidence = vi.fn().mockRejectedValue(new Error('network unavailable'));

    await expect(
      pollRailwayWorkers({
        expectedSha: SHA,
        protectedTopology: TOPOLOGY,
        fetchEvidence,
        intervalMs: 10,
        timeoutMs: 10,
        now: clock.now,
        sleep: clock.sleep,
      })
    ).rejects.toBeInstanceOf(RailwayWorkersWaitError);
    expect(fetchEvidence).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['right names and wrong IDs', railwayEvidence({
      services: ['fund-scenario-calc', 'capital-call-status'].map((serviceName) => ({
        ...railwayEvidence().services.find((service) => service.serviceName === serviceName),
        serviceId: `wrong-${serviceName}`,
      })),
    })],
    ['right IDs and wrong project', railwayEvidence({ projectId: 'wrong-project' })],
    ['duplicate protected name', railwayEvidence({
      services: [
        ...railwayEvidence().services,
        { ...railwayEvidence().services[0], serviceId: 'another-id' },
      ],
    })],
    ['duplicate protected ID', railwayEvidence({
      services: [
        ...railwayEvidence().services,
        { ...railwayEvidence().services[0], serviceName: 'unrelated-worker' },
      ],
    })],
    ['cross-mapped pairs', railwayEvidence({
      services: railwayEvidence().services.map((service) => ({
        ...service,
        serviceId: service.serviceName === 'fund-scenario-calc'
          ? TOPOLOGY.services['capital-call-status']
          : TOPOLOGY.services['fund-scenario-calc'],
      })),
    })],
  ])('does not converge for %s', { retry: 0 }, async (_label, evidence) => {
    const clock = advancingClock();
    await expect(pollRailwayWorkers({
      expectedSha: SHA,
      protectedTopology: TOPOLOGY,
      fetchEvidence: vi.fn().mockResolvedValue(evidence),
      intervalMs: 10,
      timeoutMs: 25,
      now: clock.now,
      sleep: clock.sleep,
    })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('converges with exact protected pairs plus unrelated service', { retry: 0 }, async () => {
    const clock = advancingClock();
    const evidence = railwayEvidence({
      services: [
        ...railwayEvidence().services,
        { serviceName: 'unrelated-api', serviceId: 'unrelated-id', domains: [] },
      ],
    });
    await expect(pollRailwayWorkers({
      expectedSha: SHA,
      protectedTopology: TOPOLOGY,
      fetchEvidence: vi.fn().mockResolvedValue(evidence),
      intervalMs: 10,
      timeoutMs: 25,
      now: clock.now,
      sleep: clock.sleep,
    })).resolves.toMatchObject({ status: 'ready' });
  });

  it('fetches Railway scope and topology without exposing token or raw GraphQL output', { retry: 0 }, async () => {
    const token = 'RAILWAY_TOKEN-secret-value';
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { projectToken: { project: { id: 'project-1' }, environment: { id: 'environment-1' } } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            environment: { serviceInstances: { edges: [], pageInfo: { hasNextPage: false } } },
            rawGraphqlSentinel: 'raw-graphql-sentinel-value',
          },
        }),
      });
    const evidence = await fetchRailwayEvidence({ token, fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers['Project-Access-Token']).toBe(token);
    expect(fetchImpl.mock.calls[1][1].body).toContain('projectId');
    expect(JSON.stringify(evidence)).not.toContain(token);
    expect(JSON.stringify(evidence)).not.toContain('raw-graphql-sentinel-value');
  });
});
