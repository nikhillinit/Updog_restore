import { execFile } from 'node:child_process';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { postRailwayGraphql, safeErrorMessage } from './railway-graphql-transport.mjs';

const SHA = /^[a-f0-9]{40}$/;
const DRY_RUN_TOKEN = 'dry-run-token';
const execFileAsync = promisify(execFile);
const TERMINAL_FAILURE_STATUSES = new Set(['FAILED', 'CRASHED', 'REMOVED', 'SKIPPED']);
const TERMINAL_INACTIVE_INSTANCE_STATUSES = new Set([
  'CRASHED',
  'EXITED',
  'REMOVED',
  'SKIPPED',
  'STOPPED',
]);
const IN_PROGRESS_STATUSES = new Set([
  'BUILDING',
  'DEPLOYING',
  'INITIALIZING',
  'NEEDS_APPROVAL',
  'QUEUED',
  'REMOVING',
  'RESTARTING',
  'WAITING',
]);
// ponytail: cap discovery at 100 pages/500 deployments; raise only with a provider paging contract and matching bounded-scan tests.
const MAX_DEPLOYMENT_DISCOVERY_PAGES = 100;
const MAX_DEPLOYMENT_DISCOVERY_RESULTS = 500;

export const DEFAULT_DEPLOYMENT_INTERVAL_MS = 15_000;
export const DEFAULT_DEPLOYMENT_TIMEOUT_MS = 35 * 60_000;
export const DEPLOYMENT_EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  BLOCKED: 1,
});

const SERVICES = Object.freeze([
  Object.freeze({
    name: 'fund-scenario-calc',
    environmentKey: 'RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID',
  }),
  Object.freeze({
    name: 'capital-call-status',
    environmentKey: 'RAILWAY_CAPITAL_CALL_STATUS_SERVICE_ID',
  }),
]);

const PROJECT_SCOPE_QUERY =
  'query { projectToken { project { id } environment { id } } }';
const TOPOLOGY_QUERY = `query railwayWorkerTopology($projectId: String!, $environmentId: String!) {
  environment(id: $environmentId, projectId: $projectId) {
    serviceInstances(first: 100) {
      edges { node { serviceId serviceName } }
      pageInfo { hasNextPage }
    }
  }
}`;
const AUTODEPLOY_STATUS_QUERY = `query serviceInstanceAutoDeployStatus($projectId: String!, $environmentId: String!, $serviceId: String!) {
  serviceInstanceAutoDeployStatus(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
    enabled
    canEnable
    reason
  }
}`;
const DEPLOYMENTS_QUERY = `query railwayDeployments($input: DeploymentListInput!) {
  deployments(input: $input, first: 1) {
    edges { node { id status meta canRedeploy canRollback } }
  }
}`;
const RECENT_DEPLOYMENTS_QUERY = `query railwayRecentDeployments($input: DeploymentListInput!, $after: String) {
  deployments(input: $input, first: 5, after: $after) {
    edges { node { id status meta canRedeploy canRollback } }
    pageInfo { hasNextPage endCursor }
  }
}`;
const DEPLOYMENT_QUERY = `query railwayDeployment($id: String!) {
  deployment(id: $id) {
    id
    status
    meta
    canRedeploy
    canRollback
    serviceId
    environmentId
    deploymentStopped
    instances { id status }
  }
}`;
const DEPLOY_MUTATION = `mutation serviceInstanceDeployV2($serviceId: String!, $environmentId: String!, $commitSha: String) {
  serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
}`;
const ROLLBACK_MUTATION = `mutation deploymentRollback($id: String!) {
  deploymentRollback(id: $id)
}`;
const REDEPLOY_MUTATION = `mutation deploymentRedeploy($id: String!) {
  deploymentRedeploy(id: $id) { id status meta canRedeploy canRollback }
}`;

class DeployFailure extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RailwayWorkersDeployFailure';
    this.code = code;
    Object.assign(this, details);
  }
}

export async function fetchLiveMainSha({
  execFileImpl = execFileAsync,
  deadlineAt,
  now = Date.now,
} = {}) {
  if (typeof execFileImpl !== 'function') {
    throw new Error('execFile must be a function');
  }
  const options = { encoding: 'utf8' };
  let timeoutMs;
  if (deadlineAt !== undefined) {
    if (!Number.isFinite(deadlineAt)) {
      throw new DeployFailure('INVALID_ARGUMENT', 'git ls-remote deadline must be finite');
    }
    timeoutMs = Math.ceil(deadlineAt - now());
    if (timeoutMs <= 0) {
      throw new DeployFailure(
        'MAIN_REFENCE_UNAVAILABLE',
        'git ls-remote deadline exceeded before spawn'
      );
    }
    options.timeout = timeoutMs;
  }

  let result;
  try {
    result = await execFileImpl(
      'git',
      ['ls-remote', 'origin', 'refs/heads/main'],
      options
    );
  } catch (error) {
    let outcome = 'failed before completion';
    if (error?.code === 'ETIMEDOUT' || error?.killed) {
      outcome = timeoutMs === undefined ? 'timed out' : `timed out after ${timeoutMs}ms`;
    } else if (Number.isInteger(error?.code)) {
      outcome = `exited with code ${error.code}`;
    } else if (typeof error?.signal === 'string') {
      outcome = `terminated by signal ${error.signal}`;
    }
    throw new DeployFailure('MAIN_REFENCE_UNAVAILABLE', `git ls-remote ${outcome}`);
  }

  if (deadlineAt !== undefined && now() >= deadlineAt) {
    throw new DeployFailure(
      'MAIN_REFENCE_UNAVAILABLE',
      timeoutMs === undefined
        ? 'git ls-remote deadline exceeded'
        : `git ls-remote timed out after ${timeoutMs}ms`
    );
  }

  const stdout = typeof result === 'string' ? result : result?.stdout;
  const match = String(stdout ?? '').trim().match(/^([a-f0-9]{40})\s+refs\/heads\/main$/);
  if (!match) {
    throw new DeployFailure(
      'MAIN_REFENCE_UNAVAILABLE',
      'git ls-remote returned invalid refs/heads/main output'
    );
  }
  return match[1];
}

function requireSha(value) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new DeployFailure('INVALID_ARGUMENT', 'expected SHA must be a lowercase 40-character SHA');
  }
  return value;
}

function requiredEnvironment(environment, key) {
  const value = environment?.[key];
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new DeployFailure('INVALID_ENVIRONMENT', `${key} environment value is required`);
  }
  return value;
}

function graphqlErrorMessage(error, token) {
  const message =
    error && typeof error.message === 'string' ? error.message : JSON.stringify(error);
  return safeErrorMessage(message || 'unknown GraphQL error', token);
}

function assertPayload(payload, operation, token) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new DeployFailure('INVALID_RESPONSE', `${operation} response is malformed`);
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const details = payload.errors.map((error) => graphqlErrorMessage(error, token)).join('; ');
    throw new DeployFailure('GRAPHQL_ERROR', `${operation} GraphQL error: ${details}`);
  }
  return payload;
}

async function request(config, { operation, query, variables, deadlineAt }) {
  if (!Number.isFinite(deadlineAt)) {
    throw new DeployFailure('INVALID_ARGUMENT', `${operation} requires an absolute deadline`);
  }
  try {
    const payload = await config.transport({
      token: config.token,
      query,
      variables,
      fetchImpl: config.fetchImpl,
      operation,
      deadlineAt,
      now: config.now,
    });
    return assertPayload(payload, operation, config.token);
  } catch (error) {
    if (error instanceof DeployFailure) throw error;
    throw new DeployFailure(
      'TRANSPORT_ERROR',
      `${operation} request failed: ${safeErrorMessage(error, config.token)}`
    );
  }
}

