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
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SECRET_KEY = /(?:api[_-]?key|authorization|cookie|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE = /(?:github_pat_|gh[pousr]_|sk-|rk-|pk-|(?:bearer|basic)\s+|(?:postgres|postgresql|mysql|mongodb|redis):\/\/|[?&](?:api[_-]?key|password|secret|token)=)/i;
const WORKER_NAMES = Object.freeze(['fund-scenario-calc', 'capital-call-status']);
const VERCEL_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/;
const GITHUB_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PLAN_PATH = 'docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md';
const RAILWAY_API_URL = 'https://backboard.railway.com/graphql/v2';
const PROVIDER_TIMEOUT_MS = 15_000;
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
    url = new URL(value);
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
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
  planSha256,
  environment,
  expectedIdentity: expected,
  providerIdentity: provider,
  capturedAt: time,
}) {
  return {
    baselineMainSha,
    plannedPrHeadSha,
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
  planSha256,
  environment = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('provider fetch is unavailable');
  sha(baselineMainSha, 'baseline main SHA');
  sha(plannedPrHeadSha, 'planned PR head SHA');
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

async function gitOutput(execFileImpl, args) {
  try {
    const result = await execFileImpl('git', args, { encoding: 'utf8' });
    return String(result.stdout).trim();
  } catch {
    fail('Git evidence could not be read');
  }
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
  planSha256,
  environment = process.env,
  fetchImpl = globalThis.fetch,
  execFileImpl = execFileAsync,
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof execFileImpl !== 'function') {
    fail('baseline evidence dependencies are unavailable');
  }
  const baseline = sha(baselineMainSha, 'baseline main SHA');
  const planned = sha(plannedPrHeadSha, 'planned PR head SHA');
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
    (await githubJson(fetchImpl, repository, '/pulls/1385', token))?.head?.sha,
    'planned PR head SHA'
  );
  if (prHead !== planned) fail('live PR head does not match planned PR head SHA');
  await gitOutput(execFileImpl, ['fetch', '--no-tags', 'origin', 'pull/1385/head:refs/remotes/origin/pr-1385']);
  if ((await gitOutput(execFileImpl, ['rev-parse', 'origin/pr-1385'])) !== planned) {
    fail('fetched PR head does not match planned PR head SHA');
  }
  const plan = await gitContents(execFileImpl, ['show', `${planned}:${PLAN_PATH}`]);
  if (createHash('sha256').update(plan).digest('hex') !== digest) {
    fail('approved plan digest does not match');
  }
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
      '--plan-sha256',
    ]);
    await verifyBaselineBinding({
      baselineMainSha: options['--baseline-main-sha'],
      plannedPrHeadSha: options['--planned-pr-head-sha'],
      planSha256: options['--plan-sha256'],
    });
    console.log('Release baseline binding verified.');
    return;
  }
  if (command === 'capture-provider') {
    const options = parseArguments(args, [
      '--baseline-main-sha',
      '--planned-pr-head-sha',
      '--plan-sha256',
      '--output',
    ]);
    await captureProviderBaselineToFile({
      baselineMainSha: options['--baseline-main-sha'],
      plannedPrHeadSha: options['--planned-pr-head-sha'],
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
