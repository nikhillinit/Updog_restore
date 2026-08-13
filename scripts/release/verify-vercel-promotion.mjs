import console from 'node:console';
import { appendFile } from 'node:fs/promises';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  normalizeCanonicalHostname as normalizeProviderCanonicalHostname,
} from './provider-evidence-contract.mjs';

const MAX_ATTEMPTS = 60;
const OVERALL_DEADLINE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_WAIT_MS = 5_000;
const VERCEL_API_URL = 'https://api.vercel.com';
const SHA = /^[a-f0-9]{40}$/;
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOSTNAME = new RegExp(`^(?=.{1,253}$)${LABEL}(?:\\.${LABEL})*$`);

function fail(message) {
  throw new Error(`Canonical promotion verification failed: ${message}`);
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} is invalid`);
  return value;
}

function requiredSha(value) {
  if (typeof value !== 'string' || !SHA.test(value)) fail('expected SHA is invalid');
  return value;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} is malformed`);
  }
  return value;
}

export function normalizeCanonicalHostname(value) {
  let hostname;
  try {
    hostname = normalizeProviderCanonicalHostname(value);
  } catch {
    fail('canonical hostname is invalid');
  }
  if (!HOSTNAME.test(hostname)) fail('canonical hostname is invalid');
  return hostname;
}

function exactAliases(deployment, canonicalHostname) {
  const hasAliases = Object.prototype.hasOwnProperty.call(deployment, 'aliases');
  const hasAlias = Object.prototype.hasOwnProperty.call(deployment, 'alias');
  if (!hasAliases && !hasAlias) fail('Vercel aliases are missing');

  const aliases = hasAliases ? deployment.aliases : deployment.alias;
  const legacyAliases = hasAlias ? deployment.alias : undefined;
  if (!Array.isArray(aliases) || aliases.some((alias) => typeof alias !== 'string')) {
    fail('Vercel aliases are malformed');
  }
  if (hasAliases && hasAlias && JSON.stringify(aliases) !== JSON.stringify(legacyAliases)) {
    fail('Vercel aliases conflict');
  }
  if (!aliases.includes(canonicalHostname)) fail('Vercel canonical alias does not match');
}

export function verifyCanonicalPromotion({
  canonicalHostname,
  deployment,
  expectedDeploymentId,
  expectedProjectId,
  expectedSha,
} = {}) {
  const hostname = normalizeCanonicalHostname(canonicalHostname);
  const deploymentRecord = record(deployment, 'Vercel deployment');
  if (
    Object.prototype.hasOwnProperty.call(deploymentRecord, 'error') ||
    Object.prototype.hasOwnProperty.call(deploymentRecord, 'errors')
  ) {
    fail('Vercel API returned an error');
  }

  const deploymentId = requiredText(expectedDeploymentId, 'expected deployment ID');
  const projectId = requiredText(expectedProjectId, 'expected project ID');
  const sha = requiredSha(expectedSha);
  if (deploymentRecord.id !== deploymentId) fail('deployment ID does not match expected staged deployment');
  if (deploymentRecord.projectId !== projectId) fail('project ID does not match protected project');
  if (deploymentRecord.readyState !== 'READY') fail('Vercel deployment is not READY');
  if (deploymentRecord.target !== 'production') fail('Vercel deployment target is not production');

  const metadata = record(deploymentRecord.meta, 'Vercel deployment metadata');
  if (metadata.githubCommitSha !== sha) fail('Vercel deployment commit SHA does not match expected SHA');
  exactAliases(deploymentRecord, hostname);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') fail(`${name} is required`);
  return value;
}

