import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createPrivateKey, sign } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AdmissionError,
  assert0062Admission,
  assert0062ProductionEndpoint,
} from './journaled-0062-admission.mjs';

const ID = /^[1-9][0-9]{0,15}$/;
const MINUTE = 60_000;
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

// Refusal codes are fixed tokens; they never carry identifiers, values, paths or key material.
export class SigningRefusal extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function requireValid(condition, code) {
  if (!condition) throw new SigningRefusal(code);
}

function parseJson(text, code) {
  try {
    return JSON.parse(text);
  } catch {
    throw new SigningRefusal(code);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Admission check messages are fixed texts; any other error text may hold protected data. */
export function refusalReason(error) {
  if (error instanceof SigningRefusal) return error.code;
  if (error instanceof AdmissionError) return error.message;
  return 'UNEXPECTED_ERROR';
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
  requireValid(
    ID.test(runId ?? '') && /^[\w.-]+\/[\w.-]+$/.test(repository ?? ''),
    'INVALID_ARGUMENTS'
  );
  requireValid(
    isObject(record) &&
      JSON.stringify(Object.keys(record).sort()) === JSON.stringify([...RECORD_KEYS].sort()),
    'RECORD_KEYS_INVALID'
  );
  requireValid(typeof payloadText === 'string', 'PAYLOAD_INVALID');

  const [run, repositoryInfo, pendingDeployments] = await Promise.all([
    github.getRun(runId),
    github.getRepository(),
    github.getPendingDeployments(runId),
  ]);
  const candidateSha = run?.head_sha;
  requireValid(
    String(run?.id) === runId &&
      run.repository?.full_name === repository &&
      repositoryInfo?.full_name === repository,
    'RUN_IDENTITY_MISMATCH'
  );
  requireValid(run.status === 'waiting', 'RUN_NOT_WAITING');
  requireValid(
    run.display_title === `actuals-schema:apply-journaled-0062:${candidateSha}`,
    'RUN_TITLE_MISMATCH'
  );
  requireValid(
    Array.isArray(pendingDeployments) &&
      pendingDeployments.some(
        (deployment) => deployment?.environment?.name === 'production-schema'
      ),
    'PENDING_ENVIRONMENT_MISMATCH'
  );
  const expectedSha = run.display_title.slice('actuals-schema:apply-journaled-0062:'.length);

  const environmentVariables = await github.getEnvironmentVariables('production-schema');
  requireValid(Array.isArray(environmentVariables), 'ENVIRONMENT_VARIABLES_UNREADABLE');
  const environment = {};
  for (const name of ENVIRONMENT_KEYS) {
    const matches = environmentVariables.filter((variable) => variable?.name === name);
    requireValid(
      matches.length === 1 && typeof matches[0].value === 'string',
      'ENVIRONMENT_VARIABLE_MISSING'
    );
    environment[name] = matches[0].value;
  }

  const parsedPayload = parseJson(payloadText, 'PAYLOAD_INVALID');
  requireValid(isObject(parsedPayload), 'PAYLOAD_INVALID');
  // Pre-checks name the likely time failure; assert0062Admission below stays authoritative.
  const fresh = (time, age) => Number.isSafeInteger(time) && time <= now && now - time <= age;
  requireValid(fresh(parsedPayload.reviewedAtMs, 30 * MINUTE), 'REVIEW_STALE_OR_MISSING');
  requireValid(
    fresh(parsedPayload.isolatedRestoredAtMs, 72 * 60 * MINUTE),
    'RESTORE_STALE_OR_MISSING'
  );
  const payload = JSON.stringify(parsedPayload);
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    throw new SigningRefusal('PRIVATE_KEY_INVALID');
  }
  requireValid(privateKey.asymmetricKeyType === 'ed25519', 'PRIVATE_KEY_INVALID');
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
    Array.isArray(databases) && databases.some((database) => database?.name === proof.database),
    'DATABASE_ABSENT'
  );
  requireValid(
    Array.isArray(roles) && roles.some((role) => role?.name === proof.role),
    'ROLE_ABSENT'
  );

  return envelope;
}

