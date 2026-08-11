import { createHash } from 'node:crypto';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { redactSecretShapedValues } from './verify-exact-sha-checks.mjs';

const SHA = /^[a-f0-9]{40}$/;
const WORKERS = Object.freeze(['fund-scenario-calc', 'capital-call-status']);
// G4 operator runs can start 40+ minutes after dispatch-time probe capture;
// 120 minutes covers one full run while still rejecting stale evidence.
const DEFAULT_MAX_PROBE_AGE_MINUTES = 120;
const MAX_PROBE_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_CROSS_PROBE_SKEW_MS = 15 * 60 * 1000;
const VERSION_KEYS = Object.freeze([
  'arch',
  'commit',
  'environment',
  'nodeVersion',
  'platform',
  'timestamp',
  'version',
]);

function fail(message) {
  throw new Error(`Provider identity failed: ${message}`);
}

function requireSha(value) {
  if (typeof value !== 'string' || !SHA.test(value)) fail('expected SHA must be a lowercase 40-character SHA');
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} is required`);
  return value;
}

function requireProbeAgeMinutes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail('maximum probe age must be a positive number of minutes');
  }
  return value;
}

function probeTimestamp(probe, label) {
  if (!probe || typeof probe.timestamp !== 'string' || probe.timestamp.trim() === '') {
    fail(`${label} probe timestamp is required`);
  }
  const timestamp = Date.parse(probe.timestamp);
  if (!Number.isFinite(timestamp)) fail(`${label} probe timestamp is invalid`);
  return timestamp;
}

function verifyProbeFreshness(probes, maxProbeAgeMinutes, now = Date.now()) {
  const maxAgeMinutes = requireProbeAgeMinutes(
    maxProbeAgeMinutes ?? DEFAULT_MAX_PROBE_AGE_MINUTES
  );
  const maxAgeMs = maxAgeMinutes * 60 * 1000;
  if (!Number.isFinite(maxAgeMs)) fail('maximum probe age is out of range');
  if (typeof now !== 'number' || !Number.isFinite(now)) fail('operator clock is invalid');
  const timestamps = probes.map(([label, probe]) => [label, probeTimestamp(probe, label)]);
  for (const [label, timestamp] of timestamps) {
    if (timestamp > now + MAX_PROBE_FUTURE_SKEW_MS) {
      fail(`${label} probe timestamp is in the future`);
    }
    if (now - timestamp > maxAgeMs) {
      fail(`${label} probe is older than ${maxAgeMinutes} minutes`);
    }
  }
  const values = timestamps.map(([, timestamp]) => timestamp);
  if (Math.max(...values) - Math.min(...values) > MAX_CROSS_PROBE_SKEW_MS) {
    fail('worker probes were captured more than 15 minutes apart');
  }
}

export function assertVercelCandidateHost(url) {
  const host = String(url ?? '').toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(host)) {
    fail('Vercel candidate host is invalid');
  }
  return host;
}

function verifyVercel(version, deployment, expectedProjectId, expectedSha) {
  if (!deployment || deployment.readyState !== 'READY') fail('Vercel deployment is not READY');
  requiredText(expectedProjectId, 'Vercel expected project ID');
  requiredText(deployment.projectId, 'Vercel deployment project ID');
  if (deployment.projectId !== expectedProjectId) fail('Vercel project does not match expected project');
  if (deployment.target !== 'production') fail('Vercel staged candidate must have production target');
  if (!Array.isArray(deployment.aliases) || deployment.aliases.length !== 0) fail('Vercel staged candidate must have no production alias');
  if (deployment.meta?.githubCommitRef !== 'main' || deployment.meta?.githubCommitSha !== expectedSha) {
    fail('Vercel deployment commit does not match expected SHA');
  }
  requiredText(deployment.id, 'Vercel deployment ID');
  assertVercelCandidateHost(deployment.url);
  if (!version || typeof version !== 'object') fail('Vercel version response is missing');
  if (JSON.stringify(Object.keys(version).sort()) !== JSON.stringify([...VERSION_KEYS].sort())) {
    fail('Vercel version response does not have exactly seven public fields');
  }
  if (version.commit !== expectedSha || version.environment !== 'production') {
    fail('Vercel version response does not match the production candidate');
  }
}

export function normalizeRailwayResponse(response) {
  if (!response || !response.data || (Array.isArray(response.errors) && response.errors.length > 0)) {
    fail('Railway GraphQL response contains errors');
  }
  const environment = response.data.environment;
  if (!environment || !Array.isArray(environment.serviceInstances?.edges)) fail('Railway environment response is malformed');
  if (environment.serviceInstances.pageInfo?.hasNextPage !== false) fail('Railway service pagination is truncated');
  return {
    projectId: requiredText(response.data.projectId, 'Railway project ID'),
    environmentId: requiredText(response.data.environmentId, 'Railway environment ID'),
    services: environment.serviceInstances.edges.map(({ node }) => ({
      serviceId: node?.serviceId,
      serviceName: node?.serviceName,
      numReplicas: node?.numReplicas,
      domains: [
        ...(node?.domains?.serviceDomains ?? []),
        ...(node?.domains?.customDomains ?? []),
      ],
      latestDeployment: node?.latestDeployment,
      activeDeployments: node?.activeDeployments,
    })),
  };
}

function verifyDeployment(deployment, expectedSha, label) {
  requiredText(deployment?.id, `${label} deployment ID`);
  if (deployment.status !== 'SUCCESS' || deployment.deploymentStopped !== false) {
    fail(`${label} deployment is not successful and running`);
  }
  if (deployment.meta?.commitHash !== expectedSha) fail(`${label} deployment commit does not match expected SHA`);
  if (!Array.isArray(deployment.instances) || deployment.instances.length !== 1 || deployment.instances[0]?.status !== 'RUNNING') {
    fail(`${label} deployment does not have exactly one RUNNING instance`);
  }
}

export function verifyRailwayTopology(railway, expectedSha) {
  requiredText(railway?.projectId, 'Railway project ID');
  requiredText(railway?.environmentId, 'Railway environment ID');
  const services = railway?.services;
  if (!Array.isArray(services) || services.length !== 2) fail('Railway must contain exactly two worker services');
  if (JSON.stringify(services.map((service) => service.serviceName).sort()) !== JSON.stringify([...WORKERS].sort())) {
    fail('Railway worker service names do not match');
  }
  const deploymentIds = {};
  const serviceSummary = [];
  for (const service of services) {
    requiredText(service.serviceId, `Railway ${service.serviceName} service ID`);
    if (service.numReplicas !== 1) fail(`Railway ${service.serviceName} must have exactly one replica`);
    if (!Array.isArray(service.domains) || service.domains.length !== 0) fail(`Railway ${service.serviceName} must have zero domains`);
    const active = service.activeDeployments;
    if (!Array.isArray(active) || active.length !== 1) fail(`Railway ${service.serviceName} must have exactly one active deployment`);
    verifyDeployment(service.latestDeployment, expectedSha, `Railway ${service.serviceName} latest`);
    verifyDeployment(active[0], expectedSha, `Railway ${service.serviceName} active`);
    if (service.latestDeployment.id !== active[0].id) fail(`Railway ${service.serviceName} latest deployment does not match active deployment`);
    deploymentIds[service.serviceName] = active[0].id;
    serviceSummary.push({
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      deploymentId: active[0].id,
    });
  }
  return { deploymentIds, services: serviceSummary };
}

function verifyHealth(workerType, health, expectedSha, expectedDeploymentId) {
  if (!health || health.status !== 'healthy' || health.workerType !== workerType || health.commit !== expectedSha) {
    fail(`${workerType} health identity does not match`);
  }
  requiredText(health.deploymentId, `${workerType} health deployment ID`);
  if (health.deploymentId !== expectedDeploymentId) fail(`${workerType} health deployment does not match Railway active deployment`);
  if (!Array.isArray(health.workers) || health.workers.length !== 1) fail(`${workerType} health must contain exactly one worker`);
  const worker = health.workers[0];
  if (worker.name !== workerType || worker.status !== 'healthy' || worker.isRunning !== true) {
    fail(`${workerType} worker is not healthy and running`);
  }
  return health.deploymentId;
}

function verifyReadiness(workerType, ready, expectedSha, expectedDeploymentId) {
  if (
    !ready ||
    ready.status !== 'ready' ||
    ready.workerType !== workerType ||
    ready.commit !== expectedSha ||
    ready.deploymentId !== expectedDeploymentId
  ) {
    fail(`${workerType} readiness identity does not match`);
  }
}

export function verifyWorkerPrivateProof({
  expectedSha,
  fundHealth,
  fundReady,
  capitalHealth,
  capitalReady,
  deploymentIds,
  endpointClaim = false,
  maxProbeAgeMinutes = DEFAULT_MAX_PROBE_AGE_MINUTES,
  now = Date.now(),
}) {
  const sha = requireSha(expectedSha);
  if (endpointClaim) fail('workflow mode cannot claim private endpoint proof');
  verifyProbeFreshness(
    [
      ['fund health', fundHealth],
      ['fund ready', fundReady],
      ['capital health', capitalHealth],
      ['capital ready', capitalReady],
    ],
    maxProbeAgeMinutes,
    now
  );
  const identities = [
    ['fund-scenario-calc', fundHealth, fundReady],
    ['capital-call-status', capitalHealth, capitalReady],
  ].map(([workerType, health, ready]) => {
    const deploymentId = verifyHealth(workerType, health, sha, deploymentIds?.[workerType]);
    verifyReadiness(workerType, ready, sha, deploymentId);
    return { workerType, deploymentId };
  });
  const reference = `sha256:${createHash('sha256').update(stableJson(redactSecretShapedValues({
    expectedSha: sha,
    fundHealth,
    fundReady,
    capitalHealth,
    capitalReady,
  }))).digest('hex')}`;
  return { reference, identities };
}

export function verifyProviderIdentity({
  mode,
  expectedSha,
  vercel,
  railway,
  privateProof,
  maxProbeAgeMinutes = DEFAULT_MAX_PROBE_AGE_MINUTES,
  now = Date.now(),
}) {
  const sha = requireSha(expectedSha);
  if (mode !== 'workflow' && mode !== 'operator') fail('mode must be workflow or operator');
  verifyVercel(vercel?.version, vercel?.deployment, vercel?.expectedProjectId, sha);
  const railwaySummary = verifyRailwayTopology(railway, sha);
  const controlPlane = {
    vercel: { projectId: vercel.deployment.projectId, deploymentId: vercel.deployment.id },
    railway: {
      projectId: railway.projectId,
      environmentId: railway.environmentId,
      services: railwaySummary.services,
    },
  };
  if (mode === 'workflow') {
    if (privateProof?.endpointClaim) fail('workflow mode cannot claim private endpoint proof');
    return { mode, expectedSha: sha, controlPlane, privateProof: null };
  }
  const workerProof = verifyWorkerPrivateProof({
    expectedSha: sha,
    deploymentIds: railwaySummary.deploymentIds,
    ...privateProof,
    maxProbeAgeMinutes,
    now,
  });
  return { mode, expectedSha: sha, controlPlane, privateProof: workerProof };
}

function parseArguments(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) fail('arguments must be --name value pairs');
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

async function jsonFile(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    fail(`${label} JSON file is unreadable`);
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const mode = args.mode;
  const expectedSha = args['expected-sha'];
  const maxProbeAgeMinutes = args['max-probe-age-minutes'] === undefined
    ? DEFAULT_MAX_PROBE_AGE_MINUTES
    : Number(args['max-probe-age-minutes']);
  const vercel = await jsonFile(args.vercel, 'Vercel');
  const railwayInput = await jsonFile(args.railway, 'Railway');
  const railway = railwayInput?.data ? normalizeRailwayResponse(railwayInput) : railwayInput;
  const privateProof = mode === 'operator'
    ? {
        fundHealth: await jsonFile(args['fund-health'], 'fund health'),
        fundReady: await jsonFile(args['fund-ready'], 'fund ready'),
        capitalHealth: await jsonFile(args['capital-health'], 'capital health'),
        capitalReady: await jsonFile(args['capital-ready'], 'capital ready'),
      }
    : { endpointClaim: false };
  const result = verifyProviderIdentity({
    mode,
    expectedSha,
    vercel,
    railway,
    privateProof,
    maxProbeAgeMinutes,
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Provider identity failed');
    process.exitCode = 1;
  });
}
