import console from 'node:console';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  normalizeRailwayResponse,
  verifyRailwayTopology,
  verifyVercelEvidence,
} from './provider-evidence-contract.mjs';

const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const PR_NUMBER = /^[1-9][0-9]{0,8}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SECRET_KEY = /(?:api[_-]?key|authorization|cookie|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE = /(?:github_pat_|gh[pousr]_|sk-|rk-|pk-|(?:bearer|basic)\s+|(?:postgres|postgresql|mysql|mongodb|redis):\/\/|[?&](?:api[_-]?key|password|secret|token)=)/i;
const WORKER_NAMES = Object.freeze(['fund-scenario-calc', 'capital-call-status']);
const VERCEL_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/;
const GITHUB_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RAILWAY_API_URL = 'https://backboard.railway.com/graphql/v2';
const PROVIDER_TIMEOUT_MS = 15_000;
export const DEFAULT_GIT_FETCH_TIMEOUT_MS = 2 * 60_000;
const execFileAsync = promisify(execFile);

function fail(message) {
  throw new Error(`Release recovery context capture failed: ${message}`);
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid`);
  return value;
}

function exactKeys(value, keys, label) {
  const object = plainObject(value, label);
  const expected = new Set(keys);
  const actual = Object.keys(object);
  if (actual.length !== keys.length || actual.some((key) => !expected.has(key))) {
    fail(`${label} has unknown or missing fields`);
  }
  for (const key of actual) {
    if (SECRET_KEY.test(key)) fail(`${label} contains a secret-shaped key`);
  }
  return object;
}

function safeText(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    fail(`${label} is invalid`);
  }
  if (SECRET_VALUE.test(value)) fail(`${label} contains a protected value`);
  return value;
}

function sha(value, label) {
  const text = safeText(value, label);
  if (!SHA.test(text)) fail(`${label} is invalid`);
  return text;
}

function sha256(value, label) {
  const text = safeText(value, label);
  if (!SHA256.test(text)) fail(`${label} is invalid`);
  return text;
}

function identifier(value, label) {
  const text = safeText(value, label);
  if (!IDENTIFIER.test(text)) fail(`${label} is invalid`);
  return text;
}

function hostname(value, label) {
  const text = safeText(value, label);
  if (
    text.length > 253 ||
    text !== text.toLowerCase() ||
    text.includes('://') ||
    text.includes('/') ||
    text.includes('?') ||
    text.includes('#') ||
    text.includes(':') ||
    text.includes('@') ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(text) ||
    text.split('.').some((segment) => segment.length > 63)
  ) {
    fail(`${label} is invalid`);
  }
  return text;
}

function capturedAt(value) {
  const text = safeText(value, 'capture timestamp');
  const time = new Date(text);
  if (!Number.isFinite(time.getTime()) || time.toISOString() !== text) {
    fail('capture timestamp is invalid');
  }
  return text;
}

function runAttempt(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('GitHub run attempt is invalid');
  return value;
}

function runId(value) {
  const text = safeText(value, 'GitHub run ID');
  if (!POSITIVE_DECIMAL.test(text)) fail('GitHub run ID is invalid');
  return text;
}

function pullRequestNumber(value, label) {
  const text = safeText(String(value), label);
  if (!PR_NUMBER.test(text)) fail(`${label} is invalid`);
  return Number(text);
}

function planPath(value) {
  const text = safeText(value, 'plan path');
  if (!/^[A-Za-z0-9._][A-Za-z0-9._/-]{0,511}$/.test(text) || text.split('/').includes('..')) {
    fail('plan path is invalid');
  }
  return text;
}

function expectedIdentity(value) {
  const identity = exactKeys(
    value,
    [
      'vercelProjectId',
      'vercelHostname',
      'railwayProjectId',
      'railwayEnvironmentId',
      'railwayServices',
    ],
    'expected provider identity'
  );
  const services = exactKeys(
    identity.railwayServices,
    WORKER_NAMES,
    'expected Railway service identity'
  );
  return {
    vercelProjectId: identifier(identity.vercelProjectId, 'expected Vercel project ID'),
    vercelHostname: hostname(identity.vercelHostname, 'expected Vercel hostname'),
    railwayProjectId: identifier(identity.railwayProjectId, 'expected Railway project ID'),
    railwayEnvironmentId: identifier(identity.railwayEnvironmentId, 'expected Railway environment ID'),
    railwayServices: Object.fromEntries(
      WORKER_NAMES.map((serviceName) => [
        serviceName,
        identifier(services[serviceName], `expected Railway ${serviceName} service ID`),
      ])
    ),
  };
}

function providerIdentity(value, expected) {
  const provider = exactKeys(value, ['vercel', 'railway'], 'provider identity');
  const vercel = exactKeys(
    provider.vercel,
    ['projectId', 'deploymentId', 'hostname', 'sourceSha'],
    'Vercel provider identity'
  );
  const railway = exactKeys(
    provider.railway,
    ['projectId', 'environmentId', 'services'],
    'Railway provider identity'
  );
  if (!Array.isArray(railway.services) || railway.services.length !== WORKER_NAMES.length) {
    fail('Railway protected services are invalid');
  }

  const normalizedVercel = {
    projectId: identifier(vercel.projectId, 'Vercel project ID'),
    deploymentId: identifier(vercel.deploymentId, 'Vercel deployment ID'),
    hostname: hostname(vercel.hostname, 'Vercel hostname'),
    sourceSha: sha(vercel.sourceSha, 'Vercel source SHA'),
  };
  if (
    normalizedVercel.projectId !== expected.vercelProjectId ||
    normalizedVercel.hostname !== expected.vercelHostname
  ) {
    fail('Vercel provider identity does not match protected identity');
  }

  const services = new Map();
  for (const value of railway.services) {
    const service = exactKeys(
      value,
      ['serviceName', 'serviceId', 'deploymentId', 'sourceSha'],
      'Railway protected service'
    );
    const serviceName = safeText(service.serviceName, 'Railway service name');
    if (!WORKER_NAMES.includes(serviceName) || services.has(serviceName)) {
      fail('Railway protected service identity is invalid');
    }
    services.set(serviceName, {
      serviceName,
      serviceId: identifier(service.serviceId, `Railway ${serviceName} service ID`),
      deploymentId: identifier(service.deploymentId, `Railway ${serviceName} deployment ID`),
      sourceSha: sha(service.sourceSha, `Railway ${serviceName} source SHA`),
    });
  }

  const normalizedRailway = {
    projectId: identifier(railway.projectId, 'Railway project ID'),
    environmentId: identifier(railway.environmentId, 'Railway environment ID'),
    services: WORKER_NAMES.map((serviceName) => {
      const service = services.get(serviceName);
      if (!service || service.serviceId !== expected.railwayServices[serviceName]) {
        fail('Railway provider identity does not match protected identity');
      }
      return service;
    }),
  };
  if (
    normalizedRailway.projectId !== expected.railwayProjectId ||
    normalizedRailway.environmentId !== expected.railwayEnvironmentId
  ) {
    fail('Railway provider identity does not match protected identity');
  }

  return { vercel: normalizedVercel, railway: normalizedRailway };
}

export function buildReleaseRecoveryContext(value) {
  const input = exactKeys(
    value,
    [
      'baselineMainSha',
      'plannedPrHeadSha',
      'plannedPrNumber',
      'planPath',
      'planSha256',
      'githubRunId',
      'githubRunAttempt',
      'capturedAt',
      'expectedIdentity',
      'providerIdentity',
    ],
    'capture input'
  );
  const expected = expectedIdentity(input.expectedIdentity);
  const provider = providerIdentity(input.providerIdentity, expected);

  return {
    schemaVersion: 'release-recovery-context-v1',
    baselineMainSha: sha(input.baselineMainSha, 'baseline main SHA'),
    plannedPrHeadSha: sha(input.plannedPrHeadSha, 'planned PR head SHA'),
    plannedPrNumber: pullRequestNumber(input.plannedPrNumber, 'planned PR number'),
    planPath: planPath(input.planPath),
    planSha256: sha256(input.planSha256, 'plan SHA-256'),
    githubRunId: runId(input.githubRunId),
    githubRunAttempt: runAttempt(input.githubRunAttempt),
    capturedAt: capturedAt(input.capturedAt),
    vercel: provider.vercel,
    railway: provider.railway,
  };
}

async function readCaptureInput(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') fail('input path is invalid');
  try {
    return JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  } catch {
    fail('capture input file is unreadable');
  }
}

async function writeContext(outputPath, context) {
  if (typeof outputPath !== 'string' || outputPath.trim() === '') fail('output path is invalid');
  const normalizedPath = resolve(outputPath);
  let handle;
  try {
    handle = await open(normalizedPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(context)}\n`, 'utf8');
    await handle.chmod(0o600);
  } catch {
    fail('release recovery context could not be written');
  } finally {
    await handle?.close();
  }
}

