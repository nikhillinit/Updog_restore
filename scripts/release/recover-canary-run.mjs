import console from 'node:console';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Exact abandoned-run recovery. Both modes select by exact identity only:
// `resolve` by the unique workflow execution (run ID + attempt), `mark-failed`
// by the full recovery handle. Neither mode can search for a latest run, mark
// a run completed, purge, or select by SHA or time alone.
const SHA = /^[a-f0-9]{40}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKFLOW_RUN_ID = /^[1-9][0-9]{0,31}$/;

export const RECOVER_CANARY_EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  INVALID_ARGUMENT: 1,
  RECOVERY_FAILURE: 2,
});

// Resolve the one run created by this exact workflow execution; the partial
// unique index release_canary_runs_workflow_identity_unique backs uniqueness.
export const RECOVER_CANARY_RESOLVE_QUERY = `
  SELECT
    r.id AS "runId",
    r.status AS "runStatus",
    r.version AS "runVersion",
    r.release_sha AS "runReleaseSha",
    r.workflow_run_id AS "runWorkflowRunId",
    r.workflow_run_attempt AS "runWorkflowRunAttempt",
    f.id AS "fundId",
    f.data_origin AS "fundDataOrigin"
  FROM release_canary_runs AS r
  JOIN funds AS f ON f.canary_run_id = r.id
  WHERE r.workflow_run_id = $1
    AND r.workflow_run_attempt = $2
`;

// Prove the full recovery handle before any transition: exact fund, exact run,
// exact workflow execution, release-canary principal, and creator grant.
export const RECOVER_CANARY_MARK_FAILED_QUERY = `
  SELECT
    f.id AS "fundId",
    f.data_origin AS "fundDataOrigin",
    f.canary_run_id AS "fundCanaryRunId",
    r.id AS "runId",
    r.status AS "runStatus",
    r.version AS "runVersion",
    r.release_sha AS "runReleaseSha",
    r.workflow_run_id AS "runWorkflowRunId",
    r.workflow_run_attempt AS "runWorkflowRunAttempt",
    u.is_release_canary_principal AS "principalIsReleaseCanary",
    g.user_id AS "grantUserId"
  FROM funds AS f
  JOIN release_canary_runs AS r ON r.id = f.canary_run_id
  JOIN users AS u ON u.id = r.principal_user_id
  JOIN user_fund_grants AS g ON g.user_id = r.principal_user_id AND g.fund_id = f.id
  WHERE f.id = $1
    AND r.workflow_run_id = $2
    AND r.workflow_run_attempt = $3
`;

class RecoverCanaryArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecoverCanaryArgumentError';
  }
}

class RecoverCanaryProofError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecoverCanaryProofError';
  }
}

function invalid(message) {
  throw new RecoverCanaryArgumentError(message);
}

function proofFailure(message) {
  throw new RecoverCanaryProofError(message);
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    invalid(`${label} must be a 40-character SHA`);
  }
  return value.toLowerCase();
}

function requireUuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) {
    invalid(`${label} must be a UUID`);
  }
  return value.toLowerCase();
}