function ghApi(endpoint) {
  let output;
  try {
    output = execFileSync('gh', ['api', endpoint], {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 256 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new SigningRefusal('GITHUB_READ_FAILED');
  }
  return parseJson(output, 'GITHUB_READ_FAILED');
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
        requireValid(Array.isArray(result?.variables), 'ENVIRONMENT_VARIABLES_UNREADABLE');
        variables.push(...result.variables);
        if (result.variables.length < 100) return variables;
      }
    },
  };
}

function createNeonReader(apiKey) {
  async function neonJson(resource) {
    requireValid(typeof apiKey === 'string' && apiKey.length > 0, 'NEON_API_KEY_MISSING');
    let response;
    try {
      response = await fetch(`https://console.neon.tech/api/v2${resource}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SigningRefusal('NEON_READ_FAILED');
    }
    requireValid(response.ok, 'NEON_READ_FAILED');
    return parseJson(await response.text(), 'NEON_READ_FAILED');
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
        !argv[index + 1].startsWith('--'),
      'INVALID_ARGUMENTS'
    );
    values.set(flag, argv[index + 1]);
    index += 1;
  }
  requireValid(values.size === 5, 'INVALID_ARGUMENTS');
  return {
    repository: values.get('--repo'),
    runId: values.get('--run-id'),
    payloadPath: values.get('--payload'),
    privateKeyPath: values.get('--private-key'),
    recordPath: values.get('--record'),
  };
}

async function signerCheckoutRoot() {
  try {
    const scriptPath = await realpath(fileURLToPath(import.meta.url));
    const root = path.resolve(path.dirname(scriptPath), '../..');
    execFileSync('git', ['--git-dir=.git', '--work-tree=.', 'rev-parse', '--show-toplevel'], {
      cwd: root,
      stdio: 'ignore',
    });
    return root;
  } catch {
    throw new SigningRefusal('REPOSITORY_ROOT_UNRESOLVED');
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
  let resolvedPath;
  let metadata;
  try {
    resolvedPath = await realpath(filePath);
    metadata = await stat(resolvedPath);
  } catch {
    throw new SigningRefusal('INPUT_FILE_UNREADABLE');
  }
  requireValid(!isWithinDirectory(root, resolvedPath), 'INPUT_FILE_INSIDE_REPOSITORY');
  requireValid(metadata.isFile(), 'INPUT_FILE_UNREADABLE');
  if (privateKey)
    requireValid((metadata.mode & 0o044) === 0, 'PRIVATE_KEY_FILE_READABLE_BY_OTHERS');
  return resolvedPath;
}

async function readInput(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    throw new SigningRefusal('INPUT_FILE_UNREADABLE');
  }
}

async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const args = parseArgs(argv);
  requireValid(
    /^[\w.-]+\/[\w.-]+$/.test(args.repository) && ID.test(args.runId),
    'INVALID_ARGUMENTS'
  );
  const root = await signerCheckoutRoot();
  const [payloadPath, privateKeyPath, recordPath] = await Promise.all([
    resolveExternalFile(path.resolve(cwd, args.payloadPath), root),
    resolveExternalFile(path.resolve(cwd, args.privateKeyPath), root, { privateKey: true }),
    resolveExternalFile(path.resolve(cwd, args.recordPath), root),
  ]);
  const [payloadText, privateKeyPem, recordText] = await Promise.all([
    readInput(payloadPath),
    readInput(privateKeyPath),
    readInput(recordPath),
  ]);
  return sign0062Admission({
    payloadText,
    privateKeyPem,
    record: parseJson(recordText, 'RECORD_KEYS_INVALID'),
    runId: args.runId,
    repository: args.repository,
    github: createGithubReader(args.repository),
    neon: createNeonReader(process.env.NEON_API_KEY),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((envelope) => process.stdout.write(`${envelope}\n`))
    .catch((error) => {
      process.stderr.write(`${REFUSAL}: ${refusalReason(error)}\n`);
      process.exitCode = 1;
    });
}