export async function captureReleaseRecoveryContext({ inputPath, outputPath } = {}) {
  const context = buildReleaseRecoveryContext(await readCaptureInput(inputPath));
  await writeContext(outputPath, context);
  return context;
}

function requiredEnvironment(environment, key) {
  return safeText(environment?.[key], `${key} environment value`);
}

function requiredSecretEnvironment(environment, key) {
  const value = environment?.[key];
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    fail(`${key} environment value is invalid`);
  }
  return value;
}

function providerExpectedIdentity(environment) {
  return expectedIdentity({
    vercelProjectId: requiredEnvironment(environment, 'VERCEL_PROJECT_ID'),
    vercelHostname: requiredEnvironment(environment, 'VERCEL_PRODUCTION_HOSTNAME'),
    railwayProjectId: requiredEnvironment(environment, 'RAILWAY_PROJECT_ID'),
    railwayEnvironmentId: requiredEnvironment(environment, 'RAILWAY_ENVIRONMENT_ID'),
    railwayServices: {
      'fund-scenario-calc': requiredEnvironment(
        environment,
        'RAILWAY_FUND_SCENARIO_CALC_SERVICE_ID'
      ),
      'capital-call-status': requiredEnvironment(
        environment,
        'RAILWAY_CAPITAL_CALL_STATUS_SERVICE_ID'
      ),
    },
  });
}

