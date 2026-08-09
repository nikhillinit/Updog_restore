import { randomUUID } from 'node:crypto';

import { Queue, QueueEvents, Worker } from 'bullmq';
import type { Queue as QueueType, QueueEvents as QueueEventsType, Worker as WorkerType } from 'bullmq';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getPostgresConnectionString,
  getRedisConnection,
  setupTestContainers,
} from '../helpers/testcontainers';

const TEST_TIMEOUT_MS = 30_000;

interface SeededRun {
  id: string;
  fundId: number;
  scenarioSetId: string;
  sourceConfigId: number;
  inputHash: string;
}

let pool: Pool;
let sweep: typeof import('../../server/services/fund-scenario-calculation-run-service').sweepFundScenarioCalculationRunDeadlines;
let startedTestContainers = false;
let queue: QueueType;
let queueEvents: QueueEventsType;
let worker: WorkerType;

async function seedRun(
  status: 'queued' | 'running',
  deadlineAt: Date | null,
  existing?: SeededRun
): Promise<SeededRun> {
  let fundId: number;
  let sourceConfigId: number;
  let scenarioSetId: string;
  if (existing) {
    ({ fundId, sourceConfigId, scenarioSetId } = existing);
  } else {
    const fund = await pool.query<{ id: number }>(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [`Deadline Fund ${randomUUID()}`, '1000000.00', '0.0200', '0.2000', 2026]
    );
    fundId = fund.rows[0]!.id;
    const config = await pool.query<{ id: number }>(
      `INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published)
       VALUES ($1, 1, $2, false, true)
       RETURNING id`,
      [fundId, { fundName: 'Deadline Fund' }]
    );
    sourceConfigId = config.rows[0]!.id;
    scenarioSetId = randomUUID();
    await pool.query(
      `INSERT INTO fund_scenario_sets (
         id, fund_id, name, source_config_id, source_config_version,
         created_by_label, updated_by_label
       ) VALUES ($1, $2, $3, $4, 1, 'timeout-test', 'timeout-test')`,
      [scenarioSetId, fundId, 'Deadline scenario set', sourceConfigId]
    );
  }

  const id = randomUUID();
  const inputHash = 'a'.repeat(64);
  await pool.query(
    `INSERT INTO fund_scenario_calculation_runs (
       id, fund_id, scenario_set_id, source_config_id, source_config_version,
       calculation_mode, override_type, input_hash, hash_kind,
       model_inputs_as_of_date, comparison_lineage_version, job_id,
       correlation_id, status, deadline_at
     ) VALUES ($1, $2, $3, $4, 1, 'async_reserve_allocation', 'reserve_allocation',
       $5, 'scenario-input-hash-v2', '2026-06-30', 'comparison-lineage-v1',
       $6, $7, $8, $9)`,
    [
      id,
      fundId,
      scenarioSetId,
      sourceConfigId,
      inputHash,
      `job-${id}`,
      randomUUID(),
      status,
      deadlineAt,
    ]
  );

  return { id, fundId, scenarioSetId, sourceConfigId, inputHash };
}

describe('fund scenario hard-timeout lifecycle', () => {
  beforeAll(async () => {
    process.env.FUND_SCENARIO_HARD_TIMEOUT_MS = '30000';
    process.env.FUND_SCENARIO_SWEEP_ENABLED = '1';
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();

    ({ sweep } = {
      sweep: (await import('../../server/services/fund-scenario-calculation-run-service'))
        .sweepFundScenarioCalculationRunDeadlines,
    });
    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const redis = getRedisConnection();
    const connection = { host: redis.host, port: redis.port };
    const queueName = `fund-scenario-deadline-test-${randomUUID()}`;
    queue = new Queue(queueName, { connection });
    queueEvents = new QueueEvents(queueName, { connection });
    worker = new Worker(
      queueName,
      async () => sweep(),
      { connection, concurrency: 1 }
    );
    await Promise.all([queue.waitUntilReady(), queueEvents.waitUntilReady(), worker.waitUntilReady()]);
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    await worker?.close();
    await queueEvents?.close();
    await queue?.close();
    await pool?.end();
    const { closePool } = await import('../../server/db/pg-circuit');
    await closePool();
    if (startedTestContainers) {
      const { cleanupTestContainers } = await import('../helpers/testcontainers');
      await cleanupTestContainers();
    }
  });

  it('reconciles once, then terminalizes through a later expired sweep', async () => {
    const run = await seedRun('running', null);

    await expect(sweep()).resolves.toMatchObject({ reconciledCount: 1, timedOutCount: 0 });
    const reconciled = await pool.query<{ status: string; deadline_at: Date }>(
      `SELECT status, deadline_at FROM fund_scenario_calculation_runs WHERE id = $1`,
      [run.id]
    );
    expect(reconciled.rows[0]?.status).toBe('running');
    expect(reconciled.rows[0]?.deadline_at.getTime()).toBeGreaterThan(Date.now());

    await pool.query(
      `UPDATE fund_scenario_calculation_runs
          SET deadline_at = clock_timestamp() - INTERVAL '1 second'
        WHERE id = $1`,
      [run.id]
    );
    await expect(sweep()).resolves.toMatchObject({ reconciledCount: 0, timedOutCount: 1 });

    const terminal = await pool.query<{ status: string; failure_code: string }>(
      `SELECT status, failure_code FROM fund_scenario_calculation_runs WHERE id = $1`,
      [run.id]
    );
    expect(terminal.rows[0]).toEqual({ status: 'failed', failure_code: 'HARD_TIMEOUT' });
  }, TEST_TIMEOUT_MS);

  it('terminalizes an expired queued row through Redis and frees its dedupe slot', async () => {
    const run = await seedRun('queued', new Date(Date.now() - 1000));
    const job = await queue.add('fund-scenario-deadline-sweep', { kind: 'fund-scenario-deadline-sweep' });
    await job.waitUntilFinished(queueEvents, TEST_TIMEOUT_MS);

    const terminal = await pool.query<{ status: string; failure_code: string }>(
      `SELECT status, failure_code FROM fund_scenario_calculation_runs WHERE id = $1`,
      [run.id]
    );
    expect(terminal.rows[0]).toEqual({ status: 'failed', failure_code: 'HARD_TIMEOUT' });

    const retry = await seedRun('queued', new Date(Date.now() + 30_000), run);
    expect(retry.scenarioSetId).toBe(run.scenarioSetId);
  }, TEST_TIMEOUT_MS);
});
