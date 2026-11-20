import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createPrivateKey, sign } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assert0062Admission, assert0062ProductionEndpoint } from './journaled-0062-admission.mjs';

const ID = /^[1-9][0-9]{0,15}$/;
const REFUSAL = '0062 admission signing refused';
const RECORD_KEYS = [
  'ACTUALS_PREFLIGHT_NEON_PROJECT_ID',
  'ACTUALS_PREFLIGHT_NEON_BRANCH_ID',
  'ACTUALS_PREFLIGHT_NEON_ENDPOINT_ID',
  'PRODUCTION_DATABASE_NAME',
  'ACTUALS_PREFLIGHT_DATABASE_ROLE',
  'PRODUCTION_SCHEMA_TARGET_FINGERPRINT',
];
const ENVIRONMENT_KEYS = [
  'SCHEMA_0062_RECOVERY_PUBLIC_KEY',
  'SCHEMA_0062_REHEARSAL_PROJECT_ID',
  'SCHEMA_0062_REHEARSAL_PARENT_BRANCH_ID',
  'SCHEMA_0062_REHEARSAL_DATABASE_NAME',
];

function requireValid(condition) {
  if (!condition) throw new Error('invalid admission signing input');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function sign0062Admission({
  payloadText,
  privateKeyPem,
  record,
  runId,
  repository,
  github,
  neon,
  now = Date.now(),
}) {
  requireValid(ID.test(runId ?? '') && /^[\w.-]+\/[\w.-]+$/.test(repository ?? ''));
  requireValid(typeof payloadText === 'string' && isObject(record));
  requireValid(
    JSON.stringify(Object.keys(record).sort()) === JSON.stringify([...RECORD_KEYS].sort())
  );

  const [run, repositoryInfo, pendingDeployments] = await Promise.all([
    github.getRun(runId),
    github.getRepository(),
    github.getPendingDeployments(runId),
  ]);
  const candidateSha = run?.head_sha;
  requireValid(
    run?.status === 'waiting' &&
      String(run.id) === runId &&
      run.repository?.full_name === repository &&
      repositoryInfo?.full_name === repository &&
      run.display_title === `actuals-schema:apply-journaled-0062:${candidateSha}` &&
      Array.isArray(pendingDeployments) &&
      pendingDeployments.some((deployment) => deployment?.environment?.name === 'production-schema')
  );
  const expectedSha = run.display_title.slice('actuals-schema:apply-journaled-0062:'.length);

  const environmentVariables = await github.getEnvironmentVariables('production-schema');
  requireValid(Array.isArray(environmentVariables));
  const environment = {};
  for (const name of ENVIRONMENT_KEYS) {
    const matches = environmentVariables.filter((variable) => variable?.name === name);
    requireValid(matches.length === 1 && typeof matches[0].value === 'string');
    environment[name] = matches[0].value;
  }

  const parsedPayload = JSON.parse(payloadText);
  requireValid(isObject(parsedPayload) && typeof privateKeyPem === 'string');
  const payload = JSON.stringify(parsedPayload);
  const privateKey = createPrivateKey(privateKeyPem);
  requireValid(privateKey.asymmetricKeyType === 'ed25519');
  const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64');
  const envelope = JSON.stringify({ payload, signature });

  const ref = `refs/heads/${run.head_branch}`;
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: String(run.run_attempt),
    GITHUB_SHA: candidateSha,
    EXPECTED_SHA: expectedSha,
    GITHUB_ACTOR_ID: String(run.actor?.id ?? ''),
    GITHUB_ACTOR: run.actor?.login,
    GITHUB_TRIGGERING_ACTOR: run.triggering_actor?.login,
    GITHUB_EVENT_NAME: run.event,
    GITHUB_REF: ref,
    GITHUB_WORKFLOW_REF: `${repository}/${run.path}@${ref}`,
    GITHUB_WORKFLOW_SHA: run.head_sha,
    REPOSITORY_OWNER_ID: String(repositoryInfo.owner?.id ?? ''),
    ...record,
    ...environment,
    SCHEMA_0062_ADMISSION: envelope,
  };
  const proof = assert0062Admission({ env, now });

  const [endpoint, databases, roles] = await Promise.all([
    neon.getEndpoint(proof.projectId, proof.endpointId),
    neon.getDatabases(proof.projectId, proof.sourceBranchId),
    neon.getRoles(proof.projectId, proof.sourceBranchId),
  ]);
  assert0062ProductionEndpoint({ proof, endpoint });
  requireValid(
    Array.isArray(databases) && databases.some((database) => database?.name === proof.database)
  );
  requireValid(Array.isArray(roles) && roles.some((role) => role?.name === proof.role));

  return envelope;
}

