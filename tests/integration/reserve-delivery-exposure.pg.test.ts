import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  RESERVE_DELIVERY_EXPOSURE_CONTEXT_QUERY,
  RESERVE_DELIVERY_EXPOSURE_QUERY,
  runReserveDeliveryExposureReport,
  summarizeExposure,
} from '../../scripts/release/report-reserve-delivery-exposure.mjs';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';
const WINDOW_START = '2026-10-01T00:00:00Z';
const WINDOW_END = '2026-10-05T00:00:00Z';
const STUCK_AFTER = '6 hours';
const BASE_COUNTS = {
  completed_with_snapshot: 1,
  failed_or_cancelled: 1,
  completed_without_snapshot: 1,
  stuck: 1,
  in_flight: 1,
  covered_by_completed_run: 1,
  failed_event_only: 1,
  calculated_event_only: 1,
  repeat_job_id: 1,
  no_run_drop_candidate: 2,
};

let adminPool: Pool | undefined;
let databaseName = '';
let connectionString = '';
let startedTestContainers = false;

function baseConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

function databaseConnectionString(database: string): string {
  const url = new URL(baseConnectionString());
  url.pathname = `/${database}`;
  return url.toString();
}

async function withPool<T>(callback: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString, max: 4 });
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function insertFund(pool: Pool, id: number, name: string, canaryRunId: string | null) {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO funds (
       id, name, size, management_fee, carry_percentage, vintage_year,
       data_origin, canary_run_id
     ) VALUES ($1, $2, 1000000, '0.0200', '0.2000', 2026, $3, $4)
     RETURNING id`,
    [id, name, canaryRunId ? 'release_canary' : 'production', canaryRunId]
  );
  const fundId = result.rows[0]?.id;
  if (typeof fundId !== 'number') throw new Error('Expected seeded fund ID.');

  const config = await pool.query<{ id: number }>(
    `INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published)
     VALUES ($1, 1, $2, false, true) RETURNING id`,
    [fundId, { fundName: name }]
  );
  const sourceConfigId = config.rows[0]?.id;
  if (typeof sourceConfigId !== 'number') throw new Error('Expected seeded config ID.');

  const scenarioSetId = randomUUID();
  await pool.query(
    `INSERT INTO fund_scenario_sets (
       id, fund_id, name, source_config_id, source_config_version,
       created_by_label, updated_by_label
     ) VALUES ($1, $2, $3, $4, 1, 'integration-test', 'integration-test')`,
    [scenarioSetId, fundId, name, sourceConfigId]
  );
  return { fundId, sourceConfigId, scenarioSetId };
}

async function insertSnapshot(pool: Pool, fundId: number, correlationId: string): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO fund_snapshots (fund_id, type, payload, calc_version, correlation_id, snapshot_time)
     VALUES ($1, 'EXPOSURE_TEST', '{}'::jsonb, 'integration-test', $2, $3)
     RETURNING id`,
    [fundId, correlationId, '2026-10-02T00:00:00Z']
  );
  const id = result.rows[0]?.id;
  if (typeof id !== 'number') throw new Error('Expected seeded snapshot ID.');
  return id;
}

type SeededScenario = Awaited<ReturnType<typeof insertFund>>;

async function insertRun(
  pool: Pool,
  scenario: SeededScenario,
  {
    correlationId,
    status,
    inputHash = randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
    snapshotId = null,
    jobId = null,
    createdAt = '2026-10-02T00:00:00Z',
    updatedAt = '2026-10-04T23:59:00Z',
    deadlineAt = null,
    failureCode = null,
  }: {
    correlationId: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    inputHash?: string;
    snapshotId?: number | null;
    jobId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    deadlineAt?: string | null;
    failureCode?: string | null;
  }
) {
  await pool.query(
    `INSERT INTO fund_scenario_calculation_runs (
       fund_id, scenario_set_id, source_config_id, source_config_version,
       calculation_mode, override_type, input_hash, job_id, correlation_id, status,
       snapshot_id, failure_code, created_at, updated_at, deadline_at
     ) VALUES ($1, $2, $3, 1, 'async_reserve_allocation', 'reserve_allocation',
               $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      scenario.fundId,
      scenario.scenarioSetId,
      scenario.sourceConfigId,
      inputHash,
      jobId,
      correlationId,
      status,
      snapshotId,
      failureCode,
      createdAt,
      updatedAt,
      deadlineAt,
    ]
  );
}

async function insertEvent(
  pool: Pool,
  scenario: SeededScenario,
  {
    eventType = 'calculation_queued',
    correlationId,
    jobId,
    inputHash = randomUUID().replaceAll('-', '').padEnd(64, 'b').slice(0, 64),
    createdAt,
  }: {
    eventType?: 'calculation_queued' | 'calculation_failed' | 'calculated';
    correlationId: string;
    jobId: string;
    inputHash?: string;
    createdAt: string;
  }
) {
  await pool.query(
    `INSERT INTO fund_scenario_set_events (scenario_set_id, fund_id, event_type, change_summary_json, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      scenario.scenarioSetId,
      scenario.fundId,
      eventType,
      { correlation_id: correlationId, job_id: jobId, input_hash: inputHash },
      createdAt,
    ]
  );
}

