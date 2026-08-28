import console from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import {
  assertVercelCandidateHost,
  normalizeRailwayResponse,
  normalizeVercelEvidence,
} from './provider-evidence-contract.mjs';
import { postRailwayGraphql } from './railway-graphql-transport.mjs';

const VERCEL_API_URL = 'https://api.vercel.com';
const PROJECT_SCOPE_QUERY =
  'query { projectToken { project { id } environment { id } } }';
const SERVICE_INSTANCES_QUERY =
  'query($projectId: String!, $environmentId: String!) { environment(id: $environmentId, projectId: $projectId) { serviceInstances(first: 100) { edges { node { serviceId serviceName numReplicas latestDeployment { id status meta deploymentStopped instances { id status } } activeDeployments { id status meta deploymentStopped instances { id status } } domains { serviceDomains { id } customDomains { id } } } } pageInfo { hasNextPage endCursor } } }';
const REQUIRED_ENVIRONMENT = Object.freeze([
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT_ID',
  'RAILWAY_TOKEN',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
]);

function fail(message) {
  throw new Error(`Provider evidence collection failed: ${message}`);
}

function requiredEnvironment(name, environment) {
  const value = environment?.[name];
  if (typeof value !== 'string' || value.trim() === '') fail(`${name} is required`);
  return value;
}

function parseDeploymentUrl(value) {
  if (typeof value !== 'string') fail('deployment URL is required');
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('deployment URL is invalid');
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    fail('deployment URL is invalid');
  }
  const host = assertVercelCandidateHost(value);
  return { url, host };
}

function assertSafePath(outputDirectory, secrets) {
  if (typeof outputDirectory !== 'string' || outputDirectory.trim() === '') {
    fail('output directory is required');
  }
  const normalized = resolve(outputDirectory);
  if (secrets.some((secret) => normalized.includes(secret))) {
    fail('output directory is unsafe');
  }
  return normalized;
}

function assertNoSecret(value, secrets) {
  const serialized = JSON.stringify(value);
  if (secrets.some((secret) => serialized.includes(secret))) {
    fail('provider response contained a protected value');
  }
}

async function responseJson(response, label) {
  if (!response?.ok || typeof response.json !== 'function') {
    fail(`${label} request failed`);
  }
  try {
    return await response.json();
  } catch {
    fail(`${label} response is malformed`);
  }
}

async function getJson(fetchImpl, url, options, label) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch {
    fail(`${label} request failed`);
  }
  try {
    return await responseJson(response, label);
  } catch {
    fail(`${label} request failed`);
  }
}

async function writeEvidence(writeFileImpl, outputDirectory, filename, value, secrets) {
  assertNoSecret(value, secrets);
  try {
    await writeFileImpl(join(outputDirectory, filename), `${JSON.stringify(value)}\n`, 'utf8');
  } catch {
    fail('evidence file could not be written');
  }
}

export async function collectProviderEvidence({
  deploymentUrl,
  outputDirectory,
  fetchImpl = globalThis.fetch,
  writeFileImpl = writeFile,
} = {}) {
  if (typeof fetchImpl !== 'function') fail('fetch is unavailable');
  if (typeof writeFileImpl !== 'function') fail('file writer is unavailable');
  const environment = process.env;
  const vercelToken = requiredEnvironment('VERCEL_TOKEN', environment);
  const vercelOrgId = requiredEnvironment('VERCEL_ORG_ID', environment);
  const vercelProjectId = requiredEnvironment('VERCEL_PROJECT_ID', environment);
  const railwayToken = requiredEnvironment('RAILWAY_TOKEN', environment);
  const bypassSecret = requiredEnvironment('VERCEL_AUTOMATION_BYPASS_SECRET', environment);
  const secrets = [vercelToken, railwayToken, bypassSecret];
  const { url, host } = parseDeploymentUrl(deploymentUrl);
  const safeOutputDirectory = assertSafePath(outputDirectory, secrets);

  const deployment = await getJson(
    fetchImpl,
    `${VERCEL_API_URL}/v13/deployments/${host}?teamId=${encodeURIComponent(vercelOrgId)}`,
    { headers: { Authorization: `Bearer ${vercelToken}` } },
    'Vercel deployment'
  );
  const version = await getJson(
    fetchImpl,
    new URL('/api/version', url).toString(),
    { headers: { 'x-vercel-protection-bypass': bypassSecret } },
    'Vercel version'
  );
  const vercelEvidence = normalizeVercelEvidence(
    { deployment, version },
    vercelProjectId
  );

  let scope;
  try {
    scope = await postRailwayGraphql({
      fetchImpl,
      token: railwayToken,
      query: PROJECT_SCOPE_QUERY,
      operation: 'Railway scope',
    });
  } catch {
    fail('Railway scope request failed');
  }
  const projectId = scope.data?.projectToken?.project?.id;
  const environmentId = scope.data?.projectToken?.environment?.id;
  if (scope.errors?.length || typeof projectId !== 'string' || typeof environmentId !== 'string') {
    fail('Railway project or environment scope is unavailable');
  }
  let control;
  try {
    control = await postRailwayGraphql({
      fetchImpl,
      token: railwayToken,
      query: SERVICE_INSTANCES_QUERY,
      variables: { projectId, environmentId },
      operation: 'Railway topology',
    });
  } catch {
    fail('Railway topology request failed');
  }
  const railwayEvidence = normalizeRailwayResponse({
    data: { projectId, environmentId, environment: control.data?.environment },
    errors: control.errors,
  });

  await writeEvidence(writeFileImpl, safeOutputDirectory, 'vercel-evidence.json', vercelEvidence, secrets);
  await writeEvidence(writeFileImpl, safeOutputDirectory, 'railway-evidence.json', railwayEvidence, secrets);
  return { vercelEvidence, railwayEvidence };
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if ((flag !== '--deployment-url' && flag !== '--output-dir') || value === undefined) {
      fail('arguments must be --deployment-url value --output-dir value');
    }
    values[flag.slice(2)] = value;
  }
  if (!values['deployment-url'] || !values['output-dir']) {
    fail('deployment URL and output directory are required');
  }
  return values;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  // Reject a secret-bearing output path BEFORE the directory (and therefore a
  // token-named filesystem entry) can be created.
  const environmentSecrets = [
    process.env['VERCEL_TOKEN'],
    process.env['RAILWAY_TOKEN'],
    process.env['VERCEL_AUTOMATION_BYPASS_SECRET'],
  ].filter((secret) => typeof secret === 'string' && secret !== '');
  // Use the RESOLVED path everywhere after validation: recursive mkdir on the
  // raw input would materialize secret-bearing intermediate components that
  // dot-dot segments hide from the normalized check.
  const safeOutputDirectory = assertSafePath(args['output-dir'], environmentSecrets);
  await mkdir(safeOutputDirectory, { recursive: true });
  await collectProviderEvidence({
    deploymentUrl: args['deployment-url'],
    outputDirectory: safeOutputDirectory,
  });
  console.log('Provider evidence collected.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {
    console.error('Provider evidence collection failed.');
    process.exitCode = 1;
  });
}

export { REQUIRED_ENVIRONMENT };
