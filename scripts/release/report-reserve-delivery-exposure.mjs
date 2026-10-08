import console from 'node:console';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const FALLBACK_WINDOW_START = '2026-08-09T00:00:00Z';
const WARNING_CLASSIFICATIONS = Object.freeze([
  'no_run_drop_candidate',
  'repeat_job_id',
  'stuck',
  'completed_without_snapshot',
  'calculated_event_only',
]);
const CLASSIFICATIONS = Object.freeze([
  'completed_with_snapshot',
  'failed_or_cancelled',
  'completed_without_snapshot',
  'stuck',
  'in_flight',
  'covered_by_completed_run',
  'failed_event_only',
  'calculated_event_only',
  'repeat_job_id',
  'no_run_drop_candidate',
]);
const MAX_DATE = 8_640_000_000_000_000;

export const RESERVE_DELIVERY_EXPOSURE_EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  INVALID_ARGUMENT: 1,
  EXECUTION_FAILURE: 2,
});

export const RESERVE_DELIVERY_EXPOSURE_CONTEXT_QUERY = `
  SELECT
    now() AS executed_at,
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'fund_scenario_calculation_runs'
               AND column_name = 'deadline_at') AS has_deadline_at,
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'funds'
               AND column_name = 'data_origin') AS has_data_origin,
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'funds'
               AND column_name = 'canary_run_id') AS has_canary_run_id,
    (SELECT count(*) FROM fund_scenario_set_events) AS events_visible_total,
    (SELECT count(*) FROM fund_scenario_calculation_runs) AS runs_visible_total,
    (SELECT count(*) FROM fund_scenario_set_events
       WHERE event_type = 'calculation_queued') AS queued_events_visible_all_time,
    (SELECT min(created_at) FROM fund_scenario_set_events
       WHERE event_type = 'calculation_queued') AS first_queued_event_at,
    (SELECT max(created_at) FROM fund_scenario_set_events
       WHERE event_type = 'calculation_queued') AS last_queued_event_at
`;