function serviceConfig(environment, dryRun) {
  const services = Object.fromEntries(
    SERVICES.map((service) => [service.name, requiredEnvironment(environment, service.environmentKey)])
  );
  const projectId = requiredEnvironment(environment, 'RAILWAY_PROJECT_ID');
  const environmentId = requiredEnvironment(environment, 'RAILWAY_ENVIRONMENT_ID');
  if (new Set(Object.values(services)).size !== SERVICES.length) {
    throw new DeployFailure('INVALID_ENVIRONMENT', 'Railway worker service IDs must be distinct');
  }
  if (!dryRun) requiredEnvironment(environment, 'RAILWAY_TOKEN');
  if (!dryRun && environment?.GITHUB_RUN_ATTEMPT !== undefined && environment.GITHUB_RUN_ATTEMPT !== '1') {
    throw new DeployFailure('INVALID_ENVIRONMENT', 'GITHUB_RUN_ATTEMPT must be 1');
  }
  return {
    projectId,
    environmentId,
    services,
    token: dryRun ? DRY_RUN_TOKEN : environment.RAILWAY_TOKEN,
  };
}

function createDryRunTransport(expectedSha, config) {
  return async ({ query, variables }) => {
    if (query.includes('projectToken')) {
      return {
        data: {
          projectToken: {
            project: { id: config.projectId },
            environment: { id: config.environmentId },
          },
        },
      };
    }
    if (query.includes('serviceInstanceAutoDeployStatus')) {
      return { data: { serviceInstanceAutoDeployStatus: { enabled: false, canEnable: true, reason: null } } };
    }
    if (query.includes('serviceInstances')) {
      return {
        data: {
          environment: {
            serviceInstances: {
              edges: SERVICES.map((service) => ({
                node: { serviceName: service.name, serviceId: config.services[service.name] },
              })),
              pageInfo: { hasNextPage: false },
            },
          },
        },
      };
    }
    if (query.includes('deployments(')) {
      return {
        data: {
          deployments: {
            edges: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      };
    }
    if (query.includes('serviceInstanceDeployV2')) {
      return { data: { serviceInstanceDeployV2: `dry-run-${variables.serviceId}` } };
    }
    if (query.includes('deployment(id:')) {
      const serviceId = Object.values(config.services).find((candidate) => variables.id.includes(candidate));
      return {
        data: {
          deployment: {
            id: variables.id,
            status: 'SUCCESS',
            meta: { commitHash: expectedSha },
            canRedeploy: false,
            canRollback: false,
            serviceId,
            environmentId: config.environmentId,
            deploymentStopped: false,
            instances: [{ id: `dry-instance-${variables.id}`, status: 'RUNNING' }],
          },
        },
      };
    }
    throw new DeployFailure('INVALID_OPERATION', 'dry-run operation is not recognized');
  };
}

function buildConfig({
  expectedSha,
  environment,
  dryRun,
  transport,
  fetchImpl,
  fetchLiveMainSha: fetchLiveMainShaImpl,
  execFileImpl,
  timeoutMs,
  intervalMs,
  now,
  sleep,
}) {
  const sha = requireSha(expectedSha);
  const provider = serviceConfig(environment, dryRun);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new DeployFailure('INVALID_ARGUMENT', 'timeoutMs must be a positive integer');
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new DeployFailure('INVALID_ARGUMENT', 'intervalMs must be a positive integer');
  }
  if (typeof fetchLiveMainShaImpl !== 'function') {
    throw new DeployFailure('INVALID_ARGUMENT', 'fetchLiveMainSha must be a function');
  }
  if (typeof execFileImpl !== 'function') {
    throw new DeployFailure('INVALID_ARGUMENT', 'execFileImpl must be a function');
  }
  const base = {
    ...provider,
    expectedSha: sha,
    dryRun,
    fetchImpl,
    fetchLiveMainSha: fetchLiveMainShaImpl,
    execFileImpl,
    timeoutMs,
    intervalMs,
    now,
    sleep,
  };
  return {
    ...base,
    transport: transport ?? (dryRun && fetchImpl === undefined
      ? createDryRunTransport(sha, base)
      : postRailwayGraphql),
  };
}

function serviceEntries(config) {
  return SERVICES.map((service) => ({
    ...service,
    serviceId: config.services[service.name],
  }));
}

async function assertNoInFlightDeployments(config, service, deadlineAt) {
  const operation = `Railway in-flight fence ${service.name}`;
  const deployments = await listRecentDeployments(config, service, operation, deadlineAt);
  const inFlight = deployments.find((deployment) => IN_PROGRESS_STATUSES.has(deployment.status));
  if (inFlight) {
    throw new DeployFailure(
      'DEPLOYMENT_IN_FLIGHT',
      `Railway deployment ${inFlight.id ?? 'unknown'} for ${service.name} is already ${inFlight.status}`,
      { deploymentId: inFlight.id, deploymentStatus: inFlight.status }
    );
  }
}

async function checkMainReference(config, service, state, deadlineAt) {
  const check = { serviceName: service.name, status: 'PENDING' };
  state.mainReferenceCheck = check;
  if (config.dryRun) {
    check.status = 'SKIPPED';
    return;
  }

  try {
    const liveMainSha = await config.fetchLiveMainSha({
      expectedSha: config.expectedSha,
      serviceName: service.name,
      execFileImpl: config.execFileImpl,
      deadlineAt,
      now: config.now,
    });
    if (typeof liveMainSha !== 'string' || !SHA.test(liveMainSha)) {
      throw new DeployFailure(
        'MAIN_REFENCE_UNAVAILABLE',
        `Live refs/heads/main SHA for ${service.name} is invalid`
      );
    }
    check.observedSha = liveMainSha;
    if (liveMainSha !== config.expectedSha) {
      check.status = 'BLOCKED';
      throw new DeployFailure(
        'MAIN_REFENCE_MISMATCH',
        `Live refs/heads/main SHA ${liveMainSha} differs from expected SHA ${config.expectedSha}`,
        { liveMainSha }
      );
    }
    check.status = 'PASSED';
  } catch (error) {
    check.status = 'BLOCKED';
    if (error instanceof DeployFailure) throw error;
    throw new DeployFailure(
      'MAIN_REFENCE_UNAVAILABLE',
      `Live refs/heads/main check for ${service.name} failed: ${safeErrorMessage(error, config.token)}`
    );
  }
}

async function preflight(config, service, deadlineAt) {
  const scope = await request(config, {
    operation: 'Railway scope',
    query: PROJECT_SCOPE_QUERY,
    variables: {},
    deadlineAt,
  });
  const projectToken = scope.data?.projectToken;
  if (
    projectToken?.project?.id !== config.projectId ||
    projectToken?.environment?.id !== config.environmentId
  ) {
    throw new DeployFailure('SCOPE_MISMATCH', 'Railway project or environment scope does not match expected identity');
  }

  const topology = await request(config, {
    operation: 'Railway topology',
    query: TOPOLOGY_QUERY,
    variables: { projectId: config.projectId, environmentId: config.environmentId },
    deadlineAt,
  });
  const instances = topology.data?.environment?.serviceInstances;
  if (
    !instances ||
    !Array.isArray(instances.edges) ||
    instances.pageInfo?.hasNextPage !== false
  ) {
    throw new DeployFailure('TOPOLOGY_MISMATCH', 'Railway worker topology is missing or truncated');
  }
  // Extra non-worker services (e.g. Redis) are tolerated, matching
  // verifyRailwayTopology: each protected worker must resolve exactly once
  // by name AND by ID, cross-mapped correctly.
  const nodes = instances.edges.map((edge) => edge?.node).filter(Boolean);
  for (const service of serviceEntries(config)) {
    const byName = nodes.filter((node) => node.serviceName === service.name);
    const byId = nodes.filter((node) => node.serviceId === service.serviceId);
    if (byName.length !== 1 || byId.length !== 1) {
      throw new DeployFailure('TOPOLOGY_MISMATCH', `Railway protected service ${service.name} is duplicated or missing`);
    }
    if (byName[0].serviceId !== service.serviceId || byId[0].serviceName !== service.name) {
      throw new DeployFailure('TOPOLOGY_MISMATCH', `Railway protected service ${service.name} is cross-mapped`);
    }
  }

  for (const service of serviceEntries(config)) {
    const autodeploy = await request(config, {
      operation: `Railway autodeploy ${service.name}`,
      query: AUTODEPLOY_STATUS_QUERY,
      variables: {
        projectId: config.projectId,
        environmentId: config.environmentId,
        serviceId: service.serviceId,
      },
      deadlineAt,
    });
    const status = autodeploy.data?.serviceInstanceAutoDeployStatus;
    if (status?.enabled !== false) {
      throw new DeployFailure(
        'AUTODEPLOY_ENABLED',
        `Railway autodeploy is not disabled for ${service.name}`
      );
    }
  }

  await assertNoInFlightDeployments(config, service, deadlineAt);
}

function deploymentInput(config, service) {
  return {
    projectId: config.projectId,
    serviceId: service.serviceId,
    environmentId: config.environmentId,
    status: { successfulOnly: true },
  };
}

function recentDeploymentInput(config, service) {
  return {
    projectId: config.projectId,
    serviceId: service.serviceId,
    environmentId: config.environmentId,
  };
}

function deploymentNodes(payload, operation) {
  const connection = payload.data?.deployments;
  if (!connection || typeof connection !== 'object') {
    throw new DeployFailure('INVALID_RESPONSE', `${operation} deployments response is malformed`);
  }
  if (!Array.isArray(connection.edges)) {
    throw new DeployFailure('INVALID_RESPONSE', `${operation} deployments response is malformed`);
  }
  return connection.edges.map((edge) => {
    if (!edge?.node || typeof edge.node !== 'object') {
      throw new DeployFailure('INVALID_RESPONSE', `${operation} deployment edge is malformed`);
    }
    return edge.node;
  });
}

function deploymentPage(payload, operation, observeDeployment) {
  const connection = payload.data?.deployments;
  const nodes = deploymentNodes(payload, operation);
  for (const deployment of nodes) observeDeployment?.(deployment);
  const pageInfo = connection?.pageInfo;
  if (!pageInfo || typeof pageInfo.hasNextPage !== 'boolean') {
    throw new DeployFailure('INVALID_RESPONSE', `${operation} deployment pageInfo is malformed`);
  }
  if (
    pageInfo.hasNextPage &&
    (typeof pageInfo.endCursor !== 'string' || pageInfo.endCursor === '')
  ) {
    throw new DeployFailure('INVALID_RESPONSE', `${operation} deployment endCursor is missing`);
  }
  return { nodes, pageInfo };
}

async function listRecentDeployments(
  config,
  service,
  operation,
  deadlineAt,
  observeDeployment
) {
  const deployments = [];
  const cursors = new Set();
  let after;
  let pageCount = 0;

  while (true) {
    if (config.now() >= deadlineAt) {
      throw new DeployFailure(
        'DEPLOYMENT_DEADLINE_EXCEEDED',
        `${operation} deployment discovery exceeded the run deadline`
      );
    }
    const payload = await request(config, {
      operation,
      query: RECENT_DEPLOYMENTS_QUERY,
      variables: {
        input: recentDeploymentInput(config, service),
        ...(after ? { after } : {}),
      },
      deadlineAt,
    });
    pageCount += 1;
    const { nodes, pageInfo } = deploymentPage(payload, operation, observeDeployment);
    deployments.push(...nodes);
    if (deployments.length > MAX_DEPLOYMENT_DISCOVERY_RESULTS) {
      throw new DeployFailure(
        'DEPLOYMENT_DISCOVERY_LIMIT',
        `${operation} deployment discovery exceeded ${MAX_DEPLOYMENT_DISCOVERY_RESULTS} deployments`
      );
    }
    if (config.now() >= deadlineAt) {
      throw new DeployFailure(
        'DEPLOYMENT_DEADLINE_EXCEEDED',
        `${operation} deployment discovery exceeded the run deadline`
      );
    }
    if (!pageInfo.hasNextPage) return deployments;
    if (cursors.has(pageInfo.endCursor)) {
      throw new DeployFailure('INVALID_RESPONSE', `${operation} deployment cursor repeated`);
    }
    if (
      pageCount >= MAX_DEPLOYMENT_DISCOVERY_PAGES ||
      deployments.length >= MAX_DEPLOYMENT_DISCOVERY_RESULTS
    ) {
      throw new DeployFailure(
        'DEPLOYMENT_DISCOVERY_LIMIT',
        `${operation} deployment discovery exceeded ${MAX_DEPLOYMENT_DISCOVERY_PAGES} pages or ${MAX_DEPLOYMENT_DISCOVERY_RESULTS} deployments`
      );
    }
    cursors.add(pageInfo.endCursor);
    after = pageInfo.endCursor;
  }
}

async function snapshotDeploymentIds(config, service, deadlineAt) {
  const deployments = await listRecentDeployments(
    config,
    service,
    `Railway pre-mutation snapshot ${service.name}`,
    deadlineAt
  );
  const ids = new Set();
  for (const deployment of deployments) {
    if (typeof deployment?.id !== 'string' || deployment.id.trim() === '') {
      throw new DeployFailure(
        'INVALID_RESPONSE',
        `Railway pre-mutation snapshot for ${service.name} contains a deployment without an ID`
      );
    }
    ids.add(deployment.id);
  }
  return ids;
}

async function findSuccessfulDeployment(config, service, operation, deadlineAt) {
  const payload = await request(config, {
    operation,
    query: DEPLOYMENTS_QUERY,
    variables: { input: deploymentInput(config, service) },
    deadlineAt,
  });
  const [deployment] = deploymentNodes(payload, operation);
  if (deployment === undefined) return undefined;
  if (!deployment || typeof deployment.id !== 'string' || deployment.id.trim() === '') {
    throw new DeployFailure('INVALID_RESPONSE', `${operation} deployment ID is missing`);
  }
  return deployment;
}

function isExactActiveDeployment(deployment, expectedSha) {
  return (
    deployment.status === 'SUCCESS' &&
    deployment.meta?.commitHash === expectedSha &&
    deployment.deploymentStopped === false
  );
}

async function reconcileAmbiguousDeployment(
  config,
  service,
  handles,
  preMutationDeploymentIds,
  deadlineAt
) {
  const operation = `Railway reconcile deploy ${service.name}`;
  const maxAttempts = Math.max(
    1,
    Math.ceil(Math.max(0, deadlineAt - config.now()) / config.intervalMs) + 1
  );
  let attempts = 0;
  // Novelty accumulates across attempts: a candidate that later disappears from
  // the listing still counts against the exactly-one requirement.
  const observedNovelIds = new Set();

  const unresolvedFailure = (message) =>
    new DeployFailure('RECONCILIATION_IDENTITY_UNRESOLVED', message, {
      deploymentIds: [...observedNovelIds],
    });

  while (true) {
    if (config.now() >= deadlineAt) {
      throw unresolvedFailure(
        `${operation} did not prove exactly one novel ready deployment before timeout`
      );
    }
    attempts += 1;
    const deployments = await listRecentDeployments(
      config,
      service,
      operation,
      deadlineAt,
      (deployment) =>
        rememberObservedNovelDeployment(
          deployment,
          preMutationDeploymentIds,
          observedNovelIds,
          handles,
          service,
          'unconfirmed'
        )
    );
    const listedNovelDeployments = new Map();

    for (const deployment of deployments) {
      if (typeof deployment?.id !== 'string' || deployment.id.trim() === '') {
        throw unresolvedFailure(
          `${operation} observed a novel deployment with an invalid identity`
        );
      }
      if (preMutationDeploymentIds.has(deployment.id)) continue;
      if (!listedNovelDeployments.has(deployment.id)) {
        listedNovelDeployments.set(deployment.id, deployment);
      }
    }

    if (observedNovelIds.size > 1) {
      throw unresolvedFailure(`${operation} observed multiple novel deployment identities`);
    }

    if (observedNovelIds.size === 1) {
      const [novelId] = observedNovelIds;
      const listed = listedNovelDeployments.get(novelId);
      if (listed === undefined) {
        throw unresolvedFailure(
          `${operation} novel deployment ${novelId} disappeared from discovery`
        );
      }
      if (listed.meta?.commitHash !== config.expectedSha) {
        throw unresolvedFailure(
          `${operation} candidate ${novelId} does not match the expected SHA`
        );
      }
      let readback;
      try {
        readback = await readDeployment(
          config,
          service,
          novelId,
          `${operation} ${novelId}`,
          deadlineAt
        );
      } catch (error) {
        throw new DeployFailure(
          'RECONCILIATION_IDENTITY_UNRESOLVED',
          `${operation} candidate ${novelId} identity could not be verified`,
          {
            deploymentId: novelId,
            reconciliationError: failureSummary(error, config.token),
          }
        );
      }
      const handle = rememberHandle(handles, service.name, 'unconfirmed', novelId);
      if (handle) handle.status = readback.status;
      if (isReadyDeployment(readback, config.expectedSha)) return readback;
      const stillConverging =
        IN_PROGRESS_STATUSES.has(readback.status) ||
        (readback.status === 'SUCCESS' &&
          readback.deploymentStopped === false &&
          !hasRunningInstance(readback));
      if (!stillConverging) {
        throw unresolvedFailure(`${operation} candidate ${novelId} did not fully verify`);
      }
    }

    const currentTime = config.now();
    if (currentTime >= deadlineAt || attempts >= maxAttempts) {
      throw unresolvedFailure(
        `${operation} did not prove exactly one novel ready deployment before timeout`
      );
    }
    await config.sleep(Math.min(config.intervalMs, deadlineAt - currentTime));
  }
}

async function waitForRollbackRecovery(config, service, expectedCommitHash, handles, deadlineAt) {
  const operation = `Railway rollback resolution ${service.name}`;

  while (true) {
    const resolved = await findSuccessfulDeployment(config, service, operation, deadlineAt);
    if (resolved && resolved.meta?.commitHash === expectedCommitHash) {
      rememberHandle(handles, service.name, 'recovery', resolved.id);
      const readback = await readDeployment(config, service, resolved.id, operation, deadlineAt);
      if (isReadyDeployment(readback, expectedCommitHash)) return readback;
    }

    const currentTime = config.now();
    if (currentTime >= deadlineAt) {
      throw new DeployFailure(
        'RECOVERY_BLOCKED',
        `Railway rollback for ${service.name} did not resolve a ready prior deployment before timeout`,
        { deploymentStatus: resolved?.status }
      );
    }
    await config.sleep(Math.min(config.intervalMs, deadlineAt - currentTime));
  }
}

async function readDeployment(config, service, deploymentId, operation, deadlineAt) {
  const payload = await request(config, {
    operation,
    query: DEPLOYMENT_QUERY,
    variables: { id: deploymentId },
    deadlineAt,
  });
  const deployment = payload.data?.deployment;
  if (!deployment || typeof deployment !== 'object' || deployment.id !== deploymentId) {
    throw new DeployFailure('INVALID_RESPONSE', `${operation} deployment identity is invalid`);
  }
  if (
    deployment.serviceId !== service.serviceId ||
    deployment.environmentId !== config.environmentId
  ) {
    throw new DeployFailure(
      'DEPLOYMENT_IDENTITY_MISMATCH',
      `${operation} deployment target does not match expected service or environment`,
      { deploymentId }
    );
  }
  return deployment;
}

async function waitForDeployment(config, service, deploymentId, expectedSha, deadlineAt) {
  const startedAt = config.now();
  if (!Number.isFinite(deadlineAt)) {
    throw new DeployFailure('INVALID_ARGUMENT', 'Railway deployment requires an absolute deadline');
  }
  const deadline = deadlineAt;
  let attempts = 0;
  let successWithoutRunningInstance = false;

  while (true) {
    attempts += 1;
    const deployment = await readDeployment(
      config,
      service,
      deploymentId,
      `Railway deployment ${service.name}`,
      deadline
    );
    if (deployment.status === 'SUCCESS') {
      if (deployment.deploymentStopped !== false) {
        throw new DeployFailure(
          'DEPLOYMENT_STOPPED',
          `Railway deployment ${deploymentId} for ${service.name} is stopped or missing running-state proof`,
          { deploymentId }
        );
      }
      if (deployment.meta?.commitHash !== expectedSha) {
        throw new DeployFailure(
          'DEPLOYMENT_SHA_MISMATCH',
          `Railway deployment ${deploymentId} for ${service.name} does not match expected SHA`,
          { deploymentId }
        );
      }
      if (hasRunningInstance(deployment)) {
        return { ...deployment, attempts, elapsedMs: config.now() - startedAt };
      }
      successWithoutRunningInstance = true;
    } else if (TERMINAL_FAILURE_STATUSES.has(deployment.status)) {
      throw new DeployFailure(
        'DEPLOYMENT_FAILED',
        `Railway deployment ${deploymentId} for ${service.name} ended with ${deployment.status}`,
        { deploymentId, deploymentStatus: deployment.status }
      );
    } else if (deployment.status === 'SLEEPING') {
      throw new DeployFailure(
        'DEPLOYMENT_UNEXPECTED_STATUS',
        `Railway deployment ${deploymentId} for ${service.name} entered SLEEPING before SUCCESS`,
        { deploymentId, deploymentStatus: deployment.status }
      );
    } else if (!IN_PROGRESS_STATUSES.has(deployment.status)) {
      throw new DeployFailure(
        'DEPLOYMENT_UNEXPECTED_STATUS',
        `Railway deployment ${deploymentId} for ${service.name} returned unexpected status ${deployment.status}`,
        { deploymentId, deploymentStatus: deployment.status }
      );
    }

    const currentTime = config.now();
    if (currentTime >= deadline) {
      throw new DeployFailure(
        successWithoutRunningInstance ? 'DEPLOYMENT_INSTANCE_NOT_READY' : 'DEPLOYMENT_TIMEOUT',
        successWithoutRunningInstance
          ? `Railway deployment ${deploymentId} for ${service.name} reached SUCCESS without a running instance before timeout`
          : `Railway deployment ${deploymentId} for ${service.name} did not reach SUCCESS before timeout`,
        { deploymentId, deploymentStatus: deployment.status }
      );
    }
    await config.sleep(Math.min(config.intervalMs, deadline - currentTime));
  }
}

function hasRunningInstance(deployment) {
  return Array.isArray(deployment.instances) &&
    deployment.instances.some((instance) => instance?.status === 'RUNNING');
}

function isReadyDeployment(deployment, expectedSha) {
  return (
    deployment.status === 'SUCCESS' &&
    deployment.meta?.commitHash === expectedSha &&
    deployment.deploymentStopped === false &&
    hasRunningInstance(deployment)
  );
}

function isTerminallyInactiveDeployment(deployment) {
  return (
    Array.isArray(deployment.instances) &&
    deployment.instances.every(
      (instance) =>
        typeof instance?.id === 'string' &&
        instance.id.trim() !== '' &&
        TERMINAL_INACTIVE_INSTANCE_STATUSES.has(instance.status)
    ) &&
    !hasRunningInstance(deployment) &&
    ((deployment.status === 'SUCCESS' && deployment.deploymentStopped === true) ||
      TERMINAL_FAILURE_STATUSES.has(deployment.status))
  );
}

function shouldPollRecoveryDeployment(deployment) {
  return (
    IN_PROGRESS_STATUSES.has(deployment.status) ||
    (deployment.status === 'SUCCESS' &&
      deployment.deploymentStopped === false &&
      !hasRunningInstance(deployment))
  );
}

function rememberHandle(handles, serviceName, role, deploymentId) {
  if (typeof deploymentId !== 'string' || deploymentId.trim() === '') return;
  const existing = handles.find(
    (handle) =>
      handle.serviceName === serviceName &&
      handle.role === role &&
      handle.deploymentId === deploymentId
  );
  if (existing) {
    return existing;
  }
  const handle = { serviceName, role, deploymentId };
  handles.push(handle);
  return handle;
}

function rememberObservedNovelDeployment(
  deployment,
  preMutationDeploymentIds,
  observedNovelIds,
  handles,
  service,
  role
) {
  if (typeof deployment?.id !== 'string' || deployment.id.trim() === '') return;
  if (preMutationDeploymentIds.has(deployment.id)) return;
  observedNovelIds.add(deployment.id);
  const handle = rememberHandle(handles, service.name, role, deployment.id);
  if (handle && typeof deployment.status === 'string') handle.status = deployment.status;
}

async function deployService(config, service, state, handles, deadlineAt) {
  const prior = await findSuccessfulDeployment(
    config,
    service,
    `Railway reuse ${service.name}`,
    deadlineAt
  );
  if (prior) {
    state.priorDeploymentId = prior.id;
    state.priorCommitHash = prior.meta?.commitHash;
    rememberHandle(handles, service.name, 'prior', prior.id);
  }
  if (prior?.status === 'SUCCESS' && prior.meta?.commitHash === config.expectedSha) {
    const candidate = await readDeployment(
      config,
      service,
      prior.id,
      `Railway reuse verification ${service.name}`,
      deadlineAt
    );
    if (candidate && isExactActiveDeployment(candidate, config.expectedSha)) {
      await waitForDeployment(config, service, candidate.id, config.expectedSha, deadlineAt);
      state.deploymentId = candidate.id;
      state.reused = true;
      state.status = 'SUCCESS';
      return;
    }
  }

  const reconcile = async (originalFailure) => {
    try {
      const deployment = await reconcileAmbiguousDeployment(
        config,
        service,
        handles,
        preMutationDeploymentIds,
        deadlineAt
      );
      state.reconciliation = {
        reconciliation: 'RESOLVED',
        deploymentId: deployment.id,
        originalError: failureSummary(originalFailure, config.token),
      };
      state.newDeploymentId = deployment.id;
      state.deploymentId = deployment.id;
      state.status = 'SUCCESS';
    } catch (reconciliationError) {
      state.reconciliation = {
        reconciliation: 'UNRESOLVED',
        originalError: failureSummary(originalFailure, config.token),
        error: failureSummary(reconciliationError, config.token),
      };
      throw reconciliationError;
    }
  };

  const preMutationDeploymentIds = await snapshotDeploymentIds(config, service, deadlineAt);

  let payload;
  try {
    payload = await request(config, {
      operation: `Railway deploy ${service.name}`,
      query: DEPLOY_MUTATION,
      variables: {
        serviceId: service.serviceId,
        environmentId: config.environmentId,
        commitSha: config.expectedSha,
      },
      deadlineAt,
    });
  } catch (error) {
    await reconcile(error);
    return;
  }

  const deploymentId = payload.data?.serviceInstanceDeployV2;
  if (typeof deploymentId !== 'string' || deploymentId.trim() === '') {
    await reconcile(
      new DeployFailure(
        'DEPLOYMENT_ID_MISSING',
        `Railway deploy ${service.name} did not return a deployment ID`
      )
    );
    return;
  }
  if (preMutationDeploymentIds.has(deploymentId)) {
    throw new DeployFailure(
      'DEPLOYMENT_ID_NOT_NOVEL',
      `Railway deploy ${service.name} returned a deployment ID from the pre-mutation snapshot`,
      { deploymentId }
    );
  }
  state.newDeploymentId = deploymentId;
  state.deploymentId = deploymentId;
  rememberHandle(handles, service.name, 'new', deploymentId);
  await waitForDeployment(config, service, deploymentId, config.expectedSha, deadlineAt);
  state.status = 'SUCCESS';
}

async function snapshotRollbackState(config, service, priorDeploymentId, expectedCommitHash, deadlineAt) {
  const deploymentIds = await snapshotDeploymentIds(
    config,
    service,
    deadlineAt
  );
  const prior = await readDeployment(
    config,
    service,
    priorDeploymentId,
    `Railway rollback pre-mutation ${service.name}`,
    deadlineAt
  );
  return {
    deploymentIds,
    prior,
    priorReady: isReadyDeployment(prior, expectedCommitHash),
  };
}

async function reconcileNovelRecoveryDeployment(
  config,
  service,
  handles,
  preMutationDeploymentIds,
  expectedCommitHash,
  deadlineAt
) {
  const operation = `Railway recovery resolution ${service.name}`;
  const maxAttempts = Math.max(
    1,
    Math.ceil(Math.max(0, deadlineAt - config.now()) / config.intervalMs) + 1
  );
  const observedNovelIds = new Set();
  let attempts = 0;

  const unresolvedFailure = (message, details = {}) =>
    new DeployFailure('RECOVERY_RECONCILIATION_UNRESOLVED', message, {
      ...details,
      deploymentIds: [...observedNovelIds],
    });

  while (true) {
    if (config.now() >= deadlineAt) {
      throw unresolvedFailure(
        `${operation} did not prove exactly one novel ready recovery deployment before timeout`
      );
    }
    attempts += 1;

    let deployments;
    try {
      deployments = await listRecentDeployments(
        config,
        service,
        operation,
        deadlineAt,
        (deployment) =>
          rememberObservedNovelDeployment(
            deployment,
            preMutationDeploymentIds,
            observedNovelIds,
            handles,
            service,
            'recovery'
          )
      );
    } catch (error) {
      throw unresolvedFailure(`${operation} deployment discovery failed`, {
        reconciliationError: failureSummary(error, config.token),
      });
    }

    const listedNovelDeployments = new Map();
    for (const deployment of deployments) {
      if (typeof deployment?.id !== 'string' || deployment.id.trim() === '') {
        throw unresolvedFailure(`${operation} observed a recovery deployment with an invalid identity`);
      }
      if (preMutationDeploymentIds.has(deployment.id)) continue;
      if (!listedNovelDeployments.has(deployment.id)) {
        listedNovelDeployments.set(deployment.id, deployment);
      }
    }

    if (observedNovelIds.size > 1) {
      throw unresolvedFailure(`${operation} observed multiple novel recovery deployment identities`);
    }
    if (observedNovelIds.size === 0) {
      const currentTime = config.now();
      if (currentTime >= deadlineAt || attempts >= maxAttempts) {
        throw unresolvedFailure(
          `${operation} did not observe a novel recovery deployment before timeout`
        );
      }
      await config.sleep(Math.min(config.intervalMs, deadlineAt - currentTime));
      continue;
    }

    const [recoveryDeploymentId] = observedNovelIds;
    const listed = listedNovelDeployments.get(recoveryDeploymentId);
    if (listed === undefined) {
      throw unresolvedFailure(
        `${operation} novel recovery deployment ${recoveryDeploymentId} disappeared from discovery`
      );
    }
    if (listed.meta?.commitHash !== expectedCommitHash) {
      throw unresolvedFailure(
        `${operation} candidate ${recoveryDeploymentId} does not match the prior commit SHA`
      );
    }

    let readback;
    try {
      readback = await readDeployment(
        config,
        service,
        recoveryDeploymentId,
        `${operation} ${recoveryDeploymentId}`,
        deadlineAt
      );
    } catch (error) {
      throw unresolvedFailure(
        `${operation} candidate ${recoveryDeploymentId} identity could not be verified`,
        {
          deploymentId: recoveryDeploymentId,
          reconciliationError: failureSummary(error, config.token),
        }
      );
    }
    const handle = rememberHandle(handles, service.name, 'recovery', recoveryDeploymentId);
    if (handle) handle.status = readback.status;
    if (isReadyDeployment(readback, expectedCommitHash)) return readback;
    if (!shouldPollRecoveryDeployment(readback)) {
      throw unresolvedFailure(
        `${operation} candidate ${recoveryDeploymentId} did not fully verify`,
        { deploymentId: recoveryDeploymentId, deploymentStatus: readback.status }
      );
    }

    const currentTime = config.now();
    if (currentTime >= deadlineAt || attempts >= maxAttempts) {
      throw unresolvedFailure(
        `${operation} candidate ${recoveryDeploymentId} did not become ready before timeout`,
        { deploymentId: recoveryDeploymentId, deploymentStatus: readback.status }
      );
    }
    await config.sleep(Math.min(config.intervalMs, deadlineAt - currentTime));
  }
}

async function reconcileAmbiguousRollback(
  config,
  service,
  state,
  handles,
  preMutationState,
  expectedCommitHash,
  deadlineAt
) {
  const operation = `Railway rollback resolution ${service.name}`;
  const maxAttempts = Math.max(
    1,
    Math.ceil(Math.max(0, deadlineAt - config.now()) / config.intervalMs) + 1
  );
  const observedNovelIds = new Set();
  let attempts = 0;

  const unresolvedFailure = (message, details = {}) =>
    new DeployFailure('RECOVERY_RECONCILIATION_UNRESOLVED', message, {
      ...details,
      deploymentIds: [...observedNovelIds],
    });

  while (true) {
    if (config.now() >= deadlineAt) {
      throw unresolvedFailure(
        `${operation} did not prove one valid rollback recovery before timeout`
      );
    }
    attempts += 1;

    let deployments;
    try {
      deployments = await listRecentDeployments(
        config,
        service,
        operation,
        deadlineAt,
        (deployment) =>
          rememberObservedNovelDeployment(
            deployment,
            preMutationState.deploymentIds,
            observedNovelIds,
            handles,
            service,
            'recovery'
          )
      );
    } catch (error) {
      throw unresolvedFailure(`${operation} deployment discovery failed`, {
        reconciliationError: failureSummary(error, config.token),
      });
    }

    const listedNovelDeployments = new Map();
    for (const deployment of deployments) {
      if (typeof deployment?.id !== 'string' || deployment.id.trim() === '') {
        throw unresolvedFailure(`${operation} observed a recovery deployment with an invalid identity`);
      }
      if (preMutationState.deploymentIds.has(deployment.id)) continue;
      if (!listedNovelDeployments.has(deployment.id)) {
        listedNovelDeployments.set(deployment.id, deployment);
      }
    }

    if (observedNovelIds.size > 1) {
      throw unresolvedFailure(`${operation} observed multiple novel recovery deployment identities`);
    }

    let recoveryDeployment;
    if (observedNovelIds.size === 1) {
      const [recoveryDeploymentId] = observedNovelIds;
      const listed = listedNovelDeployments.get(recoveryDeploymentId);
      if (listed === undefined) {
        throw unresolvedFailure(
          `${operation} novel recovery deployment ${recoveryDeploymentId} disappeared from discovery`
        );
      }
      if (listed.meta?.commitHash !== expectedCommitHash) {
        throw unresolvedFailure(
          `${operation} candidate ${recoveryDeploymentId} does not match the prior commit SHA`
        );
      }
      let readback;
      try {
        readback = await readDeployment(
          config,
          service,
          recoveryDeploymentId,
          `${operation} ${recoveryDeploymentId}`,
          deadlineAt
        );
      } catch (error) {
        throw unresolvedFailure(
          `${operation} candidate ${recoveryDeploymentId} identity could not be verified`,
          {
            deploymentId: recoveryDeploymentId,
            reconciliationError: failureSummary(error, config.token),
          }
        );
      }
      const handle = rememberHandle(handles, service.name, 'recovery', recoveryDeploymentId);
      if (handle) handle.status = readback.status;
      if (isReadyDeployment(readback, expectedCommitHash)) {
        recoveryDeployment = readback;
      } else if (!shouldPollRecoveryDeployment(readback)) {
        throw unresolvedFailure(
          `${operation} candidate ${recoveryDeploymentId} did not fully verify`,
          { deploymentId: recoveryDeploymentId, deploymentStatus: readback.status }
        );
      }
    } else if (!preMutationState.priorReady) {
      let priorReadback;
      try {
        priorReadback = await readDeployment(
          config,
          service,
          state.priorDeploymentId,
          `${operation} prior ${state.priorDeploymentId}`,
          deadlineAt
        );
      } catch (error) {
        throw unresolvedFailure(`${operation} prior deployment identity could not be verified`, {
          deploymentId: state.priorDeploymentId,
          reconciliationError: failureSummary(error, config.token),
        });
      }
      const handle = rememberHandle(handles, service.name, 'recovery', state.priorDeploymentId);
      if (handle) handle.status = priorReadback.status;
      if (isReadyDeployment(priorReadback, expectedCommitHash)) {
        recoveryDeployment = priorReadback;
      } else if (!shouldPollRecoveryDeployment(priorReadback)) {
        throw unresolvedFailure(
          `${operation} intended prior deployment did not fully verify`,
          { deploymentId: state.priorDeploymentId, deploymentStatus: priorReadback.status }
        );
      }
    } else {
      throw unresolvedFailure(
        `${operation} intended prior deployment was already ready before rollback`
      );
    }

    if (recoveryDeployment) {
      if (typeof state.newDeploymentId !== 'string' || state.newDeploymentId.trim() === '') {
        throw unresolvedFailure(`${operation} has no attempted deployment identity`);
      }
      let attemptedReadback;
      try {
        attemptedReadback = await readDeployment(
          config,
          service,
          state.newDeploymentId,
          `${operation} attempted ${state.newDeploymentId}`,
          deadlineAt
        );
      } catch (error) {
        throw unresolvedFailure(`${operation} attempted deployment identity could not be verified`, {
          deploymentId: state.newDeploymentId,
          reconciliationError: failureSummary(error, config.token),
        });
      }
      const attemptedHandle = rememberHandle(handles, service.name, 'new', state.newDeploymentId);
      if (attemptedHandle) attemptedHandle.status = attemptedReadback.status;
      if (isTerminallyInactiveDeployment(attemptedReadback)) {
        return recoveryDeployment;
      }
      if (!shouldPollRecoveryDeployment(attemptedReadback)) {
        throw unresolvedFailure(
          `${operation} attempted deployment remained active or lacked terminal inactivity proof`,
          { deploymentId: state.newDeploymentId, deploymentStatus: attemptedReadback.status }
        );
      }
    }

    const currentTime = config.now();
    if (currentTime >= deadlineAt || attempts >= maxAttempts) {
      throw unresolvedFailure(
        `${operation} did not prove one valid rollback recovery before timeout`
      );
    }
    await config.sleep(Math.min(config.intervalMs, deadlineAt - currentTime));
  }
}

async function recoverService(config, service, state, handles, deadlineAt) {
  if (!state.priorDeploymentId) {
    throw new DeployFailure(
      'RECOVERY_BLOCKED',
      `Railway recovery for ${service.name} has no prior deployment handle`
    );
  }
  const prior = await readDeployment(
    config,
    service,
    state.priorDeploymentId,
    `Railway recovery prior ${service.name}`,
    deadlineAt
  );
  // No status requirement: Railway marks superseded deployments REMOVED once
  // a newer deployment succeeds; canRollback/canRedeploy are the recovery
  // authority (plan, "Mutation sequence and recovery").
  const priorCommitHash = prior.meta?.commitHash;
  if (typeof priorCommitHash !== 'string' || priorCommitHash.length === 0) {
    throw new DeployFailure(
      'RECOVERY_BLOCKED',
      `Railway recovery prior deployment for ${service.name} has no verifiable commit hash`
    );
  }

  if (prior.canRollback === true) {
    const preMutationState = await snapshotRollbackState(
      config,
      service,
      state.priorDeploymentId,
      priorCommitHash,
      deadlineAt
    );
    const reconcileRollback = async (originalError) => {
      try {
        const resolved = await reconcileAmbiguousRollback(
          config,
          service,
          state,
          handles,
          preMutationState,
          priorCommitHash,
          deadlineAt
        );
        state.recovery = {
          method: 'rollback',
          priorDeploymentId: state.priorDeploymentId,
          recoveryDeploymentId: resolved.id,
          terminalStatus: resolved.status,
          status: 'SUCCESS',
          originalError: failureSummary(originalError, config.token),
        };
        state.status = 'RECOVERED';
      } catch (reconciliationError) {
        state.recovery = {
          status: 'BLOCKED',
          reconciliation: 'UNRESOLVED',
          error: failureSummary(reconciliationError, config.token),
          originalError: failureSummary(originalError, config.token),
          priorDeploymentId: state.priorDeploymentId,
          attemptedDeploymentId: state.newDeploymentId,
        };
        throw reconciliationError;
      }
    };

    let rollback;
    try {
      rollback = await request(config, {
        operation: `Railway rollback ${service.name}`,
        query: ROLLBACK_MUTATION,
        variables: { id: state.priorDeploymentId },
        deadlineAt,
      });
    } catch (error) {
      await reconcileRollback(error);
      return;
    }
    if (rollback.data?.deploymentRollback !== true) {
      await reconcileRollback(
        new DeployFailure('RECOVERY_BLOCKED', `Railway rollback for ${service.name} was not confirmed`)
      );
      return;
    }
    const resolved = await waitForRollbackRecovery(
      config,
      service,
      priorCommitHash,
      handles,
      deadlineAt
    );
    state.recovery = {
      method: 'rollback',
      priorDeploymentId: state.priorDeploymentId,
      recoveryDeploymentId: resolved.id,
      terminalStatus: resolved.status,
      status: 'SUCCESS',
    };
    state.status = 'RECOVERED';
    return;
  }

  if (prior.canRedeploy === true) {
    const preMutationDeploymentIds = await snapshotDeploymentIds(
      config,
      service,
      deadlineAt
    );
    const reconcileRedeploy = async (originalError) => {
      try {
        const resolved = await reconcileNovelRecoveryDeployment(
          config,
          service,
          handles,
          preMutationDeploymentIds,
          priorCommitHash,
          deadlineAt
        );
        state.recovery = {
          method: 'redeploy',
          priorDeploymentId: state.priorDeploymentId,
          recoveryDeploymentId: resolved.id,
          terminalStatus: resolved.status,
          status: 'SUCCESS',
          originalError: failureSummary(originalError, config.token),
        };
        state.status = 'RECOVERED';
      } catch (reconciliationError) {
        state.recovery = {
          status: 'BLOCKED',
          reconciliation: 'UNRESOLVED',
          error: failureSummary(reconciliationError, config.token),
          originalError: failureSummary(originalError, config.token),
          priorDeploymentId: state.priorDeploymentId,
          attemptedDeploymentId: state.newDeploymentId,
        };
        throw reconciliationError;
      }
    };

    let redeploy;
    try {
      redeploy = await request(config, {
        operation: `Railway redeploy ${service.name}`,
        query: REDEPLOY_MUTATION,
        variables: { id: state.priorDeploymentId },
        deadlineAt,
      });
    } catch (error) {
      await reconcileRedeploy(error);
      return;
    }
    const recoveryDeploymentId = redeploy.data?.deploymentRedeploy?.id;
    if (typeof recoveryDeploymentId !== 'string' || recoveryDeploymentId.trim() === '') {
      await reconcileRedeploy(
        new DeployFailure(
          'DEPLOYMENT_ID_MISSING',
          `Railway redeploy for ${service.name} did not return a deployment ID`
        )
      );
      return;
    }
    if (preMutationDeploymentIds.has(recoveryDeploymentId)) {
      throw new DeployFailure(
        'DEPLOYMENT_ID_NOT_NOVEL',
        `Railway redeploy for ${service.name} returned a deployment ID from the pre-mutation snapshot`,
        { deploymentId: recoveryDeploymentId }
      );
    }
    rememberHandle(handles, service.name, 'recovery', recoveryDeploymentId);
    const resolved = await waitForDeployment(
      config,
      service,
      recoveryDeploymentId,
      priorCommitHash,
      deadlineAt
    );
    state.recovery = {
      method: 'redeploy',
      priorDeploymentId: state.priorDeploymentId,
      recoveryDeploymentId,
      terminalStatus: resolved.status,
      status: 'SUCCESS',
    };
    state.status = 'RECOVERED';
    return;
  }

  throw new DeployFailure(
    'RECOVERY_BLOCKED',
    `Railway recovery for ${service.name} has neither rollback nor redeploy capability`
  );
}

function makeServiceState(service) {
  return {
    serviceName: service.name,
    serviceId: service.serviceId,
    deploymentId: null,
    reused: false,
    status: 'PENDING',
    priorDeploymentId: null,
    priorCommitHash: null,
    newDeploymentId: null,
    mainReferenceCheck: null,
    recovery: null,
    reconciliation: null,
  };
}

function outputServices(states, dryRun) {
  return states.map((state) => ({
    serviceName: state.serviceName,
    serviceId: state.serviceId,
    deploymentId: state.deploymentId,
    status: dryRun && (state.status === 'SUCCESS' || state.status === 'RECOVERED') ? 'DRY_RUN' : state.status,
    reused: state.reused,
  }));
}

function makeResult({ overall, expectedSha, dryRun, states, handles, error, recovery }) {
  const result = {
    overall,
    expectedSha: expectedSha ?? null,
    dryRun,
    mainReferenceChecks: states.flatMap((state) =>
      state.mainReferenceCheck ? [{ ...state.mainReferenceCheck }] : []
    ),
    services: outputServices(states, dryRun),
  };
  if (overall === 'BLOCKED') {
    result.deploymentHandles = handles;
    result.error = error;
    const reconciliation = states.find((state) => state.reconciliation)?.reconciliation;
    if (reconciliation) result.reconciliation = reconciliation;
    if (recovery) result.recovery = recovery;
  }
  return result;
}

function failureSummary(error, token) {
  const summary = {
    code: error?.code ?? 'RAILWAY_DEPLOY_BLOCKED',
    message: safeErrorMessage(error, token),
  };
  if (typeof error?.deploymentId === 'string') summary.deploymentId = error.deploymentId;
  if (typeof error?.deploymentStatus === 'string') {
    summary.deploymentStatus = error.deploymentStatus;
  }
  if (error?.reconciliationError && typeof error.reconciliationError === 'object') {
    summary.reconciliationError = error.reconciliationError;
  }
  return summary;
}

export function parseDeployArgs(args) {
  let expectedSha;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') {
      if (dryRun) throw new DeployFailure('INVALID_ARGUMENT', '--dry-run may only be provided once');
      dryRun = true;
      continue;
    }
    if (argument === '--expected-sha') {
      if (expectedSha !== undefined) {
        throw new DeployFailure('INVALID_ARGUMENT', '--expected-sha may only be provided once');
      }
      expectedSha = args[index + 1];
      index += 1;
      continue;
    }
    throw new DeployFailure('INVALID_ARGUMENT', `Unknown argument: ${argument}`);
  }
  return { expectedSha: requireSha(expectedSha), dryRun };
}

