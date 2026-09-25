import express from 'express';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { once } from 'node:events';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  FundFinalizeResponseV1,
  FundFinalizeV1,
} from '../../shared/contracts/fund-finalize-v1.contract';
import type { FundResultsReadV1 } from '../../shared/contracts/fund-results-v1.contract';
import type { FundStateReadV1 } from '../../shared/contracts/fund-state-read-v1.contract';
import {
  parseReleaseCanaryHttpFundProofV2,
  RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
} from '../../shared/contracts/release-canary-residue-characterization-v2.contract';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const AUTH_SECRET = 'fund-lifecycle-db-secret-minimum-32';
const AUTH_ISSUER = 'updog-api';
const AUTH_AUDIENCE = 'updog-client';
const ORGANIZATION_ID = 'ce000000-0000-4000-8000-000000000001';
const initialHttpProofEnv = {
  resultPath: process.env['RELEASE_CANARY_HTTP_RESULT_PATH'],
  sourceSha: process.env['RELEASE_CANARY_HTTP_SOURCE_SHA'],
  workflowRunId: process.env['RELEASE_CANARY_HTTP_WORKFLOW_RUN_ID'],
  workflowRunAttempt: process.env['RELEASE_CANARY_HTTP_WORKFLOW_RUN_ATTEMPT'],
};
const httpProofSourceSha = initialHttpProofEnv.sourceSha ?? 'a'.repeat(40);
const httpProofWorkflowRunId = initialHttpProofEnv.workflowRunId ?? '987654321';
const httpProofWorkflowRunAttempt = Number(initialHttpProofEnv.workflowRunAttempt ?? '1');
const httpProofConfigured = Object.values(initialHttpProofEnv).every(
  (value) => value !== undefined
);

type SignToken = (data: object) => string;

interface Runtime {
  app: express.Express;
  pool: Pool;
  postgres: StartedPostgreSqlContainer;
  signToken: SignToken;
  userId: number;
}

interface RowCounts {
  funds: number;
  publishedConfigs: number;
  calcRuns: number;
  snapshots: number;
}

let runtime: Runtime | null = null;
let isStoppingPostgres = false;

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function isExpectedPostgresStopError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === '57P01' || /terminating connection due to administrator command/i.test(message);
}

function createRuntimePool(connectionString: string): Pool {
  const pool = new Pool({ connectionString, max: 4 });
  pool.on('error', (error) => {
    if (isStoppingPostgres && isExpectedPostgresStopError(error)) {
      return;
    }
    throw error;
  });
  return pool;
}

async function tolerateExpectedPostgresStop(
  operations: Array<Promise<void> | undefined>
): Promise<void> {
  const results = await Promise.allSettled(
    operations.map((operation) => operation ?? Promise.resolve())
  );
  for (const result of results) {
    if (result.status === 'rejected' && !isExpectedPostgresStopError(result.reason)) {
      throw result.reason;
    }
  }
}

async function stopPostgresContainer(postgres: StartedPostgreSqlContainer | undefined) {
  if (!postgres) return;
  if (process.env.CI === 'true') {
    console.warn('[fund-lifecycle-db] Postgres container left for CI cleanup after pg pools close');
    return;
  }
  await postgres.stop();
}