function ghApi(endpoint) {
  return JSON.parse(
    execFileSync('gh', ['api', endpoint], {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 256 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  );
}

function createGithubReader(repository) {
  const base = `repos/${repository}`;
  return {
    getRun: (runId) => ghApi(`${base}/actions/runs/${runId}`),
    getRepository: () => ghApi(base),
    getPendingDeployments: (runId) => ghApi(`${base}/actions/runs/${runId}/pending_deployments`),
    getEnvironmentVariables(environmentName) {
      const variables = [];
      for (let page = 1; ; page += 1) {
        const result = ghApi(
          `${base}/environments/${encodeURIComponent(environmentName)}/variables?per_page=100&page=${page}`
        );
        requireValid(Array.isArray(result?.variables));
        variables.push(...result.variables);
        if (result.variables.length < 100) return variables;
      }
    },
  };
}

function createNeonReader(apiKey) {
  async function neonJson(resource) {
    requireValid(typeof apiKey === 'string' && apiKey.length > 0);
    const response = await fetch(`https://console.neon.tech/api/v2${resource}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    requireValid(response.ok);
    return response.json();
  }

  return {
    async getEndpoint(projectId, endpointId) {
      return (await neonJson(`/projects/${projectId}/endpoints/${endpointId}`)).endpoint;
    },
    async getDatabases(projectId, branchId) {
      return (await neonJson(`/projects/${projectId}/branches/${branchId}/databases`)).databases;
    },
    async getRoles(projectId, branchId) {
      return (await neonJson(`/projects/${projectId}/branches/${branchId}/roles`)).roles;
    },
  };
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    requireValid(
      ['--repo', '--run-id', '--payload', '--private-key', '--record'].includes(flag) &&
        !values.has(flag) &&
        typeof argv[index + 1] === 'string' &&
        argv[index + 1].length > 0 &&
        !argv[index + 1].startsWith('--')
    );
    values.set(flag, argv[index + 1]);
    index += 1;
  }
  requireValid(values.size === 5);
  return {
    repository: values.get('--repo'),
    runId: values.get('--run-id'),
    payloadPath: values.get('--payload'),
    privateKeyPath: values.get('--private-key'),
    recordPath: values.get('--record'),
  };
}

function workingTreeRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return cwd;
  }
}

function isWithinDirectory(directory, file) {
  const relative = path.relative(directory, file);
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== '..')
  );
}

async function resolveExternalFile(filePath, root, { privateKey = false } = {}) {
  const resolvedPath = await realpath(filePath);
  requireValid(!isWithinDirectory(root, resolvedPath));
  const metadata = await stat(resolvedPath);
  requireValid(metadata.isFile());
  if (privateKey) requireValid((metadata.mode & 0o044) === 0);
  return resolvedPath;
}

async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const args = parseArgs(argv);
  requireValid(/^[\w.-]+\/[\w.-]+$/.test(args.repository) && ID.test(args.runId));
  const root = await realpath(workingTreeRoot(cwd));
  const [payloadPath, privateKeyPath, recordPath] = await Promise.all([
    resolveExternalFile(path.resolve(cwd, args.payloadPath), root),
    resolveExternalFile(path.resolve(cwd, args.privateKeyPath), root, { privateKey: true }),
    resolveExternalFile(path.resolve(cwd, args.recordPath), root),
  ]);
  const [payloadText, privateKeyPem, recordText] = await Promise.all([
    readFile(payloadPath, 'utf8'),
    readFile(privateKeyPath, 'utf8'),
    readFile(recordPath, 'utf8'),
  ]);
  const record = JSON.parse(recordText);
  return sign0062Admission({
    payloadText,
    privateKeyPem,
    record,
    runId: args.runId,
    repository: args.repository,
    github: createGithubReader(args.repository),
    neon: createNeonReader(process.env.NEON_API_KEY),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((envelope) => process.stdout.write(`${envelope}\n`))
    .catch(() => {
      process.stderr.write(`${REFUSAL}\n`);
      process.exitCode = 1;
    });
}