async function assertFailedServiceInactive(config, service, state, handles, deadlineAt) {
  if (!state.newDeploymentId) return;
  let readback;
  try {
    readback = await readDeployment(
      config,
      service,
      state.newDeploymentId,
      `Railway failed-service readback ${service.name}`,
      deadlineAt
    );
  } catch (error) {
    throw new DeployFailure(
      'RECOVERY_BLOCKED',
      `Railway recovery withheld because the ${service.name} attempted deployment could not be read back`,
      {
        deploymentId: state.newDeploymentId,
        readbackError: failureSummary(error, config.token),
      }
    );
  }
  const handle = rememberHandle(handles, service.name, 'new', state.newDeploymentId);
  if (handle) handle.status = readback.status;
  if (!isTerminallyInactiveDeployment(readback)) {
    throw new DeployFailure(
      'RECOVERY_BLOCKED',
      `Railway recovery withheld because the ${service.name} attempted deployment is not terminally inactive`,
      { deploymentId: state.newDeploymentId, deploymentStatus: readback.status }
    );
  }
}

function canRecoverPreviousService(failedState, error) {
  if (!failedState) return false;
  if (
    failedState.reconciliation?.reconciliation === 'UNRESOLVED' ||
    failedState.recovery?.reconciliation === 'UNRESOLVED' ||
    error?.code === 'RECONCILIATION_IDENTITY_UNRESOLVED' ||
    error?.code === 'RECOVERY_RECONCILIATION_UNRESOLVED' ||
    error?.code === 'DEPLOYMENT_ID_NOT_NOVEL' ||
    IN_PROGRESS_STATUSES.has(error?.deploymentStatus)
  ) {
    return false;
  }
  if (!failedState.newDeploymentId) return failedState.reconciliation === null;
  if (
    error?.code === 'DEPLOYMENT_STOPPED' &&
    error?.deploymentId === failedState.newDeploymentId
  ) {
    return true;
  }
  return TERMINAL_FAILURE_STATUSES.has(error?.deploymentStatus);
}