async function seedCanaryRun(pool: Pool): Promise<string> {
  const principal = await pool.query<{ id: number }>(
    `INSERT INTO users (username, password, is_release_canary_principal)
     VALUES ($1, 'integration-only', true) RETURNING id`,
    [`reserve-exposure-${randomUUID()}`]
  );
  const userId = principal.rows[0]?.id;
  if (typeof userId !== 'number') throw new Error('Expected canary principal ID.');
  const canaryRunId = randomUUID();
  await pool.query(
    `INSERT INTO release_canary_runs (
       id, release_version, release_sha, deployment_id, worker_deployment_id,
       correlation_id, principal_user_id, expires_at
     ) VALUES ($1, 'test', $2, 'web-test-deployment', 'worker-test-deployment', $3, $4, $5)`,
    [canaryRunId, 'a'.repeat(40), randomUUID(), userId, '2026-10-10T00:00:00Z']
  );
  return canaryRunId;
}

async function seedExposureRows(pool: Pool) {
  const fundBaseId = 1_000_000_000 + process.pid * 2;
  const nonCanary = await insertFund(pool, fundBaseId, `Exposure ${randomUUID()}`, null);
  const canaryRunId = await seedCanaryRun(pool);
  const canary = await insertFund(pool, fundBaseId + 1, `Canary ${randomUUID()}`, canaryRunId);
  const identifiers: Array<string | number> = [nonCanary.fundId, canary.fundId];

  const completedCorrelation = randomUUID();
  const completedJob = `completed-${randomUUID()}`;
  const completedSnapshot = await insertSnapshot(pool, nonCanary.fundId, randomUUID());
  await insertRun(pool, nonCanary, {
    correlationId: completedCorrelation,
    status: 'completed',
    snapshotId: completedSnapshot,
  });
  await insertEvent(pool, nonCanary, {
    correlationId: completedCorrelation,
    jobId: completedJob,
    createdAt: '2026-10-02T00:00:00Z',
  });
  identifiers.push(completedJob, completedCorrelation);

  const failedCorrelation = randomUUID();
  const failedJob = `failed-${randomUUID()}`;
  await insertRun(pool, nonCanary, {
    correlationId: failedCorrelation,
    status: 'failed',
    failureCode: 'fixture_failure',
  });
  await insertEvent(pool, nonCanary, {
    correlationId: failedCorrelation,
    jobId: failedJob,
    createdAt: '2026-10-02T00:01:00Z',
  });
  identifiers.push(failedJob, failedCorrelation);

  const completedNoSnapshotCorrelation = randomUUID();
  const completedNoSnapshotJob = `complete-no-snapshot-${randomUUID()}`;
  await insertRun(pool, nonCanary, {
    correlationId: completedNoSnapshotCorrelation,
    status: 'completed',
  });
  await insertEvent(pool, nonCanary, {
    correlationId: completedNoSnapshotCorrelation,
    jobId: completedNoSnapshotJob,
    createdAt: '2026-10-02T00:02:00Z',
  });
  identifiers.push(completedNoSnapshotJob, completedNoSnapshotCorrelation);

  const stuckCorrelation = randomUUID();
  const stuckJob = `stuck-${randomUUID()}`;
  await insertRun(pool, nonCanary, {
    correlationId: stuckCorrelation,
    status: 'queued',
    updatedAt: '2026-10-03T00:00:00Z',
    deadlineAt: '2026-10-04T00:00:00Z',
  });
  await insertEvent(pool, nonCanary, {
    correlationId: stuckCorrelation,
    jobId: stuckJob,
    createdAt: '2026-10-02T00:03:00Z',
  });
  identifiers.push(stuckJob, stuckCorrelation);

  const inFlightCorrelation = randomUUID();
  const inFlightJob = `in-flight-${randomUUID()}`;
  await insertRun(pool, nonCanary, {
    correlationId: inFlightCorrelation,
    status: 'running',
    updatedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await insertEvent(pool, nonCanary, {
    correlationId: inFlightCorrelation,
    jobId: inFlightJob,
    createdAt: '2026-10-02T00:04:00Z',
  });
  identifiers.push(inFlightJob, inFlightCorrelation);

  const coveredHash = 'c'.repeat(64);
  const coveredRunCorrelation = randomUUID();
  const coveredRunSnapshot = await insertSnapshot(pool, nonCanary.fundId, randomUUID());
  await insertRun(pool, nonCanary, {
    correlationId: coveredRunCorrelation,
    status: 'completed',
    inputHash: coveredHash,
    snapshotId: coveredRunSnapshot,
    createdAt: '2026-09-30T00:00:00Z',
  });
  const coveredCorrelation = randomUUID();
  const coveredJob = `covered-${randomUUID()}`;
  await insertEvent(pool, nonCanary, {
    correlationId: coveredCorrelation,
    jobId: coveredJob,
    inputHash: coveredHash,
    createdAt: '2026-10-02T00:05:00Z',
  });
  identifiers.push(coveredJob, coveredCorrelation);

  const calculatedOnlyCorrelation = randomUUID();
  const calculatedOnlyJob = `calculated-only-${randomUUID()}`;
  await insertEvent(pool, nonCanary, {
    correlationId: calculatedOnlyCorrelation,
    jobId: calculatedOnlyJob,
    createdAt: '2026-10-02T00:06:00Z',
  });
  await insertEvent(pool, nonCanary, {
    eventType: 'calculated',
    correlationId: calculatedOnlyCorrelation,
    jobId: calculatedOnlyJob,
    createdAt: '2026-10-02T00:07:00Z',
  });
  identifiers.push(calculatedOnlyJob, calculatedOnlyCorrelation);

  const preWindowJob = `pre-window-reused-${randomUUID()}`;
  const preWindowRunCorrelation = randomUUID();
  await insertRun(pool, nonCanary, {
    correlationId: preWindowRunCorrelation,
    status: 'failed',
    jobId: preWindowJob,
    createdAt: '2026-09-30T12:00:00Z',
    updatedAt: '2026-09-30T12:01:00Z',
  });
  const preWindowEventCorrelation = randomUUID();
  await insertEvent(pool, nonCanary, {
    correlationId: preWindowEventCorrelation,
    jobId: preWindowJob,
    createdAt: '2026-10-02T00:08:00Z',
  });
  identifiers.push(preWindowJob, preWindowRunCorrelation, preWindowEventCorrelation);

  const reusedJob = `reused-${randomUUID()}`;
  const reusedFirstCorrelation = randomUUID();
  const reusedSecondCorrelation = randomUUID();
  await insertEvent(pool, nonCanary, {
    correlationId: reusedFirstCorrelation,
    jobId: reusedJob,
    createdAt: '2026-10-02T00:09:00Z',
  });
  await insertEvent(pool, nonCanary, {
    eventType: 'calculation_failed',
    correlationId: reusedFirstCorrelation,
    jobId: reusedJob,
    createdAt: '2026-10-02T00:10:00Z',
  });
  await insertEvent(pool, nonCanary, {
    correlationId: reusedSecondCorrelation,
    jobId: reusedJob,
    createdAt: '2026-10-02T00:11:00Z',
  });
  identifiers.push(reusedJob, reusedFirstCorrelation, reusedSecondCorrelation);

  const plainDropCorrelation = randomUUID();
  const plainDropJob = `plain-drop-${randomUUID()}`;
  await insertEvent(pool, nonCanary, {
    correlationId: plainDropCorrelation,
    jobId: plainDropJob,
    createdAt: '2026-10-02T00:12:00Z',
  });
  identifiers.push(plainDropJob, plainDropCorrelation);

  const canaryCorrelation = randomUUID();
  const canaryJob = `canary-${randomUUID()}`;
  await insertEvent(pool, canary, {
    correlationId: canaryCorrelation,
    jobId: canaryJob,
    createdAt: '2026-10-02T00:13:00Z',
  });
  identifiers.push(canaryRunId, canary.scenarioSetId);
  identifiers.push(canaryCorrelation, canaryJob);
  identifiers.push(nonCanary.scenarioSetId);
  return { identifiers, nonCanary, canary };
}

function expectClassificationCounts(
  summary: ReturnType<typeof summarizeExposure>,
  expected: typeof BASE_COUNTS,
  canaryTotal: number
) {
  expect(summary.counts).toEqual(expected);
  expect(summary.canaryTotal).toBe(canaryTotal);
  expect(summary.warningTotal).toBe(
    expected.no_run_drop_candidate +
      expected.repeat_job_id +
      expected.stuck +
      expected.completed_without_snapshot +
      expected.calculated_event_only
  );
}

describe.skipIf(skipIfNoDocker)('reserve delivery exposure PostgreSQL report', { retry: 0 }, () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    adminPool = new Pool({ connectionString: baseConnectionString(), max: 1 });
    databaseName = `reserve_exposure_${process.pid}_${Date.now()}`.toLowerCase();
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    connectionString = databaseConnectionString(databaseName);
    await runMigrationsWithConnectionString(connectionString);
  }, 120_000);

  afterAll(async () => {
    try {
      if (adminPool && /^reserve_exposure_[a-z0-9_]+$/.test(databaseName)) {
        await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      }
    } finally {
      await adminPool?.end();
      if (startedTestContainers) await cleanupTestContainers();
    }
  });

  it('classifies seeded rows, keeps public output aggregate-only, and runs read-only', async () => {
    const seeded = await withPool((pool) => seedExposureRows(pool));
    const privateIdentifiers = seeded.identifiers;
    const fetch = vi.fn(async (url: string) =>
      url.includes('/jobs?')
        ? {
            ok: true,
            json: async () => ({
              jobs: [
                {
                  name: 'Promote Staged Vercel Deployment',
                  conclusion: 'failure',
                  steps: [
                    {
                      name: 'Resolve and prove canonical Vercel promotion',
                      conclusion: 'success',
                    },
                  ],
                },
              ],
            }),
          }
        : {
            ok: true,
            json: async () => ({
              workflow_runs: [
                { id: 81234567890, run_started_at: WINDOW_START, conclusion: 'failure' },
              ],
            }),
          }
    );

    await withPool(async (pool) => {
      const directRows = await pool.query(RESERVE_DELIVERY_EXPOSURE_QUERY, [
        WINDOW_START,
        WINDOW_END,
        STUCK_AFTER,
      ]);
      const directSummary = summarizeExposure(directRows.rows);
      expectClassificationCounts(directSummary, BASE_COUNTS, 1);

      const readOnlyClient = await pool.connect();
      try {
        await readOnlyClient.query('BEGIN TRANSACTION READ ONLY');
        let writeError: { code?: string } | undefined;
        try {
          await readOnlyClient.query(
            `INSERT INTO fund_scenario_set_events
               (scenario_set_id, fund_id, event_type, change_summary_json)
             VALUES ($1, $2, 'calculation_queued', '{}'::jsonb)`,
            [seeded.nonCanary.scenarioSetId, seeded.nonCanary.fundId]
          );
        } catch (error) {
          writeError = error as { code?: string };
        }
        expect(writeError?.code).toBe('25006');
      } finally {
        await readOnlyClient.query('ROLLBACK');
        readOnlyClient.release();
      }

      const outputLines: string[] = [];
      const stepSummaries: string[] = [];
      const exitCode = await runReserveDeliveryExposureReport({
        env: {
          DATABASE_URL: connectionString,
          GH_TOKEN: 'integration-token',
          GITHUB_REPOSITORY: 'example-owner/example-repo',
          GITHUB_RUN_ID: '81234567891',
          GITHUB_STEP_SUMMARY: '/tmp/reserve-delivery-exposure-summary.md',
        },
        fetch,
        createPool: (url) => new Pool({ connectionString: url, max: 2 }),
        appendSummary: vi.fn(async (_path: string, content: string) => {
          stepSummaries.push(content);
        }),
        output: (line) => outputLines.push(line),
        errorOutput: (line) => outputLines.push(line),
      });
      expect(exitCode).toBe(0);
      expect(fetch).toHaveBeenCalledTimes(2);
      const reportOutput = [...outputLines, ...stepSummaries].join('\n');
      expect(reportOutput).toContain('Non-canary warning-class events: 6');
      for (const [classification, count] of Object.entries(BASE_COUNTS)) {
        expect(reportOutput).toContain(`| ${classification} | ${count} |`);
      }
      expect(reportOutput).toContain('Canary fund events: 1');
      for (const identifier of privateIdentifiers) {
        if (typeof identifier === 'number') {
          expect(reportOutput).not.toMatch(new RegExp(`\\b${identifier}\\b`));
        } else {
          expect(reportOutput).not.toContain(identifier);
        }
      }
    });

    await withPool(async (pool) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'ALTER TABLE fund_scenario_calculation_runs DROP COLUMN deadline_at CASCADE'
        );
        await client.query(
          'ALTER TABLE funds DROP COLUMN data_origin CASCADE, DROP COLUMN canary_run_id CASCADE'
        );
        const context = await client.query(RESERVE_DELIVERY_EXPOSURE_CONTEXT_QUERY);
        expect(context.rows[0]).toMatchObject({
          has_deadline_at: false,
          has_data_origin: false,
          has_canary_run_id: false,
        });
        const rows = await client.query(RESERVE_DELIVERY_EXPOSURE_QUERY, [
          WINDOW_START,
          WINDOW_END,
          STUCK_AFTER,
        ]);
        const summary = summarizeExposure(rows.rows);
        expectClassificationCounts(summary, { ...BASE_COUNTS, no_run_drop_candidate: 3 }, 0);
        expect(rows.rows.every((row: { canary_fund: boolean }) => row.canary_fund === false)).toBe(
          true
        );
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  }, 180_000);
});