export const RESERVE_DELIVERY_EXPOSURE_QUERY = `
WITH params AS (
  SELECT
    $1::timestamptz AS window_start,
    $2::timestamptz AS window_end,
    $3::interval AS stuck_after
),
queued AS (
  SELECT
    e.id                                         AS event_id,
    e.fund_id,
    e.scenario_set_id,
    e.created_at                                 AS queued_at,
    e.change_summary_json->>'job_id'             AS job_id,
    e.change_summary_json->>'correlation_id'     AS correlation_id,
    e.change_summary_json->>'input_hash'         AS input_hash,
    COALESCE(e.change_summary_json->>'hash_kind', 'scenario-input-hash-v1') AS hash_kind
  FROM fund_scenario_set_events e
  CROSS JOIN params p
  WHERE e.event_type = 'calculation_queued'
    AND e.created_at >= p.window_start
    AND e.created_at <  p.window_end
),
matched AS (
  SELECT
    q.*,
    r.id          AS run_id,
    r.status      AS run_status,
    r.snapshot_id AS run_snapshot_id,
    r.failure_code AS run_failure_code,
    -- read through jsonb so the query parses when the 0050 column is absent
    (to_jsonb(r)->>'deadline_at')::timestamptz AS run_deadline_at,
    r.updated_at  AS run_updated_at
  FROM queued q
  -- correlation_id only: job ids are reused across deliveries (the old
  -- producer's id is deterministic and BullMQ forgets it once the job is
  -- removed), so a job_id match cannot prove it is the same delivery
  LEFT JOIN LATERAL (
    SELECT r.*
    FROM fund_scenario_calculation_runs r
    WHERE r.scenario_set_id = q.scenario_set_id
      AND r.fund_id = q.fund_id
      AND r.correlation_id = q.correlation_id
    ORDER BY r.created_at DESC
    LIMIT 1
  ) r ON TRUE
),
enriched AS (
  SELECT
    m.*,
    EXISTS (
      SELECT 1 FROM queued q2
      WHERE q2.job_id = m.job_id
        AND q2.event_id <> m.event_id
        AND (q2.queued_at < m.queued_at OR (q2.queued_at = m.queued_at AND q2.event_id < m.event_id))
    ) AS earlier_event_same_job_id,
    -- any creation time: the producer's dedup index (migration 0034) counts a
    -- completed run as active, so a resubmission reuses it and calculates nothing
    EXISTS (
      SELECT 1 FROM fund_scenario_calculation_runs r2
      WHERE r2.scenario_set_id = m.scenario_set_id
        AND r2.fund_id = m.fund_id
        AND r2.input_hash = m.input_hash
        AND COALESCE(r2.hash_kind, 'scenario-input-hash-v1') = m.hash_kind
        AND r2.status = 'completed'
        AND r2.snapshot_id IS NOT NULL
        AND (m.run_id IS NULL OR r2.id <> m.run_id)
    ) AS completed_run_same_input,
    EXISTS (
      SELECT 1 FROM fund_scenario_set_events f
      WHERE f.scenario_set_id = m.scenario_set_id
        AND f.event_type = 'calculation_failed'
        AND f.created_at >= m.queued_at
        AND f.change_summary_json->>'correlation_id' = m.correlation_id
    ) AS later_failed_event_same_delivery,
    EXISTS (
      SELECT 1 FROM fund_scenario_set_events c
      WHERE c.scenario_set_id = m.scenario_set_id
        AND c.event_type = 'calculated'
        AND c.created_at >= m.queued_at
        AND c.change_summary_json->>'correlation_id' = m.correlation_id
    ) AS later_calculated_event_same_delivery,
    EXISTS (
      SELECT 1 FROM funds fu
      WHERE fu.id = m.fund_id
        -- jsonb reads: both columns postdate 068430726a (migration 0051)
        AND (to_jsonb(fu)->>'data_origin' = 'release_canary'
             OR to_jsonb(fu)->>'canary_run_id' IS NOT NULL)
    ) AS canary_fund
  FROM matched m
),
classified AS (
  SELECT
    e.*,
    CASE
      WHEN e.run_status = 'completed' AND e.run_snapshot_id IS NOT NULL THEN 'completed_with_snapshot'
      WHEN e.run_status IN ('failed', 'cancelled')                      THEN 'failed_or_cancelled'
      WHEN e.run_status = 'completed' AND e.run_snapshot_id IS NULL     THEN 'completed_without_snapshot'
      WHEN e.run_status IN ('queued', 'running')
           AND ((e.run_deadline_at IS NOT NULL AND e.run_deadline_at < p.window_end)
                OR (e.run_deadline_at IS NULL AND e.run_updated_at < p.window_end - p.stuck_after))
                                                                        THEN 'stuck'
      WHEN e.run_status IN ('queued', 'running')                        THEN 'in_flight'
      WHEN e.completed_run_same_input                                   THEN 'covered_by_completed_run'
      WHEN e.later_failed_event_same_delivery                           THEN 'failed_event_only'
      WHEN e.later_calculated_event_same_delivery                       THEN 'calculated_event_only'
      WHEN e.earlier_event_same_job_id                                  THEN 'repeat_job_id'
      ELSE 'no_run_drop_candidate'
    END AS classification
  FROM enriched e
  CROSS JOIN params p
)
SELECT
  classification,
  canary_fund,
  count(*)::int AS count
FROM classified
GROUP BY classification, canary_fund
ORDER BY classification, canary_fund
`;

function invalid(message) {
  const error = new Error(message);
  error.name = 'InvalidArgumentError';
  throw error;
}

function timestamp(value, label) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_DATE)
    invalid(`${label} must be a valid timestamp`);
  return value;
}

