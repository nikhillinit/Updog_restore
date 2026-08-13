import console from 'node:console';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  normalizeRailwayResponse,
  verifyRailwayTopology,
} from './provider-evidence-contract.mjs';

const SHA = /^[a-f0-9]{40}$/;
const RAILWAY_GRAPHQL_URL = 'https://backboard.railway.com/graphql/v2';
const PROJECT_SCOPE_QUERY = 'query { projectToken { project { id } environment { id } } }';
const SERVICE_INSTANCES_QUERY =
  'query($projectId: String!, $environmentId: String!) { environment(id: $environmentId, projectId: $projectId) { serviceInstances(first: 100) { edges { node { serviceId serviceName numReplicas latestDeployment { id status meta deploymentStopped instances { id status } } activeDeployments { id status meta deploymentStopped instances { id status } } domains { serviceDomains { id } customDomains { id } } } } pageInfo { hasNextPage endCursor } } }';

export const DEFAULT_INTERVAL_MS = 15_000;
export const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const MAX_INTERVAL_MS = 60_000;
const MAX_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;

export const WAIT_EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  INVALID_ARGUMENT: 1,
  TIMEOUT: 2,
  SKEW: 3,
});

export class RailwayWorkersWaitError extends Error {
  constructor(kind, message, { attempts = 0, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'RailwayWorkersWaitError';
    this.kind = kind;
    this.code = kind === 'skew' ? 'RAILWAY_WORKER_SKEW' : 'RAILWAY_WORKER_TIMEOUT';
    this.exitCode = kind === 'skew' ? WAIT_EXIT_CODES.SKEW : WAIT_EXIT_CODES.TIMEOUT;
    this.attempts = attempts;
  }
}

function requireExpectedSha(value) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new Error('expected SHA must be a lowercase 40-character SHA');
  }
  return value;
}

function parseDuration(value, label, maximum) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`${label} must be a positive integer in milliseconds`);
  }
  const duration = Number(value);
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > maximum) {
    throw new Error(`${label} must be between 1 and ${maximum} milliseconds`);
  }
  return duration;
}

function requireTopologyValue(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value;
}

function assertNoToken(value, token) {
  if (JSON.stringify(value).includes(token)) {
    throw new Error('Railway evidence contained a protected value');
  }
}

export function parseWaitArgs(args) {
  let expectedSha;
  let projectId;
  let environmentId;
  let fundScenarioCalcServiceId;
  let capitalCallStatusServiceId;
  let intervalMs = DEFAULT_INTERVAL_MS;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error('arguments must be --name value pairs');
    }
    index += 1;
    if (flag === '--expected-sha') {
      expectedSha = value;
    } else if (flag === '--expected-railway-project-id') {
      projectId = value;
    } else if (flag === '--expected-railway-environment-id') {
      environmentId = value;
    } else if (flag === '--expected-fund-scenario-service-id') {
      fundScenarioCalcServiceId = value;
    } else if (flag === '--expected-capital-call-service-id') {
      capitalCallStatusServiceId = value;
    } else if (flag === '--interval-ms') {
      intervalMs = parseDuration(value, '--interval-ms', MAX_INTERVAL_MS);
    } else if (flag === '--timeout-ms') {
      timeoutMs = parseDuration(value, '--timeout-ms', MAX_TIMEOUT_MS);
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return {
    expectedSha: requireExpectedSha(expectedSha),
    protectedTopology: {
      projectId: requireTopologyValue(projectId, '--expected-railway-project-id'),
      environmentId: requireTopologyValue(environmentId, '--expected-railway-environment-id'),
      services: {
        'fund-scenario-calc': requireTopologyValue(
          fundScenarioCalcServiceId,
          '--expected-fund-scenario-service-id'
        ),
        'capital-call-status': requireTopologyValue(
          capitalCallStatusServiceId,
          '--expected-capital-call-service-id'
        ),
      },
    },
    intervalMs,
    timeoutMs,
  };
}

function isSuccessfulCommitSkew(railway, expectedSha, protectedTopology) {
  if (!railway || !Array.isArray(railway.services)) return false;
  const protectedNames = new Set(Object.keys(protectedTopology?.services ?? {}));
  const protectedIds = new Set(Object.values(protectedTopology?.services ?? {}));
  return railway.services.some((service) => {
    if (!protectedNames.has(service?.serviceName) && !protectedIds.has(service?.serviceId)) {
      return false;
    }
    const deployments = [
      service?.latestDeployment,
      ...(Array.isArray(service?.activeDeployments) ? service.activeDeployments : []),
    ];
    return deployments.some(
      (deployment) =>
        deployment?.status === 'SUCCESS' &&
        typeof deployment?.meta?.commitHash === 'string' &&
        deployment.meta.commitHash !== expectedSha
    );
  });
}