function requireWorkflowRunId(value, label) {
  if (typeof value !== 'string' || !WORKFLOW_RUN_ID.test(value)) {
    invalid(`${label} must be a decimal GitHub run ID`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    invalid(`${label} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    invalid(`${label} must be a positive integer`);
  }
  return parsed;
}

const MODE_FLAGS = Object.freeze({
  resolve: Object.freeze(['--github-run-id', '--github-run-attempt', '--expected-sha']),
  'mark-failed': Object.freeze([
    '--github-run-id',
    '--github-run-attempt',
    '--fund-id',
    '--canary-run-id',
    '--expected-sha',
  ]),
});

export function parseRecoverCanaryArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    invalid('a mode of resolve or mark-failed is required');
  }
  const [mode, ...flagArgs] = args;
  if (mode !== 'resolve' && mode !== 'mark-failed') {
    invalid('a mode of resolve or mark-failed is required');
  }

  const allowedFlags = MODE_FLAGS[mode];
  const options = {};
  const seenFlags = new Set();
  for (let index = 0; index < flagArgs.length; index += 1) {
    const flag = flagArgs[index];
    if (typeof flag !== 'string' || !flag.startsWith('--')) {
      invalid('arguments must be --name value pairs');
    }
    if (seenFlags.has(flag)) invalid(`Duplicate argument: ${flag}`);
    seenFlags.add(flag);
    if (!allowedFlags.includes(flag)) invalid(`Unknown argument: ${flag}`);

    const value = flagArgs[index + 1];
    if (value === undefined || typeof value !== 'string' || value.startsWith('--')) {
      invalid('arguments must be --name value pairs');
    }
    index += 1;

    if (flag === '--github-run-id') {
      options.githubRunId = requireWorkflowRunId(value, '--github-run-id');
    } else if (flag === '--github-run-attempt') {
      options.githubRunAttempt = requirePositiveInteger(value, '--github-run-attempt');
    } else if (flag === '--expected-sha') {
      options.expectedSha = requireSha(value, '--expected-sha');
    } else if (flag === '--fund-id') {
      options.fundId = requirePositiveInteger(value, '--fund-id');
    } else if (flag === '--canary-run-id') {
      options.canaryRunId = requireUuid(value, '--canary-run-id');
    }
  }

  for (const flag of allowedFlags) {
    const key = {
      '--github-run-id': 'githubRunId',
      '--github-run-attempt': 'githubRunAttempt',
      '--expected-sha': 'expectedSha',
      '--fund-id': 'fundId',
      '--canary-run-id': 'canaryRunId',
    }[flag];
    if (options[key] === undefined) invalid(`${flag} is required`);
  }

  return { mode, ...options };
}

function exactNumberField(row, key, label) {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value)) proofFailure(`${label} is not a safe integer`);
  return value;
}

function requireSingleRow(rows, label) {
  if (!Array.isArray(rows)) proofFailure(`${label} query did not return rows`);
  if (rows.length !== 1) {
    proofFailure(`${label} query returned ${rows.length} rows; exactly one is required`);
  }
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    proofFailure(`${label} row is invalid`);
  }
  return row;
}

function proveWorkflowIdentity(row, options) {
  if (row.runWorkflowRunId !== options.githubRunId) {
    proofFailure('run workflow run ID does not equal the requested workflow execution');
  }
  const attempt = exactNumberField(row, 'runWorkflowRunAttempt', 'run workflow attempt');
  if (attempt !== options.githubRunAttempt) {
    proofFailure('run workflow attempt does not equal the requested workflow execution');
  }
}

/** Resolve the exact recovery handle for one workflow execution. */
export function resolveRecoveryHandle({ rows, options } = {}) {
  const row = requireSingleRow(rows, 'exact workflow execution');
  proveWorkflowIdentity(row, options);
  const releaseSha = typeof row.runReleaseSha === 'string' ? row.runReleaseSha.toLowerCase() : '';
  if (!SHA.test(releaseSha) || releaseSha !== options.expectedSha) {
    proofFailure('run release SHA does not equal the expected SHA');
  }
  if (row.fundDataOrigin !== 'release_canary') {
    proofFailure('fund origin is not release_canary');
  }
  const fundId = exactNumberField(row, 'fundId', 'fund ID');
  if (fundId < 1) proofFailure('fund ID is invalid');
  const canaryRunId = typeof row.runId === 'string' ? row.runId.toLowerCase() : '';
  if (!UUID.test(canaryRunId)) proofFailure('run ID is invalid');

  return {
    schemaVersion: 'release-canary-recovery-handle-v1',
    githubRunId: options.githubRunId,
    githubRunAttempt: options.githubRunAttempt,
    fundId,
    canaryRunId,
    releaseSha,
  };
}

/** Prove the full recovery handle and classify the version-fenced transition. */
export function proveMarkFailedTarget({ rows, options } = {}) {
  const row = requireSingleRow(rows, 'exact recovery handle');
  if (exactNumberField(row, 'fundId', 'fund ID') !== options.fundId) {
    proofFailure('fund ID does not equal the requested fund');
  }
  if (row.fundDataOrigin !== 'release_canary') {
    proofFailure('fund origin is not release_canary');
  }
  const canaryRunId = typeof row.runId === 'string' ? row.runId.toLowerCase() : null;
  const fundCanaryRunId =
    typeof row.fundCanaryRunId === 'string' ? row.fundCanaryRunId.toLowerCase() : null;
  if (canaryRunId === null || fundCanaryRunId !== canaryRunId) {
    proofFailure('fund canary_run_id does not equal the joined run ID');
  }
  if (canaryRunId !== options.canaryRunId) {
    proofFailure('run ID does not equal the requested canary run');
  }
  proveWorkflowIdentity(row, options);
  const releaseSha = typeof row.runReleaseSha === 'string' ? row.runReleaseSha.toLowerCase() : '';
  if (!SHA.test(releaseSha) || releaseSha !== options.expectedSha) {
    proofFailure('run release SHA does not equal the expected SHA');
  }
  if (row.principalIsReleaseCanary !== true && row.principalIsReleaseCanary !== 't') {
    proofFailure('run principal is not a release canary principal');
  }
  if (exactNumberField(row, 'grantUserId', 'creator grant user') < 1) {
    proofFailure('creator grant user is invalid');
  }

  const runVersion = exactNumberField(row, 'runVersion', 'run version');
  if (runVersion < 1) proofFailure('run version is invalid');
  const runStatus = row.runStatus;
  if (runStatus === 'completed') {
    return { runId: canaryRunId, runVersion, runStatus, outcome: 'noop-already-completed' };
  }
  if (runStatus === 'failed') {
    return { runId: canaryRunId, runVersion, runStatus, outcome: 'already-failed' };
  }
  if (runStatus !== 'created' && runStatus !== 'running') {
    proofFailure(`run status ${String(runStatus)} cannot be marked failed`);
  }
  return { runId: canaryRunId, runVersion, runStatus, outcome: 'marked-failed' };
}

export async function readSharedCanaryRunTransition() {
  const { tsImport } = await import('tsx/esm/api');
  const { transitionReleaseCanaryRun } = await tsImport(
    '../../server/services/canary-residue-service.ts',
    import.meta.url
  );
  return transitionReleaseCanaryRun;
}

async function createPgPool(connectionString) {
  const { Pool } = await import('pg');
  return new Pool({ connectionString, connectionTimeoutMillis: 5000, allowExitOnIdle: true });
}

async function queryWithPool(databaseUrl, createPool, text, values) {
  const pool = await createPool(databaseUrl);
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(text, values);
    return result?.rows;
  } finally {
    try {
      client?.release();
    } finally {
      await pool.end();
    }
  }
}

function failureSummary(error, mode) {
  if (error instanceof RecoverCanaryArgumentError) {
    return {
      mode: mode ?? null,
      outcome: 'invalid',
      reason: error.message,
      exitCode: RECOVER_CANARY_EXIT_CODES.INVALID_ARGUMENT,
    };
  }
  const safeMessage =
    error instanceof RecoverCanaryProofError ||
    error?.name === 'CanaryRunTransitionConflictError' ||
    error?.name === 'CanaryResiduePreflightError'
      ? error.message
      : 'Release canary recovery configuration or query failed';
  return {
    mode: mode ?? null,
    outcome: 'recovery-failure',
    reason: safeMessage,
    exitCode: RECOVER_CANARY_EXIT_CODES.RECOVERY_FAILURE,
  };
}

/**
 * Execute the recovery command with injectable environment and I/O boundaries.
 * `resolve` is read-only; `mark-failed` performs one version-fenced
 * created|running -> failed transition on the exact proven run.
 */
export async function runCanaryRecovery({
  args = process.argv.slice(2),
  env = process.env,
  queryResolveRows,
  queryMarkFailedRows,
  transitionRun,
  createPool = createPgPool,
  output = console.log,
  errorOutput = console.error,
} = {}) {
  let options;
  try {
    options = parseRecoverCanaryArgs(args);
    const databaseUrl = typeof env?.DATABASE_URL === 'string' ? env.DATABASE_URL.trim() : '';
    if (databaseUrl === '' || databaseUrl.toLowerCase().startsWith('memory://')) {
      invalid('DATABASE_URL is required; refusing to run against memory://');
    }

    if (options.mode === 'resolve') {
      const rows =
        typeof queryResolveRows === 'function'
          ? await queryResolveRows(options.githubRunId, options.githubRunAttempt)
          : await queryWithPool(databaseUrl, createPool, RECOVER_CANARY_RESOLVE_QUERY, [
              options.githubRunId,
              options.githubRunAttempt,
            ]);
      const handle = resolveRecoveryHandle({ rows, options });
      output(JSON.stringify(handle));
      return RECOVER_CANARY_EXIT_CODES.SUCCESS;
    }

    const readMarkFailedRows =
      typeof queryMarkFailedRows === 'function'
        ? queryMarkFailedRows
        : (fundId, githubRunId, githubRunAttempt) =>
            queryWithPool(databaseUrl, createPool, RECOVER_CANARY_MARK_FAILED_QUERY, [
              fundId,
              githubRunId,
              githubRunAttempt,
            ]);
    const rows = await readMarkFailedRows(
      options.fundId,
      options.githubRunId,
      options.githubRunAttempt
    );
    const target = proveMarkFailedTarget({ rows, options });

    if (target.outcome !== 'noop-already-completed') {
      const transition = transitionRun ?? (await readSharedCanaryRunTransition());
      await transition(target.runId, 'failed', target.runVersion, ['created', 'running']);
      const reloaded = requireSingleRow(
        await readMarkFailedRows(options.fundId, options.githubRunId, options.githubRunAttempt),
        'exact recovery handle reload'
      );
      const reloadedRunId =
        typeof reloaded.runId === 'string' ? reloaded.runId.toLowerCase() : null;
      if (reloadedRunId !== target.runId) {
        proofFailure('exact recovery handle reload returned a different run');
      }
      if (reloaded.runStatus !== 'failed') {
        proofFailure('exact run did not reach failed after the fenced transition');
      }
    }

    output(
      JSON.stringify({
        mode: 'mark-failed',
        outcome: target.outcome,
        fundId: options.fundId,
        canaryRunId: target.runId,
        githubRunId: options.githubRunId,
        githubRunAttempt: options.githubRunAttempt,
        status: target.outcome === 'noop-already-completed' ? 'completed' : 'failed',
        exitCode: RECOVER_CANARY_EXIT_CODES.SUCCESS,
      })
    );
    return RECOVER_CANARY_EXIT_CODES.SUCCESS;
  } catch (error) {
    const summary = failureSummary(error, options?.mode);
    output(JSON.stringify(summary));
    errorOutput(summary.reason);
    return summary.exitCode;
  }
}

function isDirectEntrypoint(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

if (isDirectEntrypoint(import.meta.url)) {
  runCanaryRecovery().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
