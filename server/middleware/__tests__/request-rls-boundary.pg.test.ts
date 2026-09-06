/**
 * @group integration
 *
 * Real PostgreSQL verification for request-scoped RLS transactions.
 * Requires an explicit local RLS_TEST_ADMIN_DATABASE_URL and USE_REAL_DB_IN_VITEST=1.
 */

import http, { type Server } from 'node:http';
import express, { type NextFunction, type RequestHandler, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { Pool, type QueryResult } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { RLSRequest } from '../with-rls-transaction';

vi.unmock('../../db');
vi.unmock('../../db/pg-circuit');
vi.unmock('../with-rls-transaction');
vi.unmock('../../services/lp-audit-logger');

const startupTimeoutMs = 30_000;
const rawAdminDatabaseUrl = process.env['RLS_TEST_ADMIN_DATABASE_URL'];
const useRealDatabase = process.env['USE_REAL_DB_IN_VITEST'] === '1';

function isLocalPostgresUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
      ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

const adminDatabaseUrl =
  useRealDatabase && isLocalPostgresUrl(rawAdminDatabaseUrl) ? rawAdminDatabaseUrl : undefined;
const skipRealDatabase = adminDatabaseUrl === undefined;

const originalEnvironment = {
  DATABASE_URL: process.env['DATABASE_URL'],
  NEON_DATABASE_URL: process.env['NEON_DATABASE_URL'],
  USE_REAL_DB_IN_VITEST: process.env['USE_REAL_DB_IN_VITEST'],
  ALLOW_MEMORY_STORAGE: process.env['ALLOW_MEMORY_STORAGE'],
  _EXPLICIT_DATABASE_URL: process.env['_EXPLICIT_DATABASE_URL'],
  _EXPLICIT_ALLOW_MEMORY_STORAGE: process.env['_EXPLICIT_ALLOW_MEMORY_STORAGE'],
  CB_DB_ENABLED: process.env['CB_DB_ENABLED'],
};

type DatabaseModule = typeof import('../../db');
type PgCircuitModule = typeof import('../../db/pg-circuit');
type MiddlewareModule = typeof import('../with-rls-transaction');
type AuditLoggerModule = typeof import('../../services/lp-audit-logger');
type DatabaseResult = QueryResult<Record<string, unknown>> | { rows: unknown[] };

let adminPool: Pool;
let databaseModule: DatabaseModule;
let pgCircuitModule: PgCircuitModule;
let middlewareModule: MiddlewareModule;
let auditLoggerModule: AuditLoggerModule;
let app: express.Express;
let server: Server;
let baseUrl = '';

const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
const schemaName = `rls_req_${suffix}`;
const roleName = `rls_role_${suffix}`;
const applicationName = `rls_boundary_${suffix}`;
const tenantA = 'org-a';
const tenantB = 'org-b';

function restoreEnvironment(): void {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function applicationDatabaseUrl(): string {
  const parsed = new URL(adminDatabaseUrl!);
  parsed.username = roleName;
  parsed.password = '';
  parsed.searchParams.set('application_name', applicationName);
  return parsed.toString();
}

function rowsOf<T>(result: DatabaseResult): T[] {
  return result.rows as T[];
}

function contextMiddleware(req: RLSRequest, res: Response, next: NextFunction): void {
  const orgId =
    req.params['tenant'] === 'a' ? tenantA : req.params['tenant'] === 'b' ? tenantB : '';
  if (!orgId) {
    res.status(404).json({ error: 'unknown_test_tenant' });
    return;
  }

  req.context = {
    userId: `user-${req.params['tenant']}`,
    email: `user-${req.params['tenant']}@example.test`,
    orgId,
    role: 'admin',
    fundId: `fund-${req.params['tenant']}`,
  };
  next();
}

function asyncRoute(
  handler: (req: RLSRequest, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    void handler(req as RLSRequest, res, next).catch(next);
  };
}

async function setupFixture(): Promise<void> {
  await adminPool.query(`CREATE ROLE "${roleName}" LOGIN`);
  await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
  await adminPool.query(`ALTER ROLE "${roleName}" SET search_path TO "${schemaName}", public`);
  await adminPool.query(`GRANT USAGE ON SCHEMA "${schemaName}" TO "${roleName}"`);
  await adminPool.query(`
    CREATE TABLE "${schemaName}".items (
      id text PRIMARY KEY,
      organization_id text NOT NULL,
      note text NOT NULL
    )
  `);
  await adminPool.query(`
    ALTER TABLE "${schemaName}".items ENABLE ROW LEVEL SECURITY
  `);
  await adminPool.query(`
    CREATE POLICY tenant_items ON "${schemaName}".items
      USING (organization_id = current_setting('app.current_org', true))
      WITH CHECK (organization_id = current_setting('app.current_org', true))
  `);
  await adminPool.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON "${schemaName}".items TO "${roleName}"
  `);

  await adminPool.query(`
    CREATE TABLE "${schemaName}".commit_fail (
      id text PRIMARY KEY,
      organization_id text NOT NULL,
      marker text NOT NULL,
      CONSTRAINT commit_fail_marker_unique UNIQUE (marker) DEFERRABLE INITIALLY DEFERRED
    )
  `);
  await adminPool.query(`
    ALTER TABLE "${schemaName}".commit_fail ENABLE ROW LEVEL SECURITY
  `);
  await adminPool.query(`
    CREATE POLICY tenant_commit_fail ON "${schemaName}".commit_fail
      USING (organization_id = current_setting('app.current_org', true))
      WITH CHECK (organization_id = current_setting('app.current_org', true))
  `);
  await adminPool.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON "${schemaName}".commit_fail TO "${roleName}"
  `);

  await adminPool.query(`
    CREATE TABLE "${schemaName}".lp_audit_log (
      id uuid DEFAULT gen_random_uuid(),
      timestamp timestamptz DEFAULT now() NOT NULL,
      lp_id integer NOT NULL,
      user_id integer,
      action varchar(50) NOT NULL CHECK (action = 'fixture_allowed'),
      resource_type varchar(50) NOT NULL,
      resource_id varchar(255),
      ip_address varchar(45),
      user_agent text,
      metadata jsonb
    )
  `);
  await adminPool.query(`
    GRANT INSERT ON "${schemaName}".lp_audit_log TO "${roleName}"
  `);

  await adminPool.query(
    `INSERT INTO "${schemaName}".items (id, organization_id, note)
     VALUES ('seed-a', $1, 'tenant A'), ('seed-b', $2, 'tenant B')`,
    [tenantA, tenantB]
  );
  await adminPool.query(
    `INSERT INTO "${schemaName}".commit_fail (id, organization_id, marker)
     VALUES ('seed-conflict', $1, 'duplicate-at-commit')`,
    [tenantA]
  );
}

function registerRoutes(): void {
  const transactionMiddleware = middlewareModule.withRLSTransaction();
  app = express();
  app.use(express.json());

  app.get(
    '/probe/:tenant',
    contextMiddleware,
    transactionMiddleware,
    asyncRoute(async (req, res) => {
      const clientResult = await req.pgClient!.query<{ pid: number; org: string }>(
        `SELECT pg_backend_pid() AS pid, current_setting('app.current_org', true) AS org`
      );
      const transactionResult = await req.tx!.execute(
        sql.raw(`SELECT pg_backend_pid() AS pid, current_setting('app.current_org', true) AS org`)
      );
      const globalResult = await databaseModule.db.execute(
        sql.raw(`SELECT pg_backend_pid() AS pid, current_setting('app.current_org', true) AS org`)
      );
      const circuitResult = await pgCircuitModule.query<{ pid: number; org: string }>(
        `SELECT pg_backend_pid() AS pid, current_setting('app.current_org', true) AS org`
      );
      await req.pgClient!.query('SELECT pg_sleep(0.05)');
      const items = await databaseModule.db.execute(
        sql.raw(`SELECT id, organization_id FROM "${schemaName}".items ORDER BY id`)
      );

      res.json({
        pids: [
          clientResult.rows[0]!.pid,
          rowsOf<{ pid: number }>(transactionResult as DatabaseResult)[0]!.pid,
          rowsOf<{ pid: number }>(globalResult as DatabaseResult)[0]!.pid,
          circuitResult.rows[0]!.pid,
        ],
        orgs: [
          clientResult.rows[0]!.org,
          rowsOf<{ org: string }>(transactionResult as DatabaseResult)[0]!.org,
          rowsOf<{ org: string }>(globalResult as DatabaseResult)[0]!.org,
          circuitResult.rows[0]!.org,
        ],
        items: rowsOf<{ id: string; organization_id: string }>(items as DatabaseResult),
      });
    })
  );

  app.post(
    '/nested/:tenant',
    contextMiddleware,
    transactionMiddleware,
    asyncRoute(async (req, res) => {
      await databaseModule.db.execute(
        sql.raw(
          `INSERT INTO "${schemaName}".items (id, organization_id, note)
           VALUES ('outer-commit', current_setting('app.current_org', true), 'outer')`
        )
      );
      await databaseModule.db.transaction(async (nestedTransaction) => {
        await nestedTransaction.execute(
          sql.raw(
            `INSERT INTO "${schemaName}".items (id, organization_id, note)
             VALUES ('nested-commit', current_setting('app.current_org', true), 'nested')`
          )
        );
      });
      res.status(201).json({ committed: true });
    })
  );

  app.post(
    '/rollback/:tenant',
    contextMiddleware,
    transactionMiddleware,
    asyncRoute(async (_req, _res, next) => {
      await databaseModule.db.execute(
        sql.raw(
          `INSERT INTO "${schemaName}".items (id, organization_id, note)
           VALUES ('outer-rollback', current_setting('app.current_org', true), 'rollback')`
        )
      );
      next(new Error('force outer rollback'));
    })
  );

  app.post(
    '/commit-failure/:tenant',
    contextMiddleware,
    transactionMiddleware,
    asyncRoute(async (_req, res) => {
      await databaseModule.db.execute(
        sql.raw(
          `INSERT INTO "${schemaName}".commit_fail (id, organization_id, marker)
           VALUES ('deferred-conflict', current_setting('app.current_org', true), 'duplicate-at-commit')`
        )
      );
      res.status(201).json({ committed: true });
    })
  );

  app.post(
    '/owned/:tenant',
    contextMiddleware,
    transactionMiddleware,
    asyncRoute(async (_req, _res, next) => {
      await databaseModule.db.execute(
        sql.raw(
          `INSERT INTO "${schemaName}".items (id, organization_id, note)
           VALUES ('outer-owned-rollback', current_setting('app.current_org', true), 'outer')`
        )
      );
      await pgCircuitModule.transaction(async (client) => {
        await client.query(
          `INSERT INTO "${schemaName}".items (id, organization_id, note)
           VALUES ('owned-commit', current_setting('app.current_org', true), 'owned')`
        );
      });
      next(new Error('rollback outer after owned transaction'));
    })
  );

  app.post(
    '/disconnect/:tenant',
    contextMiddleware,
    transactionMiddleware,
    asyncRoute(async (req, res) => {
      await req.pgClient!.query(
        `INSERT INTO "${schemaName}".items (id, organization_id, note)
         VALUES ('disconnect-rollback', current_setting('app.current_org', true), 'disconnect')`
      );
      await req.pgClient!.query('SELECT pg_sleep(0.4)');
      res.status(201).json({ committed: true });
    })
  );

  app.get(
    '/wire/:tenant',
    contextMiddleware,
    transactionMiddleware,
    asyncRoute(async (req, res) => {
      await auditLoggerModule.lpAuditLogger.logWireInstructionsAccess(
        7,
        'call-sensitive',
        '9',
        req
      );
      res.json({ accountNumber: 'masked-account', routingNumber: 'masked-routing' });
    })
  );

  app.use((_error: unknown, _req: RLSRequest, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: 'route_error' });
  });
}

