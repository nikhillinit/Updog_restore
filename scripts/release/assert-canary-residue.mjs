import console from 'node:console';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Aggregate caps intentionally include unpurged residue across all release
// SHAs; expected SHA scopes completion evidence, not cap accounting.
const SHA = /^[a-f0-9]{40}$/i;
const HOUR_MS = 60 * 60 * 1000;
const MAX_ECMASCRIPT_TIME_MS = 8_640_000_000_000_000;
const RESIDUE_FIELDS = Object.freeze([
  'portfolioCompany',
  'fund',
  'fundConfig',
  'fundEvent',
  'notification',
  'grant',
  'calculation',
  'mutationReceipt',
  'scenario',
  'reporting',
]);
const RUN_STATUSES = new Set(['created', 'running', 'completed', 'failed', 'expired', 'purged']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKFLOW_RUN_ID = /^[1-9][0-9]{0,31}$/;
const TERMINAL_TRANSITIONS = Object.freeze({
  '--complete-current-run': 'completed',
  '--fail-current-run': 'failed',
});

export const CANARY_RESIDUE_EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  INVALID_ARGUMENT: 1,
  POLICY_FAILURE: 2,
  EXPECTED_SHA_FAILURE: 3,
  EXACT_RUN_FAILURE: 4,
});

export const RELEASE_CANARY_RUNS_QUERY = `
  SELECT
    id,
    version,
    release_sha AS "releaseSha",
    status,
    expires_at AS "expiresAt",
    purged_at AS "purgedAt",
    created_at AS "createdAt",
    portfolio_company_residue_count AS "portfolioCompanyResidueCount",
    fund_residue_count AS "fundResidueCount",
    fund_config_residue_count AS "fundConfigResidueCount",
    fund_event_residue_count AS "fundEventResidueCount",
    notification_residue_count AS "notificationResidueCount",
    grant_residue_count AS "grantResidueCount",
    calculation_residue_count AS "calculationResidueCount",
    mutation_receipt_residue_count AS "mutationReceiptResidueCount",
    scenario_residue_count AS "scenarioResidueCount",
    reporting_residue_count AS "reportingResidueCount",
    total_residue_count AS "totalResidueCount"
  FROM release_canary_runs
  ORDER BY created_at ASC, id ASC
`;

// Exact current-execution proof: the fund ID is the primary selector, and the
// joins prove the stored run belongs to this exact GitHub workflow execution.
export const RELEASE_CANARY_EXACT_RUN_QUERY = `
  SELECT
    f.id AS "fundId",
    f.data_origin AS "fundDataOrigin",
    f.canary_run_id AS "fundCanaryRunId",
    r.id AS "runId",
    r.version AS "runVersion",
    r.status AS "runStatus",
    r.release_sha AS "runReleaseSha",
    r.workflow_run_id AS "runWorkflowRunId",
    r.workflow_run_attempt AS "runWorkflowRunAttempt",
    r.created_at AS "runCreatedAt",
    u.is_release_canary_principal AS "principalIsReleaseCanary",
    g.user_id AS "grantUserId"
  FROM funds AS f
  JOIN release_canary_runs AS r ON r.id = f.canary_run_id
  JOIN users AS u ON u.id = r.principal_user_id
  JOIN user_fund_grants AS g ON g.user_id = r.principal_user_id AND g.fund_id = f.id
  WHERE f.id = $1
`;

class CanaryResidueAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanaryResidueAssertionError';
  }
}

export class CanaryExactRunProofError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanaryExactRunProofError';
  }
}

function exactProofFailure(message) {
  throw new CanaryExactRunProofError(message);
}

function invalid(message) {
  throw new CanaryResidueAssertionError(message);
}

function requireSha(value, label = 'expected SHA') {
  if (typeof value !== 'string' || !SHA.test(value)) {
    invalid(`${label} must be a 40-character SHA`);
  }
  return value.toLowerCase();
}

function requirePositiveNumber(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    invalid(`${label} must be a positive number`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    invalid(`${label} must be a positive number`);
  }
  return parsed;
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

function requireTimestampString(value, label) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_ECMASCRIPT_TIME_MS) {
    invalid(`${label} must be a valid timestamp`);
  }
  return value;
}

