import { execFile } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { RAILWAY_GRAPHQL_URL } from '../../../scripts/release/railway-graphql-transport.mjs';
import {
  DEFAULT_DEPLOYMENT_TIMEOUT_MS,
  deployRailwayWorkers,
  fetchLiveMainSha,
  parseDeployArgs,
} from '../../../scripts/release/deploy-railway-workers.mjs';

const execFileAsync = promisify(execFile);
const CLI_PATH = fileURLToPath(new URL('../../../scripts/release/deploy-railway-workers.mjs', import.meta.url));
const SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);
const TOKEN = 'real-railway-project-token';

function environment(overrides = {}) {
  return {
    RAILWAY_PROJECT_ID: 'project-1',
    RAILWAY_ENVIRONMENT_ID: 'environment-1',
    RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID: 'service-fund',
    RAILWAY_CAPITAL_CALL_STATUS_SERVICE_ID: 'service-capital',
    RAILWAY_TOKEN: TOKEN,
    ...overrides,
  };
}

function scopeResponse(env) {
  return {
    data: {
      projectToken: {
        project: { id: env.RAILWAY_PROJECT_ID },
        environment: { id: env.RAILWAY_ENVIRONMENT_ID },
      },
    },
  };
}

function topologyResponse(env, nodes = [
  {
    serviceName: 'fund-scenario-calc',
    serviceId: env.RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID,
  },
  {
    serviceName: 'capital-call-status',
    serviceId: env.RAILWAY_CAPITAL_CALL_STATUS_SERVICE_ID,
  },
]) {
  return {
    data: {
      environment: {
        serviceInstances: {
          edges: nodes.map((node) => ({ node })),
          pageInfo: { hasNextPage: false },
        },
      },
    },
  };
}

function autoDeployResponse(enabled = false) {
  return {
    data: {
      serviceInstanceAutoDeployStatus: {
        enabled,
        canEnable: true,
        reason: null,
      },
    },
  };
}

function serviceIdForDeployment(id) {
  return id.includes('capital') ? 'service-capital' : 'service-fund';
}

function deploymentResponse({
  id,
  status = 'SUCCESS',
  commitHash = SHA,
  canRollback = false,
  canRedeploy = false,
  serviceId = serviceIdForDeployment(id),
  environmentId = 'environment-1',
  deploymentStopped = false,
} = {}) {
  return {
    data: {
      deployment: {
        id,
        status,
        meta: { commitHash },
        canRollback,
        canRedeploy,
        serviceId,
        environmentId,
        deploymentStopped,
      },
    },
  };
}

function requestKind(query) {
  if (query.includes('projectToken')) return 'scope';
  if (query.includes('serviceInstanceAutoDeployStatus')) return 'autodeploy';
  if (query.includes('serviceInstances')) return 'topology';
  if (query.includes('serviceInstanceDeployV2')) return 'deploy';
  if (query.includes('deploymentRollback')) return 'rollback';
  if (query.includes('deploymentRedeploy')) return 'redeploy';
  if (query.includes('deployments(')) return 'deployments';
  if (query.includes('deployment(id:')) return 'deployment';
  return 'unknown';
}

function makeTransport(env, expectedSha = SHA, handlers = {}) {
  const calls = [];
  const transport = vi.fn(async (request) => {
    calls.push(request);
    const kind = requestKind(request.query);
    const handler = handlers[kind];
    if (handler !== undefined) {
      return typeof handler === 'function' ? handler(request, calls) : handler;
    }
    if (kind === 'scope') return scopeResponse(env);
    if (kind === 'topology') return topologyResponse(env);
    if (kind === 'autodeploy') return autoDeployResponse();
    if (kind === 'deployments') return { data: { deployments: { edges: [] } } };
    if (kind === 'deploy') {
      return { data: { serviceInstanceDeployV2: `new-${request.variables.serviceId}` } };
    }
    if (kind === 'deployment') {
      return deploymentResponse({
        id: request.variables.id,
        commitHash: expectedSha,
        environmentId: env.RAILWAY_ENVIRONMENT_ID,
      });
    }
    if (kind === 'rollback') return { data: { deploymentRollback: true } };
    if (kind === 'redeploy') {
      return {
        data: {
          deploymentRedeploy: {
            id: `recovery-${request.variables.id}`,
            status: 'SUCCESS',
            meta: { commitHash: expectedSha },
          },
        },
      };
    }
    throw new Error(`unhandled request ${request.operation}`);
  });
  return { transport, calls };
}

