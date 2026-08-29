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
  instances = [{ id: `instance-${id}`, status: 'RUNNING' }],
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
        instances,
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

function withDeploymentPageInfo(response) {
  const connection = response?.data?.deployments;
  if (!connection || connection.pageInfo) return response;
  return {
    ...response,
    data: {
      ...response.data,
      deployments: {
        ...connection,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

function makeTransport(env, expectedSha = SHA, handlers = {}) {
  const calls = [];
  const transport = vi.fn(async (request) => {
    calls.push(request);
    const kind = requestKind(request.query);
    const handler = handlers[kind];
    if (handler !== undefined) {
      const response = typeof handler === 'function' ? handler(request, calls) : handler;
      return kind === 'deployments' ? withDeploymentPageInfo(response) : response;
    }
    if (kind === 'scope') return scopeResponse(env);
    if (kind === 'topology') return topologyResponse(env);
    if (kind === 'autodeploy') return autoDeployResponse();
    if (kind === 'deployments') {
      return withDeploymentPageInfo({ data: { deployments: { edges: [] } } });
    }
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

function advancingClock() {
  let current = 0;
  return {
    now: () => current,
    sleep: vi.fn(async (milliseconds) => {
      current += milliseconds;
    }),
  };
}

function serviceCalls(calls, kind) {
  return calls.filter((call) => requestKind(call.query) === kind);
}

function deploymentListNode(
  id,
  { status = 'SUCCESS', commitHash = SHA, canRollback = false, canRedeploy = false } = {}
) {
  return {
    node: {
      id,
      status,
      meta: { commitHash },
      canRollback,
      canRedeploy,
    },
  };
}

function deploymentPage(nodes) {
  return {
    data: {
      deployments: {
        edges: nodes,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
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
      else if (kind === 'deployments') {
        payload = withDeploymentPageInfo({ data: { deployments: { edges: [] } } });
      }
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
    const inFlightRequest = requests.find(
      ({ body }) => requestKind(body.query) === 'deployments' &&
        body.variables.input.status === undefined
    );
    expect(inFlightRequest.body.variables).toEqual({
      input: {
        projectId: 'project-1',
        serviceId: 'service-fund',
        environmentId: 'environment-1',
      },
    });
    const reuseRequest = requests.find(
      ({ body }) => requestKind(body.query) === 'deployments' &&
        body.variables.input.status?.successfulOnly === true
    );
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
    expect(deploymentRequest.body.query).toContain('instances');
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
      status: 'SUCCESS',
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

  it('polls until a delayed exact-SHA deployment becomes visible', async () => {
    const env = environment();
    let discoveryAttempts = 0;
    const { transport } = makeTransport(env, SHA, {
      deploy: (request) => {
        if (request.variables.serviceId === 'service-fund') {
          throw new Error('connection lost after mutation');
        }
        return { data: { serviceInstanceDeployV2: 'new-capital' } };
      },
      deployments: (request) => {
        if (!request.operation.includes('reconcile deploy fund-scenario-calc')) {
          return { data: { deployments: { edges: [] } } };
        }
        discoveryAttempts += 1;
        return {
          data: {
            deployments: {
              edges:
                discoveryAttempts === 1
                  ? []
                  : [
                      {
                        node: {
                          id: 'delayed-fund',
                          status: 'DEPLOYING',
                          meta: { commitHash: SHA },
                        },
                      },
                    ],
            },
          },
        };
      },
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'OK',
      services: [{ deploymentId: 'delayed-fund', status: 'SUCCESS' }, { status: 'SUCCESS' }],
    });
    expect(discoveryAttempts).toBe(2);
  });

  it('exhausts paginated deployment discovery before deciding containment', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deploy: (request) => {
        if (request.variables.serviceId === 'service-fund') {
          throw new Error('connection lost after mutation');
        }
        return { data: { serviceInstanceDeployV2: 'new-capital' } };
      },
      deployments: (request) => {
        if (!request.operation.includes('reconcile deploy fund-scenario-calc')) {
          if (request.operation.includes('pre-mutation snapshot fund-scenario-calc')) {
            return {
              data: {
                deployments: {
                  edges: [
                    { node: { id: 'old-fund', status: 'SUCCESS', meta: { commitHash: OLD_SHA } } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            };
          }
          return { data: { deployments: { edges: [] } } };
        }
        if (!request.variables.after) {
          return {
            data: {
              deployments: {
                edges: [
                  { node: { id: 'old-fund', status: 'SUCCESS', meta: { commitHash: OLD_SHA } } },
                ],
                pageInfo: { hasNextPage: true, endCursor: 'page-1' },
              },
            },
          };
        }
        return {
          data: {
            deployments: {
              edges: [
                { node: { id: 'page-2-fund', status: 'DEPLOYING', meta: { commitHash: SHA } } },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      },
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));
    const discoveryCalls = serviceCalls(calls, 'deployments').filter((call) =>
      call.operation.includes('reconcile deploy fund-scenario-calc')
    );

    expect(result).toMatchObject({ overall: 'OK' });
    expect(discoveryCalls).toHaveLength(2);
    expect(discoveryCalls[0].query).toContain('pageInfo { hasNextPage endCursor }');
    expect(discoveryCalls[1].variables.after).toBe('page-1');
  });

  it('retains an observed novel deployment handle when later reconciliation pagination is malformed', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deploy: (request) => {
        if (request.variables.serviceId === 'service-fund') {
          throw new Error('connection lost after mutation');
        }
        return { data: { serviceInstanceDeployV2: 'new-capital' } };
      },
      deployments: (request) => {
        if (!request.operation.includes('reconcile deploy fund-scenario-calc')) {
          return deploymentPage([]);
        }
        if (!request.variables.after) {
          return {
            data: {
              deployments: {
                edges: [deploymentListNode('novel-fund', { status: 'DEPLOYING' })],
                pageInfo: { hasNextPage: true, endCursor: 'page-1' },
              },
            },
          };
        }
        return {
          data: {
            deployments: {
              edges: [],
              pageInfo: { hasNextPage: 'yes', endCursor: null },
            },
          },
        };
      },
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'INVALID_RESPONSE' },
      deploymentHandles: [
        expect.objectContaining({
          serviceName: 'fund-scenario-calc',
          role: 'unconfirmed',
          deploymentId: 'novel-fund',
          status: 'DEPLOYING',
        }),
      ],
    });
    expect(serviceCalls(calls, 'deploy')).toHaveLength(1);
  });

  it.each([
    [
      'malformed deployment pageInfo',
      { hasNextPage: 'yes', endCursor: null },
      /pageInfo is malformed/,
    ],
    [
      'missing deployment endCursor',
      { hasNextPage: true },
      /endCursor is missing/,
    ],
    [
      'repeated deployment cursor',
      { hasNextPage: true, endCursor: 'repeated-cursor' },
      /cursor repeated/,
    ],
  ])('fails closed on %s before provider mutation', async (_label, pageInfo, message) => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => request.operation.includes('in-flight')
        ? { data: { deployments: { edges: [], pageInfo } } }
        : deploymentPage([]),
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'INVALID_RESPONSE', message: expect.stringMatching(message) },
    });
    expect(serviceCalls(calls, 'deploy')).toHaveLength(0);
  });

  it('shares one reconciliation budget across every discovered handle', async () => {
    const env = environment();
    let currentTime = 0;
    const sleep = vi.fn(async (milliseconds) => {
      currentTime += milliseconds;
    });
    const { transport } = makeTransport(env, SHA, {
      deploy: () => {
        throw new Error('connection lost after mutation');
      },
      deployments: (request) =>
        request.operation.includes('reconcile deploy')
          ? {
              data: {
                deployments: {
                  edges: ['candidate-a'].map((id) => ({
                    node: { id, status: 'BUILDING', meta: { commitHash: SHA } },
                  })),
                },
              },
            }
          : { data: { deployments: { edges: [] } } },
      deployment: (request) => deploymentResponse({ id: request.variables.id, status: 'BUILDING' }),
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, {
        timeoutMs: 25,
        intervalMs: 10,
        now: () => currentTime,
        sleep,
      })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'RECONCILIATION_IDENTITY_UNRESOLVED' },
      reconciliation: { reconciliation: 'UNRESOLVED' },
    });
    expect(result.deploymentHandles).toEqual(
      expect.arrayContaining([
        {
          serviceName: 'fund-scenario-calc',
          role: 'unconfirmed',
          deploymentId: 'candidate-a',
          status: 'BUILDING',
        },
      ])
    );
    expect(sleep.mock.calls.reduce((total, [milliseconds]) => total + milliseconds, 0)).toBe(25);
  });

  it('withholds service A rollback while service B creation remains unresolved', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => ({
        data: {
          deployments: {
            edges: [
              {
                node: {
                  id:
                    request.variables.input.serviceId === 'service-fund'
                      ? 'old-fund'
                      : 'old-capital',
                  status: 'SUCCESS',
                  meta: { commitHash: OLD_SHA },
                  canRollback: true,
                },
              },
            ],
          },
        },
      }),
      deploy: (request) => {
        if (request.variables.serviceId === 'service-capital') {
          throw new Error('service B response lost');
        }
        return { data: { serviceInstanceDeployV2: 'new-fund' } };
      },
      deployment: (request) => deploymentResponse({ id: request.variables.id, commitHash: SHA }),
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, {
        timeoutMs: 25,
        intervalMs: 10,
      })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'RECONCILIATION_IDENTITY_UNRESOLVED' },
      reconciliation: { reconciliation: 'UNRESOLVED' },
      recovery: { status: 'BLOCKED', attemptedDeploymentId: 'new-fund' },
    });
    expect(serviceCalls(calls, 'rollback')).toHaveLength(0);
    expect(serviceCalls(calls, 'redeploy')).toHaveLength(0);
  });

  it('withholds service A rollback while service B is already in flight', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation === 'Railway in-flight fence capital-call-status') {
          return {
            data: {
              deployments: {
                edges: [{ node: { id: 'candidate-capital', status: 'DEPLOYING' } }],
              },
            },
          };
        }
        if (request.operation === 'Railway reuse fund-scenario-calc') {
          return {
            data: {
              deployments: {
                edges: [
                  {
                    node: {
                      id: 'old-fund',
                      status: 'SUCCESS',
                      meta: { commitHash: OLD_SHA },
                      canRollback: true,
                    },
                  },
                ],
              },
            },
          };
        }
        return { data: { deployments: { edges: [] } } };
      },
      deployment: (request) => deploymentResponse({ id: request.variables.id }),
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: {
        code: 'DEPLOYMENT_IN_FLIGHT',
        deploymentId: 'candidate-capital',
        deploymentStatus: 'DEPLOYING',
      },
      recovery: { status: 'BLOCKED', attemptedDeploymentId: 'new-service-fund' },
    });
    expect(serviceCalls(calls, 'deploy').map((call) => call.variables.serviceId)).toEqual([
      'service-fund',
    ]);
    expect(serviceCalls(calls, 'rollback')).toHaveLength(0);
    expect(serviceCalls(calls, 'redeploy')).toHaveLength(0);
  });

  it('carries one deployment deadline through ambiguous mutation reconciliation', async () => {
    const env = environment();
    let currentTime = 0;
    const { transport, calls } = makeTransport(env, SHA, {
      deploy: (request) => {
        if (request.variables.serviceId === 'service-fund') {
          currentTime = 40;
          throw new Error('connection lost after mutation');
        }
        return { data: { serviceInstanceDeployV2: 'new-capital' } };
      },
      deployments: (request) =>
        request.operation.includes('reconcile deploy fund-scenario-calc')
          ? {
              data: {
                deployments: {
                  edges: [
                    {
                      node: {
                        id: 'reconciled-fund',
                        status: 'DEPLOYING',
                        meta: { commitHash: SHA },
                      },
                    },
                  ],
                },
              },
            }
          : { data: { deployments: { edges: [] } } },
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, {
        now: () => currentTime,
      })
    );
    const fundMutation = serviceCalls(calls, 'deploy').find(
      (call) => call.variables.serviceId === 'service-fund'
    );
    const reconciliationCalls = calls.filter((call) =>
      call.operation.includes('reconcile deploy fund-scenario-calc')
    );

    expect(result).toMatchObject({ overall: 'OK' });
    expect(fundMutation.deadlineAt).toBe(100);
    expect(reconciliationCalls.length).toBeGreaterThan(1);
    expect(reconciliationCalls.every((call) => call.deadlineAt === fundMutation.deadlineAt)).toBe(
      true
    );
  });

  it('records reconciliation failure while preserving the original mutation error', async () => {
    const env = environment();
    const { transport } = makeTransport(env, SHA, {
      deploy: () => ({ errors: [{ message: 'mutation resolver failed' }] }),
      deployments: (request) => request.operation.includes('reconcile deploy')
        ? { errors: [{ message: 'reconciliation unavailable' }] }
        : { data: { deployments: { edges: [] } } },
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'GRAPHQL_ERROR' },
      reconciliation: {
        reconciliation: 'UNRESOLVED',
        error: { code: 'GRAPHQL_ERROR' },
      },
    });
  });

  it('preserves the causal candidate readback error during deploy reconciliation', async () => {
    const env = environment();
    const { transport } = makeTransport(env, SHA, {
      deploy: () => {
        throw new Error('connection lost after mutation');
      },
      deployments: (request) => request.operation.includes('reconcile deploy')
        ? deploymentPage([deploymentListNode('novel-fund', { commitHash: SHA })])
        : deploymentPage([]),
      deployment: (request) => request.variables.id === 'novel-fund'
        ? { errors: [{ message: 'candidate readback unavailable' }] }
        : deploymentResponse({ id: request.variables.id }),
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      reconciliation: {
        reconciliation: 'UNRESOLVED',
        error: {
          code: 'RECONCILIATION_IDENTITY_UNRESOLVED',
          deploymentId: 'novel-fund',
          reconciliationError: {
            code: 'GRAPHQL_ERROR',
            message: expect.stringContaining('candidate readback unavailable'),
          },
        },
      },
    });
  });

  it('fails closed on an in-flight deployment before mutation', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => request.operation.includes('in-flight')
        ? {
            data: {
              deployments: {
                edges: [{ node: { id: 'in-flight-fund', status: 'DEPLOYING' } }],
              },
            },
          }
        : { data: { deployments: { edges: [] } } },
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'DEPLOYMENT_IN_FLIGHT' },
    });
    expect(serviceCalls(calls, 'deploy')).toHaveLength(0);
  });

  it('waits for a running instance and fails distinctly when none becomes ready', async () => {
    const env = environment();
    const { transport } = makeTransport(env, SHA, {
      deployment: (request) => deploymentResponse({
        id: request.variables.id,
        instances: [],
      }),
    });
    let currentTime = 0;

    const result = await deployRailwayWorkers(deployOptions(env, transport, {
      timeoutMs: 25,
      now: () => currentTime,
      sleep: vi.fn(async (milliseconds) => {
        currentTime += milliseconds;
      }),
    }));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'DEPLOYMENT_INSTANCE_NOT_READY' },
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
        : request.variables.id === 'rollback-fund'
          ? deploymentResponse({ id: 'rollback-fund', commitHash: OLD_SHA })
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
        ? { data: { serviceInstanceDeployV2: 'new-capital' } }
        : { data: { serviceInstanceDeployV2: 'new-fund' } },
      deployment: (request) => request.variables.id === 'old-fund'
        ? deploymentResponse({ id: 'old-fund', commitHash: OLD_SHA, canRollback: true })
        : request.variables.id === 'rollback-fund'
          ? deploymentResponse({ id: 'rollback-fund', commitHash: OLD_SHA })
          : request.variables.id === 'new-capital'
            ? deploymentResponse({ id: 'new-capital', commitHash: SHA, status: 'FAILED', instances: [] })
            : deploymentResponse({ id: request.variables.id, commitHash: SHA }),
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport, {
      now: () => serviceCalls(calls, 'deployment')
        .some((call) => call.variables.id === 'new-capital') ? 50 : 0,
    }));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'DEPLOYMENT_FAILED' },
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
    const recoveryDeadlines = calls
      .filter((call) => /^Railway (recovery|rollback)/.test(call.operation))
      .map((call) => call.deadlineAt);
    expect(recoveryDeadlines.length).toBeGreaterThan(2);
    expect(new Set(recoveryDeadlines)).toEqual(new Set([100]));
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
        ? { data: { serviceInstanceDeployV2: 'new-capital' } }
        : { data: { serviceInstanceDeployV2: 'new-fund' } },
      deployment: (request) => request.variables.id === 'old-fund'
        ? deploymentResponse({ id: 'old-fund', commitHash: OLD_SHA, canRedeploy: true })
        : request.variables.id === 'recovery-old-fund'
          ? deploymentResponse({ id: 'recovery-old-fund', commitHash: OLD_SHA })
          : request.variables.id === 'new-capital'
            ? deploymentResponse({ id: 'new-capital', commitHash: SHA, status: 'FAILED', instances: [] })
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
        ? { data: { serviceInstanceDeployV2: 'new-capital' } }
        : { data: { serviceInstanceDeployV2: 'new-fund' } },
      deployment: (request) => request.variables.id === 'old-fund'
        ? deploymentResponse({ id: 'old-fund', commitHash: OLD_SHA })
        : request.variables.id === 'new-capital'
          ? deploymentResponse({ id: 'new-capital', commitHash: SHA, status: 'FAILED', instances: [] })
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