function boundedNumber(value, flag, fallback, min, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value))
    invalid(`${flag} must be an integer from ${min} to ${max}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    invalid(`${flag} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

export function parseReserveDeliveryExposureArgs(args = []) {
  if (!Array.isArray(args) || args.length % 2 !== 0)
    invalid('arguments must be --name value pairs');
  const values = new Map();
  const allowed = new Set([
    '--stuck-after-hours',
    '--statement-timeout-seconds',
    '--deadline-seconds',
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      !allowed.has(flag) ||
      typeof value !== 'string' ||
      value.startsWith('--') ||
      values.has(flag)
    ) {
      invalid('arguments must contain unique supported --name value pairs');
    }
    values.set(flag, value);
  }
  return {
    stuckAfterHours: boundedNumber(
      values.get('--stuck-after-hours'),
      '--stuck-after-hours',
      6,
      1,
      168
    ),
    statementTimeoutSeconds: boundedNumber(
      values.get('--statement-timeout-seconds'),
      '--statement-timeout-seconds',
      60,
      5,
      60
    ),
    deadlineSeconds: boundedNumber(
      values.get('--deadline-seconds'),
      '--deadline-seconds',
      120,
      30,
      150
    ),
  };
}

function timeoutError() {
  const error = new Error('total deadline exceeded');
  error.name = 'TimeoutError';
  return error;
}

async function fetchJson(fetchImpl, url, token, deadlineAt, now) {
  const remaining = deadlineAt - now();
  if (remaining <= 0) throw timeoutError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  const aborted = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(timeoutError()), { once: true });
  });
  try {
    const response = await Promise.race([
      fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      }),
      aborted,
    ]);
    if (!response || response.ok !== true) throw new Error('GitHub API request failed');
    let body;
    try {
      body = await Promise.race([response.json(), aborted]);
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'TimeoutError') throw timeoutError();
      throw new Error('GitHub API returned malformed JSON');
    }
    if (now() >= deadlineAt) throw timeoutError();
    return body;
  } catch (error) {
    if (controller.signal.aborted) throw timeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolvePreviousPromotion({
  fetch: fetchImpl = globalThis.fetch,
  repository,
  token,
  currentRunId,
  deadlineAt = Date.now() + 120_000,
  now = Date.now,
} = {}) {
  if (
    typeof fetchImpl !== 'function' ||
    typeof repository !== 'string' ||
    !/^[^/]+\/[^/]+$/.test(repository) ||
    typeof token !== 'string' ||
    token.trim() === '' ||
    typeof currentRunId !== 'string'
  ) {
    invalid('GitHub workflow lookup configuration is invalid');
  }
  for (let page = 1; page <= 2; page += 1) {
    const url = `https://api.github.com/repos/${repository}/actions/workflows/release-production.yml/runs?status=completed&per_page=100&page=${page}`;
    const body = await fetchJson(fetchImpl, url, token, deadlineAt, now);
    if (!Array.isArray(body?.workflow_runs))
      throw new Error('GitHub workflow response is malformed');
    for (const run of body.workflow_runs) {
      if (!run || typeof run !== 'object' || String(run.id) === currentRunId) continue;
      const jobsBody = await fetchJson(
        fetchImpl,
        `https://api.github.com/repos/${repository}/actions/runs/${encodeURIComponent(String(run.id))}/jobs?per_page=100`,
        token,
        deadlineAt,
        now
      );
      if (!Array.isArray(jobsBody?.jobs)) throw new Error('GitHub jobs response is malformed');
      const promoted = jobsBody.jobs.some(
        (job) =>
          job?.name === 'Promote Staged Vercel Deployment' &&
          Array.isArray(job.steps) &&
          job.steps.some(
            (step) =>
              step?.name === 'Resolve and prove canonical Vercel promotion' &&
              step.conclusion === 'success'
          )
      );
      if (promoted) {
        return {
          source: 'promotion',
          windowStart: timestamp(run.run_started_at, 'promotion run_started_at'),
          runId: String(run.id),
        };
      }
    }
    if (body.workflow_runs.length < 100) break;
  }
  return { source: 'fallback', windowStart: FALLBACK_WINDOW_START };
}

export function summarizeExposure(rows) {
  if (!Array.isArray(rows)) invalid('exposure query did not return rows');
  const counts = Object.fromEntries(CLASSIFICATIONS.map((classification) => [classification, 0]));
  let canaryTotal = 0;
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || !CLASSIFICATIONS.includes(row.classification)) {
      invalid(`exposure row ${index} has an unknown classification`);
    }
    if (typeof row.canary_fund !== 'boolean')
      invalid(`exposure row ${index} has an invalid canary flag`);
    if (typeof row.count !== 'number' || !Number.isSafeInteger(row.count) || row.count < 0) {
      invalid(`exposure row ${index} count must be a safe non-negative integer`);
    }
    if (row.canary_fund) canaryTotal += row.count;
    else counts[row.classification] += row.count;
    if (!Number.isSafeInteger(canaryTotal) || !Number.isSafeInteger(counts[row.classification])) {
      invalid('exposure counts exceed the safe integer range');
    }
  }
  const warningTotal = WARNING_CLASSIFICATIONS.reduce(
    (total, classification) => total + counts[classification],
    0
  );
  if (!Number.isSafeInteger(warningTotal)) invalid('warning count exceeds the safe integer range');
  return { counts, canaryTotal, warningTotal };
}