function assertSafeVercelDeploymentUrl(value) {
  if (typeof value !== 'string') fail('Vercel deployment URL is invalid');
  if (!value.includes('://')) {
    if (!VERCEL_HOST.test(value)) fail('Vercel deployment URL is invalid');
    return;
  }
  let url;
  try {
    url = new globalThis.URL(value);
  } catch {
    fail('Vercel deployment URL is invalid');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    !VERCEL_HOST.test(url.hostname.toLowerCase())
  ) {
    fail('Vercel deployment URL is invalid');
  }
}

async function responseJson(fetchImpl, url, options, label) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      signal: globalThis.AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    fail(`${label} request failed`);
  }
  if (!response?.ok || typeof response.json !== 'function') fail(`${label} request failed`);
  try {
    return await response.json();
  } catch {
    fail(`${label} response is malformed`);
  }
}

function providerCaptureInput({
  baselineMainSha,
  plannedPrHeadSha,
  plannedPrNumber,
  planPath: capturedPlanPath,
  planSha256,
  environment,
  expectedIdentity: expected,
  providerIdentity: provider,
  capturedAt: time,
}) {
  return {
    baselineMainSha,
    plannedPrHeadSha,
    plannedPrNumber,
    planPath: capturedPlanPath,
    planSha256,
    githubRunId: requiredEnvironment(environment, 'GITHUB_RUN_ID'),
    githubRunAttempt: Number(requiredEnvironment(environment, 'GITHUB_RUN_ATTEMPT')),
    capturedAt: time,
    expectedIdentity: expected,
    providerIdentity: provider,
  };
}

export async function captureProviderBaseline({
  baselineMainSha,
  plannedPrHeadSha,
  plannedPrNumber,
  planPath: capturedPlanPath,
  planSha256,
  environment = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('provider fetch is unavailable');
  sha(baselineMainSha, 'baseline main SHA');
  sha(plannedPrHeadSha, 'planned PR head SHA');
  pullRequestNumber(plannedPrNumber, 'planned PR number');
  planPath(capturedPlanPath);
  sha256(planSha256, 'plan SHA-256');
  const expected = providerExpectedIdentity(environment);
  const vercelToken = requiredSecretEnvironment(environment, 'VERCEL_TOKEN');
  const vercelOrgId = identifier(requiredEnvironment(environment, 'VERCEL_ORG_ID'), 'Vercel organization ID');
  const railwayToken = requiredSecretEnvironment(environment, 'RAILWAY_TOKEN');
  const vercelDeployment = await responseJson(
    fetchImpl,
    `https://api.vercel.com/v13/deployments/${expected.vercelHostname}?teamId=${vercelOrgId}`,
    { headers: { Authorization: `Bearer ${vercelToken}` } },
    'Vercel deployment'
  );
  assertSafeVercelDeploymentUrl(vercelDeployment?.url);
  const vercel = verifyVercelEvidence(
    {
      deployment: {
        ...vercelDeployment,
        aliases: vercelDeployment?.aliases ?? vercelDeployment?.alias ?? [],
      },
    },
    expected.vercelProjectId,
    { kind: 'canonical_baseline', canonicalHostname: expected.vercelHostname }
  );
  const railwayHeaders = {
    'Content-Type': 'application/json',
    'Project-Access-Token': railwayToken,
  };
  const token = await responseJson(
    fetchImpl,
    RAILWAY_API_URL,
    {
      method: 'POST',
      headers: railwayHeaders,
      body: JSON.stringify({ query: 'query { projectToken { project { id } environment { id } } }' }),
    },
    'Railway token context'
  );
  const projectId = token?.data?.projectToken?.project?.id;
  const environmentId = token?.data?.projectToken?.environment?.id;
  if (token?.errors?.length || typeof projectId !== 'string' || typeof environmentId !== 'string') {
    fail('Railway token context is malformed');
  }
  const control = await responseJson(
    fetchImpl,
    RAILWAY_API_URL,
    {
      method: 'POST',
      headers: railwayHeaders,
      body: JSON.stringify({
        query:
          'query($projectId: String!, $environmentId: String!) { environment(id: $environmentId, projectId: $projectId) { serviceInstances(first: 100) { edges { node { serviceId serviceName numReplicas latestDeployment { id status meta deploymentStopped instances { id status } } activeDeployments { id status meta deploymentStopped instances { id status } } domains { serviceDomains { id } customDomains { id } } } } pageInfo { hasNextPage endCursor } } }',
        variables: { projectId, environmentId },
      }),
    },
    'Railway topology'
  );
  const railwayResponse = {
    data: {
      projectId,
      environmentId,
      environment: control?.data?.environment,
    },
    errors: control?.errors,
  };
  const normalizedRailway = normalizeRailwayResponse(railwayResponse);
  const railwaySourceSha = normalizedRailway.services.find(
    (service) => service.serviceName === 'fund-scenario-calc'
  )?.latestDeployment?.meta?.commitHash;
  if (typeof railwaySourceSha !== 'string' || !SHA.test(railwaySourceSha)) {
    fail('Railway protected source SHA is invalid');
  }
  const railway = verifyRailwayTopology(railwayResponse, railwaySourceSha, {
    projectId: expected.railwayProjectId,
    environmentId: expected.railwayEnvironmentId,
    services: expected.railwayServices,
  });
  const sourceByService = new Map(
    normalizedRailway.services.map((service) => [
      service.serviceName,
      service.latestDeployment?.meta?.commitHash,
    ])
  );
  return buildReleaseRecoveryContext(
    providerCaptureInput({
      baselineMainSha,
      plannedPrHeadSha,
      plannedPrNumber,
      planPath: capturedPlanPath,
      planSha256,
      environment,
      expectedIdentity: expected,
      providerIdentity: {
        vercel: {
          projectId: vercel.projectId,
          deploymentId: vercel.deploymentId,
          hostname: expected.vercelHostname,
          sourceSha: vercel.sourceSha,
        },
        railway: {
          projectId: railway.projectId,
          environmentId: railway.environmentId,
          services: railway.services.map((service) => ({
            ...service,
            sourceSha: sourceByService.get(service.serviceName),
          })),
        },
      },
      capturedAt: now(),
    })
  );
}

export async function captureProviderBaselineToFile({ outputPath, ...options } = {}) {
  const context = await captureProviderBaseline(options);
  await writeContext(outputPath, context);
  return context;
}

function positiveTimeout(value, label) {
  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) fail(`${label} is invalid`);
  return Math.ceil(timeoutMs);
}