describe.skipIf(skipRealDatabase)('request-scoped RLS boundary with real PostgreSQL', () => {
  beforeAll(async () => {
    adminPool = new Pool({ connectionString: adminDatabaseUrl!, max: 4 });
    await setupFixture();

    const appDatabaseUrl = applicationDatabaseUrl();
    Object.assign(process.env, {
      DATABASE_URL: appDatabaseUrl,
      _EXPLICIT_DATABASE_URL: appDatabaseUrl,
      USE_REAL_DB_IN_VITEST: '1',
      ALLOW_MEMORY_STORAGE: '0',
      _EXPLICIT_ALLOW_MEMORY_STORAGE: '0',
      CB_DB_ENABLED: 'false',
    });
    delete process.env['NEON_DATABASE_URL'];

    vi.resetModules();
    databaseModule = await import('../../db');
    pgCircuitModule = await import('../../db/pg-circuit');
    middlewareModule = await import('../with-rls-transaction');
    auditLoggerModule = await import('../../services/lp-audit-logger');

    registerRoutes();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server failed to bind');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, startupTimeoutMs);

  afterAll(async () => {
    let cleanupError: unknown;
    const attempt = async (operation: (() => Promise<unknown>) | undefined): Promise<void> => {
      try {
        await operation?.();
      } catch (error) {
        cleanupError ??= error;
      }
    };

    await attempt(
      server
        ? () =>
            new Promise<void>((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
            })
        : undefined
    );
    await attempt(databaseModule ? () => databaseModule.closeDatabasePool() : undefined);
    await attempt(pgCircuitModule ? () => pgCircuitModule.pool.end() : undefined);
    await attempt(() => adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`));
    await attempt(() => adminPool.query(`DROP OWNED BY "${roleName}"`));
    await attempt(() => adminPool.query(`DROP ROLE IF EXISTS "${roleName}"`));
    await attempt(() => adminPool.end());
    restoreEnvironment();
    vi.resetModules();

    if (cleanupError) throw cleanupError;
  }, startupTimeoutMs);

  it('isolates concurrent tenants and binds every request database facade to one backend', async () => {
    const [responseA, responseB] = await Promise.all([
      request(app).get('/probe/a'),
      request(app).get('/probe/b'),
    ]);

    expect(responseA.status, JSON.stringify(responseA.body)).toBe(200);
    expect(responseB.status, JSON.stringify(responseB.body)).toBe(200);
    expect(new Set(responseA.body.pids)).toHaveLength(1);
    expect(new Set(responseB.body.pids)).toHaveLength(1);
    expect(responseA.body.orgs).toEqual([tenantA, tenantA, tenantA, tenantA]);
    expect(responseB.body.orgs).toEqual([tenantB, tenantB, tenantB, tenantB]);
    expect(responseA.body.items).toEqual([{ id: 'seed-a', organization_id: tenantA }]);
    expect(responseB.body.items).toEqual([{ id: 'seed-b', organization_id: tenantB }]);
  });

  it('clears tenant scope for an authenticated user without an organization', async () => {
    const scopedRows = await databaseModule.runWithDatabaseContext(
      {
        userId: 'user-a',
        email: 'user-a@example.test',
        orgId: tenantA,
        role: 'admin',
        fundId: 'fund-a',
      },
      async (database) =>
        rowsOf<{ id: string }>(
          (await database.execute(
            sql.raw(`SELECT id FROM "${schemaName}".items ORDER BY id`)
          )) as DatabaseResult
        )
    );
    expect(scopedRows).toEqual([{ id: 'seed-a' }]);

    const emptyScope = await databaseModule.runWithDatabaseContext(
      {
        userId: 'user-without-org',
        email: 'user-without-org@example.test',
        orgId: '',
        role: 'admin',
        fundId: 'fund-without-org',
      },
      async (database, client) => ({
        org: (
          await client.query<{ org: string }>(
            `SELECT current_setting('app.current_org', true) AS org`
          )
        ).rows[0]!.org,
        rows: rowsOf<{ id: string }>(
          (await database.execute(
            sql.raw(`SELECT id FROM "${schemaName}".items ORDER BY id`)
          )) as DatabaseResult
        ),
      })
    );

    expect(emptyScope).toEqual({ org: '', rows: [] });
  });

  it('leaves authenticated streaming and managed simulation routes outside the request transaction wrapper', () => {
    const boundary = middlewareModule.protectedRLSTransaction();
    const context = {
      userId: 'stream-user',
      email: 'stream-user@example.test',
      orgId: tenantA,
      role: 'admin',
      fundId: 'fund-a',
    };

    for (const [method, path] of [
      ['GET', '/backtesting/jobs/job-1/stream'],
      ['GET', '/monte-carlo/jobs/job-1/stream'],
      ['GET', '/events/fund/123'],
      ['GET', '/events/simulation/456'],
      ['GET', '/performance/realtime'],
      ['POST', '/monte-carlo/simulate'],
      ['POST', '/monte-carlo/simulate/async'],
      ['POST', '/monte-carlo/batch'],
      ['POST', '/monte-carlo/multi-environment'],
      ['GET', '/monte-carlo/funds/7/simulate'],
    ]) {
      const next = vi.fn();
      boundary({ method, path, context } as RLSRequest, {} as Response, next);
      expect(next, path).toHaveBeenCalledOnce();
    }
  });

  it.each(['payment', 'notification preferences'] as const)(
    'rolls back the %s mutation when its required audit insert fails',
    async (operation) => {
      const mutationId = operation === 'payment' ? 'payment-audit-failure' : 'prefs-audit-failure';
      await expect(
        databaseModule.runWithDatabaseContext(
          {
            userId: 'audit-user',
            email: 'audit-user@example.test',
            orgId: tenantA,
            role: 'admin',
            fundId: 'fund-a',
          },
          async (database) => {
            await database.execute(
              sql.raw(
                `INSERT INTO "${schemaName}".items (id, organization_id, note)
                 VALUES ('${mutationId}', current_setting('app.current_org', true), 'mutation')`
              )
            );
            if (operation === 'payment') {
              await auditLoggerModule.lpAuditLogger.logPaymentSubmission(
                7,
                'call-1',
                'submission-1',
                '9'
              );
            } else {
              await auditLoggerModule.lpAuditLogger.logNotificationPrefsUpdate(7, '9');
            }
          }
        )
      ).rejects.toThrow();

      const persisted = await adminPool.query(`SELECT 1 FROM "${schemaName}".items WHERE id = $1`, [
        mutationId,
      ]);
      expect(persisted.rowCount).toBe(0);
    }
  );

  it('denies wire-instruction disclosure when its required audit insert fails', async () => {
    const response = await request(app).get('/wire/a');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'route_error' });
    expect(response.body).not.toHaveProperty('accountNumber');
    expect(response.body).not.toHaveProperty('routingNumber');
  });

  it('commits nested ORM work before returning success', async () => {
    await request(app).post('/nested/a').expect(201, { committed: true });

    const persisted = await adminPool.query<{ id: string }>(
      `SELECT id FROM "${schemaName}".items
       WHERE id IN ('outer-commit', 'nested-commit') ORDER BY id`
    );
    expect(persisted.rows.map((row) => row.id)).toEqual(['nested-commit', 'outer-commit']);
  });

  it('rolls back request work when the route returns an error', async () => {
    await request(app).post('/rollback/a').expect(500, { error: 'route_error' });

    const persisted = await adminPool.query(
      `SELECT 1 FROM "${schemaName}".items WHERE id = 'outer-rollback'`
    );
    expect(persisted.rowCount).toBe(0);
  });

  it('does not expose a success response when COMMIT fails', async () => {
    const response = await request(app).post('/commit-failure/a');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      error: 'internal_error',
      code: 'TRANSACTION_FAILED',
    });

    const persisted = await adminPool.query(
      `SELECT 1 FROM "${schemaName}".commit_fail WHERE id = 'deferred-conflict'`
    );
    expect(persisted.rowCount).toBe(0);
  });

  it('commits an owned pg-circuit transaction independently of the outer rollback', async () => {
    await request(app).post('/owned/a').expect(500, { error: 'route_error' });

    const persisted = await adminPool.query<{ id: string }>(
      `SELECT id FROM "${schemaName}".items
       WHERE id IN ('outer-owned-rollback', 'owned-commit') ORDER BY id`
    );
    expect(persisted.rows.map((row) => row.id)).toEqual(['owned-commit']);
  });

  it('rolls back and releases the request client after disconnect', async () => {
    const controller = new AbortController();
    const responsePromise = fetch(`${baseUrl}/disconnect/a`, {
      method: 'POST',
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 75);
    await expect(responsePromise).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 600));

    const persisted = await adminPool.query(
      `SELECT 1 FROM "${schemaName}".items WHERE id = 'disconnect-rollback'`
    );
    expect(persisted.rowCount).toBe(0);

    const applicationPool = databaseModule.pool as Pool;
    expect(applicationPool.waitingCount).toBe(0);
    expect(applicationPool.idleCount).toBe(applicationPool.totalCount);

    const openTransactions = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM pg_stat_activity
       WHERE application_name = $1 AND state = 'idle in transaction'`,
      [applicationName]
    );
    expect(openTransactions.rows[0]!.count).toBe('0');
  });
});
