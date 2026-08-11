import console from 'node:console';
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
]);
const RUN_STATUSES = new Set(['created', 'running', 'completed', 'failed', 'expired', 'purged']);

export const CANARY_RESIDUE_EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  INVALID_ARGUMENT: 1,
  POLICY_FAILURE: 2,
  EXPECTED_SHA_FAILURE: 3,
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
    total_residue_count AS "totalResidueCount"
  FROM release_canary_runs
  ORDER BY created_at ASC, id ASC
`;

class CanaryResidueAssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanaryResidueAssertionError';
  }
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

    if (flag === '--reconcile-expected-sha') {
      options.reconcileExpectedSha = true;
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
    } else {
      invalid(`Unknown argument: ${flag}`);
    }
  }

  return {
    expectedSha: requireSha(options.expectedSha),
    maxAgeHours: options.maxAgeHours,
    reconcileExpectedSha: options.reconcileExpectedSha === true,
  };
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
  if (hasPurgedStatus) {
    return { releaseSha, status: 'purged', purged: true };
  }

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

function requireRunId(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function requireRunVersion(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    invalid(`${label} must be a positive integer`);
  }
  return value;
}

function rowWithReconciledCounts(row, version, counts) {
  return {
    ...row,
    status: 'completed',
    version: version + 1,
    portfolioCompanyResidueCount: counts?.portfolioCompany,
    fundResidueCount: counts?.fund,
    fundConfigResidueCount: counts?.fundConfig,
    fundEventResidueCount: counts?.fundEvent,
    notificationResidueCount: counts?.notification,
    totalResidueCount: counts?.total,
  };
}

/** Reconcile active expected-SHA runs through the atomic terminal transition seam. */
export async function reconcileExpectedShaRuns({ rows, expectedSha, transitionRun } = {}) {
  if (!Array.isArray(rows)) invalid('release canary query did not return rows');
  if (typeof transitionRun !== 'function') invalid('canary run transition is unavailable');

  const normalizedSha = requireSha(expectedSha);
  const reconciledRows = [];
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      invalid(`release canary row ${index} is invalid`);
    }
    const releaseSha = requireSha(row.releaseSha, `release canary row ${index} releaseSha`);
    if (releaseSha !== normalizedSha || !['created', 'running'].includes(row.status)) {
      reconciledRows.push(row);
      continue;
    }

    const runId = requireRunId(row.id, `release canary row ${index} id`);
    const version = requireRunVersion(row.version, `release canary row ${index} version`);
    const counts = await transitionRun(runId, 'completed', version, ['created', 'running']);
    reconciledRows.push(rowWithReconciledCounts(row, version, counts));
  }
  return reconciledRows;
}

async function createPgPool(connectionString) {
  const { Pool } = await import('pg');
  return new Pool({ connectionString, connectionTimeoutMillis: 5000, allowExitOnIdle: true });
}

async function queryReleaseCanaryRows(databaseUrl, createPool) {
  const pool = await createPool(databaseUrl);
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(RELEASE_CANARY_RUNS_QUERY);
    return result?.rows;
  } finally {
    try {
      client?.release();
    } finally {
      await pool.end();
    }
  }
}

/**
 * Execute the read-only command with injectable environment and I/O boundaries.
 */
export async function runCanaryResidueAssertion({
  args = process.argv.slice(2),
  env = process.env,
  now = () => Date.now(),
  readRuntimePolicy = readSharedRuntimePolicy,
  queryRows,
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
    const rows =
      typeof queryRows === 'function'
        ? await queryRows(databaseUrl)
        : await queryReleaseCanaryRows(databaseUrl, createPool);
    const rowsForEvaluation = options.reconcileExpectedSha
      ? await reconcileExpectedShaRuns({
          rows,
          expectedSha: options.expectedSha,
          transitionRun: transitionRun ?? (await readSharedCanaryRunTransition()),
        })
      : rows;
    result = evaluateCanaryResidue({
      ...options,
      rows: rowsForEvaluation,
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