function deployOptions(env, transport, overrides = {}) {
  return {
    expectedSha: SHA,
    environment: env,
    transport,
    fetchLiveMainSha: vi.fn().mockResolvedValue(SHA),
    timeoutMs: 100,
    intervalMs: 10,
    now: () => 0,
    sleep: vi.fn(async () => {}),
    ...overrides,
  };
}

function serviceCalls(calls, kind) {
  return calls.filter((call) => requestKind(call.query) === kind);
}

describe('deploy-railway-workers', () => {
  it('reads live main SHA through the injected exec transport', async () => {
    const execFileImpl = vi.fn().mockResolvedValue({
      stdout: `${SHA}\trefs/heads/main\n`,
    });

    await expect(fetchLiveMainSha({ execFileImpl })).resolves.toBe(SHA);
    expect(execFileImpl).toHaveBeenCalledWith(
      'git',
      ['ls-remote', 'origin', 'refs/heads/main'],
      { encoding: 'utf8' }
    );
  });

  it('parses expected SHA and dry-run arguments', () => {
    expect(parseDeployArgs(['--dry-run', '--expected-sha', SHA])).toEqual({
      expectedSha: SHA,
      dryRun: true,
    });
    expect(() => parseDeployArgs(['--expected-sha', 'bad'])).toThrow(/40-character SHA/);
  });

  it.each([
    ['missing token', { RAILWAY_TOKEN: undefined }],
    ['stale run attempt', { GITHUB_RUN_ATTEMPT: '2' }],
    ['blank project ID', { RAILWAY_PROJECT_ID: ' ' }],
  ])('blocks %s before transport', async (_label, overrides) => {
    const env = environment(overrides);
    const { transport } = makeTransport(env);
    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'INVALID_ENVIRONMENT' },
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('runs dry-run with no credential or network and validates request shape', async () => {
    const env = environment();
    const requests = [];
    const globalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('network must not be used')
    );
    const fetchImpl = vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, options, body });
      const kind = requestKind(body.query);
      let payload;
      if (kind === 'scope') payload = scopeResponse(env);
      else if (kind === 'topology') payload = topologyResponse(env);
      else if (kind === 'autodeploy') payload = autoDeployResponse();
      else if (kind === 'deployments') payload = { data: { deployments: { edges: [] } } };
      if (kind === 'deploy') {
        payload = { data: { serviceInstanceDeployV2: `dry-${body.variables.serviceId}` } };
      }
      if (kind === 'deployment') {
        payload = deploymentResponse({ id: body.variables.id });
      }
      if (payload === undefined) throw new Error(`unhandled request ${kind}`);
      return { ok: true, json: async () => payload };
    });

    try {
      const result = await deployRailwayWorkers({
        expectedSha: SHA,
        environment: env,
        dryRun: true,
        fetchImpl,
        timeoutMs: 100,
        intervalMs: 10,
      });
      expect(result, JSON.stringify(result)).toMatchObject({
        overall: 'OK',
        dryRun: true,
        mainReferenceChecks: [
          { serviceName: 'fund-scenario-calc', status: 'SKIPPED' },
          { serviceName: 'capital-call-status', status: 'SKIPPED' },
        ],
        services: [
          { serviceName: 'fund-scenario-calc', deploymentId: 'dry-service-fund', status: 'DRY_RUN', reused: false },
          { serviceName: 'capital-call-status', deploymentId: 'dry-service-capital', status: 'DRY_RUN', reused: false },
        ],
      });
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    } finally {
      globalFetch.mockRestore();
    }

    expect(globalFetch).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalled();
    for (const request of requests) {
      expect(request.url).toBe(RAILWAY_GRAPHQL_URL);
      expect(request.options.method).toBe('POST');
      expect(request.options.headers).toEqual({
        'Content-Type': 'application/json',
        'Project-Access-Token': 'dry-run-token',
      });
      expect(request.body).toHaveProperty('query');
      expect(request.body).toHaveProperty('variables');
    }
    const deployRequest = requests.find(({ body }) => requestKind(body.query) === 'deploy');
    expect(deployRequest.body.variables).toEqual({
      serviceId: 'service-fund',
      environmentId: 'environment-1',
      commitSha: SHA,
    });
    const reuseRequest = requests.find(({ body }) => requestKind(body.query) === 'deployments');
    expect(reuseRequest.body.variables).toEqual({
      input: {
        projectId: 'project-1',
        serviceId: 'service-fund',
        environmentId: 'environment-1',
        status: { successfulOnly: true },
      },
    });
    const deploymentRequest = requests.find(({ body }) => requestKind(body.query) === 'deployment');
    expect(deploymentRequest.body.query).toContain('serviceId');
    expect(deploymentRequest.body.query).toContain('environmentId');
    expect(deploymentRequest.body.query).toContain('deploymentStopped');
  });

  it.each([
    ['wrong service identity', { serviceId: 'wrong-service' }, 'DEPLOYMENT_IDENTITY_MISMATCH'],
    ['wrong environment identity', { environmentId: 'wrong-environment' }, 'DEPLOYMENT_IDENTITY_MISMATCH'],
    ['stopped success deployment', { deploymentStopped: true }, 'DEPLOYMENT_STOPPED'],
  ])('fails closed on %s', async (_label, deploymentOverrides, code) => {
    const env = environment();
    const { transport } = makeTransport(env, SHA, {
      deployment: (request) => deploymentResponse({
        id: request.variables.id,
        ...deploymentOverrides,
      }),
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({ overall: 'BLOCKED', error: { code } });
  });

  it('fails closed for wrong scope, topology, GraphQL errors, and enabled autodeploy', async () => {
    const cases = [
      {
        name: 'wrong scope',
        handlers: {
          scope: {
            data: {
              projectToken: {
                project: { id: 'wrong-project' },
                environment: { id: 'environment-1' },
              },
            },
          },
        },
        code: 'SCOPE_MISMATCH',
      },
      {
        name: 'wrong topology',
        handlers: {
          topology: () => topologyResponse(environment(), [
            { serviceName: 'fund-scenario-calc', serviceId: 'wrong-service' },
          ]),
        },
        code: 'TOPOLOGY_MISMATCH',
      },
      {
        name: 'GraphQL errors',
        handlers: { scope: { errors: [{ message: 'scope denied' }] } },
        code: 'GRAPHQL_ERROR',
      },
      {
        name: 'enabled autodeploy',
        handlers: { autodeploy: autoDeployResponse(true) },
        code: 'AUTODEPLOY_ENABLED',
      },
    ];

    for (const testCase of cases) {
      const env = environment();
      const { transport } = makeTransport(env, SHA, testCase.handlers);
      const result = await deployRailwayWorkers(deployOptions(env, transport));
      expect(result, testCase.name).toMatchObject({
        overall: 'BLOCKED',
        error: { code: testCase.code },
      });
      expect(serviceCalls(transport.mock.calls.map(([request]) => request), 'deploy')).toHaveLength(0);
    }

    const extraTopology = environment();
    const { transport: extraTopologyTransport } = makeTransport(extraTopology, SHA, {
      topology: () => topologyResponse(extraTopology, [
        {
          serviceName: 'fund-scenario-calc',
          serviceId: extraTopology.RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID,
        },
        {
          serviceName: 'capital-call-status',
          serviceId: extraTopology.RAILWAY_CAPITAL_CALL_STATUS_SERVICE_ID,
        },
        { serviceName: 'unrelated-service', serviceId: 'service-unrelated' },
      ]),
    });
    // Extra non-worker services (e.g. Redis) are tolerated, matching the
    // production verifyRailwayTopology semantics: each protected worker must
    // resolve exactly once and cross-map correctly; unrelated services do not
    // block the release.
    const extraTopologyResult = await deployRailwayWorkers(
      deployOptions(extraTopology, extraTopologyTransport)
    );
    expect(extraTopologyResult).toMatchObject({ overall: 'OK' });

    const duplicateTopology = environment();
    const { transport: duplicateTopologyTransport } = makeTransport(duplicateTopology, SHA, {
      topology: () => topologyResponse(duplicateTopology, [
        {
          serviceName: 'fund-scenario-calc',
          serviceId: duplicateTopology.RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID,
        },
        {
          serviceName: 'fund-scenario-calc',
          serviceId: 'service-duplicate',
        },
        {
          serviceName: 'capital-call-status',
          serviceId: duplicateTopology.RAILWAY_CAPITAL_CALL_STATUS_SERVICE_ID,
        },
      ]),
    });
    const duplicateTopologyResult = await deployRailwayWorkers(
      deployOptions(duplicateTopology, duplicateTopologyTransport)
    );
    expect(duplicateTopologyResult).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'TOPOLOGY_MISMATCH' },
    });
    expect(serviceCalls(duplicateTopologyTransport.mock.calls.map(([request]) => request), 'deploy'))
      .toHaveLength(0);
  });

  it('reuses exact-SHA successful deployments without mutation', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => ({
        data: {
          deployments: {
            edges: [{
              node: {
                id: `reuse-${request.variables.input.serviceId}`,
                status: 'SUCCESS',
                meta: { commitHash: SHA },
                canRollback: false,
                canRedeploy: false,
              },
            }],
          },
        },
      }),
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'OK',
      services: [
        { deploymentId: 'reuse-service-fund', status: 'SUCCESS', reused: true },
        { deploymentId: 'reuse-service-capital', status: 'SUCCESS', reused: true },
      ],
    });
    expect(serviceCalls(calls, 'deploy')).toHaveLength(0);
  });

  it.each([
    ['status', { status: 'DEPLOYING' }],
    ['commit SHA', { commitHash: OLD_SHA }],
    ['stopped state', { deploymentStopped: true }],
  ])('does not reuse an exact-SHA list candidate when its %s readback is invalid', async (_label, deploymentOverrides) => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => ({
        data: {
          deployments: {
            edges: [{ node: {
              id: `reuse-${request.variables.input.serviceId}`,
              status: 'SUCCESS',
              meta: { commitHash: SHA },
            } }],
          },
        },
      }),
      deployment: (request) => request.variables.id.startsWith('reuse-')
        ? deploymentResponse({
            id: request.variables.id,
            ...deploymentOverrides,
          })
        : deploymentResponse({ id: request.variables.id }),
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({ overall: 'OK' });
    expect(result.services.every((service) => service.reused === false)).toBe(true);
    expect(serviceCalls(calls, 'deploy').map((call) => call.variables.serviceId)).toEqual([
      'service-fund',
      'service-capital',
    ]);
  });

 it('fails closed when exact-SHA reuse readback targets the wrong service', async () => {
 const env = environment();
 const { transport, calls } = makeTransport(env, SHA, {
 deployments: (request) => ({
 data: {
 deployments: {
 edges: [{
 node: {
 id: `reuse-${request.variables.input.serviceId}`,
 status: 'SUCCESS',
 meta: { commitHash: SHA },
 },
 }],
 },
 },
 }),
 deployment: (request) => deploymentResponse({
 id: request.variables.id,
 serviceId: 'wrong-service',
 }),
 });

 const result = await deployRailwayWorkers(deployOptions(env, transport));

 expect(result).toMatchObject({
 overall: 'BLOCKED',
 error: { code: 'DEPLOYMENT_IDENTITY_MISMATCH' },
 });
 expect(serviceCalls(calls, 'deploy')).toHaveLength(0);
 });

 it('fails closed when exact-SHA reuse readback errors', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => ({
        data: {
          deployments: {
            edges: [{ node: {
              id: `reuse-${request.variables.input.serviceId}`,
              status: 'SUCCESS',
              meta: { commitHash: SHA },
            } }],
          },
        },
      }),
      deployment: () => ({ errors: [{ message: 'reuse readback unavailable' }] }),
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'GRAPHQL_ERROR' },
    });
    expect(serviceCalls(calls, 'deploy')).toHaveLength(0);
  });

  it.each([
    ['transport error', () => { throw new Error('connection lost after mutation'); }],
    ['GraphQL error', () => ({ errors: [{ message: 'resolver failed after mutation' }] })],
    ['missing deployment ID', () => ({ data: { serviceInstanceDeployV2: null } })],
  ])('reconciles %s and reports unconfirmed deployment handles', async (_label, deployFailure) => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deploy: deployFailure,
      deployments: (request) => request.operation.includes('reconcile deploy')
        ? {
            data: {
              deployments: {
                edges: [{
                  node: {
                    id: 'unconfirmed-fund',
                    status: 'DEPLOYING',
                    meta: { commitHash: SHA },
                  },
                }],
              },
            },
          }
        : { data: { deployments: { edges: [] } } },
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({ overall: 'BLOCKED' });
    expect(result.deploymentHandles).toContainEqual({
      serviceName: 'fund-scenario-calc',
      role: 'unconfirmed',
      deploymentId: 'unconfirmed-fund',
    });
    const reconciliation = serviceCalls(calls, 'deployments').find((call) =>
      call.operation.includes('reconcile deploy')
    );
    expect(reconciliation.query).not.toContain('successfulOnly');
    expect(reconciliation.query).toContain('first: 5');
    expect(reconciliation.variables).toEqual({
      input: {
        projectId: env.RAILWAY_PROJECT_ID,
        serviceId: env.RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID,
        environmentId: env.RAILWAY_ENVIRONMENT_ID,
      },
    });
  });

  it('deploys services serially with a re-fence before service B', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env);
    const fetchLiveMainSha = vi.fn().mockResolvedValue(SHA);
    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { fetchLiveMainSha })
    );
    const deployCalls = serviceCalls(calls, 'deploy');
    const firstDeploymentWait = calls.findIndex(
      (call) => requestKind(call.query) === 'deployment' && call.variables.id === 'new-service-fund'
    );
    const secondServiceScope = calls.findIndex(
      (call, index) => index > firstDeploymentWait && requestKind(call.query) === 'scope'
    );

    expect(result.overall).toBe('OK');
    expect(deployCalls.map((call) => call.variables.serviceId)).toEqual([
      'service-fund',
      'service-capital',
    ]);
    expect(secondServiceScope).toBeGreaterThan(firstDeploymentWait);
    expect(fetchLiveMainSha).toHaveBeenCalledTimes(2);
    expect(result.mainReferenceChecks).toEqual([
      { serviceName: 'fund-scenario-calc', status: 'PASSED', observedSha: SHA },
      { serviceName: 'capital-call-status', status: 'PASSED', observedSha: SHA },
    ]);
  });

  it('fails closed on main reference drift before any mutation', async () => {
    const env = environment();
    const { transport } = makeTransport(env);
    const fetchLiveMainSha = vi.fn().mockResolvedValue(OLD_SHA);
    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { fetchLiveMainSha })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'MAIN_REFENCE_MISMATCH' },
      mainReferenceChecks: [
        {
          serviceName: 'fund-scenario-calc',
          status: 'BLOCKED',
          observedSha: OLD_SHA,
        },
      ],
    });
    expect(serviceCalls(transport.mock.calls.map(([request]) => request), 'deploy'))
      .toHaveLength(0);
    expect(fetchLiveMainSha).toHaveBeenCalledTimes(1);
  });

  it('recovers service A when main drifts before service B', async () => {
    const env = environment();
    const fetchLiveMainSha = vi.fn()
      .mockResolvedValueOnce(SHA)
      .mockResolvedValueOnce(OLD_SHA);
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation.includes('rollback resolution')) {
          return {
            data: {
              deployments: {
                edges: [{
                  node: {
                    id: 'rollback-fund',
                    status: 'SUCCESS',
                    meta: { commitHash: OLD_SHA },
                  },
                }],
              },
            },
          };
        }
        return {
          data: {
            deployments: {
              edges: [{
                node: {
                  id: request.variables.input.serviceId === 'service-fund'
                    ? 'old-fund'
                    : 'old-capital',
                  status: 'SUCCESS',
                  meta: { commitHash: OLD_SHA },
                  canRollback: false,
                  canRedeploy: false,
                },
              }],
            },
          },
        };
      },
      deployment: (request) => request.variables.id === 'old-fund'
        ? deploymentResponse({ id: 'old-fund', commitHash: OLD_SHA, canRollback: true })
        : deploymentResponse({ id: request.variables.id, commitHash: SHA }),
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { fetchLiveMainSha })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'MAIN_REFENCE_MISMATCH' },
      recovery: {
        method: 'rollback',
        status: 'SUCCESS',
        priorDeploymentId: 'old-fund',
        recoveryDeploymentId: 'rollback-fund',
      },
      mainReferenceChecks: [
        { serviceName: 'fund-scenario-calc', status: 'PASSED', observedSha: SHA },
        { serviceName: 'capital-call-status', status: 'BLOCKED', observedSha: OLD_SHA },
      ],
    });
    expect(serviceCalls(calls, 'deploy').map((call) => call.variables.serviceId))
      .toEqual(['service-fund']);
    expect(serviceCalls(calls, 'rollback')).toHaveLength(1);
  });

  it.each([
    ['FAILED', 'DEPLOYMENT_FAILED'],
    ['SLEEPING', 'DEPLOYMENT_UNEXPECTED_STATUS'],
  ])('fails closed on %s deployment status', async (status, code) => {
    const env = environment();
    const { transport } = makeTransport(env, SHA, {
      deployment: (request) => deploymentResponse({ id: request.variables.id, status }),
    });
    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({ overall: 'BLOCKED', error: { code } });
  });

  it('times out inside its own bounded deployment wait loop', async () => {
    const env = environment();
    const { transport } = makeTransport(env, SHA, {
      deployment: (request) => deploymentResponse({ id: request.variables.id, status: 'BUILDING' }),
    });
    let current = 0;
    const result = await deployRailwayWorkers(deployOptions(env, transport, {
      timeoutMs: 25,
      now: () => current,
      sleep: vi.fn(async (milliseconds) => {
        current += milliseconds;
      }),
    }));

    expect(result).toMatchObject({ overall: 'BLOCKED', error: { code: 'DEPLOYMENT_TIMEOUT' } });
    expect(DEFAULT_DEPLOYMENT_TIMEOUT_MS).toBeGreaterThan(25);
  });

  it('recovers service A through rollback Boolean re-resolution after service B fails', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        const serviceId = request.variables.input.serviceId;
        if (request.operation.includes('rollback resolution')) {
          return {
            data: {
              deployments: {
                edges: [{ node: { id: 'rollback-fund', status: 'SUCCESS', meta: { commitHash: OLD_SHA } } }],
              },
            },
          };
        }
        return {
          data: {
            deployments: {
              edges: [{
                node: {
                  id: serviceId === 'service-fund' ? 'old-fund' : 'old-capital',
                  status: 'SUCCESS',
                  meta: { commitHash: OLD_SHA },
                  canRollback: false,
                  canRedeploy: false,
                },
              }],
            },
          },
        };
      },
      deploy: (request) => request.variables.serviceId === 'service-capital'
        ? { errors: [{ message: 'service B rejected' }] }
        : { data: { serviceInstanceDeployV2: 'new-fund' } },
      deployment: (request) => request.variables.id === 'old-fund'
        ? deploymentResponse({ id: 'old-fund', commitHash: OLD_SHA, canRollback: true })
        : deploymentResponse({ id: request.variables.id, commitHash: SHA }),
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'GRAPHQL_ERROR' },
      recovery: {
        method: 'rollback',
        status: 'SUCCESS',
        priorDeploymentId: 'old-fund',
        recoveryDeploymentId: 'rollback-fund',
      },
    });
    expect(result.deploymentHandles).toEqual(expect.arrayContaining([
      { serviceName: 'fund-scenario-calc', role: 'prior', deploymentId: 'old-fund' },
      { serviceName: 'fund-scenario-calc', role: 'new', deploymentId: 'new-fund' },
      { serviceName: 'fund-scenario-calc', role: 'recovery', deploymentId: 'rollback-fund' },
    ]));
    expect(serviceCalls(calls, 'rollback')).toHaveLength(1);
    expect(serviceCalls(calls, 'redeploy')).toHaveLength(0);
  });

  it('falls back to redeploy and waits for the recovered deployment', async () => {
    const env = environment();
    const { transport } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation.includes('rollback resolution')) {
          throw new Error('rollback resolution must not run');
        }
        return {
          data: {
            deployments: {
              edges: [{ node: {
                id: request.variables.input.serviceId === 'service-fund' ? 'old-fund' : 'old-capital',
                status: 'SUCCESS',
                meta: { commitHash: OLD_SHA },
                canRollback: false,
                canRedeploy: false,
              } }],
            },
          },
        };
      },
      deploy: (request) => request.variables.serviceId === 'service-capital'
        ? { errors: [{ message: 'service B rejected' }] }
        : { data: { serviceInstanceDeployV2: 'new-fund' } },
      deployment: (request) => request.variables.id === 'old-fund'
        ? deploymentResponse({ id: 'old-fund', commitHash: OLD_SHA, canRedeploy: true })
        : request.variables.id === 'recovery-old-fund'
          ? deploymentResponse({ id: 'recovery-old-fund', commitHash: OLD_SHA })
          : deploymentResponse({ id: request.variables.id, commitHash: SHA }),
      redeploy: {
        data: {
          deploymentRedeploy: {
            id: 'recovery-old-fund',
            status: 'DEPLOYING',
            meta: { commitHash: OLD_SHA },
          },
        },
      },
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      recovery: { method: 'redeploy', status: 'SUCCESS', recoveryDeploymentId: 'recovery-old-fund' },
    });
  });

  it('reports BLOCKED with all known handles when recovery has no capability', async () => {
    const env = environment();
    const { transport } = makeTransport(env, SHA, {
      deployments: (request) => ({
        data: {
          deployments: {
            edges: [{ node: {
              id: request.variables.input.serviceId === 'service-fund' ? 'old-fund' : 'old-capital',
              status: 'SUCCESS',
              meta: { commitHash: OLD_SHA },
              canRollback: false,
              canRedeploy: false,
            } }],
          },
        },
      }),
      deploy: (request) => request.variables.serviceId === 'service-capital'
        ? { errors: [{ message: 'service B rejected' }] }
        : { data: { serviceInstanceDeployV2: 'new-fund' } },
      deployment: (request) => request.variables.id === 'old-fund'
        ? deploymentResponse({ id: 'old-fund', commitHash: OLD_SHA })
        : deploymentResponse({ id: request.variables.id, commitHash: SHA }),
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'RECOVERY_BLOCKED' },
      recovery: { status: 'BLOCKED', priorDeploymentId: 'old-fund', attemptedDeploymentId: 'new-fund' },
    });
    expect(result.deploymentHandles).toEqual(expect.arrayContaining([
      { serviceName: 'fund-scenario-calc', role: 'prior', deploymentId: 'old-fund' },
      { serviceName: 'fund-scenario-calc', role: 'new', deploymentId: 'new-fund' },
    ]));
  });

  it('emits machine-readable dry-run JSON without requiring a token', async () => {
    const childEnvironment = {
      ...environment(),
      RAILWAY_TOKEN: undefined,
    };
    delete childEnvironment.RAILWAY_TOKEN;
    const { stdout } = await execFileAsync(
      process.execPath,
      [CLI_PATH, '--dry-run', '--expected-sha', SHA],
      { env: childEnvironment }
    );
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({ overall: 'OK', dryRun: true });
    expect(stdout).not.toContain(TOKEN);
  });
});
