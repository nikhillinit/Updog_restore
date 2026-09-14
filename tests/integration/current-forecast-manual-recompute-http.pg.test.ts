import { request as httpRequest, type Server } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';
import { manageIsolatedDatabasePool } from '../helpers/isolated-postgres-database';
import * as schema from '@shared/schema';
import type { CurrentForecastV2 } from '../../shared/contracts/current-forecast-v2.contract';
import { CURRENT_FORECAST_FUND_LOCK_CLASS } from '../../server/services/current-forecast-fund-lock';

const forecast = vi.hoisted(() => ({
  getOrCreateCurrentForecastV2WithReceipt: vi.fn(),
  runCurrentForecastV2: vi.fn(),
}));
vi.mock('../../server/services/current-forecast-v2-service', async (original) => ({
  ...(await original<typeof import('../../server/services/current-forecast-v2-service')>()),
  ...forecast,
}));

let admin: Pool;
let observer: Pool;
let databaseName = '';
let dbModule: typeof import('../../server/db');
let jwtModule: typeof import('../../server/lib/auth/jwt');
let app: ReturnType<(typeof import('../../server/app'))['makeApp']>;
let server: Server | undefined;
let providers:
  Awaited<ReturnType<(typeof import('../../server/providers'))['buildProviders']>> | undefined;
let fundSequence = 229_096_100;
let contextModule: typeof import('../../server/db/request-context');
const originalEnvironment = { ...process.env };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function bounded<T>(operation: Promise<T>, timeoutMs = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('HTTP recompute probe exceeded its bound')),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function token(fundId: number, role = 'admin') {
  return jwtModule.signToken({
    sub: '7',
    email: 'recompute@example.com',
    role,
    orgId: 'recompute-org',
    fundIds: [fundId],
  });
}

function context(fundId: number) {
  return {
    userId: '7',
    orgId: 'recompute-org',
    email: 'recompute@example.com',
    role: 'admin',
    fundId: String(fundId),
  };
}

async function rows(fundId: number) {
  const command = await observer.query(
    `SELECT status, failure_code FROM current_forecast_recompute_commands WHERE fund_id = $1`,
    [fundId]
  );
  const counts = await observer.query(
    `SELECT
    (SELECT count(*)::integer FROM fund_snapshots WHERE fund_id = $1 AND type = 'CURRENT_FORECAST_V2') AS receipts,
    (SELECT count(*)::integer FROM substrate_shadow_reconciliations WHERE fund_id = $1) AS reconciliations`,
    [fundId]
  );
  return { commands: command.rows, ...counts.rows[0] };
}