function gitFetchTimeout({ gitFetchTimeoutMs, deadlineAt, now }) {
  const timeoutMs = positiveTimeout(gitFetchTimeoutMs, 'git fetch timeout');
  if (deadlineAt === undefined) return timeoutMs;
  if (!Number.isFinite(deadlineAt)) fail('git fetch deadline is invalid');
  if (typeof now !== 'function') fail('git fetch clock is unavailable');
  const remainingMs = Math.ceil(deadlineAt - now());
  if (remainingMs <= 0) fail('git fetch deadline exceeded before spawn');
  return Math.min(timeoutMs, remainingMs);
}

function failGitFetch(error, timeoutMs) {
  if (error?.code === 'ETIMEDOUT' || error?.killed) {
    fail(`git fetch timeout after ${timeoutMs}ms`);
  }
  if (Number.isInteger(error?.code)) {
    fail(`git fetch exited with code ${error.code}`);
  }
  if (typeof error?.signal === 'string') {
    fail(`git fetch terminated by signal ${error.signal}`);
  }
  fail('git fetch failed before completion');
}

async function gitOutput(
  execFileImpl,
  args,
  { gitFetchTimeoutMs = DEFAULT_GIT_FETCH_TIMEOUT_MS, deadlineAt, now = Date.now } = {}
) {
  const isFetch = args[0] === 'fetch';
  const options = { encoding: 'utf8' };
  const timeoutMs = isFetch
    ? gitFetchTimeout({ gitFetchTimeoutMs, deadlineAt, now })
    : undefined;
  if (isFetch) options.timeout = timeoutMs;
  let result;
  try {
    result = await execFileImpl('git', args, options);
  } catch (error) {
    if (isFetch) failGitFetch(error, timeoutMs);
    fail('Git evidence could not be read');
  }
  if (isFetch && deadlineAt !== undefined && now() >= deadlineAt) {
    fail(`git fetch deadline exceeded after ${timeoutMs}ms`);
  }
  return String(result.stdout).trim();
}

async function gitContents(execFileImpl, args) {
  try {
    const result = await execFileImpl('git', args, { encoding: 'utf8' });
    return String(result.stdout);
  } catch {
    fail('Git evidence could not be read');
  }
}