export function formatExposureReport({
  windowStart,
  windowEnd,
  windowSource,
  promotionRunId,
  context,
  summary,
}) {
  timestamp(windowStart, 'window start');
  timestamp(windowEnd, 'window end');
  if (!['promotion', 'fallback'].includes(windowSource)) invalid('window source is invalid');
  if (
    windowSource === 'promotion' &&
    (typeof promotionRunId !== 'string' || !/^[0-9]+$/.test(promotionRunId))
  ) {
    invalid('promotion run ID is invalid');
  }
  for (const key of ['has_deadline_at', 'has_data_origin', 'has_canary_run_id']) {
    if (typeof context?.[key] !== 'boolean') invalid(`context ${key} is invalid`);
  }
  const contextCounts = [
    'events_visible_total',
    'runs_visible_total',
    'queued_events_visible_all_time',
  ];
  for (const key of contextCounts) {
    const value = context[key];
    const isSafeNumber = Number.isSafeInteger(value) && value >= 0;
    const isCountString = typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
    if (!isSafeNumber && !isCountString) invalid(`context ${key} is invalid`);
  }
  for (const classification of CLASSIFICATIONS) {
    if (
      !Number.isSafeInteger(summary?.counts?.[classification]) ||
      summary.counts[classification] < 0
    ) {
      invalid(`summary ${classification} count is invalid`);
    }
  }
  if (
    !Number.isSafeInteger(summary.canaryTotal) ||
    summary.canaryTotal < 0 ||
    !Number.isSafeInteger(summary.warningTotal) ||
    summary.warningTotal < 0
  )
    invalid('summary totals are invalid');

  const source =
    windowSource === 'promotion' ? `promotion run ${promotionRunId}` : 'F_1.21.0 fallback bound';
  const displayTimestamp = (value) =>
    value instanceof Date ? value.toISOString() : (value ?? 'none');
  const lines = [
    `Reserve delivery exposure window: ${windowStart} to ${windowEnd}`,
    `Window start source: ${source}`,
    `Optional columns: deadline_at=${context.has_deadline_at}, data_origin=${context.has_data_origin}, canary_run_id=${context.has_canary_run_id}`,
    `Visible totals: events=${context.events_visible_total}, runs=${context.runs_visible_total}, queued_events=${context.queued_events_visible_all_time}`,
    `Queued event range: ${displayTimestamp(context.first_queued_event_at)} to ${displayTimestamp(context.last_queued_event_at)}`,
    `Canary fund events: ${summary.canaryTotal}`,
    `Non-canary warning-class events: ${summary.warningTotal}`,
  ];
  const table = [
    '| Classification | Non-canary count |',
    '| --- | ---: |',
    ...CLASSIFICATIONS.map(
      (classification) => `| ${classification} | ${summary.counts[classification]} |`
    ),
    `| Canary funds (all classifications) | ${summary.canaryTotal} |`,
  ].join('\n');
  return {
    lines,
    stepSummary: `## Reserve delivery exposure report\n\n${lines.map((line) => `- ${line}`).join('\n')}\n\n${table}\n`,
    warning:
      summary.warningTotal > 0
        ? `::warning::Reserve delivery exposure findings: ${WARNING_CLASSIFICATIONS.map(
            (name) => `${name}=${summary.counts[name]}`
          )
            .filter((entry) => !entry.endsWith('=0'))
            .join(
              ', '
            )}. See docs/1-plans/F_1.21.0_reserve-delivery-contract-visibility.plan.md SQL for owner-run row details.`
        : null,
  };
}

async function createPgPool(connectionString) {
  const { Pool } = await import('pg');
  return new Pool({ connectionString, connectionTimeoutMillis: 5000, allowExitOnIdle: true });
}

function sqlState(error) {
  return typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : 'unknown';
}