describe('F_1.3.4 failing deploy contracts', () => {
  it('uses one absolute run deadline across preflight, both services, and recovery', async () => {
    const env = environment();
    let currentTime = 0;
    const { transport: innerTransport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation.includes('in-flight')) return deploymentPage([]);
        if (request.operation.includes('reuse')) {
          const id = request.variables.input.serviceId === 'service-fund'
            ? 'old-fund'
            : 'old-capital';
          return deploymentPage([
            deploymentListNode(id, { commitHash: OLD_SHA, canRollback: true }),
          ]);
        }
        if (request.operation.includes('rollback resolution')) {
          return deploymentPage([deploymentListNode('rollback-fund', { commitHash: OLD_SHA })]);
        }
        return deploymentPage([]);
      },
      deploy: (request) => ({
        data: {
          serviceInstanceDeployV2: request.variables.serviceId === 'service-fund'
            ? 'new-fund'
            : 'new-capital',
        },
      }),
      deployment: (request) => request.variables.id === 'new-capital'
        ? deploymentResponse({ id: 'new-capital', status: 'FAILED', instances: [] })
        : request.variables.id === 'old-fund'
          ? deploymentResponse({ id: 'old-fund', commitHash: OLD_SHA, canRollback: true })
          : request.variables.id === 'rollback-fund'
            ? deploymentResponse({ id: 'rollback-fund', commitHash: OLD_SHA })
            : deploymentResponse({ id: request.variables.id }),
      rollback: { data: { deploymentRollback: true } },
    });
    const transport = vi.fn(async (request) => {
      try {
        return await innerTransport(request);
      } finally {
        currentTime += 1;
      }
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, {
        timeoutMs: 100,
        intervalMs: 10,
        now: () => currentTime,
      })
    );

    expect(result).toMatchObject({ overall: 'BLOCKED', recovery: { status: 'SUCCESS' } });
    expect(calls.length).toBeGreaterThan(10);
    expect(new Set(calls.map((call) => call.deadlineAt))).toEqual(new Set([100]));
  });

  it('does not start any provider mutation after the run deadline expires before mutation', async () => {
    const env = environment();
    let currentTime = 0;
    const { transport: innerTransport, calls } = makeTransport(env, SHA);
    const transport = vi.fn(async (request) => {
      if (request.deadlineAt <= currentTime) throw new Error('deadline exhausted');
      return innerTransport(request);
    });
    const fetchLiveMainShaImpl = vi.fn(async () => {
      currentTime = 500;
      return SHA;
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, {
        timeoutMs: 100,
        now: () => currentTime,
        fetchLiveMainSha: fetchLiveMainShaImpl,
      })
    );

    expect(result).toMatchObject({ overall: 'BLOCKED' });
    expect(serviceCalls(calls, 'deploy')).toHaveLength(0);
    expect(serviceCalls(calls, 'rollback')).toHaveLength(0);
    expect(serviceCalls(calls, 'redeploy')).toHaveLength(0);
  });

  it('permits only bounded reconciliation after an ambiguous mutation exhausts the run deadline', async () => {
    const env = environment();
    let currentTime = 0;
    const { transport: innerTransport, calls } = makeTransport(env, SHA, {
      deploy: (request) => {
        if (request.variables.serviceId === 'service-fund') {
          currentTime = 70;
          throw new Error('connection lost after mutation');
        }
        return { data: { serviceInstanceDeployV2: 'new-capital' } };
      },
      deployments: (request) => request.operation.includes('reconcile deploy fund-scenario-calc')
        ? deploymentPage([deploymentListNode('new-fund')])
        : deploymentPage([]),
      deployment: (request) => {
        if (request.variables.id === 'new-fund') {
          currentTime = 110;
          return deploymentResponse({ id: 'new-fund' });
        }
        return deploymentResponse({ id: request.variables.id });
      },
    });
    const transport = vi.fn(async (request) => {
      if (request.deadlineAt <= currentTime) throw new Error('deadline exhausted');
      return innerTransport(request);
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, {
        timeoutMs: 100,
        intervalMs: 10,
        now: () => currentTime,
      })
    );

    expect(result).toMatchObject({ overall: 'BLOCKED' });
    expect(serviceCalls(calls, 'deploy').map((call) => call.variables.serviceId)).toEqual([
      'service-fund',
    ]);
    expect(calls.some((call) => call.operation.includes('reconcile deploy fund-scenario-calc'))).toBe(
      true
    );
  });

  it('bounds a never-resolving second-service git ls-remote after service A mutation', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA);
    const execFileImpl = vi.fn(async (_command, _args, options) => {
      if (execFileImpl.mock.calls.length === 1) return { stdout: `${SHA}\trefs/heads/main\n` };
      if (options?.timeout === undefined) throw new Error('unbounded ls-remote sentinel');
      throw Object.assign(new Error('ls-remote timed out'), { code: 'ETIMEDOUT' });
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, {
        timeoutMs: 100,
        fetchLiveMainSha: (options) => fetchLiveMainSha(options),
        execFileImpl,
      })
    );

    expect(result).toMatchObject({ overall: 'BLOCKED' });
    expect(serviceCalls(calls, 'deploy')).toHaveLength(1);
    expect(execFileImpl.mock.calls[1][2]).toMatchObject({ timeout: expect.any(Number) });
  });

  it('does not resolve a lost deploy response to a historical exact-SHA deployment', async () => {
    const env = environment();
    const clock = advancingClock();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation.includes('in-flight')) return deploymentPage([]);
        if (request.operation.includes('reuse')) {
          const id = request.variables.input.serviceId === 'service-fund'
            ? 'old-fund'
            : 'old-capital';
          return deploymentPage([deploymentListNode(id, { commitHash: OLD_SHA })]);
        }
        if (request.operation.includes('reconcile deploy')) {
          return deploymentPage([deploymentListNode('historical-fund')]);
        }
        return deploymentPage([deploymentListNode('historical-fund')]);
      },
      deploy: (request) => request.variables.serviceId === 'service-fund'
        ? (() => { throw new Error('connection lost after mutation'); })()
        : { data: { serviceInstanceDeployV2: 'new-capital' } },
      deployment: (request) => deploymentResponse({ id: request.variables.id }),
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, {
        timeoutMs: 25,
        intervalMs: 10,
        now: clock.now,
        sleep: clock.sleep,
      })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      reconciliation: { reconciliation: 'UNRESOLVED' },
    });
    expect(serviceCalls(calls, 'deploy').map((call) => call.variables.serviceId)).toEqual([
      'service-fund',
    ]);
  });

  it('rejects a returned deploy ID already present in the pre-mutation snapshot', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation.includes('in-flight')) return deploymentPage([]);
        if (request.operation.includes('reuse')) {
          const id = request.variables.input.serviceId === 'service-fund'
            ? 'old-fund'
            : 'old-capital';
          return deploymentPage([deploymentListNode(id, { commitHash: OLD_SHA })]);
        }
        return deploymentPage([deploymentListNode('existing-fund')]);
      },
      deploy: (request) => request.variables.serviceId === 'service-fund'
        ? { data: { serviceInstanceDeployV2: 'existing-fund' } }
        : { data: { serviceInstanceDeployV2: 'new-capital' } },
    });

    const result = await deployRailwayWorkers(deployOptions(env, transport));

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'DEPLOYMENT_ID_NOT_NOVEL' },
    });
    expect(serviceCalls(calls, 'deploy').map((call) => call.variables.serviceId)).toEqual([
      'service-fund',
    ]);
  });

  it('fails closed when ambiguous deploy reconciliation has zero novel candidates', async () => {
    const env = environment();
    const clock = advancingClock();
    const { transport } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation.includes('in-flight')) return deploymentPage([]);
        if (request.operation.includes('reuse')) {
          const id = request.variables.input.serviceId === 'service-fund'
            ? 'old-fund'
            : 'old-capital';
          return deploymentPage([deploymentListNode(id, { commitHash: OLD_SHA })]);
        }
        if (request.operation.includes('reconcile deploy')) return deploymentPage([]);
        return deploymentPage([deploymentListNode('old-fund', { commitHash: OLD_SHA })]);
      },
      deploy: () => { throw new Error('connection lost after mutation'); },
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, {
        timeoutMs: 25,
        intervalMs: 10,
        now: clock.now,
        sleep: clock.sleep,
      })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'RECONCILIATION_IDENTITY_UNRESOLVED' },
    });
  });

  it('fails closed when ambiguous deploy reconciliation has one exact-SHA and one foreign novel candidate', async () => {
    const env = environment();
    const { transport } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation.includes('in-flight')) return deploymentPage([]);
        if (request.operation.includes('reuse')) {
          const id = request.variables.input.serviceId === 'service-fund'
            ? 'old-fund'
            : 'old-capital';
          return deploymentPage([deploymentListNode(id, { commitHash: OLD_SHA })]);
        }
        if (request.operation.includes('reconcile deploy')) {
          return deploymentPage([
            deploymentListNode('novel-exact', { commitHash: SHA }),
            deploymentListNode('novel-foreign', { commitHash: OLD_SHA }),
          ]);
        }
        return deploymentPage([deploymentListNode('old-fund', { commitHash: OLD_SHA })]);
      },
      deploy: () => { throw new Error('connection lost after mutation'); },
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 25, intervalMs: 10 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      reconciliation: { reconciliation: 'UNRESOLVED' },
    });
    expect(result.deploymentHandles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deploymentId: 'novel-exact' }),
        expect.objectContaining({ deploymentId: 'novel-foreign' }),
      ])
    );
  });

  it('fails closed after deployment discovery reaches the 100-page or 500-result ceiling', async () => {
    const env = environment();
    let page = 0;
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (!request.operation.includes('in-flight')) return deploymentPage([]);
        page += 1;
        return {
          data: {
            deployments: {
              edges: Array.from({ length: 5 }, (_, index) =>
                deploymentListNode(`fence-${page}-${index}`, { commitHash: OLD_SHA })
              ),
              pageInfo: {
                hasNextPage: page < 101,
                endCursor: `cursor-${page}`,
              },
            },
          },
        };
      },
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 1_000_000, intervalMs: 1 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'DEPLOYMENT_DISCOVERY_LIMIT' },
    });
    expect(serviceCalls(calls, 'deploy')).toHaveLength(0);
  });

  it('fails closed when the deployment ceiling scan expires before its next page', async () => {
    const env = environment();
    let currentTime = 0;
    let page = 0;
    const { transport: innerTransport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (!request.operation.includes('in-flight')) return deploymentPage([]);
        page += 1;
        currentTime += 10;
        return {
          data: {
            deployments: {
              edges: [deploymentListNode(`expiring-${page}`, { commitHash: OLD_SHA })],
              pageInfo: { hasNextPage: page < 10, endCursor: `cursor-${page}` },
            },
          },
        };
      },
    });
    const transport = vi.fn((request) => innerTransport(request));

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, {
        timeoutMs: 25,
        intervalMs: 1,
        now: () => currentTime,
      })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'DEPLOYMENT_DEADLINE_EXCEEDED' },
    });
    expect(serviceCalls(calls, 'deploy')).toHaveLength(0);
  });

  function makeRecoveryScenario({
    method = 'rollback',
    priorInitiallyReady = false,
    ambiguousOutcome = 'transport',
    recoveryCandidates = [],
    attemptedAfter = 'FAILED',
  } = {}) {
    const env = environment();
    let recoveryStarted = false;
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation.includes('in-flight')) return deploymentPage([]);
        const serviceId = request.variables.input?.serviceId;
        const priorId = serviceId === 'service-fund' ? 'old-fund' : 'old-capital';
        const prior = deploymentListNode(priorId, {
          commitHash: OLD_SHA,
          canRollback: method === 'rollback',
          canRedeploy: method === 'redeploy',
        });
        if (request.operation.includes('reuse')) return deploymentPage([prior]);
        if (/reconcile|resolution/i.test(request.operation)) {
          return deploymentPage(
            recoveryCandidates.map((candidate) => deploymentListNode(candidate.id, {
              status: candidate.status ?? 'SUCCESS',
              commitHash: candidate.commitHash ?? OLD_SHA,
            }))
          );
        }
        return deploymentPage([prior]);
      },
      deploy: (request) => ({
        data: {
          serviceInstanceDeployV2: request.variables.serviceId === 'service-fund'
            ? 'new-fund'
            : 'new-capital',
        },
      }),
      deployment: (request) => {
        const { id } = request.variables;
        if (id === 'new-capital') {
          return deploymentResponse({ id, status: 'FAILED', commitHash: SHA, instances: [] });
        }
        if (id === 'new-fund') {
          const status = recoveryStarted ? attemptedAfter : 'SUCCESS';
          return deploymentResponse({
            id,
            status,
            commitHash: SHA,
            instances: status === 'SUCCESS'
              ? [{ id: `instance-${id}`, status: 'RUNNING' }]
              : [],
          });
        }
        if (id === 'old-fund') {
          const ready = priorInitiallyReady || recoveryStarted;
          return deploymentResponse({
            id,
            status: ready ? 'SUCCESS' : 'DEPLOYING',
            commitHash: OLD_SHA,
            canRollback: method === 'rollback',
            canRedeploy: method === 'redeploy',
            instances: ready ? [{ id: `instance-${id}`, status: 'RUNNING' }] : [],
          });
        }
        const candidate = recoveryCandidates.find((item) => item.id === id);
        return deploymentResponse({
          id,
          status: candidate?.status ?? 'SUCCESS',
          commitHash: candidate?.commitHash ?? OLD_SHA,
        });
      },
      rollback: () => {
        recoveryStarted = true;
        if (ambiguousOutcome === 'transport') throw new Error('rollback response lost');
        if (ambiguousOutcome === 'graphql') return { errors: [{ message: 'rollback response lost' }] };
        if (ambiguousOutcome === 'missing') return { data: {} };
        if (ambiguousOutcome === 'false') return { data: { deploymentRollback: false } };
        return { data: { deploymentRollback: true } };
      },
      redeploy: () => {
        recoveryStarted = true;
        if (ambiguousOutcome === 'transport') throw new Error('redeploy response lost');
        if (ambiguousOutcome === 'missing') return { data: { deploymentRedeploy: {} } };
        if (ambiguousOutcome === 'returned-existing') {
          return { data: { deploymentRedeploy: { id: 'old-fund' } } };
        }
        return { data: { deploymentRedeploy: { id: 'recovery-returned' } } };
      },
    });
    return { env, transport, calls };
  }

  it.each(['transport', 'graphql', 'missing', 'false'])('reconciles ambiguous rollback %s into a same-ID non-ready-to-ready transition', async (ambiguousOutcome) => {
    const { env, transport, calls } = makeRecoveryScenario({
      ambiguousOutcome,
      recoveryCandidates: [{ id: 'old-fund' }],
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 100, intervalMs: 10 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      recovery: {
        status: 'SUCCESS',
        method: 'rollback',
        recoveryDeploymentId: 'old-fund',
      },
    });
    expect(calls.filter((call) =>
      requestKind(call.query) === 'deployments' && /reconcile|resolution/i.test(call.operation)
    ).length).toBeGreaterThan(0);
  });

  it('keeps ambiguous rollback unresolved when the attempted deployment remains active', async () => {
    const { env, transport, calls } = makeRecoveryScenario({
      recoveryCandidates: [{ id: 'old-fund' }],
      attemptedAfter: 'DEPLOYING',
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 100, intervalMs: 10 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      recovery: {
        status: 'BLOCKED',
        reconciliation: 'UNRESOLVED',
        error: { code: 'RECOVERY_RECONCILIATION_UNRESOLVED' },
      },
    });
    expect(calls.filter((call) =>
      requestKind(call.query) === 'deployment' && call.variables.id === 'new-fund'
    ).length).toBeGreaterThan(1);
  });

  it('rejects an already-ready historical deployment as ambiguous rollback proof', async () => {
    const { env, transport, calls } = makeRecoveryScenario({
      priorInitiallyReady: true,
      recoveryCandidates: [{ id: 'old-fund' }],
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 100, intervalMs: 10 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      recovery: {
        status: 'BLOCKED',
        reconciliation: 'UNRESOLVED',
        error: { code: 'RECOVERY_RECONCILIATION_UNRESOLVED' },
      },
    });
    expect(calls.filter((call) =>
      requestKind(call.query) === 'deployments' && /reconcile|resolution/i.test(call.operation)
    ).length).toBeGreaterThan(0);
  });

  it('reconciles an ambiguous rollback to one novel prior-commit deployment', async () => {
    const { env, transport } = makeRecoveryScenario({
      recoveryCandidates: [{ id: 'recovery-novel' }],
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 100, intervalMs: 10 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      recovery: {
        status: 'SUCCESS',
        method: 'rollback',
        recoveryDeploymentId: 'recovery-novel',
      },
    });
  });

  it.each(['transport', 'missing'])('reconciles ambiguous redeploy %s to one novel prior-commit deployment', async (ambiguousOutcome) => {
    const { env, transport } = makeRecoveryScenario({
      method: 'redeploy',
      ambiguousOutcome,
      recoveryCandidates: [{ id: 'recovery-novel' }],
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 100, intervalMs: 10 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      recovery: {
        status: 'SUCCESS',
        method: 'redeploy',
        recoveryDeploymentId: 'recovery-novel',
      },
    });
  });

  it('keeps ambiguous redeploy unresolved when multiple novel prior-commit candidates remain', async () => {
    const { env, transport } = makeRecoveryScenario({
      method: 'redeploy',
      recoveryCandidates: [{ id: 'recovery-a' }, { id: 'recovery-b' }],
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 100, intervalMs: 10 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      recovery: {
        status: 'BLOCKED',
        reconciliation: 'UNRESOLVED',
        error: { code: 'RECOVERY_RECONCILIATION_UNRESOLVED' },
      },
    });
  });

  it('rejects a returned redeploy ID already present in the pre-mutation snapshot', async () => {
    const { env, transport } = makeRecoveryScenario({
      method: 'redeploy',
      ambiguousOutcome: 'returned-existing',
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 100, intervalMs: 10 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      recovery: {
        status: 'BLOCKED',
        error: { code: 'DEPLOYMENT_ID_NOT_NOVEL' },
      },
    });
  });

  it.each([
    ['empty', []],
    ['crashed', [{ id: 'instance-new-capital', status: 'CRASHED' }]],
    ['exited', [{ id: 'instance-new-capital', status: 'EXITED' }]],
    ['removed', [{ id: 'instance-new-capital', status: 'REMOVED' }]],
    ['skipped', [{ id: 'instance-new-capital', status: 'SKIPPED' }]],
    ['stopped', [{ id: 'instance-new-capital', status: 'STOPPED' }]],
  ])(
    'recovers service A after exact service-B stopped-success containment proof with %s instance evidence',
    async (_label, containmentInstances) => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation.includes('in-flight')) return deploymentPage([]);
        const id = request.variables.input.serviceId === 'service-fund'
          ? 'old-fund'
          : 'old-capital';
        return deploymentPage([
          deploymentListNode(id, { commitHash: OLD_SHA, canRollback: true }),
        ]);
      },
      deploy: (request) => ({
        data: {
          serviceInstanceDeployV2: request.variables.serviceId === 'service-fund'
            ? 'new-fund'
            : 'new-capital',
        },
      }),
      deployment: (request) => request.variables.id === 'new-capital'
        ? deploymentResponse({
            id: 'new-capital',
            commitHash: SHA,
            status: 'SUCCESS',
            deploymentStopped: true,
            instances: containmentInstances,
          })
        : request.variables.id === 'old-fund'
          ? deploymentResponse({
              id: 'old-fund',
              commitHash: OLD_SHA,
              canRollback: true,
            })
          : deploymentResponse({ id: request.variables.id }),
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 100, intervalMs: 10 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      error: { code: 'DEPLOYMENT_STOPPED', deploymentId: 'new-capital' },
      recovery: { status: 'SUCCESS', method: 'rollback' },
    });
    expect(serviceCalls(calls, 'deployment').filter(
      (call) => call.variables.id === 'new-capital'
    )).toHaveLength(2);
    expect(serviceCalls(calls, 'rollback')).toHaveLength(1);
    }
  );

  it.each([
    ['missing', undefined],
    ['non-array', null],
    ['malformed', [{ id: 'instance-new-capital' }]],
    ['blank-id', [{ id: ' ', status: 'STOPPED' }]],
    ['created', [{ id: 'instance-new-capital', status: 'CREATED' }]],
    ['initializing', [{ id: 'instance-new-capital', status: 'INITIALIZING' }]],
    ['removing', [{ id: 'instance-new-capital', status: 'REMOVING' }]],
    ['restarting', [{ id: 'instance-new-capital', status: 'RESTARTING' }]],
    ['unknown-status', [{ id: 'instance-new-capital', status: 'UNKNOWN' }]],
    ['missing top-level status', [], 'SUCCESS', true],
    ['deploying top-level status', [], 'DEPLOYING'],
    ['restarting top-level status', [], 'RESTARTING'],
    ['unknown top-level status', [], 'UNKNOWN'],
  ])(
    'withholds service A recovery when service-B containment readback has %s',
    async (_label, containmentInstances, containmentStatus = 'SUCCESS', omitStatus = false) => {
      const env = environment();
      let capitalReadbacks = 0;
      const { transport, calls } = makeTransport(env, SHA, {
        deployments: (request) => {
          if (request.operation.includes('in-flight')) return deploymentPage([]);
          const id = request.variables.input.serviceId === 'service-fund'
            ? 'old-fund'
            : 'old-capital';
          return deploymentPage([
            deploymentListNode(id, { commitHash: OLD_SHA, canRollback: true }),
          ]);
        },
        deploy: (request) => ({
          data: {
            serviceInstanceDeployV2: request.variables.serviceId === 'service-fund'
              ? 'new-fund'
              : 'new-capital',
          },
        }),
        deployment: (request) => {
          if (request.variables.id === 'new-capital') {
            capitalReadbacks += 1;
            const response = deploymentResponse({
              id: 'new-capital',
              commitHash: SHA,
              status: capitalReadbacks === 1 ? 'SUCCESS' : containmentStatus,
              deploymentStopped: true,
              instances: capitalReadbacks === 1 ? [] : containmentInstances,
            });
            if (capitalReadbacks > 1 && containmentInstances === undefined) {
              delete response.data.deployment.instances;
            }
            if (capitalReadbacks > 1 && omitStatus) {
              delete response.data.deployment.status;
            }
            return response;
          }
          return request.variables.id === 'old-fund'
            ? deploymentResponse({
                id: 'old-fund',
                commitHash: OLD_SHA,
                canRollback: true,
              })
            : deploymentResponse({ id: request.variables.id });
        },
      });

      const result = await deployRailwayWorkers(
        deployOptions(env, transport, { timeoutMs: 100, intervalMs: 10 })
      );

      expect(result).toMatchObject({
        overall: 'BLOCKED',
        error: { code: 'RECOVERY_BLOCKED' },
        recovery: { status: 'BLOCKED', error: { code: 'RECOVERY_BLOCKED' } },
      });
      expect(serviceCalls(calls, 'deployment').filter(
        (call) => call.variables.id === 'new-capital'
      )).toHaveLength(2);
      expect(serviceCalls(calls, 'rollback')).toHaveLength(0);
      expect(serviceCalls(calls, 'redeploy')).toHaveLength(0);
    }
  );

  it('withholds service A recovery while the failed service deployment still has running instances', async () => {
    const env = environment();
    const { transport, calls } = makeTransport(env, SHA, {
      deployments: (request) => {
        if (request.operation.includes('in-flight')) return deploymentPage([]);
        const id = request.variables.input.serviceId === 'service-fund'
          ? 'old-fund'
          : 'old-capital';
        return deploymentPage([
          deploymentListNode(id, { commitHash: OLD_SHA, canRollback: true }),
        ]);
      },
      deploy: (request) => ({
        data: {
          serviceInstanceDeployV2: request.variables.serviceId === 'service-fund'
            ? 'new-fund'
            : 'new-capital',
        },
      }),
      deployment: (request) => request.variables.id === 'new-capital'
        ? deploymentResponse({ id: 'new-capital', commitHash: SHA, status: 'FAILED' })
        : request.variables.id === 'old-fund'
          ? deploymentResponse({ id: 'old-fund', commitHash: OLD_SHA, canRollback: true })
          : deploymentResponse({ id: request.variables.id }),
    });

    const result = await deployRailwayWorkers(
      deployOptions(env, transport, { timeoutMs: 100, intervalMs: 10 })
    );

    expect(result).toMatchObject({
      overall: 'BLOCKED',
      recovery: { status: 'BLOCKED', error: { code: 'RECOVERY_BLOCKED' } },
    });
    expect(serviceCalls(calls, 'rollback')).toHaveLength(0);
    expect(serviceCalls(calls, 'redeploy')).toHaveLength(0);
  });
});