export function parseCanaryResidueArgs(args) {
  if (!Array.isArray(args)) invalid('arguments must be --name value pairs');

  const options = {};
  const seenFlags = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (typeof flag !== 'string' || !flag.startsWith('--')) {
      invalid('arguments must be --name value pairs');
    }
    if (seenFlags.has(flag)) invalid(`Duplicate argument: ${flag}`);
    seenFlags.add(flag);

    if (flag === '--global-only') {
      options.globalOnly = true;
      continue;
    }
    if (flag === '--complete-current-run' || flag === '--fail-current-run') {
      if (options.terminalStatus !== undefined) {
        invalid('--complete-current-run and --fail-current-run are mutually exclusive');
      }
      options.terminalStatus = TERMINAL_TRANSITIONS[flag];
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || typeof value !== 'string' || value.startsWith('--')) {
      invalid('arguments must be --name value pairs');
    }
    index += 1;

    if (flag === '--expected-sha') {
      options.expectedSha = requireSha(value);
    } else if (flag === '--max-age-hours') {
      options.maxAgeHours = requirePositiveNumber(value, '--max-age-hours');
    } else if (flag === '--expected-fund-id') {
      options.expectedFundId = requirePositiveInteger(value, '--expected-fund-id');
    } else if (flag === '--expected-canary-run-id') {
      options.expectedCanaryRunId = requireUuid(value, '--expected-canary-run-id');
    } else if (flag === '--github-run-id') {
      options.githubRunId = requireWorkflowRunId(value, '--github-run-id');
    } else if (flag === '--github-run-attempt') {
      options.githubRunAttempt = requirePositiveInteger(value, '--github-run-attempt');
    } else if (flag === '--started-at') {
      options.startedAt = requireTimestampString(value, '--started-at');
    } else if (flag === '--max-clock-skew-seconds') {
      options.maxClockSkewSeconds = requirePositiveNumber(value, '--max-clock-skew-seconds');
    } else if (flag === '--emit-result') {
      if (value.trim() === '') invalid('--emit-result must be a file path');
      options.emitResultPath = value;
    } else {
      invalid(`Unknown argument: ${flag}`);
    }
  }

  if (options.globalOnly === true) {
    // Read-only recovery-surface evaluation: no exact-run proof or transition
    // may combine with it, so no update path can hide behind the global scan.
    for (const [key, flag] of Object.entries({
      expectedFundId: '--expected-fund-id',
      expectedCanaryRunId: '--expected-canary-run-id',
      githubRunId: '--github-run-id',
      githubRunAttempt: '--github-run-attempt',
      startedAt: '--started-at',
      maxClockSkewSeconds: '--max-clock-skew-seconds',
      emitResultPath: '--emit-result',
    })) {
      if (options[key] !== undefined) invalid(`${flag} is forbidden with --global-only`);
    }
    if (options.terminalStatus !== undefined) {
      invalid('run transitions are forbidden with --global-only');
    }
    return {
      expectedSha: requireSha(options.expectedSha),
      maxAgeHours: options.maxAgeHours,
      globalOnly: true,
    };
  }

  if (options.expectedFundId === undefined) invalid('--expected-fund-id is required');
  if (options.expectedCanaryRunId === undefined) invalid('--expected-canary-run-id is required');
  if (options.githubRunId === undefined) invalid('--github-run-id is required');
  if (options.githubRunAttempt === undefined) invalid('--github-run-attempt is required');
  if (options.startedAt === undefined) invalid('--started-at is required');
  if (options.maxClockSkewSeconds === undefined) invalid('--max-clock-skew-seconds is required');
  if (options.terminalStatus === undefined) {
    invalid('exactly one of --complete-current-run or --fail-current-run is required');
  }

  return {
    expectedSha: requireSha(options.expectedSha),
    maxAgeHours: options.maxAgeHours,
    globalOnly: false,
    expectedFundId: options.expectedFundId,
    expectedCanaryRunId: options.expectedCanaryRunId,
    githubRunId: options.githubRunId,
    githubRunAttempt: options.githubRunAttempt,
    startedAt: options.startedAt,
    maxClockSkewSeconds: options.maxClockSkewSeconds,
    terminalStatus: options.terminalStatus,
    emitResultPath: options.emitResultPath,
  };
}

