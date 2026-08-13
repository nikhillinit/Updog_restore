import { createHash } from 'node:crypto';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { redactSecretShapedValues } from './verify-exact-sha-checks.mjs';
import {
  assertVercelCandidateHost,
  normalizeRailwayResponse,
  verifyRailwayTopology,
  verifyVercelEvidence,
} from './provider-evidence-contract.mjs';

const SHA = /^[a-f0-9]{40}$/;
// G4 operator runs can start 40+ minutes after dispatch-time probe capture;
// 120 minutes covers one full run while still rejecting stale evidence.
const DEFAULT_MAX_PROBE_AGE_MINUTES = 120;
const MAX_PROBE_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_CROSS_PROBE_SKEW_MS = 15 * 60 * 1000;

export { assertVercelCandidateHost, normalizeRailwayResponse, verifyRailwayTopology };

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
  protectedTopology,
  privateProof,
  maxProbeAgeMinutes = DEFAULT_MAX_PROBE_AGE_MINUTES,
  now = Date.now(),
}) {
  const sha = requireSha(expectedSha);
  if (mode !== 'workflow' && mode !== 'operator') fail('mode must be workflow or operator');
  const vercelSummary = verifyVercelEvidence(
    vercel,
    vercel?.expectedProjectId,
    { kind: 'staged_candidate', expectedSha: sha }
  );
  const railwaySummary = verifyRailwayTopology(railway, sha, protectedTopology);
  const controlPlane = {
    vercel: { projectId: vercelSummary.projectId, deploymentId: vercelSummary.deploymentId },
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
  const railway = normalizeRailwayResponse(railwayInput);
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
    protectedTopology: {
      projectId: args['expected-railway-project-id'],
      environmentId: args['expected-railway-environment-id'],
      services: {
        'fund-scenario-calc': args['expected-fund-scenario-service-id'],
        'capital-call-status': args['expected-capital-call-service-id'],
      },
    },
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