async function githubJson(fetchImpl, repository, path, token) {
  const response = await responseJson(
    fetchImpl,
    `https://api.github.com/repos/${repository}${path}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
    'GitHub evidence'
  );
  return response;
}

export async function verifyBaselineBinding({
  baselineMainSha,
  plannedPrHeadSha,
  plannedPrNumber,
  planPath: capturedPlanPath,
  planSha256,
  environment = process.env,
  fetchImpl = globalThis.fetch,
  execFileImpl = execFileAsync,
  gitFetchTimeoutMs = DEFAULT_GIT_FETCH_TIMEOUT_MS,
  deadlineAt,
  now = Date.now,
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof execFileImpl !== 'function') {
    fail('baseline evidence dependencies are unavailable');
  }
  const baseline = sha(baselineMainSha, 'baseline main SHA');
  const planned = sha(plannedPrHeadSha, 'planned PR head SHA');
  const plannedNumber = pullRequestNumber(plannedPrNumber, 'planned PR number');
  const path = planPath(capturedPlanPath);
  const digest = sha256(planSha256, 'plan SHA-256');
  const repository = requiredEnvironment(environment, 'GITHUB_REPOSITORY');
  const token = requiredSecretEnvironment(environment, 'GH_TOKEN');
  if (!GITHUB_REPOSITORY.test(repository)) fail('GitHub repository is invalid');
  if (environment.GITHUB_REF !== 'refs/heads/main' || environment.GITHUB_SHA !== baseline) {
    fail('workflow ref does not match baseline main SHA');
  }
  if ((await gitOutput(execFileImpl, ['rev-parse', 'HEAD'])) !== baseline) {
    fail('checked out commit does not match baseline main SHA');
  }
  const liveMain = sha((await githubJson(fetchImpl, repository, '/commits/main', token))?.sha, 'live main SHA');
  if (liveMain !== baseline) fail('live main SHA does not match baseline main SHA');
  const prHead = sha(
    (await githubJson(fetchImpl, repository, `/pulls/${plannedNumber}`, token))?.head?.sha,
    'planned PR head SHA'
  );
  if (prHead !== planned) fail('live PR head does not match planned PR head SHA');
  const remoteRef = `origin/pr-${plannedNumber}`;
  await gitOutput(
    execFileImpl,
    ['fetch', '--no-tags', 'origin', `pull/${plannedNumber}/head:refs/remotes/origin/pr-${plannedNumber}`],
    { gitFetchTimeoutMs, deadlineAt, now }
  );
  if ((await gitOutput(execFileImpl, ['rev-parse', remoteRef])) !== planned) {
    fail('fetched PR head does not match planned PR head SHA');
  }
  const plan = await gitContents(execFileImpl, ['show', `${planned}:${path}`]);
  if (createHash('sha256').update(plan).digest('hex') !== digest) {
    fail('approved plan digest does not match');
  }
}

const RELEASE_MODES = Object.freeze(['primary', 'rollback']);
const ARTIFACT_DIGEST = /^sha256:[a-f0-9]{64}$/;
const BASELINE_WORKFLOW_PATH = '.github/workflows/capture-release-baseline.yml';

/**
 * Rollback releases must restore the application tree exactly; only release
 * control-plane paths may differ, because reverting those would revert the
 * hardened release and recovery workflows themselves.
 */
export const ROLLBACK_DIFF_ALLOWLIST = Object.freeze([
  '.github/workflows/',
  'scripts/release/',
  'scripts/deploy-production.ps1',
  'tests/unit/scripts/',
  'tests/regressions/',
  'docs/',
]);

function releaseMode(value) {
  // An unset or unknown mode fails closed.
  if (typeof value !== 'string' || !RELEASE_MODES.includes(value)) {
    fail('release mode must be exactly primary or rollback');
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} is invalid`);
  return value;
}

/**
 * Decode and strictly validate the compact baseline evidence input. The
 * workflow_dispatch surface caps out at ten inputs, so the five baseline
 * fields and the rollback pair travel base64-encoded as one exact input,
 * mirroring operator_evidence_b64.
 */
export function decodeBaselineEvidence(baselineEvidenceB64, mode) {
  const normalizedMode = releaseMode(mode);
  if (typeof baselineEvidenceB64 !== 'string' || baselineEvidenceB64.trim() === '') {
    fail('baseline evidence is required');
  }
  let decoded;
  try {
    decoded = JSON.parse(
      globalThis.Buffer.from(baselineEvidenceB64.trim(), 'base64').toString('utf8')
    );
  } catch {
    fail('baseline evidence is not valid base64 JSON');
  }
  const keys = [
    'schemaVersion',
    'baselineRunId',
    'baselineRunAttempt',
    'baselineArtifactId',
    'baselineArtifactDigest',
    'baselineFileSha256',
    ...(normalizedMode === 'rollback' ? ['rollbackPrNumber', 'rollbackPrHeadSha'] : []),
  ];
  const binding = exactKeys(decoded, keys, 'baseline evidence');
  if (binding.schemaVersion !== 'release-baseline-binding-v1') {
    fail('baseline evidence schema version is invalid');
  }
  const digest = safeText(binding.baselineArtifactDigest, 'baseline artifact digest');
  if (!ARTIFACT_DIGEST.test(digest)) fail('baseline artifact digest is invalid');
  const result = {
    releaseMode: normalizedMode,
    baselineRunId: runId(binding.baselineRunId),
    baselineRunAttempt: positiveInteger(binding.baselineRunAttempt, 'baseline run attempt'),
    baselineArtifactId: runId(binding.baselineArtifactId),
    baselineArtifactDigest: digest,
    baselineFileSha256: sha256(binding.baselineFileSha256, 'baseline file SHA-256'),
  };
  if (normalizedMode === 'rollback') {
    return {
      ...result,
      rollbackPrNumber: positiveInteger(binding.rollbackPrNumber, 'rollback PR number'),
      rollbackPrHeadSha: sha(binding.rollbackPrHeadSha, 'rollback PR head SHA'),
    };
  }
  return result;
}