export async function runReserveDeliveryExposureReport({
  args = process.argv.slice(2),
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  createPool = createPgPool,
  now = Date.now,
  appendSummary = appendFile,
  output = console.log,
  errorOutput = console.error,
} = {}) {
  let pool;
  let client;
  let transactionStarted = false;
  let exitCode = RESERVE_DELIVERY_EXPOSURE_EXIT_CODES.SUCCESS;
  try {
    const options = parseReserveDeliveryExposureArgs(args);
    const databaseUrl = typeof env?.DATABASE_URL === 'string' ? env.DATABASE_URL.trim() : '';
    const token = typeof env?.GH_TOKEN === 'string' ? env.GH_TOKEN.trim() : '';
    const repository =
      typeof env?.GITHUB_REPOSITORY === 'string' ? env.GITHUB_REPOSITORY.trim() : '';
    const currentRunId = typeof env?.GITHUB_RUN_ID === 'string' ? env.GITHUB_RUN_ID.trim() : '';
    if (!databaseUrl || !token || !repository || !/^[0-9]+$/.test(currentRunId)) {
      invalid('DATABASE_URL, GH_TOKEN, GITHUB_REPOSITORY, and GITHUB_RUN_ID are required');
    }
    const deadlineAt = now() + options.deadlineSeconds * 1000;
    const window = await resolvePreviousPromotion({
      fetch: fetchImpl,
      repository,
      token,
      currentRunId,
      deadlineAt,
      now,
    });
    const remainingMs = deadlineAt - now();
    if (remainingMs <= 0) throw timeoutError();
    pool = await createPool(databaseUrl);
    client = await pool.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    transactionStarted = true;
    const setRemainingStatementTimeout = async () => {
      const statementTimeout = Math.min(
        options.statementTimeoutSeconds,
        Math.floor((deadlineAt - now()) / 1000)
      );
      if (statementTimeout < 1) throw timeoutError();
      await client.query(`SET LOCAL statement_timeout = '${statementTimeout}s'`);
    };
    await setRemainingStatementTimeout();
    await client.query("SET LOCAL lock_timeout = '5s'");
    const contextResult = await client.query(RESERVE_DELIVERY_EXPOSURE_CONTEXT_QUERY);
    const context = contextResult?.rows?.[0];
    if (
      !context ||
      (typeof context.executed_at !== 'object' && typeof context.executed_at !== 'string')
    ) {
      invalid('database context query returned no valid window end');
    }
    const windowEnd =
      context.executed_at instanceof Date
        ? context.executed_at.toISOString()
        : timestamp(context.executed_at, 'database window end');
    await setRemainingStatementTimeout();
    const exposureResult = await client.query(RESERVE_DELIVERY_EXPOSURE_QUERY, [
      window.windowStart,
      windowEnd,
      `${options.stuckAfterHours} hours`,
    ]);
    const summary = summarizeExposure(exposureResult?.rows);
    await client.query('ROLLBACK');
    transactionStarted = false;

    const report = formatExposureReport({
      windowStart: window.windowStart,
      windowEnd,
      windowSource: window.source,
      promotionRunId: window.runId,
      context,
      summary,
    });
    for (const line of report.lines) output(line);
    if (report.warning) output(report.warning);
    if (typeof env.GITHUB_STEP_SUMMARY === 'string' && env.GITHUB_STEP_SUMMARY.trim() !== '') {
      await appendSummary(resolve(env.GITHUB_STEP_SUMMARY), report.stepSummary, 'utf8');
    }
  } catch (error) {
    exitCode =
      error?.name === 'InvalidArgumentError'
        ? RESERVE_DELIVERY_EXPOSURE_EXIT_CODES.INVALID_ARGUMENT
        : RESERVE_DELIVERY_EXPOSURE_EXIT_CODES.EXECUTION_FAILURE;
    const name =
      typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(error.name)
        ? error.name
        : 'Error';
    const reason = error?.name === 'TimeoutError' ? 'total deadline exceeded' : 'execution failed';
    errorOutput(
      `Reserve delivery exposure report ${reason}: ${name} (SQLSTATE ${sqlState(error)}).`
    );
  } finally {
    if (transactionStarted && client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original failure while still releasing the read-only session.
      }
    }
    try {
      client?.release();
    } catch {
      if (exitCode === RESERVE_DELIVERY_EXPOSURE_EXIT_CODES.SUCCESS) {
        exitCode = RESERVE_DELIVERY_EXPOSURE_EXIT_CODES.EXECUTION_FAILURE;
        errorOutput('Reserve delivery exposure report cleanup failed: Error (SQLSTATE unknown).');
      }
    } finally {
      try {
        await pool?.end();
      } catch {
        if (exitCode === RESERVE_DELIVERY_EXPOSURE_EXIT_CODES.SUCCESS) {
          exitCode = RESERVE_DELIVERY_EXPOSURE_EXIT_CODES.EXECUTION_FAILURE;
          errorOutput('Reserve delivery exposure report cleanup failed: Error (SQLSTATE unknown).');
        }
      }
    }
  }
  return exitCode;
}

function isDirectEntrypoint(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

if (isDirectEntrypoint(import.meta.url)) {
  runReserveDeliveryExposureReport().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
