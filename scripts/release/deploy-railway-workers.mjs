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
const IN_PROGRESS_STATUSES = new Set([
  'BUILDING',
  'DEPLOYING',
  'INITIALIZING',
  'NEEDS_APPROVAL',
  'QUEUED',
  'REMOVING',
  'WAITING',
]);

export const DEFAULT_DEPLOYMENT_INTERVAL_MS = 15_000;
export const DEFAULT_DEPLOYMENT_TIMEOUT_MS = 10 * 60_000;
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
const RECENT_DEPLOYMENTS_QUERY = `query railwayRecentDeployments($input: DeploymentListInput!) {
  deployments(input: $input, first: 5) {
    edges { node { id status meta canRedeploy canRollback } }
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

export async function fetchLiveMainSha({ execFileImpl = execFileAsync } = {}) {
  if (typeof execFileImpl !== 'function') {
    throw new Error('execFile must be a function');
  }
  const result = await execFileImpl(
    'git',
    ['ls-remote', 'origin', 'refs/heads/main'],
    { encoding: 'utf8' }
  );
  const stdout = typeof result === 'string' ? result : result?.stdout;
  const match = String(stdout ?? '').trim().match(/^([a-f0-9]{40})\s+refs\/heads\/main$/);
  if (!match) {
    throw new Error('git ls-remote did not return a valid refs/heads/main SHA');
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

async function request(config, { operation, query, variables }) {
  try {
    const payload = await config.transport({
      token: config.token,
      query,
      variables,
      fetchImpl: config.fetchImpl,
      operation,
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
      return { data: { deployments: { edges: [] } } };
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

async function checkMainReference(config, service, state) {
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

async function preflight(config) {
  const scope = await request(config, {
    operation: 'Railway scope',
    query: PROJECT_SCOPE_QUERY,
    variables: {},
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
    });
    const status = autodeploy.data?.serviceInstanceAutoDeployStatus;
    if (status?.enabled !== false) {
      throw new DeployFailure(
        'AUTODEPLOY_ENABLED',
        `Railway autodeploy is not disabled for ${service.name}`
      );
    }
  }
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

async function findSuccessfulDeployment(config, service, operation) {
  const payload = await request(config, {
    operation,
    query: DEPLOYMENTS_QUERY,
    variables: { input: deploymentInput(config, service) },
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

async function reconcileAmbiguousDeployment(config, service, handles) {
  const operation = `Railway reconcile deploy ${service.name}`;
  try {
    const payload = await request(config, {
      operation,
      query: RECENT_DEPLOYMENTS_QUERY,
      variables: { input: recentDeploymentInput(config, service) },
    });
    for (const deployment of deploymentNodes(payload, operation)) {
      if (deployment.meta?.commitHash === config.expectedSha) {
        rememberHandle(handles, service.name, 'unconfirmed', deployment.id);
      }
    }
  } catch {
    // Preserve original ambiguous mutation failure; reconciliation is best-effort.
  }
}

async function readDeployment(config, service, deploymentId, operation) {
  const payload = await request(config, {
    operation,
    query: DEPLOYMENT_QUERY,
    variables: { id: deploymentId },
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

async function waitForDeployment(config, service, deploymentId, expectedSha) {
  const startedAt = config.now();
  const deadline = startedAt + config.timeoutMs;
  let attempts = 0;

  while (true) {
    attempts += 1;
    const deployment = await readDeployment(
      config,
      service,
      deploymentId,
      `Railway deployment ${service.name}`
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
      return { ...deployment, attempts, elapsedMs: config.now() - startedAt };
    }
    if (TERMINAL_FAILURE_STATUSES.has(deployment.status)) {
      throw new DeployFailure(
        'DEPLOYMENT_FAILED',
        `Railway deployment ${deploymentId} for ${service.name} ended with ${deployment.status}`,
        { deploymentId, deploymentStatus: deployment.status }
      );
    }
    if (deployment.status === 'SLEEPING') {
      throw new DeployFailure(
        'DEPLOYMENT_UNEXPECTED_STATUS',
        `Railway deployment ${deploymentId} for ${service.name} entered SLEEPING before SUCCESS`,
        { deploymentId, deploymentStatus: deployment.status }
      );
    }
    if (!IN_PROGRESS_STATUSES.has(deployment.status)) {
      throw new DeployFailure(
        'DEPLOYMENT_UNEXPECTED_STATUS',
        `Railway deployment ${deploymentId} for ${service.name} returned unexpected status ${deployment.status}`,
        { deploymentId, deploymentStatus: deployment.status }
      );
    }

    const currentTime = config.now();
    if (currentTime >= deadline) {
      throw new DeployFailure(
        'DEPLOYMENT_TIMEOUT',
        `Railway deployment ${deploymentId} for ${service.name} did not reach SUCCESS before timeout`,
        { deploymentId, deploymentStatus: deployment.status }
      );
    }
    await config.sleep(Math.min(config.intervalMs, deadline - currentTime));
  }
}

function rememberHandle(handles, serviceName, role, deploymentId) {
  if (typeof deploymentId !== 'string' || deploymentId.trim() === '') return;
  if (handles.some((handle) => handle.serviceName === serviceName && handle.role === role && handle.deploymentId === deploymentId)) {
    return;
  }
  handles.push({ serviceName, role, deploymentId });
}

async function deployService(config, service, state, handles) {
  const prior = await findSuccessfulDeployment(
    config,
    service,
    `Railway reuse ${service.name}`
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
      `Railway reuse verification ${service.name}`
    );
    if (candidate && isExactActiveDeployment(candidate, config.expectedSha)) {
      state.deploymentId = candidate.id;
      state.reused = true;
      state.status = 'SUCCESS';
      return;
    }
  }

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
    });
  } catch (error) {
    await reconcileAmbiguousDeployment(config, service, handles);
    throw error;
  }
  const deploymentId = payload.data?.serviceInstanceDeployV2;
  if (typeof deploymentId !== 'string' || deploymentId.trim() === '') {
    await reconcileAmbiguousDeployment(config, service, handles);
    throw new DeployFailure('DEPLOYMENT_ID_MISSING', `Railway deploy ${service.name} did not return a deployment ID`);
  }
  state.newDeploymentId = deploymentId;
  state.deploymentId = deploymentId;
  rememberHandle(handles, service.name, 'new', deploymentId);
  await waitForDeployment(config, service, deploymentId, config.expectedSha);
  state.status = 'SUCCESS';
}

async function recoverService(config, service, state, handles) {
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
    `Railway recovery prior ${service.name}`
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
    const rollback = await request(config, {
      operation: `Railway rollback ${service.name}`,
      query: ROLLBACK_MUTATION,
      variables: { id: state.priorDeploymentId },
    });
    if (rollback.data?.deploymentRollback !== true) {
      throw new DeployFailure('RECOVERY_BLOCKED', `Railway rollback for ${service.name} was not confirmed`);
    }
    const resolved = await findSuccessfulDeployment(
      config,
      service,
      `Railway rollback resolution ${service.name}`
    );
    if (!resolved || resolved.meta?.commitHash !== priorCommitHash) {
      throw new DeployFailure(
        'RECOVERY_BLOCKED',
        `Railway rollback for ${service.name} did not resolve the prior commit`
      );
    }
    rememberHandle(handles, service.name, 'recovery', resolved.id);
    state.recovery = {
      method: 'rollback',
      priorDeploymentId: state.priorDeploymentId,
      recoveryDeploymentId: resolved.id,
      status: 'SUCCESS',
    };
    state.status = 'RECOVERED';
    return;
  }

  if (prior.canRedeploy === true) {
    const redeploy = await request(config, {
      operation: `Railway redeploy ${service.name}`,
      query: REDEPLOY_MUTATION,
      variables: { id: state.priorDeploymentId },
    });
    const recoveryDeploymentId = redeploy.data?.deploymentRedeploy?.id;
    if (typeof recoveryDeploymentId !== 'string' || recoveryDeploymentId.trim() === '') {
      throw new DeployFailure('RECOVERY_BLOCKED', `Railway redeploy for ${service.name} did not return a deployment ID`);
    }
    rememberHandle(handles, service.name, 'recovery', recoveryDeploymentId);
    await waitForDeployment(config, service, recoveryDeploymentId, priorCommitHash);
    state.recovery = {
      method: 'redeploy',
      priorDeploymentId: state.priorDeploymentId,
      recoveryDeploymentId,
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
    if (recovery) result.recovery = recovery;
  }
  return result;
}

function failureSummary(error, token) {
  return {
    code: error?.code ?? 'RAILWAY_DEPLOY_BLOCKED',
    message: safeErrorMessage(error, token),
  };
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
    for (const [index, service] of serviceEntries(config).entries()) {
      currentIndex = index;
      states[index].serviceId = service.serviceId;
      await checkMainReference(config, service, states[index]);
      await preflight(config);
      await deployService(config, service, states[index], handles);
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
      try {
        await recoverService(config, serviceEntries(config)[0], firstState, handles);
        recovery = firstState.recovery;
      } catch (recoveryError) {
        firstState.status = 'BLOCKED';
        recovery = {
          status: 'BLOCKED',
          error: failureSummary(recoveryError, config.token),
          priorDeploymentId: firstState.priorDeploymentId,
          attemptedDeploymentId: firstState.newDeploymentId,
        };
        originalFailure = new DeployFailure(
          'RECOVERY_BLOCKED',
          `${safeErrorMessage(error, config.token)}; recovery failed: ${safeErrorMessage(recoveryError, config.token)}`
        );
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