function expectedBaselineArtifactName(binding, plannedPrHeadSha) {
  return `release-baseline-v1-${binding.baselineRunId}-${binding.baselineRunAttempt}-${plannedPrHeadSha}`;
}

/**
 * Verify the exact capture-release-baseline execution and artifact identity by
 * ID — never a latest-artifact or name-only match.
 */
export async function verifyBaselineArtifact({
  baselineEvidenceB64,
  releaseMode: mode,
  environment = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') fail('baseline evidence dependencies are unavailable');
  const binding = decodeBaselineEvidence(baselineEvidenceB64, mode);
  const repository = requiredEnvironment(environment, 'GITHUB_REPOSITORY');
  const token = requiredSecretEnvironment(environment, 'GH_TOKEN');
  if (!GITHUB_REPOSITORY.test(repository)) fail('GitHub repository is invalid');
  const [owner] = repository.split('/');

  const run = await githubJson(
    fetchImpl,
    repository,
    `/actions/runs/${binding.baselineRunId}`,
    token
  );
  if (run?.path !== BASELINE_WORKFLOW_PATH) fail('baseline run is not the capture workflow');
  if (run?.repository?.full_name !== repository) fail('baseline run repository is invalid');
  if (run?.head_branch !== 'main') fail('baseline run did not execute on main');
  if (run?.conclusion !== 'success') fail('baseline run did not conclude successfully');
  if (run?.actor?.login !== owner) fail('baseline run actor is not the repository owner');

  const artifact = await githubJson(
    fetchImpl,
    repository,
    `/actions/artifacts/${binding.baselineArtifactId}`,
    token
  );
  if (String(artifact?.workflow_run?.id ?? '') !== binding.baselineRunId) {
    fail('baseline artifact does not belong to the exact capture run');
  }
  if (artifact?.expired !== false) fail('baseline artifact is expired');
  if (artifact?.digest !== binding.baselineArtifactDigest) {
    fail('baseline artifact digest does not match');
  }
  const artifactName = safeText(artifact?.name, 'baseline artifact name');
  const namePrefix = `release-baseline-v1-${binding.baselineRunId}-${binding.baselineRunAttempt}-`;
  if (!artifactName.startsWith(namePrefix)) {
    fail('baseline artifact name does not bind the exact run attempt');
  }
  const plannedPrHeadSha = sha(artifactName.slice(namePrefix.length), 'baseline artifact planned head');
  if (artifactName !== expectedBaselineArtifactName(binding, plannedPrHeadSha)) {
    fail('baseline artifact name is invalid');
  }

  const runArtifacts = await githubJson(
    fetchImpl,
    repository,
    `/actions/runs/${binding.baselineRunId}/artifacts?name=${encodeURIComponent(artifactName)}`,
    token
  );
  const matches = Array.isArray(runArtifacts?.artifacts) ? runArtifacts.artifacts : [];
  if (matches.length !== 1 || String(matches[0]?.id ?? '') !== binding.baselineArtifactId) {
    fail('baseline artifact is duplicated or missing on the exact run');
  }

  return { binding, plannedPrHeadSha };
}

async function isAncestor(execFileImpl, ancestorSha, descendantSha) {
  try {
    await execFileImpl('git', ['merge-base', '--is-ancestor', ancestorSha, descendantSha], {
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

function assertRollbackDiffAllowlisted(diffOutput) {
  const paths = String(diffOutput)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  // An empty diff is a perfect restoration and passes.
  for (const path of paths) {
    const allowed = ROLLBACK_DIFF_ALLOWLIST.some((prefix) =>
      prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix
    );
    if (!allowed) {
      fail(`rollback release differs from the baseline application tree at ${path}`);
    }
  }
}

/**
 * Build the exact BaselineFragmentPayload from the verified context and
 * binding and write it (mode 0600, create-only). Emitted only after every
 * consumption check has passed; without a path the emit is skipped entirely.
 */
async function emitNormalizedBaselinePayload(emitPath, { binding, context, baselineMainSha, plannedPrHeadSha }) {
  await writeContext(emitPath, {
    prechange: { vercel: context.vercel, railway: context.railway },
    rollback: {
      targetMainSha: baselineMainSha,
      recoveryContextSha256: binding.baselineFileSha256,
    },
    baselineArtifact: {
      runId: binding.baselineRunId,
      runAttempt: binding.baselineRunAttempt,
      workflowPath: BASELINE_WORKFLOW_PATH,
      baselineMainSha,
      plannedPrHeadSha,
      artifactId: binding.baselineArtifactId,
      artifactName: expectedBaselineArtifactName(binding, plannedPrHeadSha),
      artifactArchiveSha256: binding.baselineArtifactDigest.slice('sha256:'.length),
      contextFileSha256: binding.baselineFileSha256,
    },
  });
}

/**
 * Consume the downloaded baseline context file for one release: prove file
 * hash, plan binding, baseline ancestry, and mode-specific release lineage.
 */
export async function verifyBaselineConsumption({
  baselineEvidenceB64,
  releaseMode: mode,
  releaseSha,
  contextPath,
  emitNormalizedPath,
  prNumber,
  environment = process.env,
  fetchImpl = globalThis.fetch,
  execFileImpl = execFileAsync,
  readFileImpl = readFile,
  gitFetchTimeoutMs = DEFAULT_GIT_FETCH_TIMEOUT_MS,
  deadlineAt,
  now = Date.now,
} = {}) {
  if (
    typeof fetchImpl !== 'function' ||
    typeof execFileImpl !== 'function' ||
    typeof readFileImpl !== 'function'
  ) {
    fail('baseline evidence dependencies are unavailable');
  }
  const binding = decodeBaselineEvidence(baselineEvidenceB64, mode);
  const release = sha(releaseSha, 'release SHA');
  const repository = requiredEnvironment(environment, 'GITHUB_REPOSITORY');
  const token = requiredSecretEnvironment(environment, 'GH_TOKEN');
  if (!GITHUB_REPOSITORY.test(repository)) fail('GitHub repository is invalid');
  if (typeof contextPath !== 'string' || contextPath.trim() === '') {
    fail('baseline context path is invalid');
  }

  let contents;
  try {
    contents = await readFileImpl(resolve(contextPath), 'utf8');
  } catch {
    fail('baseline context file is unreadable');
  }
  if (createHash('sha256').update(contents).digest('hex') !== binding.baselineFileSha256) {
    fail('baseline context file hash does not match');
  }
  let context;
  try {
    context = JSON.parse(contents);
  } catch {
    fail('baseline context file is malformed');
  }
  const parsed = plainObject(context, 'baseline context');
  if (parsed.schemaVersion !== 'release-recovery-context-v1') {
    fail('baseline context schema version is invalid');
  }
  const historicalContextKeys = [
    'schemaVersion',
    'baselineMainSha',
    'plannedPrHeadSha',
    'planSha256',
    'githubRunId',
    'githubRunAttempt',
    'capturedAt',
    'vercel',
    'railway',
  ].sort();
  const capturedContextKeys = [...historicalContextKeys, 'plannedPrNumber', 'planPath'].sort();
  const actualContextKeys = Object.keys(parsed).sort();
  const isHistoricalContext = JSON.stringify(actualContextKeys) === JSON.stringify(historicalContextKeys);
  if (!isHistoricalContext && JSON.stringify(actualContextKeys) !== JSON.stringify(capturedContextKeys)) {
    fail('baseline context has unknown, missing, or hybrid provenance fields');
  }
  const baselineMainSha = sha(parsed.baselineMainSha, 'baseline main SHA');
  const plannedPrHeadSha = sha(parsed.plannedPrHeadSha, 'planned PR head SHA');
  if (runId(parsed.githubRunId) !== binding.baselineRunId) {
    fail('baseline context run ID does not match the exact capture run');
  }
  if (runAttempt(parsed.githubRunAttempt) !== binding.baselineRunAttempt) {
    fail('baseline context run attempt does not match the exact capture run');
  }

  // Never assume either SHA is present in a shallow checkout.
  await gitOutput(
    execFileImpl,
    ['fetch', '--no-tags', 'origin', baselineMainSha],
    { gitFetchTimeoutMs, deadlineAt, now }
  );
  await gitOutput(
    execFileImpl,
    ['fetch', '--no-tags', 'origin', release],
    { gitFetchTimeoutMs, deadlineAt, now }
  );
  if (!(await isAncestor(execFileImpl, baselineMainSha, release))) {
    fail('baseline main is not an ancestor of the release SHA');
  }

  if (binding.releaseMode === 'primary') {
    if (isHistoricalContext) {
      fail('primary baseline consumption requires captured PR and plan provenance');
    }
    const capturedPrNumber = pullRequestNumber(parsed.plannedPrNumber, 'captured planned PR number');
    const capturedPlanPath = planPath(parsed.planPath);
    const runtimePrNumber = pullRequestNumber(prNumber, 'pr-number');
    if (runtimePrNumber !== capturedPrNumber) {
      fail('runtime PR number does not equal captured planned PR number');
    }
    const pullRequest = await githubJson(
      fetchImpl,
      repository,
      `/pulls/${runtimePrNumber}`,
      token
    );
    if (sha(pullRequest?.head?.sha, 'runtime PR head SHA') !== plannedPrHeadSha) {
      fail('runtime PR head does not equal the planned final head');
    }
    if (pullRequest?.merged !== true || pullRequest?.base?.ref !== 'main') {
      fail('runtime PR is not merged into main');
    }
    if (sha(pullRequest?.merge_commit_sha, 'runtime PR merge SHA') !== release) {
      fail('runtime PR merge commit is not the release SHA');
    }
    const releasePlan = await gitContents(execFileImpl, ['show', `${release}:${capturedPlanPath}`]);
    if (createHash('sha256').update(releasePlan).digest('hex') !== sha256(parsed.planSha256, 'plan SHA-256')) {
      fail('release plan digest does not match captured plan digest');
    }
    if (emitNormalizedPath !== undefined) {
      await emitNormalizedBaselinePayload(emitNormalizedPath, {
        binding,
        context: parsed,
        baselineMainSha,
        plannedPrHeadSha,
      });
    }
    return { binding, baselineMainSha, plannedPrHeadSha, mode: 'primary' };
  }

  // Rollback mode omits plan-digest verification -- plan-approval ceremony
  // retired per ADR-084; rollback provenance verified via diff-allowlist only.
  // PR lineage alone does not prove revert semantics; require machine-verified
  // application-tree restoration bounded by the control-plane allowlist.
  const rollbackPullRequest = await githubJson(
    fetchImpl,
    repository,
    `/pulls/${binding.rollbackPrNumber}`,
    token
  );
  if (
    sha(rollbackPullRequest?.head?.sha, 'rollback PR head SHA') !==
    binding.rollbackPrHeadSha
  ) {
    fail('rollback PR head does not equal bound rollback PR head');
  }
  if (
    rollbackPullRequest?.merged !== true ||
    rollbackPullRequest?.base?.ref !== 'main'
  ) {
    fail('rollback PR not merged into main');
  }
  if (
    sha(rollbackPullRequest?.merge_commit_sha, 'rollback PR merge SHA') !==
    release
  ) {
    fail('rollback PR merge commit not release SHA');
  }
  const diffOutput = await gitContents(execFileImpl, [
    'diff',
    '--name-only',
    baselineMainSha,
    release,
  ]);
  assertRollbackDiffAllowlisted(diffOutput);
  if (emitNormalizedPath !== undefined) {
    await emitNormalizedBaselinePayload(emitNormalizedPath, {
      binding,
      context: parsed,
      baselineMainSha,
      plannedPrHeadSha,
    });
  }
  return { binding, baselineMainSha, plannedPrHeadSha, mode: 'rollback' };
}

function parseArguments(args, expectedKeys) {
  if (args.length !== expectedKeys.length * 2) fail('arguments are invalid');
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!expectedKeys.includes(key) || typeof value !== 'string' || parsed[key]) {
      fail('arguments are invalid');
    }
    parsed[key] = value;
  }
  return parsed;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'validate-baseline') {
    const options = parseArguments(args, [
      '--baseline-main-sha',
      '--planned-pr-head-sha',
      '--pr-number',
      '--plan-path',
      '--plan-sha256',
    ]);
    await verifyBaselineBinding({
      baselineMainSha: options['--baseline-main-sha'],
      plannedPrHeadSha: options['--planned-pr-head-sha'],
      plannedPrNumber: options['--pr-number'],
      planPath: options['--plan-path'],
      planSha256: options['--plan-sha256'],
    });
    console.log('Release baseline binding verified.');
    return;
  }
  if (command === 'verify-baseline-artifact') {
    const options = parseArguments(args, ['--baseline-evidence-b64', '--release-mode']);
    await verifyBaselineArtifact({
      baselineEvidenceB64: options['--baseline-evidence-b64'],
      releaseMode: options['--release-mode'],
    });
    console.log('Release baseline artifact identity verified.');
    return;
  }
  if (command === 'verify-baseline-consumption') {
    const expectedKeys = [
      '--baseline-evidence-b64',
      '--release-mode',
      '--expected-sha',
      '--context-file',
    ];
    if (args.includes('--pr-number')) expectedKeys.push('--pr-number');
    if (args.includes('--emit-normalized')) expectedKeys.push('--emit-normalized');
    const options = parseArguments(args, expectedKeys);
    await verifyBaselineConsumption({
      baselineEvidenceB64: options['--baseline-evidence-b64'],
      releaseMode: options['--release-mode'],
      releaseSha: options['--expected-sha'],
      contextPath: options['--context-file'],
      emitNormalizedPath: options['--emit-normalized'],
      prNumber: options['--pr-number'],
    });
    console.log('Release baseline consumption verified.');
    return;
  }
  if (command === 'capture-provider') {
    const options = parseArguments(args, [
      '--baseline-main-sha',
      '--planned-pr-head-sha',
      '--pr-number',
      '--plan-path',
      '--plan-sha256',
      '--output',
    ]);
    await captureProviderBaselineToFile({
      baselineMainSha: options['--baseline-main-sha'],
      plannedPrHeadSha: options['--planned-pr-head-sha'],
      plannedPrNumber: options['--pr-number'],
      planPath: options['--plan-path'],
      planSha256: options['--plan-sha256'],
      outputPath: options['--output'],
    });
    console.log('Release provider baseline captured.');
    return;
  }
  const options = parseArguments([command, ...args], ['--input', '--output']);
  await captureReleaseRecoveryContext({
    inputPath: options['--input'],
    outputPath: options['--output'],
  });
  console.log('Release recovery context captured.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    console.error('Release recovery context capture failed.');
    process.exitCode = 1;
  });
}
