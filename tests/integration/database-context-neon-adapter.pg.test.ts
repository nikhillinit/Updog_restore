import { connect, type AddressInfo, type Socket } from 'node:net';
import { Pool as PgPool } from 'pg';
import { sql } from 'drizzle-orm';
import { WebSocketServer, WebSocket } from 'ws';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';

// Actual installed Neon adapter, using its documented wsProxy configuration.
// The proxy has one fixed local PostgreSQL destination; no provider is contacted.
describe.each(['remote', 'vercel'] as const)('database context Neon %s adapter', (branch) => {
  let admin: PgPool;
  let observer: PgPool;
  let proxy: WebSocketServer;
  let databaseName = '';
  let database: typeof import('../../server/db');
  let neon: typeof import('@neondatabase/serverless');
  let contextModule: typeof import('../../server/db/request-context');
  let fault: string | undefined;
  let dropped = 0;
  let startedTestContainers = false;
  const sockets = new Set<Socket>();
  const originalEnvironment = { ...process.env };
  const context = {
    userId: '7',
    email: 'adapter@example.com',
    orgId: 'adapter-org',
    fundId: '41',
    role: 'admin',
  };

  async function eventually(predicate: () => Promise<boolean> | boolean) {
    const deadline = performance.now() + 2_000;
    while (!(await predicate())) {
      if (performance.now() >= deadline) throw new Error('Neon adapter cleanup exceeded 2 seconds');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async function noLeases() {
    const pool = database.pool as InstanceType<typeof neon.Pool>;
    await eventually(() => pool.waitingCount === 0 && pool.totalCount === pool.idleCount);
    await eventually(
      async () =>
        (
          await observer.query(
            `SELECT 1 FROM pg_stat_activity
      WHERE usename = $1 AND xact_start IS NOT NULL`,
            [databaseName]
          )
        ).rowCount === 0
    );
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    const url = new URL(process.env.TEST_DATABASE_URL ?? getPostgresConnectionString());
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('Owned local PostgreSQL required');
    const port = Number(url.port || '5432');
    admin = new PgPool({
      connectionString: url.toString(),
      max: 1,
      connectionTimeoutMillis: 2_000,
    });
    databaseName = `cf_neon_${branch}_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    await admin.query(`CREATE ROLE "${databaseName}" LOGIN PASSWORD '${databaseName}'`);
    await admin.query(`ALTER ROLE "${databaseName}" SET timezone TO 'UTC'`);
    url.pathname = `/${databaseName}`;
    observer = new PgPool({
      connectionString: url.toString(),
      max: 1,
      connectionTimeoutMillis: 2_000,
    });
    await observer.query(`CREATE TABLE neon_context_probe (fund_id integer NOT NULL, value text NOT NULL);
      ALTER TABLE neon_context_probe ENABLE ROW LEVEL SECURITY;
      CREATE POLICY fund_context ON neon_context_probe
        USING (fund_id::text = current_setting('app.current_fund', true)
          AND current_setting('app.current_user', true) = '7'
          AND current_setting('app.current_org', true) = 'adapter-org')
        WITH CHECK (fund_id::text = current_setting('app.current_fund', true)
          AND current_setting('app.current_user', true) = '7'
          AND current_setting('app.current_org', true) = 'adapter-org');
      GRANT SELECT, INSERT ON neon_context_probe TO "${databaseName}"`);

    proxy = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => proxy.once('listening', resolve));
    proxy.on('connection', (ws) => {
      if (fault === 'ACQUIRE') return;
      const tcp = connect({ host: '127.0.0.1', port });
      sockets.add(tcp);
      tcp.on('close', () => sockets.delete(tcp));
      ws.on('message', (raw) => {
        const bytes = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw as ArrayBuffer);
        // Examine SQL in PostgreSQL Query/Parse messages, not parameter values.
        // Drizzle's BEGIN has trailing whitespace; Bind data can contain COMMIT.
        for (let offset = 0; offset + 5 <= bytes.length;) {
          const length = bytes.readUInt32BE(offset + 1);
          if (length < 4 || offset + 1 + length > bytes.length) break;
          const kind = String.fromCharCode(bytes[offset]!);
          const payload = bytes.subarray(offset + 5, offset + 1 + length);
          const text =
            kind === 'Q'
              ? payload.toString().split('\0')[0]
              : kind === 'P'
                ? payload.toString().split('\0')[1]
                : undefined;
          const matches =
            fault === 'RLS'
              ? text?.includes("set_config('app.current_user'")
              : text?.trim().toUpperCase() === fault;
          if (fault && matches) {
            dropped++;
            return;
          }
          offset += 1 + length;
        }
        tcp.write(bytes);
      });
      tcp.on('data', (bytes) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(bytes);
      });
      tcp.on('end', () => ws.close());
      tcp.on('error', () => ws.close());
      ws.on('close', () => tcp.destroy());
      ws.on('error', () => tcp.destroy());
    });

    Object.assign(process.env, { NODE_ENV: 'test', USE_REAL_DB_IN_VITEST: '1' });
    delete process.env.ALLOW_MEMORY_STORAGE;
    delete process.env.NEON_DATABASE_URL;
    delete process.env.VERCEL_ENV;
    if (branch === 'vercel') process.env.VERCEL = '1';
    else delete process.env.VERCEL;
    url.username = databaseName;
    url.password = databaseName;
    // An .invalid host selects the remote adapter. wsProxy replaces its transport.
    if (branch === 'remote') url.hostname = 'owned-neon-adapter.invalid';
    process.env.DATABASE_URL = url.toString();
    vi.resetModules();
    neon = await import('@neondatabase/serverless');
    neon.neonConfig.wsProxy = () => `127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    neon.neonConfig.useSecureWebSocket = false;
    neon.neonConfig.pipelineConnect = false; // Keep startup separate for proxy fault injection.
    neon.neonConfig.forceDisablePgSSL = true;
    database = await import('../../server/db');
    contextModule = await import('../../server/db/request-context');
    expect(database.pool).toBeInstanceOf(neon.Pool);
    expect((database.pool as InstanceType<typeof neon.Pool>).options.connectionTimeoutMillis).toBe(
      2_000
    );
  }, 120_000);

  beforeEach(() => {
    fault = undefined;
    dropped = 0;
  });

  afterAll(async () => {
    await database?.closeDatabasePool();
    if (proxy) {
      await eventually(() => proxy.clients.size === 0 && sockets.size === 0);
      await new Promise<void>((resolve, reject) =>
        proxy.close((error) => (error ? reject(error) : resolve()))
      );
    }
    await observer?.end();
    if (admin && databaseName) {
      await admin.query(`DROP DATABASE "${databaseName}"`);
      await admin.query(`DROP ROLE "${databaseName}"`);
    }
    await admin?.end();
    if (startedTestContainers) await cleanupTestContainers();
    for (const key of Object.keys(process.env))
      if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
    vi.resetModules();
  }, 60_000);

  it('bounds an unavailable adapter handshake at 2 seconds without a pending lease', async () => {
    fault = 'ACQUIRE';
    const callback = vi.fn(async () => undefined);
    const startedAt = performance.now();
    await expect(
      database.runWithDatabaseContext(context, callback, { timeoutMs: 50 })
    ).rejects.toThrow(/timeout/i);
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(1_900);
    expect(performance.now() - startedAt).toBeLessThan(3_500);
    expect(callback).not.toHaveBeenCalled();
    await noLeases();
    await eventually(() => proxy.clients.size === 0);
  });

  it('commits with real RLS context and rolls back denied or failed operations', async () => {
    const result = await database.runWithDatabaseContext(
      context,
      async (tx) => {
        const settings = await tx.execute(sql`SELECT current_setting('app.current_user') AS user_id,
        current_setting('app.current_org') AS org_id, current_setting('app.current_fund') AS fund_id,
        current_setting('timezone') AS timezone`);
        await tx.execute(sql`INSERT INTO neon_context_probe VALUES (41, 'committed')`);
        return settings.rows[0];
      },
      { timeoutMs: 1_000 }
    );
    expect(result).toEqual({ user_id: '7', org_id: 'adapter-org', fund_id: '41', timezone: 'UTC' });
    await expect(
      database.runWithDatabaseContext(
        context,
        async (tx) => {
          await tx.execute(sql`INSERT INTO neon_context_probe VALUES (42, 'denied')`);
        },
        { timeoutMs: 1_000 }
      )
    ).rejects.toThrow();
    await expect(
      database.runWithDatabaseContext(
        context,
        async (tx) => {
          await tx.execute(sql`INSERT INTO neon_context_probe VALUES (41, 'rolled back')`);
          throw new Error('Rollback control');
        },
        { timeoutMs: 1_000 }
      )
    ).rejects.toThrow('Rollback control');
    expect((await observer.query('SELECT * FROM neon_context_probe')).rows).toEqual([
      { fund_id: 41, value: 'committed' },
    ]);
    await noLeases();
  });

  it('bounds exhausted adapter acquisition and admits a retry after release', async () => {
    const pool = database.pool as InstanceType<typeof neon.Pool>;
    const holders = await Promise.all(
      Array.from({ length: pool.options.max! }, () => pool.connect())
    );
    const startedAt = performance.now();
    const callback = vi.fn(async () => undefined);
    try {
      await expect(
        database.runWithDatabaseContext(context, callback, { timeoutMs: 50 })
      ).rejects.toThrow(/timeout/i);
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(1_900);
      expect(performance.now() - startedAt).toBeLessThan(3_500);
      expect(pool.waitingCount).toBe(0);
      expect(callback).not.toHaveBeenCalled();
    } finally {
      holders.forEach((client) => client.release());
    }
    await expect(
      database.runWithDatabaseContext(context, async () => 'retry', { timeoutMs: 1_000 })
    ).resolves.toBe('retry');
    await noLeases();
  });

  it.each(['BEGIN', 'RLS', 'CALLBACK', 'COMMIT', 'ROLLBACK'])(
    'destroys the owned adapter connection and rolls back when %s stalls',
    async (phase) => {
      fault = phase;
      let resume!: () => void;
      const gate = new Promise<void>((resolve) => {
        resume = resolve;
      });
      let lateWrite: Promise<unknown> | undefined;
      const callback = vi.fn(
        async (tx: Parameters<Parameters<typeof database.runWithDatabaseContext>[1]>[0]) => {
          await tx.execute(sql`INSERT INTO neon_context_probe VALUES (41, ${phase})`);
          if (phase === 'CALLBACK') {
            await gate;
            lateWrite = tx
              .execute(sql`INSERT INTO neon_context_probe VALUES (41, 'late write')`)
              .catch((error: unknown) => error);
            await lateWrite;
          }
          if (phase === 'ROLLBACK') throw new Error('Force adapter rollback');
        }
      );
      const startedAt = performance.now();
      try {
        await expect(
          database.runWithDatabaseContext(context, callback, { timeoutMs: 50 })
        ).rejects.toBeInstanceOf(contextModule.DatabaseContextTimeoutError);
        expect(performance.now() - startedAt).toBeLessThan(750);
        if (phase === 'BEGIN' || phase === 'RLS') expect(callback).not.toHaveBeenCalled();
        if (phase !== 'CALLBACK') expect(dropped).toBeGreaterThan(0);
      } finally {
        fault = undefined;
        resume();
      }
      if (phase === 'CALLBACK') {
        await eventually(() => lateWrite !== undefined);
        expect(await lateWrite).toBeInstanceOf(Error);
      }
      await noLeases();
      expect((await observer.query('SELECT * FROM neon_context_probe')).rows).toEqual([
        { fund_id: 41, value: 'committed' },
      ]);
    }
  );
});