export function evaluateRailwayEvidence(evidence, expectedSha, protectedTopology) {
  let railway;
  try {
    railway = normalizeRailwayResponse(evidence);
  } catch (error) {
    return { status: 'invalid', railway: null, skew: false, error };
  }

  const skew = isSuccessfulCommitSkew(railway, expectedSha, protectedTopology);
  try {
    return {
      status: 'ready',
      railway,
      skew: false,
      topology: verifyRailwayTopology(railway, expectedSha, protectedTopology),
    };
  } catch (error) {
    return { status: 'pending', railway, skew, error };
  }
}

export async function pollRailwayWorkers({
  expectedSha,
  protectedTopology,
  fetchEvidence,
  intervalMs = DEFAULT_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
}) {
  const sha = requireExpectedSha(expectedSha);
  if (typeof fetchEvidence !== 'function') {
    throw new Error('fetchEvidence must be a function');
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new Error('intervalMs must be a positive integer');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('timeoutMs must be a positive integer');
  }

  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let observedSkew = false;
  let lastError;

  while (true) {
    attempts += 1;
    try {
      const evaluation = evaluateRailwayEvidence(
        await fetchEvidence(),
        sha,
        protectedTopology
      );
      observedSkew ||= evaluation.skew;
      lastError = evaluation.error;
      if (evaluation.status === 'ready') {
        return { ...evaluation, attempts, elapsedMs: now() - startedAt };
      }
    } catch {
      lastError = new Error('Railway evidence fetch failed');
    }

    const currentTime = now();
    if (currentTime >= deadline) break;
    await sleep(Math.min(intervalMs, deadline - currentTime));
  }

  if (observedSkew) {
    throw new RailwayWorkersWaitError(
      'skew',
      `Railway worker deployment skew detected before timeout for expected SHA ${sha}`,
      { attempts, cause: lastError }
    );
  }
  throw new RailwayWorkersWaitError(
    'timeout',
    `Railway worker topology did not match expected SHA ${sha} before timeout`,
    { attempts, cause: lastError }
  );
}

async function postGraphql(fetchImpl, token, payload) {
  let response;
  try {
    response = await fetchImpl(RAILWAY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Project-Access-Token': token,
      },
      body: JSON.stringify(payload),
    });
    if (!response?.ok) throw new Error('request failed');
    return await response.json();
  } catch {
    throw new Error('Railway GraphQL request failed');
  }
}

export async function fetchRailwayEvidence({ token, fetchImpl = globalThis.fetch } = {}) {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('RAILWAY_TOKEN is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is unavailable');
  }

  const scope = await postGraphql(fetchImpl, token, { query: PROJECT_SCOPE_QUERY });
  const projectToken = scope.data?.projectToken;
  if (
    scope.errors?.length ||
    !projectToken?.project?.id ||
    !projectToken?.environment?.id
  ) {
    throw new Error('Railway project or environment scope is unavailable');
  }

  const control = await postGraphql(fetchImpl, token, {
    query: SERVICE_INSTANCES_QUERY,
    variables: {
      projectId: projectToken.project.id,
      environmentId: projectToken.environment.id,
    },
  });
  const evidence = normalizeRailwayResponse({
    data: {
      projectId: projectToken.project.id,
      environmentId: projectToken.environment.id,
      environment: control.data?.environment,
    },
    errors: control.errors,
  });
  assertNoToken(evidence, token);
  return evidence;
}

function isDirectEntrypoint(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

async function main() {
  const options = parseWaitArgs(process.argv.slice(2));
  const token = process.env.RAILWAY_TOKEN;
  const result = await pollRailwayWorkers({
    ...options,
    fetchEvidence: () => fetchRailwayEvidence({ token }),
  });
  console.log(
    JSON.stringify({
      status: 'ready',
      expectedSha: options.expectedSha,
      attempts: result.attempts,
      elapsedMs: result.elapsedMs,
      topology: result.topology,
    })
  );
}

if (isDirectEntrypoint(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Railway worker verification failed');
    process.exitCode =
      error instanceof RailwayWorkersWaitError
        ? error.exitCode
        : WAIT_EXIT_CODES.INVALID_ARGUMENT;
  });
}
