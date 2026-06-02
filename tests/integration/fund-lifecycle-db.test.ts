import express from 'express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  FundFinalizeResponseV1,
  FundFinalizeV1,
} from '../../shared/contracts/fund-finalize-v1.contract';
import type { FundResultsReadV1 } from '../../shared/contracts/fund-results-v1.contract';
import type { FundStateReadV1 } from '../../shared/contracts/fund-state-read-v1.contract';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 90_000;
const AUTH_SECRET = 'fund-lifecycle-db-secret-minimum-32';
const AUTH_ISSUER = 'updog-api';
const AUTH_AUDIENCE = 'updog-client';

type TestContextWithSkip = { skip?: () => void };
type SignToken = (data: object) => string;

interface Runtime {
  app: express.Express;
  pool: Pool;
  postgres: StartedPostgreSqlContainer;
  signToken: SignToken;
}

interface RowCounts {
  funds: number;
  publishedConfigs: number;
  calcRuns: number;
  snapshots: number;
}

let runtime: Runtime | null = null;
let skipReason: string | null = null;
let isStoppingPostgres = false;

function visibleLocalSkip(ctx: TestContextWithSkip): boolean {
  if (!skipReason) return false;
  console.warn(`[fund-lifecycle-db] SKIP: ${skipReason}`);
  ctx.skip?.();
  return true;
}

function isContainerRuntimeUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /container runtime|docker|testcontainers/i.test(message);
}

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
  const { signToken } = await import('../../server/lib/auth/jwt');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  registerFundConfigRoutes(app);

  return { app, pool, postgres, signToken };
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

function authHeader(active: Runtime, fundId: number): string {
  return `Bearer ${active.signToken({
    sub: 'fund-lifecycle-db',
    email: 'integration@example.com',
    role: 'admin',
    fundIds: [fundId],
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

describe('fund lifecycle DB proof', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    try {
      runtime = await startRuntime();
    } catch (error) {
      if (process.env.CI || !isContainerRuntimeUnavailable(error)) {
        throw new Error(
          `Fund lifecycle DB startup failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      skipReason = `Fund lifecycle DB infrastructure unavailable locally: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }, STARTUP_TIMEOUT_MS * 2);

  afterAll(async () => {
    isStoppingPostgres = true;
    const active = runtime;
    let closePgCircuitPool: (() => Promise<void>) | null = null;

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
    await tolerateExpectedPostgresStop([closePgCircuitPool?.(), active?.pool.end()]);
    await stopPostgresContainer(active?.postgres);
    restoreEnv(originalEnv);
    vi.resetModules();
  });

  it('proves finalize -> publish -> state/results -> idempotency against real Postgres', async (ctx) => {
    if (visibleLocalSkip(ctx)) return;
    expect(runtime).not.toBeNull();
    const active = runtime!;
    const idempotencyKey = 'lean-lifecycle-db-proof-1';
    const body = finalizeFixture();

    const first = await request(active.app)
      .post('/api/funds/finalize')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.headers['idempotency-key']).toBe(idempotencyKey);
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
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(replay.status, JSON.stringify(replay.body)).toBe(201);
    expect(replay.headers['idempotency-replay']).toBe('true');
    expect(replay.body).toEqual(first.body);
    await expect(rowCounts(active, fundId)).resolves.toEqual(beforeReplay);
  }, 60_000);
});