/**
 * Write the exact current-run residue result (mode 0600, create-only) for the
 * workflow's evidence-fragment builders. Emitted for BOTH terminal
 * transitions, before the CLI's final exit decision, so a failed canary still
 * leaves exact-run diagnostics.
 */
async function writeEmitResultFile(path, result) {
  let handle;
  try {
    handle = await open(resolve(path), 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(result)}\n`, 'utf8');
    await handle.chmod(0o600);
  } catch {
    invalid('canary residue result file could not be written');
  } finally {
    await handle?.close();
  }
}

function numberFromValue(value, label) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid(`${label} must be a safe non-negative integer`);
  }
  return value;
}

function addSafeNonNegative(left, right, label) {
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum < 0) {
    invalid(`${label} exceeds the safe integer range`);
  }
  return sum;
}

function timestampFromValue(value, label) {
  let timestamp;
  if (value instanceof Date) {
    timestamp = value.getTime();
  } else if (typeof value === 'number') {
    timestamp = value;
  } else if (typeof value === 'string') {
    timestamp = Date.parse(value);
  } else {
    invalid(`${label} must be a valid timestamp`);
  }
  if (!Number.isFinite(timestamp) || Math.abs(timestamp) > MAX_ECMASCRIPT_TIME_MS) {
    invalid(`${label} must be a valid timestamp`);
  }
  return timestamp;
}

function validatePolicy(policy, maxAgeHours) {
  if (!policy || typeof policy !== 'object') invalid('canary runtime policy is unavailable');

  const normalized = {};
  for (const field of [...RESIDUE_FIELDS, 'total']) {
    normalized[field] = numberFromValue(policy[field], `policy ${field}`);
  }

  const ttlHours = policy.ttlHours;
  if (typeof ttlHours !== 'number' || !Number.isFinite(ttlHours) || ttlHours <= 0) {
    invalid('policy ttlHours must be a positive number');
  }
  const effectiveMaxAgeHours = maxAgeHours === undefined ? ttlHours : maxAgeHours;
  if (!Number.isFinite(effectiveMaxAgeHours) || effectiveMaxAgeHours <= 0) {
    invalid('effective maximum age must be a positive number');
  }
  const effectiveMaxAgeDurationMs = effectiveMaxAgeHours * HOUR_MS;
  if (
    !Number.isFinite(effectiveMaxAgeDurationMs) ||
    effectiveMaxAgeDurationMs <= 0 ||
    effectiveMaxAgeDurationMs > MAX_ECMASCRIPT_TIME_MS
  ) {
    invalid('effective maximum age duration is out of range');
  }

  return { ...normalized, ttlHours, effectiveMaxAgeHours, effectiveMaxAgeDurationMs };
}

function emptyCounts() {
  return {
    rows: 0,
    unpurgedRows: 0,
    purgedRows: 0,
    expectedShaRuns: 0,
    completedExpectedShaRuns: 0,
  };
}

function emptyResidue() {
  return {
    portfolioCompany: 0,
    fund: 0,
    fundConfig: 0,
    fundEvent: 0,
    notification: 0,
    grant: 0,
    calculation: 0,
    mutationReceipt: 0,
    scenario: 0,
    reporting: 0,
    total: 0,
  };
}

function summary({
  expectedSha = null,
  caps = null,
  counts = emptyCounts(),
  residue = emptyResidue(),
  exitCode,
  verdict,
  reason = null,
}) {
  return { expectedSha, caps, counts, residue, exitCode, verdict, reason };
}

function invalidSummary(error, expectedSha = null, caps = null) {
  const reason =
    error instanceof CanaryResidueAssertionError
      ? error.message
      : 'Canary residue assertion configuration or query failed';
  return summary({
    expectedSha,
    caps,
    exitCode: CANARY_RESIDUE_EXIT_CODES.INVALID_ARGUMENT,
    verdict: 'invalid',
    reason,
  });
}

function normalizeCanaryRow(row, index, now, effectiveMaxAgeDurationMs) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    invalid(`release canary row ${index} is invalid`);
  }
  const releaseSha = requireSha(row.releaseSha, `release canary row ${index} releaseSha`);
  if (typeof row.status !== 'string' || !RUN_STATUSES.has(row.status)) {
    invalid(`release canary row ${index} status is invalid`);
  }
  const hasPurgedStatus = row.status === 'purged';
  const hasPurgedAt = row.purgedAt !== undefined && row.purgedAt !== null;
  if (hasPurgedAt) {
    timestampFromValue(row.purgedAt, `release canary row ${index} purgedAt`);
  }
  if (hasPurgedStatus !== hasPurgedAt) {
    invalid(`release canary row ${index} purge markers are inconsistent`);
  }

  // Full structural validation runs before purge exclusion: a purged row with
  // malformed timestamps or counts must fail, never silently vanish from caps.
  const createdAt = timestampFromValue(row.createdAt, `release canary row ${index} createdAt`);
  const expiresAt = timestampFromValue(row.expiresAt, `release canary row ${index} expiresAt`);
  const residue = {};
  let typeTotal = 0;
  for (const field of RESIDUE_FIELDS) {
    const value = numberFromValue(
      row[`${field}ResidueCount`],
      `release canary row ${index} ${field}`
    );
    residue[field] = value;
    typeTotal = addSafeNonNegative(typeTotal, value, `release canary row ${index} total`);
  }
  residue.total = numberFromValue(row.totalResidueCount, `release canary row ${index} total`);
  if (residue.total !== typeTotal) {
    invalid(`release canary row ${index} total residue does not match per-type residue`);
  }

  if (hasPurgedStatus) {
    return { releaseSha, status: 'purged', purged: true };
  }

  const oldestAllowedCreatedAt = now - effectiveMaxAgeDurationMs;
  const tooOld =
    oldestAllowedCreatedAt >= -MAX_ECMASCRIPT_TIME_MS && createdAt < oldestAllowedCreatedAt;
  return {
    releaseSha,
    status: row.status,
    purged: false,
    residue,
    expired: row.status === 'expired' || expiresAt <= now || tooOld,
  };
}

/**
 * Evaluate stored release-canary rows without database or network I/O.
 * The supplied `now` value keeps expiration and age handling deterministic.
 */
export function evaluateCanaryResidue({
  expectedSha,
  rows,
  policy,
  now = Date.now(),
  maxAgeHours,
} = {}) {
  let normalizedSha = null;
  let caps = null;
  try {
    normalizedSha = requireSha(expectedSha);
    if (!Array.isArray(rows)) invalid('release canary query did not return rows');
    const nowTimestamp = timestampFromValue(now, 'current time');
    if (maxAgeHours !== undefined) {
      if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
        invalid('maxAgeHours must be a positive number');
      }
    }
    caps = validatePolicy(policy, maxAgeHours);

    const counts = emptyCounts();
    const residue = emptyResidue();
    const completionFailures = [];
    const policyFailures = [];

    for (const [index, row] of rows.entries()) {
      counts.rows += 1;
      const normalized = normalizeCanaryRow(
        row,
        index,
        nowTimestamp,
        caps.effectiveMaxAgeDurationMs
      );
      const expected = normalized.releaseSha === normalizedSha;
      if (expected) {
        counts.expectedShaRuns += 1;
        if (normalized.status === 'completed') {
          counts.completedExpectedShaRuns += 1;
        } else {
          completionFailures.push(`expected SHA run ${index} has status ${normalized.status}`);
        }
      }
      if (normalized.purged) {
        counts.purgedRows += 1;
        continue;
      }

      counts.unpurgedRows += 1;
      for (const field of [...RESIDUE_FIELDS, 'total']) {
        residue[field] = addSafeNonNegative(
          residue[field],
          normalized.residue[field],
          `aggregate ${field} residue`
        );
      }
      if (normalized.status === 'created' || normalized.status === 'running') {
        policyFailures.push(`unpurged run ${index} remains active`);
      }
      if (normalized.expired) policyFailures.push(`unpurged run ${index} is expired or too old`);
    }

    if (counts.expectedShaRuns === 0) {
      completionFailures.push('no release canary run exists for expected SHA');
    }

    for (const field of [...RESIDUE_FIELDS, 'total']) {
      if (residue[field] > caps[field]) {
        policyFailures.push(`${field} residue ${residue[field]} exceeds cap ${caps[field]}`);
      }
    }

    if (completionFailures.length > 0) {
      return summary({
        expectedSha: normalizedSha,
        caps,
        counts,
        residue,
        exitCode: CANARY_RESIDUE_EXIT_CODES.EXPECTED_SHA_FAILURE,
        verdict: 'expected-sha-failure',
        reason: completionFailures.join('; '),
      });
    }
    if (policyFailures.length > 0) {
      return summary({
        expectedSha: normalizedSha,
        caps,
        counts,
        residue,
        exitCode: CANARY_RESIDUE_EXIT_CODES.POLICY_FAILURE,
        verdict: 'policy-failure',
        reason: policyFailures.join('; '),
      });
    }
    return summary({
      expectedSha: normalizedSha,
      caps,
      counts,
      residue,
      exitCode: CANARY_RESIDUE_EXIT_CODES.SUCCESS,
      verdict: 'pass',
    });
  } catch (error) {
    return invalidSummary(error, normalizedSha, caps);
  }
}

export async function readSharedRuntimePolicy() {
  const { tsImport } = await import('tsx/esm/api');
  const { readCanaryRuntimePolicy } = await tsImport(
    '../../server/services/canary-residue-service.ts',
    import.meta.url
  );
  return readCanaryRuntimePolicy();
}

export async function readSharedCanaryRunTransition() {
  const { tsImport } = await import('tsx/esm/api');
  const { transitionReleaseCanaryRun } = await tsImport(
    '../../server/services/canary-residue-service.ts',
    import.meta.url
  );
  return transitionReleaseCanaryRun;
}

export async function readSharedReservedResidue() {
  const { tsImport } = await import('tsx/esm/api');
  const { RELEASE_CANARY_RESERVED_RESIDUE } = await tsImport(
    '../../shared/contracts/release-canary-residue-characterization-v1.contract.ts',
    import.meta.url
  );
  return RELEASE_CANARY_RESERVED_RESIDUE;
}

function exactNumberField(row, key, label) {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value)) exactProofFailure(`${label} is not a safe integer`);
  return value;
}

/**
 * Prove the stored release-canary run belongs to this exact fund, canary run,
 * and GitHub workflow execution. The fund ID is the primary selector; the
 * timestamp window is corroborating evidence only, never a run search.
 */
export function proveExactCurrentExecution({
  rows,
  expectedFundId,
  expectedCanaryRunId,
  githubRunId,
  githubRunAttempt,
  expectedSha,
  startedAt,
  maxClockSkewSeconds,
  terminalStatus,
  now = Date.now(),
} = {}) {
  if (!Array.isArray(rows)) exactProofFailure('exact run query did not return rows');
  if (rows.length !== 1) {
    exactProofFailure(`exact run query returned ${rows.length} rows; exactly one is required`);
  }
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    exactProofFailure('exact run row is invalid');
  }

  if (exactNumberField(row, 'fundId', 'fund ID') !== expectedFundId) {
    exactProofFailure('fund ID does not equal the expected current fund');
  }
  if (row.fundDataOrigin !== 'release_canary') {
    exactProofFailure('fund origin is not release_canary');
  }
  const canaryRunId = typeof row.runId === 'string' ? row.runId.toLowerCase() : null;
  const fundCanaryRunId =
    typeof row.fundCanaryRunId === 'string' ? row.fundCanaryRunId.toLowerCase() : null;
  if (canaryRunId === null || fundCanaryRunId !== canaryRunId) {
    exactProofFailure('fund canary_run_id does not equal the joined run ID');
  }
  if (canaryRunId !== expectedCanaryRunId.toLowerCase()) {
    exactProofFailure('run ID does not equal the expected current canary run');
  }
  if (row.runWorkflowRunId !== githubRunId) {
    exactProofFailure('run workflow run ID does not equal the current workflow execution');
  }
  if (exactNumberField(row, 'runWorkflowRunAttempt', 'run workflow attempt') !== githubRunAttempt) {
    exactProofFailure('run workflow attempt does not equal the current workflow execution');
  }
  if (requireSha(row.runReleaseSha, 'run release SHA') !== expectedSha) {
    exactProofFailure('run release SHA does not equal the expected SHA');
  }

  const createdAt = timestampFromValue(row.runCreatedAt, 'run createdAt');
  const startedAtTimestamp = timestampFromValue(startedAt, 'workflow startedAt');
  const nowTimestamp = timestampFromValue(now, 'current time');
  const skewMs = maxClockSkewSeconds * 1000;
  if (!Number.isFinite(skewMs) || skewMs <= 0) {
    exactProofFailure('maximum clock skew must be a positive number of seconds');
  }
  if (createdAt < startedAtTimestamp - skewMs) {
    exactProofFailure('run was created before the workflow started (outside clock skew)');
  }
  if (createdAt > nowTimestamp + skewMs) {
    exactProofFailure('run was created after the verifier time (outside clock skew)');
  }

  if (row.principalIsReleaseCanary !== true && row.principalIsReleaseCanary !== 't') {
    exactProofFailure('run principal is not a release canary principal');
  }
  const grantUserId = exactNumberField(row, 'grantUserId', 'creator grant user');
  if (grantUserId < 1) exactProofFailure('creator grant user is invalid');

  const runVersion = exactNumberField(row, 'runVersion', 'run version');
  if (runVersion < 1) exactProofFailure('run version is invalid');
  const runStatus = row.runStatus;
  if (runStatus !== 'created' && runStatus !== 'running' && runStatus !== terminalStatus) {
    exactProofFailure(`run status ${String(runStatus)} cannot transition to ${terminalStatus}`);
  }

  return { runId: canaryRunId, runVersion, runStatus };
}

/** Require the exact run's residue to stay within the frozen reservation. */
export function assertExactRunResidueWithinReservation(counts, reserved) {
  if (!counts || typeof counts !== 'object') {
    exactProofFailure('exact run residue counts are unavailable');
  }
  if (!reserved || typeof reserved !== 'object') {
    exactProofFailure('reserved residue vector is unavailable');
  }
  let groupSum = 0;
  for (const field of RESIDUE_FIELDS) {
    const value = counts[field];
    const limit = reserved[field];
    if (!Number.isSafeInteger(value) || value < 0) {
      exactProofFailure(`exact run ${field} residue is not a safe non-negative integer`);
    }
    if (!Number.isSafeInteger(limit) || limit < 0) {
      exactProofFailure(`reserved ${field} residue is not a safe non-negative integer`);
    }
    if (value > limit) {
      exactProofFailure(`exact run ${field} residue ${value} exceeds reservation ${limit}`);
    }
    groupSum += value;
  }
  if (counts.total !== groupSum) {
    exactProofFailure('exact run total residue does not equal the group sum');
  }
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
    const result = values === undefined
      ? await client.query(text)
      : await client.query(text, values);
    return result?.rows;
  } finally {
    try {
      client?.release();
    } finally {
      await pool.end();
    }
  }
}

function exactRunSummary(error, options, caps) {
  return summary({
    expectedSha: options?.expectedSha ?? null,
    caps,
    exitCode: CANARY_RESIDUE_EXIT_CODES.EXACT_RUN_FAILURE,
    verdict: 'exact-run-failure',
    reason: error.message,
  });
}

/**
 * Execute the exact-execution completion command with injectable environment
 * and I/O boundaries. Order: validate arguments and policy, prove the exact
 * current execution, transition only that run, bound its residue by the
 * frozen reservation, then evaluate the global cap/TTL/active-state policy.
 */
export async function runCanaryResidueAssertion({
  args = process.argv.slice(2),
  env = process.env,
  now = () => Date.now(),
  readRuntimePolicy = readSharedRuntimePolicy,
  readReservedResidue = readSharedReservedResidue,
  queryRows,
  queryExactRunRows,
  transitionRun,
  createPool = createPgPool,
  output = console.log,
  errorOutput = console.error,
} = {}) {
  let options;
  let caps = null;
  let result;
  try {
    options = parseCanaryResidueArgs(args);
    const databaseUrl = typeof env?.DATABASE_URL === 'string' ? env.DATABASE_URL.trim() : '';
    if (databaseUrl === '' || databaseUrl.toLowerCase().startsWith('memory://')) {
      invalid('DATABASE_URL is required; refusing to run against memory://');
    }
    if (typeof readRuntimePolicy !== 'function')
      invalid('shared runtime policy reader is unavailable');
    if (env !== process.env && readRuntimePolicy === readSharedRuntimePolicy) {
      invalid('custom env requires an injected runtime policy reader');
    }
    caps = await readRuntimePolicy(env);
    if (options.globalOnly === true) {
      const globalRows =
        typeof queryRows === 'function'
          ? await queryRows(databaseUrl)
          : await queryWithPool(databaseUrl, createPool, RELEASE_CANARY_RUNS_QUERY);
      result = evaluateCanaryResidue({
        expectedSha: options.expectedSha,
        maxAgeHours: options.maxAgeHours,
        rows: globalRows,
        policy: caps,
        now: now(),
      });
      output(JSON.stringify(result));
      if (result.exitCode !== CANARY_RESIDUE_EXIT_CODES.SUCCESS) errorOutput(result.reason);
      return result.exitCode;
    }
    const reserved = await readReservedResidue();
    const readExactRunRows =
      typeof queryExactRunRows === 'function'
        ? queryExactRunRows
        : (fundId) =>
            queryWithPool(databaseUrl, createPool, RELEASE_CANARY_EXACT_RUN_QUERY, [fundId]);

    try {
      const exactRows = await readExactRunRows(options.expectedFundId);
      const proof = proveExactCurrentExecution({
        ...options,
        rows: exactRows,
        now: now(),
      });

      const transition = transitionRun ?? (await readSharedCanaryRunTransition());
      const exactCounts = await transition(proof.runId, options.terminalStatus, proof.runVersion, [
        'created',
        'running',
      ]);
      if (options.emitResultPath !== undefined) {
        const emittedResidue = {};
        for (const field of [...RESIDUE_FIELDS, 'total']) {
          emittedResidue[field] = exactCounts?.[field];
        }
        await writeEmitResultFile(options.emitResultPath, {
          schemaVersion: 'release-canary-residue-result-v1',
          expectedSha: options.expectedSha,
          fundId: options.expectedFundId,
          canaryRunId: options.expectedCanaryRunId,
          githubRunId: options.githubRunId,
          githubRunAttempt: options.githubRunAttempt,
          transition: options.terminalStatus,
          residue: emittedResidue,
        });
      }
      assertExactRunResidueWithinReservation(exactCounts, reserved);

      const reloadedRows = await readExactRunRows(options.expectedFundId);
      if (!Array.isArray(reloadedRows) || reloadedRows.length !== 1) {
        exactProofFailure('exact run reload did not return exactly one row');
      }
      const reloadedRunId =
        typeof reloadedRows[0]?.runId === 'string' ? reloadedRows[0].runId.toLowerCase() : null;
      if (reloadedRunId !== proof.runId) {
        exactProofFailure('exact run reload returned a different run');
      }
      if (reloadedRows[0]?.runStatus !== options.terminalStatus) {
        exactProofFailure(
          `exact run did not reach requested terminal status ${options.terminalStatus}`
        );
      }
    } catch (error) {
      // Transition-fence conflicts carry constructed, non-sensitive messages;
      // anything else stays generic through invalidSummary below.
      if (
        error instanceof CanaryExactRunProofError ||
        error?.name === 'CanaryRunTransitionConflictError' ||
        error?.name === 'CanaryResiduePreflightError'
      ) {
        result = exactRunSummary(error, options, caps);
        output(JSON.stringify(result));
        errorOutput(result.reason);
        return result.exitCode;
      }
      throw error;
    }

    const rows =
      typeof queryRows === 'function'
        ? await queryRows(databaseUrl)
        : await queryWithPool(databaseUrl, createPool, RELEASE_CANARY_RUNS_QUERY);
    result = evaluateCanaryResidue({
      expectedSha: options.expectedSha,
      maxAgeHours: options.maxAgeHours,
      rows,
      policy: caps,
      now: now(),
    });
  } catch (error) {
    result = invalidSummary(error, options?.expectedSha ?? null, caps);
  }

  output(JSON.stringify(result));
  if (result.exitCode !== CANARY_RESIDUE_EXIT_CODES.SUCCESS) errorOutput(result.reason);
  return result.exitCode;
}

function isDirectEntrypoint(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

if (isDirectEntrypoint(import.meta.url)) {
  runCanaryResidueAssertion().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