async function startRuntime(): Promise<Runtime> {
  const postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();

  const connectionString = postgres.getConnectionUri();
  const pool = createRuntimePool(connectionString);

  await runMigrationsWithConnectionString(connectionString);

  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (username, password, role)
     VALUES ($1, $2, 'admin')
     RETURNING id`,
    ['fund-lifecycle-db', 'test-only-password']
  );
  const userId = user.rows[0]!.id;

  vi.resetModules();
  process.env.NODE_ENV = 'test';
  process.env._EXPLICIT_NODE_ENV = 'test';
  process.env.DATABASE_URL = connectionString;
  process.env._EXPLICIT_DATABASE_URL = connectionString;
  process.env.USE_REAL_DB_IN_VITEST = '1';
  // This test proves the no-Redis inline reserve/pacing dispatch path.
  process.env.ENABLE_QUEUES = '0';
  process.env._EXPLICIT_ENABLE_QUEUES = '0';
  process.env.REDIS_URL = 'memory://';
  process.env._EXPLICIT_REDIS_URL = 'memory://';
  process.env.JWT_SECRET = AUTH_SECRET;
  process.env._EXPLICIT_JWT_SECRET = AUTH_SECRET;
  process.env.JWT_ISSUER = AUTH_ISSUER;
  process.env._EXPLICIT_JWT_ISSUER = AUTH_ISSUER;
  process.env.JWT_AUDIENCE = AUTH_AUDIENCE;
  process.env._EXPLICIT_JWT_AUDIENCE = AUTH_AUDIENCE;
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';

  const { registerFundConfigRoutes } = await import('../../server/routes/fund-config');
  const { requireAuth, signToken } = await import('../../server/lib/auth/jwt');

  const { protectedRLSTransaction } = await import('../../server/middleware/with-rls-transaction');
  const { default: fundsRouter } = await import('../../server/routes/funds');
  const { idempotency } = await import('../../server/middleware/idempotency');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', requireAuth());
  app.use('/api', protectedRLSTransaction());
  app.use('/api', idempotency());
  app.use('/api', fundsRouter);
  registerFundConfigRoutes(app);

  return { app, pool, postgres, signToken, userId };
}

function finalizeFixture(): FundFinalizeV1 {
  return {
    name: 'Lean Lifecycle Proof Fund',
    size: 100_000_000,
    managementFee: 0.02,
    carryPercentage: 0.2,
    vintageYear: 2026,
    modelVersion: 'lean-release-db-proof',
    establishmentDate: '2026-01-15',
    modelInputsAsOfDate: '2026-06-30',
    isEvergreen: false,
    fundLife: 10,
    investmentPeriod: 5,
    gpCommitment: 5_000_000,
    lpClasses: [],
    lps: [],
    stages: [{ id: 'seed', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
    sectorProfiles: [],
    allocations: [],
    followOnChecks: { A: 1, B: 2, C: 3 },
    capitalStageAllocations: [],
    capitalPlanAllocations: [],
    pipelineProfiles: [],
    waterfallType: 'american',
    waterfallTiers: [],
    recyclingEnabled: false,
    feeProfiles: [],
    fundExpenses: [],
  };
}

function authHeader(active: Runtime, fundId?: number): string {
  return `Bearer ${active.signToken({
    sub: String(active.userId),
    email: 'integration@example.com',
    role: 'admin',
    orgId: ORGANIZATION_ID,
    fundIds: fundId === undefined ? [] : [fundId],
  })}`;
}

async function rowCounts(active: Runtime, fundId: number): Promise<RowCounts> {
  const [funds, publishedConfigs, calcRuns, snapshots] = await Promise.all([
    active.pool.query<{ count: string }>('SELECT COUNT(*)::int AS count FROM funds WHERE id = $1', [
      fundId,
    ]),
    active.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
         FROM fundconfigs
        WHERE fund_id = $1
          AND is_published = true`,
      [fundId]
    ),
    active.pool.query<{ count: string }>(
      'SELECT COUNT(*)::int AS count FROM calc_runs WHERE fund_id = $1',
      [fundId]
    ),
    active.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
         FROM fund_snapshots
        WHERE fund_id = $1
          AND scenario_set_id IS NULL`,
      [fundId]
    ),
  ]);

  return {
    funds: Number(funds.rows[0]?.count ?? 0),
    publishedConfigs: Number(publishedConfigs.rows[0]?.count ?? 0),
    calcRuns: Number(calcRuns.rows[0]?.count ?? 0),
    snapshots: Number(snapshots.rows[0]?.count ?? 0),
  };
}

async function createDraft(active: Runtime, headers?: Record<string, string>) {
  const key = randomUUID();
  const body = { name: 'Synthetic Workspace Fund', size: 25_000_000, vintageYear: 2026 };
  const createRequest = request(active.app)
    .post('/api/funds')
    .set('Authorization', authHeader(active))
    .set('Idempotency-Key', key);
  if (headers !== undefined) createRequest.set(headers);
  const response = await createRequest.send(body);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return {
    fundId: response.body.data.id as number,
    etag: response.headers['etag'] as string,
    key,
    body,
    response,
  };
}

function saveDraft(
  active: Runtime,
  fundId: number,
  etag: string,
  key = randomUUID(),
  body: object = { fundName: 'Saved workspace fund', modelInputsAsOfDate: '2026-06-30' }
) {
  return request(active.app)
    .put(`/api/funds/${fundId}/draft`)
    .set('Authorization', authHeader(active))
    .set('Idempotency-Key', key)
    .set('If-Match', etag)
    .send(body);
}

async function durableState(active: Runtime, fundId: number) {
  const result = await active.pool.query(
    `SELECT
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM fundconfigs c WHERE fund_id=$1) AS configs,
    (SELECT count(*)::int FROM fund_workflow_commands WHERE fund_id=$1) AS receipts,
    (SELECT count(*)::int FROM fund_events WHERE fund_id=$1) AS events,
    (SELECT count(*)::int FROM calc_runs WHERE fund_id=$1) AS runs,
    (SELECT count(*)::int FROM fund_snapshots WHERE fund_id=$1) AS snapshots,
    (SELECT count(*)::int FROM fund_metrics WHERE fund_id=$1) AS metrics,
    (SELECT count(*)::int FROM fund_baselines WHERE fund_id=$1) AS baselines,
    (SELECT count(*)::int FROM user_fund_grants WHERE fund_id=$1) AS grants`,
    [fundId]
  );
  return result.rows[0];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('fund lifecycle DB proof', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    try {
      runtime = await startRuntime();
    } catch (error) {
      throw new Error(
        `Fund lifecycle DB startup failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, STARTUP_TIMEOUT_MS * 2);

  beforeEach(async () => {
    const { resetCompletionHandlers } = await import('../../server/services/calc-run-tracking');
    const { resetCompletionHandlerRegistration, registerCompletionHandlers } =
      await import('../../server/services/calc-run-completion-handlers');
    resetCompletionHandlers();
    resetCompletionHandlerRegistration();
    registerCompletionHandlers();
  });

  afterAll(async () => {
    isStoppingPostgres = true;
    const active = runtime;
    let closePrimaryDbPool: (() => Promise<void>) | null = null;
    let closePgCircuitPool: (() => Promise<void>) | null = null;

    try {
      const primaryDb = await import('../../server/db');
      closePrimaryDbPool = primaryDb.closeDatabasePool;
    } catch {
      // The primary db module may never load if startup failed before route import.
    }
    try {
      const db = await import('../../server/db/pg-circuit');
      closePgCircuitPool = db.closePool;
    } catch {
      // The pg-circuit module may never load if startup failed before route import.
    }
    try {
      const registry = await import('../../server/queues/registry');
      registry.resetQueueRegistry();
    } catch {
      // Queue registry may never load if startup failed before route import.
    }
    try {
      const idempotency = await import('../../server/middleware/idempotency');
      idempotency.clearIdempotencyCache();
    } catch {
      // Idempotency middleware may never load if startup failed before route import.
    }
    await tolerateExpectedPostgresStop([
      closePrimaryDbPool?.(),
      closePgCircuitPool?.(),
      active?.pool.end(),
    ]);
    await stopPostgresContainer(active?.postgres);
    restoreEnv(originalEnv);
    vi.resetModules();
  });

  it('proves finalize -> publish -> state/results -> idempotency against real Postgres', async () => {
    expect(runtime).not.toBeNull();
    const active = runtime!;
    const idempotencyKey = randomUUID();
    const body = finalizeFixture();
    const adminToken = authHeader(active);

    const first = await request(active.app)
      .post('/api/funds/finalize')
      .set('Authorization', adminToken)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.headers['etag']).toMatch(/^"[0-9a-f]{16}"$/);
    const firstBody = first.body as FundFinalizeResponseV1;
    expect(firstBody.success).toBe(true);
    expect(firstBody.data).toEqual(
      expect.objectContaining({
        fundId: expect.any(Number),
        configVersion: 1,
        published: true,
        runId: expect.any(Number),
        dispatchState: 'dispatched',
      })
    );

    const fundId = firstBody.data.fundId;
    const runId = firstBody.data.runId!;
    const token = authHeader(active, fundId);

    const dbRows = await active.pool.query<{
      fund_id: number;
      config_id: number;
      run_id: number;
      dispatch_state: string;
      engines: string[];
      snapshot_types: string[];
      snapshot_count: number;
    }>(
      `SELECT f.id AS fund_id,
                fc.id AS config_id,
                cr.id AS run_id,
                cr.dispatch_state,
                cr.engines,
                ARRAY_AGG(fs.type ORDER BY fs.type) AS snapshot_types,
                COUNT(fs.id)::int AS snapshot_count
           FROM funds f
           JOIN fundconfigs fc
             ON fc.fund_id = f.id
            AND fc.is_published = true
           JOIN calc_runs cr
             ON cr.fund_id = f.id
            AND cr.config_id = fc.id
            AND cr.config_version = fc.version
           JOIN fund_snapshots fs
             ON fs.fund_id = f.id
            AND fs.run_id = cr.id
            AND fs.config_id = fc.id
            AND fs.config_version = fc.version
            AND fs.scenario_set_id IS NULL
          WHERE f.id = $1
          GROUP BY f.id, fc.id, cr.id, cr.dispatch_state, cr.engines`,
      [fundId]
    );

    expect(dbRows.rows).toHaveLength(1);
    expect(dbRows.rows[0]).toEqual(
      expect.objectContaining({
        fund_id: fundId,
        run_id: runId,
        dispatch_state: 'dispatched',
        engines: ['reserve', 'pacing'],
        snapshot_types: ['PACING', 'RESERVE'],
        snapshot_count: 2,
      })
    );

    const stateResponse = await request(active.app)
      .get(`/api/funds/${fundId}/state`)
      .set('Authorization', token);
    expect(stateResponse.status, JSON.stringify(stateResponse.body)).toBe(200);
    const state = stateResponse.body as FundStateReadV1;
    expect(state.configState.hasPublished).toBe(true);
    expect(state.configState.publishedVersion).toBe(1);
    expect(state.calculationState).toEqual(
      expect.objectContaining({
        status: 'ready',
        runId,
        dispatchState: 'dispatched',
        legacyEvidence: false,
      })
    );
    expect([...state.calculationState.availableSnapshotTypes].sort()).toEqual([
      'PACING',
      'RESERVE',
    ]);
    expect([...state.calculationState.expectedSnapshotTypes].sort()).toEqual(['PACING', 'RESERVE']);

    const resultsResponse = await request(active.app)
      .get(`/api/funds/${fundId}/results`)
      .set('Authorization', token);
    expect(resultsResponse.status, JSON.stringify(resultsResponse.body)).toBe(200);
    const results = resultsResponse.body as FundResultsReadV1;
    expect(results.status).toBe('ready');
    expect(results.lifecycle.calculationState.status).toBe('ready');
    expect(results.sections.reserve.status).toBe('available');
    expect(results.sections.pacing.status).toBe('available');
    expect(JSON.stringify(results)).not.toContain('NO_PUBLISHED_CONFIG');

    const beforeReplay = await rowCounts(active, fundId);
    expect(beforeReplay).toEqual({
      funds: 1,
      publishedConfigs: 1,
      calcRuns: 1,
      snapshots: 2,
    });

    const replay = await request(active.app)
      .post('/api/funds/finalize')
      .set('Authorization', adminToken)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(replay.status, JSON.stringify(replay.body)).toBe(201);
    expect(replay.headers['idempotency-replay']).toBe('true');
    expect(replay.body.data).toEqual(first.body.data);
    expect(replay.headers['etag']).toBe(first.headers['etag']);
    await expect(rowCounts(active, fundId)).resolves.toEqual(beforeReplay);
  }, 60_000);
  it('creates distinct identical funds, replays a lost create response, and retains only business fields', async () => {
    const active = runtime!;
    const first = await createDraft(active);
    const second = await createDraft(active);
    expect(second.fundId).not.toBe(first.fundId);
    const before = await durableState(active, first.fundId);
    expect(before).toMatchObject({ receipts: 1, events: 1, grants: 1, runs: 0 });
    expect(before.configs[0].draft_revision).toBe(1);
    const replay = await request(active.app)
      .post('/api/funds')
      .set('Authorization', authHeader(active))
      .set('Idempotency-Key', first.key)
      .send(first.body);
    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(first.response.body.data);
    expect(replay.headers['etag']).toBe(first.etag);
    expect(replay.headers['idempotency-replay']).toBe('true');
    expect(await durableState(active, first.fundId)).toEqual(before);
    const receipt = await active.pool.query(
      'SELECT response_body FROM fund_workflow_commands WHERE fund_id=$1',
      [first.fundId]
    );
    expect(receipt.rows[0].response_body).not.toHaveProperty('renewedAccessToken');
    expect(JSON.stringify(receipt.rows[0])).not.toContain(AUTH_SECRET);
    const altered = await request(active.app)
      .post('/api/funds')
      .set('Authorization', authHeader(active))
      .set('Idempotency-Key', first.key)
      .send({ ...first.body, size: 26_000_000 });
    expect(altered.status).toBe(409);
    expect(altered.body.code).toBe('IDEMPOTENCY_KEY_REUSE');
  });

  it('reserves HTTP canary residue, caps extra saves, and avoids run/fund lock inversion', async () => {
    const active = runtime!;
    const env = { ...process.env };
    const releaseIdentityEnv = {
      VERCEL_GIT_COMMIT_SHA: process.env['VERCEL_GIT_COMMIT_SHA'],
      RAILWAY_GIT_COMMIT_SHA: process.env['RAILWAY_GIT_COMMIT_SHA'],
      COMMIT_REF: process.env['COMMIT_REF'],
    };
    const { RELEASE_CANARY_RESERVED_RESIDUE, transitionReleaseCanaryRun } =
      await import('../../server/services/canary-residue-service');
    const caps = {
      ...RELEASE_CANARY_RESERVED_RESIDUE,
      fundEvent: 10,
      mutationReceipt: 4,
      total: 48,
    };
    const envKeys = {
      portfolioCompany: 'PORTFOLIO_COMPANY',
      fund: 'FUND',
      fundConfig: 'FUND_CONFIG',
      fundEvent: 'FUND_EVENT',
      notification: 'NOTIFICATION',
      grant: 'GRANT',
      calculation: 'CALCULATION',
      mutationReceipt: 'MUTATION_RECEIPT',
      scenario: 'SCENARIO',
      reporting: 'REPORTING',
      total: 'TOTAL',
    };
    const actor = await active.pool.query<{ id: number }>(
      `INSERT INTO users (username, password, role, is_release_canary_principal)
       VALUES ($1, 'test-only-password', 'admin', true) RETURNING id`,
      [`workflow-canary-${randomUUID()}`]
    );
    const canary = { ...active, userId: actor.rows[0]!.id };
    try {
      for (const [group, suffix] of Object.entries(envKeys)) {
        process.env[`RELEASE_CANARY_MAX_${suffix}_RESIDUE`] = String(
          caps[group as keyof typeof caps]
        );
      }
      Object.assign(process.env, { RELEASE_CANARY_TTL_HOURS: '24' });
      const rejected = await request(active.app)
        .post('/api/funds')
        .set('Authorization', authHeader(canary))
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Over-cap synthetic canary', size: 25_000_000, vintageYear: 2026 });
      expect(rejected.status, JSON.stringify(rejected.body)).toBe(503);
      expect(rejected.body.code).toBe('CANARY_RESIDUE_CAPACITY_UNAVAILABLE');
      const empty = await active.pool.query(
        'SELECT count(*)::int AS count FROM release_canary_runs WHERE principal_user_id=$1',
        [canary.userId]
      );
      expect(empty.rows[0].count).toBe(0);
      Object.assign(process.env, {
        RELEASE_CANARY_MAX_MUTATION_RECEIPT_RESIDUE: '5',
        RELEASE_CANARY_MAX_TOTAL_RESIDUE: '49',
      });
      // Provider SHAs outrank COMMIT_REF; the decoys make the release_sha
      // readback fail if this clear is ever dropped.
      process.env.VERCEL_GIT_COMMIT_SHA = 'b'.repeat(40);
      process.env.RAILWAY_GIT_COMMIT_SHA = 'c'.repeat(40);
      delete process.env.VERCEL_GIT_COMMIT_SHA;
      delete process.env.RAILWAY_GIT_COMMIT_SHA;
      process.env.COMMIT_REF = httpProofSourceSha;
      const created = await createDraft(canary, {
        'Release-Canary-Workflow-Run-Id': httpProofWorkflowRunId,
        'Release-Canary-Workflow-Run-Attempt': String(httpProofWorkflowRunAttempt),
      });
      const runId = created.response.headers['release-canary-run-id'];
      expect(runId).toEqual(expect.any(String));
      const identity = await active.pool.query<{
        release_sha: string;
        workflow_run_id: string | null;
        workflow_run_attempt: number | null;
      }>(
        'SELECT release_sha, workflow_run_id, workflow_run_attempt FROM release_canary_runs WHERE id=$1',
        [runId]
      );
      expect(identity.rows).toHaveLength(1);
      const persistedIdentity = identity.rows[0]!;
      expect(persistedIdentity.release_sha).toBe(httpProofSourceSha);
      expect(String(persistedIdentity.workflow_run_id)).toBe(httpProofWorkflowRunId);
      expect(Number(persistedIdentity.workflow_run_attempt)).toBe(httpProofWorkflowRunAttempt);
      const runLock = await active.pool.connect();
      const saveKey = randomUUID();
      let saved;
      try {
        await runLock.query('BEGIN');
        await runLock.query('SELECT id FROM release_canary_runs WHERE id=$1 FOR UPDATE', [runId]);
        // A concurrent reconciler may own the run lock. Save must not request it
        // after locking the fund, which would reverse the reconciliation order.
        saved = await saveDraft(canary, created.fundId, created.etag, saveKey);
        expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      } finally {
        await runLock.query('ROLLBACK');
        runLock.release();
      }
      const before = await durableState(active, created.fundId);
      const replay = await saveDraft(canary, created.fundId, created.etag, saveKey);
      expect(replay.status).toBe(200);
      expect(replay.headers['idempotency-replay']).toBe('true');
      const overCap = await saveDraft(canary, created.fundId, saved.headers['etag']);
      expect(overCap.status, JSON.stringify(overCap.body)).toBe(503);
      expect(overCap.body.code).toBe('CANARY_RESIDUE_CAPACITY_UNAVAILABLE');
      expect(await durableState(active, created.fundId)).toEqual(before);
      const finalized = await request(active.app)
        .post('/api/funds/finalize')
        .set('Authorization', authHeader(canary))
        .set('Idempotency-Key', randomUUID())
        .set('If-Match', saved.headers['etag'])
        .send({ ...finalizeFixture(), draftFundId: created.fundId });
      expect(finalized.status, JSON.stringify(finalized.body)).toBe(201);
      expect(await durableState(active, created.fundId)).toMatchObject({
        receipts: 3,
        events: 5,
        runs: 1,
      });
      const observedFundPhaseResidue = await transitionReleaseCanaryRun(runId, 'completed', 1, [
        'created',
      ]);
      const recorded = await active.pool.query(
        'SELECT mutation_receipt_residue_count FROM release_canary_runs WHERE id=$1',
        [runId]
      );
      expect(recorded.rows[0].mutation_receipt_residue_count).toBe(3);
      // Historical service-only proof is deliberately not rewritten by this test.
      expect(RELEASE_CANARY_RESERVED_RESIDUE.mutationReceipt).toBe(2);
      if (httpProofConfigured) {
        const result = parseReleaseCanaryHttpFundProofV2({
          schemaVersion: 'release-canary-http-fund-proof-v2',
          sourceSha: persistedIdentity.release_sha,
          workflowRunId: String(persistedIdentity.workflow_run_id),
          workflowRunAttempt: Number(persistedIdentity.workflow_run_attempt),
          databaseCanaryRunId: runId,
          reservationIdentity: RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
          observedFundPhaseResidue,
          replayZeroGrowth: true,
          overCapZeroGrowth: true,
          result: 'passed',
        });
        const resultPath = initialHttpProofEnv.resultPath!;
        const tempPath = `${resultPath}.tmp-${process.pid}-${randomUUID()}`;
        await writeFile(tempPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
        await rename(tempPath, resultPath);
        const written = JSON.parse(await readFile(resultPath, 'utf8')) as unknown;
        expect(parseReleaseCanaryHttpFundProofV2(written)).toEqual(result);
      }
    } finally {
      restoreEnv(env);
      restoreEnv(releaseIdentityEnv);
      expect(process.env['VERCEL_GIT_COMMIT_SHA']).toBe(releaseIdentityEnv.VERCEL_GIT_COMMIT_SHA);
      expect(process.env['RAILWAY_GIT_COMMIT_SHA']).toBe(releaseIdentityEnv.RAILWAY_GIT_COMMIT_SHA);
      expect(process.env['COMMIT_REF']).toBe(releaseIdentityEnv.COMMIT_REF);
    }
  });

  it('serializes saves, replays the original revision, and never overwrites a stale draft', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const key = randomUUID();
    const first = await saveDraft(active, created.fundId, created.etag, key);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data).not.toHaveProperty('draftRevision');
    expect(first.headers['etag']).not.toBe(created.etag);
    const second = await saveDraft(active, created.fundId, first.headers['etag'], randomUUID(), {
      fundName: 'Later edit',
    });
    expect(second.status).toBe(200);
    expect(second.body.data.config).toEqual({ fundName: 'Later edit' });
    const before = await durableState(active, created.fundId);
    expect(before.configs[0].draft_revision).toBe(3);
    const replay = await saveDraft(active, created.fundId, created.etag, key);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotency-replay']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['etag']).toBe(first.headers['etag']);
    const stale = await saveDraft(active, created.fundId, created.etag);
    expect(stale.status).toBe(412);
    expect(stale.body.code).toBe('PRECONDITION_FAILED');
    expect(stale.body.details.current).toBe(second.headers['etag']);
    expect(stale.headers['etag']).toBe(second.headers['etag']);
    const changed = await saveDraft(active, created.fundId, created.etag, key, {
      fundName: 'Overwrite attempt',
    });
    expect(changed.status).toBe(409);
    expect(changed.body.code).toBe('IDEMPOTENCY_KEY_REUSE');
    expect(await durableState(active, created.fundId)).toEqual(before);
    const read = await request(active.app)
      .get(`/api/funds/${created.fundId}/draft`)
      .set('Authorization', authHeader(active));
    expect(read.headers['etag']).toBe(second.headers['etag']);
    expect(read.body).toEqual(second.body.data);
  });

  it('converges concurrent same-key saves and rejects one of two competing revisions', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const key = randomUUID();
    const same = await Promise.all([
      saveDraft(active, created.fundId, created.etag, key),
      saveDraft(active, created.fundId, created.etag, key),
    ]);
    expect(same.map((r) => r.status)).toEqual([200, 200]);
    expect(same.filter((r) => r.headers['idempotency-replay'] === 'true')).toHaveLength(1);
    expect(same[0]!.body).toEqual(same[1]!.body);
    const competing = await Promise.all([
      saveDraft(active, created.fundId, same[0]!.headers['etag'], randomUUID(), {
        fundName: 'Writer A',
      }),
      saveDraft(active, created.fundId, same[0]!.headers['etag'], randomUUID(), {
        fundName: 'Writer B',
      }),
    ]);
    expect(competing.map((r) => r.status).sort()).toEqual([200, 412]);
    const state = await durableState(active, created.fundId);
    expect(state).toMatchObject({ receipts: 3, events: 3 });
    expect(state.configs[0].draft_revision).toBe(3);
  });

  it('finalizes the reviewed existing draft once, then replays before checking for an active draft', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const key = randomUUID();
    const body = { ...finalizeFixture(), draftFundId: created.fundId, name: 'Reviewed snapshot' };
    const dispatch = () =>
      request(active.app)
        .post('/api/funds/finalize')
        .set('Authorization', authHeader(active))
        .set('Idempotency-Key', key)
        .set('If-Match', created.etag)
        .send(body);
    const first = await dispatch();
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.data.fundId).toBe(created.fundId);
    const before = await durableState(active, created.fundId);
    expect(before).toMatchObject({ receipts: 2, runs: 1, snapshots: 2, metrics: 1, baselines: 1 });
    expect(before.configs[0]).toMatchObject({
      draft_revision: 2,
      is_published: true,
      is_draft: false,
    });
    expect(before.configs[0].config.fundName).toBe('Reviewed snapshot');
    const replay = await dispatch();
    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(first.body.data);
    expect(replay.headers['etag']).toBe(first.headers['etag']);
    expect(await durableState(active, created.fundId)).toEqual(before);
    const noDraft = await saveDraft(active, created.fundId, first.headers['etag']);
    expect(noDraft.status, JSON.stringify(noDraft.body)).toBe(409);
    expect(noDraft.body.code).toBe('NO_ACTIVE_DRAFT');
    expect(await durableState(active, created.fundId)).toEqual(before);
  });

  it('publishes directly with the same guard, durable replay and no latest-publication substitution', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const saved = await saveDraft(active, created.fundId, created.etag);
    const key = randomUUID();
    const dispatch = (commandKey = key) =>
      request(active.app)
        .post(`/api/funds/${created.fundId}/publish`)
        .set('Authorization', authHeader(active))
        .set('Idempotency-Key', commandKey)
        .set('If-Match', saved.headers['etag'])
        .send({});
    const first = await dispatch();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.dispatchState).toBe('dispatched');
    const before = await durableState(active, created.fundId);
    const replay = await dispatch();
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotency-replay']).toBe('true');
    const newCommand = await dispatch(randomUUID());
    expect(newCommand.status).toBe(409);
    expect(newCommand.body.code).toBe('NO_ACTIVE_DRAFT');
    expect(await durableState(active, created.fundId)).toEqual(before);
  });

  it('rejects missing, weak, wildcard, list, duplicate and malformed preconditions without writes', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const before = await durableState(active, created.fundId);
    for (const token of [
      undefined,
      `W/${created.etag}`,
      '*',
      `${created.etag}, ${created.etag}`,
      'unquoted',
      [created.etag, created.etag],
    ]) {
      const call = request(active.app)
        .put(`/api/funds/${created.fundId}/draft`)
        .set('Authorization', authHeader(active))
        .set('Idempotency-Key', randomUUID());
      if (token !== undefined) call.set('If-Match', token);
      const response = await call.send({ fundName: 'Retained' });
      expect(response.status, JSON.stringify(response.body)).toBe(token === undefined ? 428 : 400);
      expect(response.body.code).toBe(
        token === undefined ? 'PRECONDITION_REQUIRED' : 'INVALID_IF_MATCH'
      );
    }
    for (const key of [undefined, 'old-derived-key', [randomUUID(), randomUUID()]]) {
      const call = request(active.app)
        .put(`/api/funds/${created.fundId}/draft`)
        .set('Authorization', authHeader(active))
        .set('If-Match', created.etag);
      if (key !== undefined) call.set('Idempotency-Key', key);
      const response = await call.send({ fundName: 'Retained' });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(
        key === undefined ? 'IDEMPOTENCY_KEY_REQUIRED' : 'INVALID_IDEMPOTENCY_KEY'
      );
    }
    const invalid = await saveDraft(active, created.fundId, created.etag, randomUUID(), {
      fundName: ' ',
      establishmentDate: '2026-02-30',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('DRAFT_VALIDATION_ERROR');
    expect(await durableState(active, created.fundId)).toEqual(before);
  });

  it('requires a stable actor and current write scope before any command receipt is exposed', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const before = await durableState(active, created.fundId);
    for (const [method, path, body] of [
      ['post', '/api/funds', created.body],
      ['post', '/api/funds/finalize', finalizeFixture()],
      ['put', `/api/funds/${created.fundId}/draft`, { fundName: 'Denied' }],
      ['post', `/api/funds/${created.fundId}/publish`, {}],
    ] as const) {
      const invalidActor = `Bearer ${active.signToken({ sub: 'not-a-numeric-actor', role: 'admin', orgId: ORGANIZATION_ID })}`;
      const call = request(active.app);
      const response = await call[method](path)
        .set('Authorization', invalidActor)
        .set('Idempotency-Key', randomUUID())
        .set('If-Match', created.etag)
        .send(body);
      expect(response.status, JSON.stringify(response.body)).toBe(401);
      expect(response.body.code).toBe('INVALID_AUTHENTICATION_IDENTITY');
    }
    const restricted = `Bearer ${active.signToken({ sub: String(active.userId), role: 'partner', orgId: ORGANIZATION_ID, fundIds: [] })}`;
    const denied = await request(active.app)
      .put(`/api/funds/${created.fundId}/draft`)
      .set('Authorization', restricted)
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', created.etag)
      .send({ fundName: 'Denied' });
    expect(denied.status).toBe(403);
    expect(denied.headers['etag']).not.toMatch(/^"[0-9a-f]{16}"$/);
    expect(await durableState(active, created.fundId)).toEqual(before);
  });

  it('returns bounded lock contention only after rollback, then accepts the same command', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const before = await durableState(active, created.fundId);
    const blocker = await active.pool.connect();
    const key = randomUUID();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM funds WHERE id=$1 FOR UPDATE', [created.fundId]);
      const waiting = await saveDraft(active, created.fundId, created.etag, key);
      expect(waiting.status, JSON.stringify(waiting.body)).toBe(409);
      expect(waiting.body.code).toBe('REQUEST_IN_PROGRESS');
      expect(waiting.headers['retry-after']).toBe('2');
      expect(await durableState(active, created.fundId)).toEqual(before);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
    const retried = await saveDraft(active, created.fundId, created.etag, key);
    expect(retried.status).toBe(200);
  });

  it('pauses all four writes while reads remain available, then resumes safely', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const before = await durableState(active, created.fundId);
    process.env.FUND_WORKFLOW_WRITES_PAUSED = '1';
    try {
      for (const [method, path, body] of [
        ['post', '/api/funds', created.body],
        ['post', '/api/funds/finalize', finalizeFixture()],
        ['put', `/api/funds/${created.fundId}/draft`, { fundName: 'Paused' }],
        ['post', `/api/funds/${created.fundId}/publish`, {}],
      ] as const) {
        const call = request(active.app);
        const response = await call[method](path)
          .set('Authorization', authHeader(active))
          .set('Idempotency-Key', randomUUID())
          .set('If-Match', created.etag)
          .send(body);
        expect(response.status).toBe(503);
        expect(response.body.code).toBe('FUND_WORKFLOW_WRITES_PAUSED');
        expect(response.headers['retry-after']).toBe('30');
      }
      const read = await request(active.app)
        .get(`/api/funds/${created.fundId}/draft`)
        .set('Authorization', authHeader(active));
      expect(read.status).toBe(200);
      expect(await durableState(active, created.fundId)).toEqual(before);
    } finally {
      delete process.env.FUND_WORKFLOW_WRITES_PAUSED;
    }
    expect((await saveDraft(active, created.fundId, created.etag)).status).toBe(200);
  });

  it('rolls back a launched completion failure and retries the original finalize command', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const before = await durableState(active, created.fundId);
    const { varianceTrackingService } = await import('../../server/services/variance-tracking');
    const spy = vi
      .spyOn(varianceTrackingService.baselines, 'createBaselineFromCalcRun')
      .mockRejectedValueOnce(new Error('synthetic completion failure'));
    const key = randomUUID();
    const dispatch = () =>
      request(active.app)
        .post('/api/funds/finalize')
        .set('Authorization', authHeader(active))
        .set('Idempotency-Key', key)
        .set('If-Match', created.etag)
        .send({ ...finalizeFixture(), draftFundId: created.fundId });
    try {
      const failed = await dispatch();
      expect(failed.status).toBe(500);
      expect(spy).toHaveBeenCalledOnce();
      expect(await durableState(active, created.fundId)).toEqual(before);
      const retried = await dispatch();
      expect(retried.status, JSON.stringify(retried.body)).toBe(201);
      expect((await durableState(active, created.fundId)).receipts).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('waits for a timed-out completion stage before rolling back its captured transaction', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const before = await durableState(active, created.fundId);
    const { varianceTrackingService } = await import('../../server/services/variance-tracking');
    const { getRequestDatabaseScope } = await import('../../server/db/request-context');
    const { fundEvents } = await import('../../shared/schema');
    const entered = deferred<void>();
    const release = deferred<void>();
    const settled = deferred<void>();
    const original = varianceTrackingService.baselines.createBaselineFromCalcRun.bind(
      varianceTrackingService.baselines
    );
    const spy = vi
      .spyOn(varianceTrackingService.baselines, 'createBaselineFromCalcRun')
      .mockImplementationOnce(async (runId) => {
        const tx = getRequestDatabaseScope()!.db;
        entered.resolve();
        try {
          await release.promise;
          await tx.insert(fundEvents).values({
            fundId: created.fundId,
            eventType: 'TEST_DELAYED_WRITE',
            eventTime: new Date(),
          });
          return await original(runId);
        } finally {
          settled.resolve();
        }
      });
    let finished = false;
    const response = request(active.app)
      .post('/api/funds/finalize')
      .set('Authorization', authHeader(active))
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', created.etag)
      .send({ ...finalizeFixture(), draftFundId: created.fundId })
      .then((result) => {
        finished = true;
        return result;
      });
    try {
      await entered.promise;
      await new Promise((resolve) => setTimeout(resolve, 30_100));
      expect(finished).toBe(false);
      release.resolve();
      await settled.promise;
      expect((await response).status).toBe(500);
      expect(await durableState(active, created.fundId)).toEqual(before);
    } finally {
      release.resolve();
      await response;
      spy.mockRestore();
    }
  }, 60_000);

  it('destroys the transaction on precommit disconnect so captured delayed work cannot write later', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const before = await durableState(active, created.fundId);
    const { varianceTrackingService } = await import('../../server/services/variance-tracking');
    const { getRequestDatabaseScope } = await import('../../server/db/request-context');
    const { fundEvents } = await import('../../shared/schema');
    const entered = deferred<void>();
    const release = deferred<void>();
    const settled = deferred<void>();
    const disconnected = deferred<void>();
    let delayedError: unknown;
    const spy = vi
      .spyOn(varianceTrackingService.baselines, 'createBaselineFromCalcRun')
      .mockImplementationOnce(async () => {
        const scope = getRequestDatabaseScope()!;
        const tx = scope.db;
        scope.client.once('end', () => disconnected.resolve());
        const settings = await scope.client.query(
          "SELECT current_setting('app.current_org') AS org, current_setting('app.current_user') AS actor"
        );
        expect(settings.rows[0]).toEqual({ org: ORGANIZATION_ID, actor: String(active.userId) });
        entered.resolve();
        try {
          await release.promise;
          await tx.insert(fundEvents).values({
            fundId: created.fundId,
            eventType: 'TEST_LATE_DISCONNECT_WRITE',
            eventTime: new Date(),
          });
          throw new Error('Captured transaction unexpectedly remained usable');
        } catch (error) {
          delayedError = error;
          throw error;
        } finally {
          settled.resolve();
        }
      });
    const server = active.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test listener unavailable');
    const client = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: '/api/funds/finalize',
      method: 'POST',
      headers: {
        Authorization: authHeader(active),
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
        'If-Match': created.etag,
      },
    });
    client.on('error', () => undefined);
    client.end(JSON.stringify({ ...finalizeFixture(), draftFundId: created.fundId }));
    try {
      await entered.promise;
      client.destroy();
      await disconnected.promise;
      release.resolve();
      await settled.promise;
      expect(delayedError).toBeDefined();
      expect(String(delayedError)).not.toContain('unexpectedly remained usable');
      expect(await durableState(active, created.fundId)).toEqual(before);
    } finally {
      client.destroy();
      release.resolve();
      spy.mockRestore();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }, 30_000);

  it('enforces durable commands, authentication and the write pause in both HTTP assemblies', async () => {
    const active = runtime!;
    const variance = await import('../../server/services/variance-alert-automation');
    const retention =
      await import('../../server/services/financial-observations/artifact-retention-service');
    const checkpoint =
      await import('../../server/services/internal-analysis/analysis-checkpoint-service');
    const spies = [
      vi.spyOn(variance.varianceAlertAutomationService, 'start').mockImplementation(() => {}),
      vi.spyOn(retention.artifactRetentionService, 'start').mockImplementation(() => {}),
      vi.spyOn(checkpoint.internalAnalysisCheckpointService, 'start').mockImplementation(() => {}),
    ];
    const { makeApp } = await import('../../server/app');
    const config = (await import('../../server/config/index')).loadEnv();
    const providers = await (await import('../../server/providers')).buildProviders(config);
    const server = await (await import('../../server/server')).createServer(config, providers);
    const health = await import('../../server/health/state');
    health.setReady(true);
    try {
      for (const surface of [makeApp(), server]) {
        const key = randomUUID();
        const body = { name: 'Both assemblies synthetic fund', size: 1_000_000, vintageYear: 2026 };
        const create = () =>
          request(surface)
            .post('/api/funds')
            .set('Authorization', authHeader(active))
            .set('Idempotency-Key', key)
            .send(body);
        const first = await create();
        expect(first.status, JSON.stringify(first.body)).toBe(201);
        const replay = await create();
        expect(replay.status).toBe(201);
        expect(replay.headers['idempotency-replay']).toBe('true');
        expect(replay.body.data.id).toBe(first.body.data.id);
        const fundId = first.body.data.id as number;
        const before = await durableState(active, fundId);
        for (const [method, path, payload] of [
          ['post', '/api/funds', body],
          ['post', '/api/funds/finalize', finalizeFixture()],
          ['put', `/api/funds/${fundId}/draft`, { fundName: 'Paused' }],
          ['post', `/api/funds/${fundId}/publish`, {}],
        ] as const) {
          const denied = await request(surface)[method](path).send(payload);
          expect(denied.status).toBe(401);
          process.env.FUND_WORKFLOW_WRITES_PAUSED = '1';
          const call = request(surface);
          const paused = await call[method](path)
            .set('Authorization', authHeader(active))
            .set('Idempotency-Key', randomUUID())
            .set('If-Match', first.headers['etag'])
            .send(payload);
          expect(paused.status).toBe(503);
          delete process.env.FUND_WORKFLOW_WRITES_PAUSED;
        }
        expect(await durableState(active, fundId)).toEqual(before);
        const saveKey = randomUUID();
        const save = () =>
          request(surface)
            .put(`/api/funds/${fundId}/draft`)
            .set('Authorization', authHeader(active))
            .set('Idempotency-Key', saveKey)
            .set('If-Match', first.headers['etag'])
            .send({ fundName: 'Both assembly draft', modelInputsAsOfDate: '2026-06-30' });
        const saved = await save();
        expect(saved.status, JSON.stringify(saved.body)).toBe(200);
        expect((await save()).headers['idempotency-replay']).toBe('true');
        const publishKey = randomUUID();
        const publish = () =>
          request(surface)
            .post(`/api/funds/${fundId}/publish`)
            .set('Authorization', authHeader(active))
            .set('Idempotency-Key', publishKey)
            .set('If-Match', saved.headers['etag'])
            .send({});
        expect((await publish()).status).toBe(200);
        expect((await publish()).headers['idempotency-replay']).toBe('true');
        const finalizeKey = randomUUID();
        const finalize = () =>
          request(surface)
            .post('/api/funds/finalize')
            .set('Authorization', authHeader(active))
            .set('Idempotency-Key', finalizeKey)
            .send(finalizeFixture());
        expect((await finalize()).status).toBe(201);
        expect((await finalize()).headers['idempotency-replay']).toBe('true');
        expect(await durableState(active, fundId)).toMatchObject({
          receipts: 3,
          runs: 1,
          snapshots: 2,
        });
      }
    } finally {
      delete process.env.FUND_WORKFLOW_WRITES_PAUSED;
      health.setReady(false);
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      await providers.teardown();
      spies.forEach((spy) => spy.mockRestore());
    }
  }, 60_000);
  it('rolls back an actually launched engine failure, including earlier snapshots', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const before = await durableState(active, created.fundId);
    await active.pool
      .query(`CREATE FUNCTION fixture_fail_pacing() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.fund_id = ${created.fundId} AND NEW.type = 'PACING' THEN RAISE EXCEPTION 'synthetic engine storage failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fixture_fail_pacing BEFORE INSERT ON fund_snapshots FOR EACH ROW EXECUTE FUNCTION fixture_fail_pacing()`);
    try {
      const result = await request(active.app)
        .post('/api/funds/finalize')
        .set('Authorization', authHeader(active))
        .set('Idempotency-Key', randomUUID())
        .set('If-Match', created.etag)
        .send({ ...finalizeFixture(), draftFundId: created.fundId });
      expect(result.status).toBe(500);
      expect(await durableState(active, created.fundId)).toEqual(before);
    } finally {
      await active.pool.query(
        'DROP TRIGGER fixture_fail_pacing ON fund_snapshots; DROP FUNCTION fixture_fail_pacing()'
      );
    }
  });

  it('keeps bigint revisions lossless and committed receipts immutable', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    await active.pool.query('UPDATE fundconfigs SET draft_revision=$1 WHERE fund_id=$2', [
      '9007199254740993',
      created.fundId,
    ]);
    const read = await request(active.app)
      .get(`/api/funds/${created.fundId}/draft`)
      .set('Authorization', authHeader(active));
    const saved = await saveDraft(active, created.fundId, read.headers['etag']);
    expect(saved.status).toBe(200);
    expect(saved.headers['etag']).not.toBe(read.headers['etag']);
    const revision = await active.pool.query(
      'SELECT draft_revision::text AS revision FROM fundconfigs WHERE fund_id=$1',
      [created.fundId]
    );
    expect(revision.rows[0].revision).toBe('9007199254740994');
    await expect(
      active.pool.query('UPDATE fundconfigs SET draft_revision=0 WHERE fund_id=$1', [
        created.fundId,
      ])
    ).rejects.toThrow();
    await expect(
      active.pool.query("UPDATE fund_workflow_commands SET response_body='{}' WHERE fund_id=$1", [
        created.fundId,
      ])
    ).rejects.toThrow();
  });

  it('recovers a partner create with its durable grant and denies replay after grant revocation', async () => {
    const active = runtime!;
    const key = randomUUID();
    const bearer = `Bearer ${active.signToken({ sub: String(active.userId), role: 'partner', orgId: ORGANIZATION_ID, fundIds: [] })}`;
    const dispatch = () =>
      request(active.app)
        .post('/api/funds')
        .set('Authorization', bearer)
        .set('Idempotency-Key', key)
        .send({ name: 'Partner recovery', size: 1, vintageYear: 2026 });
    const first = await dispatch();
    expect(first.status).toBe(201);
    expect((await dispatch()).headers['idempotency-replay']).toBe('true');
    await active.pool.query('DELETE FROM user_fund_grants WHERE user_id=$1 AND fund_id=$2', [
      active.userId,
      first.body.data.id,
    ]);
    const denied = await dispatch();
    expect(denied.status).toBe(403);
    expect(denied.body).not.toHaveProperty('data');
  });

  it('bounds captured work with the database deadline and destroys the connection once', async () => {
    const active = runtime!;
    const created = await createDraft(active);
    const before = await durableState(active, created.fundId);
    const { runWithDatabaseContext } = await import('../../server/db');
    const { fundEvents } = await import('../../shared/schema');
    const entered = deferred<void>();
    const release = deferred<void>();
    const settled = deferred<void>();
    let releaseSpy: ReturnType<typeof vi.spyOn> | undefined;
    let lateError: unknown;
    const operation = runWithDatabaseContext(
      {
        userId: String(active.userId),
        email: 'integration@example.com',
        orgId: ORGANIZATION_ID,
        role: 'admin',
      },
      async (tx, client) => {
        releaseSpy = vi.spyOn(client, 'release');
        entered.resolve();
        try {
          await release.promise;
          await tx.insert(fundEvents).values({
            fundId: created.fundId,
            eventType: 'TEST_DEADLINE_LATE_WRITE',
            eventTime: new Date(),
          });
        } catch (error) {
          lateError = error;
          throw error;
        } finally {
          settled.resolve();
        }
      },
      { timeoutMs: 100 }
    );
    const rejected = expect(operation).rejects.toThrow(
      'Database transaction execution deadline exceeded'
    );
    try {
      await entered.promise;
      await rejected;
      expect(releaseSpy).toHaveBeenCalledExactlyOnceWith(true);
      release.resolve();
      await settled.promise;
      expect(lateError).toBeDefined();
      expect(await durableState(active, created.fundId)).toEqual(before);
    } finally {
      release.resolve();
      await rejected;
      releaseSpy?.mockRestore();
    }
  });
});