export async function deployRailwayWorkers({
  expectedSha,
  environment = process.env,
  dryRun = false,
  transport,
  fetchImpl,
  fetchLiveMainSha: fetchLiveMainShaImpl = fetchLiveMainSha,
  execFileImpl = execFileAsync,
  timeoutMs = DEFAULT_DEPLOYMENT_TIMEOUT_MS,
  intervalMs = DEFAULT_DEPLOYMENT_INTERVAL_MS,
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
} = {}) {
  let config;
  let currentIndex = -1;
  const states = SERVICES.map((service) => makeServiceState({ ...service, serviceId: null }));
  const handles = [];
  let originalFailure;
  let recovery;
  let normalizedExpectedSha;
  let runDeadlineAt;

  try {
    normalizedExpectedSha = requireSha(expectedSha);
    config = buildConfig({
      expectedSha: normalizedExpectedSha,
      environment,
      dryRun,
      transport,
      fetchImpl,
      fetchLiveMainSha: fetchLiveMainShaImpl,
      execFileImpl,
      timeoutMs,
      intervalMs,
      now,
      sleep,
    });
    runDeadlineAt = config.now() + config.timeoutMs;
    for (const [index, service] of serviceEntries(config).entries()) {
      currentIndex = index;
      states[index].serviceId = service.serviceId;
      await checkMainReference(config, service, states[index], runDeadlineAt);
      await preflight(config, service, runDeadlineAt);
      await deployService(config, service, states[index], handles, runDeadlineAt);
    }
    return makeResult({
      overall: 'OK',
      expectedSha: normalizedExpectedSha,
      dryRun,
      states,
      handles,
    });
  } catch (error) {
    originalFailure = error;
    if (currentIndex >= 0) {
      const state = states[currentIndex];
      if (error?.deploymentStatus) state.status = error.deploymentStatus;
      else if (state.status === 'PENDING') state.status = 'BLOCKED';
      if (!state.mainReferenceCheck) {
        state.mainReferenceCheck = { serviceName: state.serviceName, status: 'BLOCKED' };
      }
    }

    const firstState = states[0];
    if (config && currentIndex === 1 && firstState.newDeploymentId && !firstState.reused) {
      const failedState = states[currentIndex];
      if (!canRecoverPreviousService(failedState, originalFailure)) {
        const recoveryError = new DeployFailure(
          'RECOVERY_BLOCKED',
          `Railway recovery for ${firstState.serviceName} withheld because ${failedState.serviceName} mutation remains unresolved`
        );
        recovery = {
          status: 'BLOCKED',
          error: failureSummary(recoveryError, config.token),
          priorDeploymentId: firstState.priorDeploymentId,
          attemptedDeploymentId: firstState.newDeploymentId,
        };
      } else {
        try {
          await assertFailedServiceInactive(
            config,
            serviceEntries(config)[currentIndex],
            failedState,
            handles,
            runDeadlineAt
          );
          await recoverService(
            config,
            serviceEntries(config)[0],
            firstState,
            handles,
            runDeadlineAt
          );
          recovery = firstState.recovery;
        } catch (recoveryError) {
          firstState.status = 'BLOCKED';
          recovery = firstState.recovery ?? {
            status: 'BLOCKED',
            error: failureSummary(recoveryError, config.token),
            priorDeploymentId: firstState.priorDeploymentId,
            attemptedDeploymentId: firstState.newDeploymentId,
          };
          originalFailure = new DeployFailure(
            'RECOVERY_BLOCKED',
            `${safeErrorMessage(originalFailure, config.token)}; recovery failed: ${safeErrorMessage(recoveryError, config.token)}`
          );
        }
      }
    }

    return makeResult({
      overall: 'BLOCKED',
      expectedSha: normalizedExpectedSha ?? expectedSha,
      dryRun,
      states,
      handles,
      error: failureSummary(originalFailure, config?.token),
      recovery,
    });
  }
}

function isDirectEntrypoint(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

function invalidArgumentResult(error) {
  return makeResult({
    overall: 'BLOCKED',
    expectedSha: null,
    dryRun: false,
    states: [],
    handles: [],
    error: failureSummary(error),
  });
}

async function main() {
  let options;
  try {
    options = parseDeployArgs(process.argv.slice(2));
  } catch (error) {
    const result = invalidArgumentResult(error);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = DEPLOYMENT_EXIT_CODES.BLOCKED;
    return;
  }
  const result = await deployRailwayWorkers(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.overall !== 'OK') process.exitCode = DEPLOYMENT_EXIT_CODES.BLOCKED;
}

if (isDirectEntrypoint(import.meta.url)) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify(invalidArgumentResult(error))}\n`);
    process.exitCode = DEPLOYMENT_EXIT_CODES.BLOCKED;
  });
}

export { SERVICES };