function parseArguments(args) {
  const parsed = {};
  const allowed = new Set([
    'canonical-hostname',
    'expected-deployment-id',
    'expected-project-id',
    'expected-sha',
    'github-output',
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      typeof flag !== 'string' ||
      !flag.startsWith('--') ||
      value === undefined ||
      !allowed.has(flag.slice(2)) ||
      Object.prototype.hasOwnProperty.call(parsed, flag.slice(2))
    ) {
      fail('arguments are invalid');
    }
    parsed[flag.slice(2)] = value;
  }
  for (const name of [
    'canonical-hostname',
    'expected-deployment-id',
    'expected-project-id',
    'expected-sha',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(parsed, name)) fail(`--${name} is required`);
  }
  if (
    parsed['github-output'] !== undefined &&
    (parsed['github-output'].trim() === '' || /[\r\n]/.test(parsed['github-output']))
  ) {
    fail('--github-output is invalid');
  }
  return parsed;
}

async function fetchDeployment(url, token, fetchImpl, signal) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
  } catch {
    throw new Error('Vercel deployment request failed');
  }
  if (!response?.ok || typeof response.json !== 'function') {
    throw new Error('Vercel deployment request failed');
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Vercel deployment response is malformed');
  }
}

async function requestWithTimeout(url, token, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new globalThis.AbortController();
  const requestTimeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchDeployment(url, token, fetchImpl, controller.signal);
  } finally {
    globalThis.clearTimeout(requestTimeout);
  }
}

async function resolveCanonicalPromotion({
  canonicalHostname,
  expectedDeploymentId,
  expectedProjectId,
  expectedSha,
  token,
  organizationId,
  fetchImpl = globalThis.fetch,
}) {
  const hostname = normalizeCanonicalHostname(canonicalHostname);
  requiredText(token, 'VERCEL_TOKEN');
  const orgId = requiredText(organizationId, 'VERCEL_ORG_ID');
  requiredText(expectedDeploymentId, 'expected deployment ID');
  requiredText(expectedProjectId, 'expected project ID');
  requiredSha(expectedSha);
  if (typeof fetchImpl !== 'function') fail('fetch is unavailable');

  const url = `${VERCEL_API_URL}/v13/deployments/${hostname}?teamId=${encodeURIComponent(orgId)}`;
  const deadline = performance.now() + OVERALL_DEADLINE_MS;
  let attempts = 0;
  while (attempts < MAX_ATTEMPTS && performance.now() < deadline) {
    attempts += 1;
    try {
      // Clip each request to the remaining overall budget so the resolver
      // cannot overrun its five-minute deadline by a full request timeout.
      const requestBudget = Math.min(REQUEST_TIMEOUT_MS, deadline - performance.now());
      const deployment = await requestWithTimeout(url, token, fetchImpl, requestBudget);
      verifyCanonicalPromotion({
        canonicalHostname: hostname,
        deployment,
        expectedDeploymentId,
        expectedProjectId,
        expectedSha,
      });
      return {
        productionUrl: `https://${hostname}`,
        // Report the observed record id so downstream equality gates compare a
        // provider-attested value, not an echo of the expectation.
        deploymentId: deployment.id,
      };
    } catch {
      // Provider errors and not-yet-promoted responses are retriable. Details stay private.
    }

    const remaining = deadline - performance.now();
    if (attempts >= MAX_ATTEMPTS || remaining <= 0) break;
    await sleep(Math.min(MAX_WAIT_MS, remaining));
  }
  fail('canonical deployment did not match before resolver deadline');
}

async function writeGithubOutput(path, result) {
  await appendFile(
    path,
    `production_url=${result.productionUrl}\ndeployment_id=${result.deploymentId}\n`,
    'utf8'
  );
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = await resolveCanonicalPromotion({
    canonicalHostname: args['canonical-hostname'],
    expectedDeploymentId: args['expected-deployment-id'],
    expectedProjectId: args['expected-project-id'],
    expectedSha: args['expected-sha'],
    token: requiredEnvironment('VERCEL_TOKEN'),
    organizationId: requiredEnvironment('VERCEL_ORG_ID'),
  });
  if (args['github-output'] !== undefined) await writeGithubOutput(args['github-output'], result);
  console.log('Canonical Vercel promotion verified.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    console.error('Canonical Vercel promotion verification failed.');
    process.exitCode = 1;
  });
}