async function noOwnedTransactions() {
  await bounded(
    (async () => {
      while (
        (
          await observer.query(
            `SELECT 1 FROM pg_stat_activity WHERE usename = $1 AND xact_start IS NOT NULL`,
            [databaseName]
          )
        ).rowCount
      ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    })()
  );
  expect((dbModule.pool as Pool).waitingCount).toBe(0);
}

function post(fundId: number, key: string, surface: typeof app | Server = app) {
  return request(surface)
    .post(`/api/funds/${fundId}/current-forecast/recompute`)
    .set('Authorization', `Bearer ${token(fundId)}`)
    .set('Idempotency-Key', key)
    .send({});
}

async function fixture() {
  const fundId = fundSequence++;
  await observer.query(
    `INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
    VALUES ($1, $2, 10000000, '0.0200', '0.2000', 2026)`,
    [fundId, `HTTP recompute ${fundId}`]
  );
  await observer.query(
    `INSERT INTO fund_calculation_modes (fund_id, calculation_key, configured_mode, shadow_started_at)
    VALUES ($1, 'current_forecast', 'shadow', clock_timestamp())`,
    [fundId]
  );
  const result = {
    fundId,
    financialFactsSnapshotId: '31',
    currentPlanVersionId: '21',
    status: 'available',
    inputHash: '2'.repeat(64),
    resultHash: String(fundId).padStart(64, '3'),
    assumptionsHash: '4'.repeat(64),
    methodologyVersion: 'cohort-projection-v2/1.0.0',
  } as CurrentForecastV2;
  const entered = deferred<void>();
  const release = deferred<void>();
  forecast.getOrCreateCurrentForecastV2WithReceipt.mockImplementation(async ({ database }) => {
    const [receipt] = await database
      .insert(schema.fundSnapshots)
      .values({
        fundId,
        type: 'CURRENT_FORECAST_V2',
        payload: result,
        calcVersion: 'cf-v2/1.0.0',
        correlationId: `00000000-0000-4000-8000-${String(fundId).padStart(12, '0')}`,
        snapshotTime: new Date('2026-08-31T23:59:00.000Z'),
      })
      .returning({ id: schema.fundSnapshots.id });
    return { fundSnapshotId: receipt.id, result };
  });
  forecast.runCurrentForecastV2.mockImplementation(async () => {
    entered.resolve(undefined);
    await release.promise;
    return result;
  });
  return { fundId, result, entered, release };
}

describe('manual recompute HTTP default database ownership', () => {
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('Owned local PostgreSQL required');
    admin = new Pool({ connectionString: url.toString(), max: 1 });
    databaseName = `cf_manual_http_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    await runMigrationsWithConnectionString(url.toString());
    observer = new Pool({ connectionString: url.toString(), max: 3 });
    await observer.query(`INSERT INTO users (id, username, password) VALUES
      (7, 'recompute-http', 'unused') ON CONFLICT DO NOTHING`);
    await admin.query(`CREATE ROLE "${databaseName}" LOGIN`);
    await observer.query(`GRANT USAGE ON SCHEMA public TO "${databaseName}";
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${databaseName}";
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${databaseName}"`);
    for (const table of [
      'fund_calculation_modes',
      'current_forecast_recompute_commands',
      'fund_snapshots',
      'substrate_shadow_reconciliations',
    ]) {
      await observer.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY http_recompute_allow ON ${table} USING (true) WITH CHECK (true);
        CREATE POLICY http_recompute_context ON ${table} AS RESTRICTIVE
          USING (fund_id::text = current_setting('app.current_fund', true)
            AND current_setting('app.current_user', true) = '7'
            AND current_setting('app.current_org', true) = 'recompute-org')
          WITH CHECK (fund_id::text = current_setting('app.current_fund', true)
            AND current_setting('app.current_user', true) = '7'
            AND current_setting('app.current_org', true) = 'recompute-org')`);
    }
    url.username = databaseName;
    Object.assign(process.env, {
      DATABASE_URL: url.toString(),
      _EXPLICIT_DATABASE_URL: '1',
      USE_REAL_DB_IN_VITEST: '1',
      NODE_ENV: 'test',
      _EXPLICIT_NODE_ENV: 'test',
      REDIS_URL: 'memory://',
      _EXPLICIT_REDIS_URL: '1',
      ENABLE_QUEUES: '0',
      _EXPLICIT_ENABLE_QUEUES: '1',
      RATE_LIMIT_MAX: '1000',
      JWT_SECRET: 'recompute-http-local-test-secret-at-least-32-bytes',
      _EXPLICIT_JWT_SECRET: '1',
    });
    delete process.env.NEON_DATABASE_URL;
    dbModule = await import('../../server/db');
    contextModule = await import('../../server/db/request-context');
    jwtModule = await import('../../server/lib/auth/jwt');
    app = (await import('../../server/app')).makeApp();
  }, 180_000);

  afterAll(async () => {
    if (server?.listening)
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve()))
      );
    await providers?.teardown();
    await dbModule?.closeDatabasePool();
    if (observer && admin && databaseName.startsWith('cf_manual_http_'))
      await manageIsolatedDatabasePool(observer).dropDatabase(admin, databaseName);
    if (databaseName) await admin.query(`DROP ROLE IF EXISTS "${databaseName}"`);
    await admin?.end();
    for (const key of Object.keys(process.env))
      if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('commits a visible pending claim and returns typed in-flight through the real boundary', async () => {
    const f = await fixture();
    const execution = post(f.fundId, 'http-visible-pending').then((response) => response);
    try {
      await bounded(f.entered.promise);
      expect(
        (
          await observer.query(
            'SELECT status FROM current_forecast_recompute_commands WHERE fund_id = $1',
            [f.fundId]
          )
        ).rows
      ).toEqual([{ status: 'pending' }]);
      const duplicate = await bounded(
        post(f.fundId, 'http-visible-pending').then((response) => response)
      );
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error).toBe('RECOMPUTE_IN_FLIGHT');
      const transactions = await observer.query(
        `SELECT state, count(*)::integer AS count FROM pg_stat_activity
        WHERE usename = $1 AND xact_start IS NOT NULL GROUP BY state`,
        [databaseName]
      );
      expect(transactions.rows).toEqual([{ state: 'idle in transaction', count: 1 }]);
    } finally {
      f.release.resolve(undefined);
      expect((await bounded(execution)).status).toBe(201);
    }
    const replay = await post(f.fundId, 'http-visible-pending');
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ status: 'completed', replayed: true });
    expect(await rows(f.fundId)).toMatchObject({ receipts: 1, reconciliations: 1 });
    await noOwnedTransactions();
  });

  it('rolls back the receipt at the real 30-second execution deadline and rejects late explicit writes', async () => {
    const f = await fixture();
    const late = deferred<unknown>();
    forecast.runCurrentForecastV2.mockImplementationOnce(async ({ database }) => {
      const settings =
        await database.execute(sql`SELECT current_setting('statement_timeout') AS statement,
        current_setting('lock_timeout') AS lock, current_setting('idle_in_transaction_session_timeout') AS idle,
        current_setting('timezone') AS timezone`);
      expect(settings.rows[0]).toEqual({
        statement: '10s',
        lock: '2s',
        idle: '0',
        timezone: 'UTC',
      });
      f.entered.resolve(undefined);
      await f.release.promise;
      try {
        await database.execute(sql`INSERT INTO fund_snapshots (fund_id, type, payload, calc_version, correlation_id, snapshot_time)
        VALUES (${f.fundId}, 'CURRENT_FORECAST_V2', '{}'::jsonb, 'late', '00000000-0000-4000-8000-999999999999', clock_timestamp())`);
      } catch (error) {
        late.resolve(error);
        throw error;
      }
      late.resolve(null);
      return f.result;
    });
    const startedAt = performance.now();
    const execution = post(f.fundId, 'http-real-deadline').then((response) => response);
    try {
      await bounded(f.entered.promise);
      const response = await bounded(execution, 38_000);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'failed',
        failureCode: 'execution_timeout',
        replayed: false,
      });
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(30_000);
      expect(performance.now() - startedAt).toBeLessThan(36_000);
      await noOwnedTransactions();
      expect(await rows(f.fundId)).toEqual({
        commands: [{ status: 'failed', failure_code: 'execution_timeout' }],
        receipts: 0,
        reconciliations: 0,
      });
    } finally {
      f.release.resolve(undefined);
      await bounded(execution, 38_000);
    }
    expect(await bounded(late.promise)).toBeInstanceOf(Error);
    expect((await post(f.fundId, 'http-real-deadline')).body).toEqual({
      status: 'failed',
      failureCode: 'execution_timeout',
      replayed: true,
    });
    expect(await rows(f.fundId)).toMatchObject({ receipts: 0, reconciliations: 0 });
  }, 45_000);

  it('recovers stale pending and rolls back the late executor after its pending-only CAS loses', async () => {
    const f = await fixture();
    const execution = post(f.fundId, 'http-stale').then((response) => response);
    try {
      await bounded(f.entered.promise);
      await observer.query(
        `UPDATE current_forecast_recompute_commands SET started_at = clock_timestamp() - interval '91 seconds' WHERE fund_id = $1`,
        [f.fundId]
      );
      expect((await post(f.fundId, 'http-stale')).body).toEqual({
        status: 'failed',
        failureCode: 'stale_pending',
        replayed: true,
      });
    } finally {
      f.release.resolve(undefined);
    }
    expect((await bounded(execution)).body).toEqual({
      status: 'failed',
      failureCode: 'stale_pending',
      replayed: false,
    });
    expect(await rows(f.fundId)).toEqual({
      commands: [{ status: 'failed', failure_code: 'stale_pending' }],
      receipts: 0,
      reconciliations: 0,
    });
    await noOwnedTransactions();
  });

  it('denies authentication, fund mismatch and role before command reads; refuses changed request hashes', async () => {
    const f = await fixture();
    const path = `/api/funds/${f.fundId}/current-forecast/recompute`;
    expect((await request(app).post(path).set('Idempotency-Key', 'denied').send({})).status).toBe(
      401
    );
    expect(
      (
        await request(app)
          .post(path)
          .set('Authorization', `Bearer ${token(f.fundId, 'lp')}`)
          .set('Idempotency-Key', 'denied')
          .send({})
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(path)
          .set('Authorization', `Bearer ${token(f.fundId + 1, 'partner')}`)
          .set('Idempotency-Key', 'denied')
          .send({})
      ).status
    ).toBe(403);
    expect(await rows(f.fundId)).toEqual({ commands: [], receipts: 0, reconciliations: 0 });
    const service = await import('../../server/services/current-forecast-shadow-trigger');
    await expect(
      service.runManualCurrentForecastRecompute({
        fundId: f.fundId,
        actorId: 7,
        idempotencyKey: 'denied',
      })
    ).rejects.toThrow('Verified');
    await expect(
      service.findManualCurrentForecastRecomputeCommandId({
        fundId: f.fundId,
        idempotencyKey: 'denied',
        context: context(f.fundId + 1),
      })
    ).rejects.toThrow('Verified');
    f.release.resolve(undefined);
    expect((await post(f.fundId, 'hash-mismatch')).status).toBe(201);
    // Recompute's existing command identity is route + fund; body fields are ignored.
    expect(
      (await post(f.fundId, 'hash-mismatch').send({ ignored: 'changed body' })).body.replayed
    ).toBe(true);
    const deniedReplay = await request(app)
      .post(path)
      .set('Authorization', `Bearer ${token(f.fundId + 1, 'partner')}`)
      .set('Idempotency-Key', 'hash-mismatch')
      .send({});
    expect(deniedReplay.status).toBe(403);
    expect(deniedReplay.body).not.toHaveProperty('shadowReconciliationId');
    expect(deniedReplay.body).not.toHaveProperty('replayed');
    await observer.query(
      `UPDATE current_forecast_recompute_commands SET request_hash = $2 WHERE fund_id = $1`,
      [f.fundId, '9'.repeat(64)]
    );
    expect((await post(f.fundId, 'hash-mismatch')).body.error).toBe('IDEMPOTENCY_KEY_REUSE');
    expect(
      await service.findManualCurrentForecastRecomputeCommandId({
        fundId: f.fundId,
        idempotencyKey: 'hash-mismatch',
        context: context(f.fundId),
      })
    ).toBeTypeOf('number');
    expect(await rows(f.fundId)).toMatchObject({ receipts: 1, reconciliations: 1 });
  });

  it('retains completed-scope denial and bounds exhausted claim acquisition without mutation', async () => {
    const f = await fixture();
    let completed!: import('../../server/db/request-context').RequestDatabaseScope;
    await dbModule.runWithDatabaseContext(context(f.fundId), async () => {
      completed = contextModule.getRequestDatabaseScope()!;
    });
    await contextModule.requestDatabaseStorage.run(completed, async () => {
      await expect(
        dbModule.runWithDatabaseContext(context(f.fundId), async () => undefined)
      ).rejects.toThrow('completed');
      expect(() => dbModule.db.select()).toThrow('completed');
      const service = await import('../../server/services/current-forecast-shadow-trigger');
      await expect(
        service.findManualCurrentForecastRecomputeCommandId({
          fundId: f.fundId,
          idempotencyKey: 'completed',
          context: context(f.fundId),
        })
      ).rejects.toThrow('completed');
    });
    const pool = dbModule.pool as Pool;
    const holders = await Promise.all(
      Array.from({ length: pool.options.max! }, () => pool.connect())
    );
    const startedAt = performance.now();
    try {
      expect(
        (
          await bounded(
            post(f.fundId, 'exhausted').then((response) => response),
            5_000
          )
        ).status
      ).toBe(401);
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(1_900);
      expect(performance.now() - startedAt).toBeLessThan(4_000);
      expect(pool.waitingCount).toBe(0);
      const acquisitionStartedAt = performance.now();
      await expect(
        dbModule.runWithDatabaseContext(context(f.fundId), async () => undefined)
      ).rejects.toThrow(/timeout/i);
      expect(performance.now() - acquisitionStartedAt).toBeLessThan(4_000);
    } finally {
      holders.forEach((client) => client.release());
    }
    expect(await rows(f.fundId)).toEqual({ commands: [], receipts: 0, reconciliations: 0 });
    await noOwnedTransactions();
  });

  it('bounds unavailable database handshakes and releases their connections', async () => {
    const f = await fixture();
    const sockets = new Set<import('node:net').Socket>();
    const unavailable = createTcpServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => unavailable.listen(0, '127.0.0.1', resolve));
    const pool = dbModule.pool as Pool;
    const oldConnectionString = pool.options.connectionString;
    const idle = await Promise.all(Array.from({ length: pool.totalCount }, () => pool.connect()));
    idle.forEach((client) => client.release(true));
    const url = new URL(oldConnectionString!);
    url.port = String((unavailable.address() as import('node:net').AddressInfo).port);
    // This isolated test owns the pool, and every prior client was destroyed.
    Object.assign(pool.options, { connectionString: url.toString() });
    const startedAt = performance.now();
    try {
      expect(
        (
          await bounded(
            post(f.fundId, 'unavailable').then((response) => response),
            5_000
          )
        ).status
      ).toBe(401);
      expect(performance.now() - startedAt).toBeLessThan(4_000);
      expect(pool.waitingCount).toBe(0);
      const acquisitionStartedAt = performance.now();
      await expect(
        dbModule.runWithDatabaseContext(context(f.fundId), async () => undefined)
      ).rejects.toThrow(/timeout/i);
      expect(performance.now() - acquisitionStartedAt).toBeLessThan(4_000);
    } finally {
      Object.assign(pool.options, { connectionString: oldConnectionString });
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        unavailable.close((error) => (error ? reject(error) : resolve()))
      );
    }
    expect(await rows(f.fundId)).toEqual({ commands: [], receipts: 0, reconciliations: 0 });
    await noOwnedTransactions();
  });

  it('finishes an admitted command after disconnect without retaining a request transaction', async () => {
    const f = await fixture();
    const listener = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => listener.once('listening', resolve));
    const port = (listener.address() as import('node:net').AddressInfo).port;
    const disconnected = deferred<void>();
    const client = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: `/api/funds/${f.fundId}/current-forecast/recompute`,
      headers: {
        Authorization: `Bearer ${token(f.fundId)}`,
        'Idempotency-Key': 'disconnect',
        'Content-Type': 'application/json',
      },
    });
    client.on('error', () => disconnected.resolve(undefined));
    client.end('{}');
    try {
      await bounded(f.entered.promise);
      client.destroy();
      await bounded(disconnected.promise);
      f.release.resolve(undefined);
      await bounded(
        (async () => {
          while ((await rows(f.fundId)).commands[0]?.status !== 'completed')
            await new Promise((resolve) => setTimeout(resolve, 20));
        })()
      );
      await noOwnedTransactions();
      expect((await post(f.fundId, 'disconnect')).body).toMatchObject({
        status: 'completed',
        replayed: true,
      });
      expect(await rows(f.fundId)).toMatchObject({ receipts: 1, reconciliations: 1 });
    } finally {
      f.release.resolve(undefined);
      client.destroy();
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it('bounds a blocked failure finalizer and recovers its unchanged pending command after release', async () => {
    const f = await fixture();
    forecast.runCurrentForecastV2.mockImplementationOnce(async () => {
      f.entered.resolve(undefined);
      await f.release.promise;
      throw new Error('Synthetic execution failure');
    });
    const execution = post(f.fundId, 'blocked-finalizer').then((response) => response);
    const holder = await observer.connect();
    let open = false;
    try {
      await bounded(f.entered.promise);
      await holder.query('BEGIN');
      open = true;
      await holder.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [
        CURRENT_FORECAST_FUND_LOCK_CLASS,
        f.fundId,
      ]);
      const startedAt = performance.now();
      f.release.resolve(undefined);
      expect((await bounded(execution)).status).toBe(500);
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(1_900);
      expect(performance.now() - startedAt).toBeLessThan(4_000);
      expect(await rows(f.fundId)).toEqual({
        commands: [{ status: 'pending', failure_code: null }],
        receipts: 0,
        reconciliations: 0,
      });
      await noOwnedTransactions();
    } finally {
      f.release.resolve(undefined);
      if (open) await holder.query('ROLLBACK');
      holder.release();
      await bounded(execution);
    }
    await observer.query(
      `UPDATE current_forecast_recompute_commands SET started_at = clock_timestamp() - interval '91 seconds' WHERE fund_id = $1`,
      [f.fundId]
    );
    expect((await post(f.fundId, 'blocked-finalizer')).body).toEqual({
      status: 'failed',
      failureCode: 'stale_pending',
      replayed: true,
    });
  });

  it('scopes ineligible-mode terminalization and diagnostic reads to the admitted fund', async () => {
    const f = await fixture();
    await observer.query(
      `UPDATE fund_calculation_modes SET configured_mode = 'off' WHERE fund_id = $1`,
      [f.fundId]
    );
    expect((await post(f.fundId, 'ineligible')).body).toEqual({
      status: 'skipped',
      replayed: false,
    });
    expect(forecast.runCurrentForecastV2).not.toHaveBeenCalled();
    expect(await rows(f.fundId)).toEqual({
      commands: [{ status: 'skipped', failure_code: null }],
      receipts: 0,
      reconciliations: 0,
    });
    const service = await import('../../server/services/current-forecast-shadow-trigger');
    expect(
      await service.findManualCurrentForecastRecomputeCommandId({
        fundId: f.fundId,
        idempotencyKey: 'ineligible',
        context: context(f.fundId),
      })
    ).toBeTypeOf('number');
    await dbModule.runWithDatabaseContext(context(f.fundId + 1), async (database) => {
      const result = await database.execute(
        sql`SELECT id FROM current_forecast_recompute_commands WHERE fund_id = ${f.fundId}`
      );
      expect(result.rows).toEqual([]);
    });
    await noOwnedTransactions();
  });

  it('uses the same managed boundary in createServer and keeps unrelated route rollback and denials', async () => {
    const configModule = await import('../../server/config/index');
    const providersModule = await import('../../server/providers');
    const completion = await import('../../server/services/calc-run-completion-handlers');
    const variance = await import('../../server/services/variance-alert-automation');
    const retention =
      await import('../../server/services/financial-observations/artifact-retention-service');
    const checkpoint =
      await import('../../server/services/internal-analysis/analysis-checkpoint-service');
    vi.spyOn(completion, 'registerCompletionHandlers').mockImplementation(() => {});
    vi.spyOn(variance.varianceAlertAutomationService, 'start').mockImplementation(() => {});
    vi.spyOn(retention.artifactRetentionService, 'start').mockImplementation(() => {});
    vi.spyOn(checkpoint.internalAnalysisCheckpointService, 'start').mockImplementation(() => {});
    const config = configModule.loadEnv();
    providers = await providersModule.buildProviders(config);
    server = await (await import('../../server/server')).createServer(config, providers);
    const health = await import('../../server/health/state');
    health.setReady(true);
    try {
      const f = await fixture();
      const execution = post(f.fundId, 'server-visible', server).then((response) => response);
      try {
        await bounded(f.entered.promise);
        expect((await rows(f.fundId)).commands).toEqual([
          { status: 'pending', failure_code: null },
        ]);
        expect((await post(f.fundId, 'server-visible', server)).body.error).toBe(
          'RECOMPUTE_IN_FLIGHT'
        );
      } finally {
        f.release.resolve(undefined);
      }
      expect((await bounded(execution)).status).toBe(201);
      expect((await post(f.fundId, 'server-visible', server)).body.replayed).toBe(true);
      const plans = await import('../../server/services/current-plan-version-service');
      for (const surface of [app, server]) {
        const unrelated = await fixture();
        const path = `/api/funds/${unrelated.fundId}/current-plan-versions`;
        const load = vi.spyOn(plans, 'getCurrentPlanVersions').mockImplementationOnce(async () => {
          const scope = contextModule.getRequestDatabaseScope();
          expect(scope?.context.userId).toBe('7');
          expect(scope?.completed).toBe(false);
          await dbModule.db.execute(
            sql`SELECT set_config('app.current_fund', ${String(unrelated.fundId)}, true)`
          );
          await dbModule.db
            .execute(sql`INSERT INTO fund_snapshots (fund_id, type, payload, calc_version, correlation_id, snapshot_time)
            VALUES (${unrelated.fundId}, 'CURRENT_FORECAST_V2', '{}'::jsonb, 'rollback', '00000000-0000-4000-8000-888888888888', clock_timestamp())`);
          throw new Error('Deliberate unrelated route failure');
        });
        expect(
          (
            await request(surface)
              .get(path)
              .set('Authorization', `Bearer ${token(unrelated.fundId)}`)
          ).status
        ).toBe(500);
        expect(load).toHaveBeenCalledTimes(1);
        expect(await rows(unrelated.fundId)).toEqual({
          commands: [],
          receipts: 0,
          reconciliations: 0,
        });
        expect((await request(surface).get(path)).status).toBe(401);
        expect(load).toHaveBeenCalledTimes(1);
        load.mockRestore();
      }
      await noOwnedTransactions();
    } finally {
      health.setReady(false);
    }
  }, 30_000);

  it.each(['BEGIN', 'RLS', 'CALLBACK', 'COMMIT', 'ROLLBACK'])(
    'bounds the full owned operation when %s stalls after acquisition',
    async (phase) => {
      const f = await fixture();
      const pool = dbModule.pool as Pool;
      const client = await pool.connect();
      const gate = deferred<void>();
      let lateSetup = false;
      const completedQuery = { rows: [], rowCount: 0, fields: [], command: '', oid: 0 };
      const originalQuery = client.query.bind(client);
      const query = vi.spyOn(client, 'query').mockImplementation(((...args: unknown[]) => {
        const statement =
          typeof args[0] === 'string' ? args[0] : ((args[0] as { text?: string })?.text ?? '');
        const matches =
          phase === 'RLS'
            ? statement.includes("set_config('app.current_user'")
            : statement.toUpperCase() === phase;
        // A driver may settle setup after the deadline. Return successful setup
        // results even on a closed socket to prove the callback guard itself.
        if (matches) return gate.promise.then(() => completedQuery);
        if (lateSetup) return Promise.resolve(completedQuery);
        return Reflect.apply(originalQuery, client, args);
      }) as typeof client.query);
      const release = vi.spyOn(client, 'release');
      const acquisition = vi.spyOn(pool, 'connect').mockResolvedValueOnce(client);
      const startedAt = performance.now();
      const callback = vi.fn(async () => {
        if (phase === 'CALLBACK') await gate.promise;
        if (phase === 'ROLLBACK') throw new Error('Force rollback');
      });
      const operation = dbModule
        .runWithDatabaseContext(context(f.fundId), callback, { timeoutMs: 20 })
        .catch((error: unknown) => error);
      try {
        const outcome = await Promise.race([
          operation,
          new Promise<string>((resolve) =>
            setTimeout(() => resolve('still pending after 70ms'), 70)
          ),
        ]);
        expect(outcome).toBeInstanceOf(contextModule.DatabaseContextTimeoutError);
        expect(performance.now() - startedAt).toBeLessThan(70);
        expect(release).toHaveBeenCalledExactlyOnceWith(true);
      } finally {
        if (release.mock.calls.length === 0) client.release(true);
        lateSetup = true;
        gate.resolve(undefined);
        await bounded(operation);
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (phase === 'BEGIN' || phase === 'RLS') expect(callback).not.toHaveBeenCalled();
        query.mockRestore();
        release.mockRestore();
        acquisition.mockRestore();
      }
      await noOwnedTransactions();
    }
  );

  it('bounds finalizer BEGIN independently of the executor deadline', async () => {
    const f = await fixture();
    const pool = dbModule.pool as Pool;
    const clients = await Promise.all([pool.connect(), pool.connect(), pool.connect()]);
    const finalizer = clients[2]!;
    const gate = deferred<void>();
    const originalQuery = finalizer.query.bind(finalizer);
    const query = vi.spyOn(finalizer, 'query').mockImplementation(((...args: unknown[]) => {
      const statement =
        typeof args[0] === 'string' ? args[0] : ((args[0] as { text?: string })?.text ?? '');
      if (statement.toUpperCase() === 'BEGIN')
        return gate.promise.then(() => Reflect.apply(originalQuery, finalizer, args));
      return Reflect.apply(originalQuery, finalizer, args);
    }) as typeof finalizer.query);
    const released = clients.map((client) => vi.spyOn(client, 'release'));
    const acquisition = vi
      .spyOn(pool, 'connect')
      .mockResolvedValueOnce(clients[0]!)
      .mockResolvedValueOnce(clients[1]!)
      .mockResolvedValueOnce(finalizer);
    forecast.runCurrentForecastV2.mockRejectedValueOnce(new Error('Force failure finalizer'));
    const service = await import('../../server/services/current-forecast-shadow-trigger');
    const startedAt = performance.now();
    const operation = service
      .runManualCurrentForecastRecompute({
        fundId: f.fundId,
        actorId: 7,
        idempotencyKey: 'stalled-finalizer-begin',
        context: context(f.fundId),
      })
      .catch((error: unknown) => error);
    try {
      const outcome = await bounded(operation, 7_000);
      expect(outcome).toBeInstanceOf(contextModule.DatabaseContextTimeoutError);
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(5_000);
      expect(performance.now() - startedAt).toBeLessThan(6_500);
      expect(released[2]).toHaveBeenCalledExactlyOnceWith(true);
    } finally {
      for (const [index, client] of clients.entries())
        if (released[index]!.mock.calls.length === 0) client.release(true);
      gate.resolve(undefined);
      await bounded(operation);
      query.mockRestore();
      released.forEach((spy) => spy.mockRestore());
      acquisition.mockRestore();
    }
    expect(await rows(f.fundId)).toEqual({
      commands: [{ status: 'pending', failure_code: null }],
      receipts: 0,
      reconciliations: 0,
    });
    await noOwnedTransactions();
  }, 10_000);
});
