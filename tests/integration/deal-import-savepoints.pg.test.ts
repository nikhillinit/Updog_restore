import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';
import { manageIsolatedDatabasePool } from '../helpers/isolated-postgres-database';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';

// makeApp wraps every protected /api request in one transaction. Without a
// per-row savepoint, one failing import row aborts it and the final COMMIT
// silently rolls back every row the response reported as imported.

let admin: Pool;
let observer: Pool;
let databaseName = '';
let dbModule: typeof import('../../server/db');
let jwtModule: typeof import('../../server/lib/auth/jwt');
let app: ReturnType<(typeof import('../../server/app'))['makeApp']>;
let startedTestContainers = false;
const originalEnvironment = { ...process.env };
const FUND_ID = 229_097_001;
let actorId = 0;

function row(companyName: string, dealSize: number) {
  return { companyName, sector: 'AI / ML', stage: 'Seed', sourceType: 'Referral', dealSize };
}

describe('deal import savepoints under the request transaction', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    const url = new URL(process.env.TEST_DATABASE_URL ?? getPostgresConnectionString());
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('Owned local PostgreSQL required');
    admin = new Pool({ connectionString: url.toString(), max: 1 });
    databaseName = `deal_import_sp_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    await runMigrationsWithConnectionString(url.toString());
    // Lets a held table lock surface as 55P03 instead of blocking forever; set
    // before the app pool opens its first session.
    await admin.query(`ALTER DATABASE "${databaseName}" SET lock_timeout = '500ms'`);
    observer = new Pool({ connectionString: url.toString(), max: 2 });
    await observer.query(
      `INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, 'Import savepoint fund', 10000000, '0.0200', '0.2000', 2026)`,
      [FUND_ID]
    );
    // The import receipt's created_by references users(id).
    const user = await observer.query<{ id: number }>(
      `INSERT INTO users (username, password, role, is_active)
       VALUES ('import-savepoint-admin', 'x', 'admin', true) RETURNING id`
    );
    actorId = user.rows[0]!.id;
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
      JWT_SECRET: 'deal-import-savepoint-local-test-secret-32b',
      _EXPLICIT_JWT_SECRET: '1',
    });
    delete process.env.NEON_DATABASE_URL;
    dbModule = await import('../../server/db');
    jwtModule = await import('../../server/lib/auth/jwt');
    app = (await import('../../server/app')).makeApp();
  }, 180_000);

  afterAll(async () => {
    await dbModule?.closeDatabasePool();
    if (observer && admin && databaseName.startsWith('deal_import_sp_'))
      await manageIsolatedDatabasePool(observer).dropDatabase(admin, databaseName);
    await admin?.end();
    if (startedTestContainers) await cleanupTestContainers();
    for (const key of Object.keys(process.env))
      if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
  }, 30_000);

  function adminToken() {
    return jwtModule.signToken({
      sub: String(actorId),
      email: 'import@example.com',
      role: 'admin',
      orgId: 'import-org',
      fundIds: [FUND_ID],
    });
  }

  it('commits the good rows and reports the failing row when one insert fails', async () => {
    const token = adminToken();

    const response = await request(app)
      .post('/api/deals/opportunities/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'deal-import-savepoint-1')
      .send({
        fundId: FUND_ID,
        mode: 'import_all',
        // 1e14 overflows deal_size numeric(15,2) inside PostgreSQL, not Zod.
        rows: [
          row('Alpha Import', 1_000_000),
          row('Overflow Import', 1e14),
          row('Gamma Import', 2_000_000),
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ imported: 2, skipped: 0, failed: 1, total: 3 });
    expect(response.body.data.failedRows).toEqual([expect.objectContaining({ index: 1 })]);

    const persisted = await observer.query<{ company_name: string }>(
      'SELECT company_name FROM deal_opportunities WHERE fund_id = $1 ORDER BY company_name',
      [FUND_ID]
    );
    expect(persisted.rows.map((stored) => stored.company_name)).toEqual([
      'Alpha Import',
      'Gamma Import',
    ]);
  });

  it('records no receipt for a lock-timed-out import and imports on retry with the same key', async () => {
    const key = 'deal-import-lock-timeout-1';
    const body = {
      fundId: FUND_ID,
      mode: 'import_all',
      rows: [row('Delta Import', 1_000_000), row('Epsilon Import', 2_000_000)],
    };
    const send = () =>
      request(app)
        .post('/api/deals/opportunities/import')
        .set('Authorization', `Bearer ${adminToken()}`)
        .set('Idempotency-Key', key)
        .send(body);

    const blocker = await observer.connect();
    let blocked: Awaited<ReturnType<typeof send>>;
    try {
      await blocker.query('BEGIN');
      // SHARE mode conflicts with the row inserts' ROW EXCLUSIVE lock.
      await blocker.query('LOCK TABLE deal_opportunities IN SHARE MODE');
      blocked = await send();
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }

    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: 'REQUEST_IN_PROGRESS' });
    const receipts = await observer.query(
      'SELECT 1 FROM deal_pipeline_commands WHERE fund_id = $1 AND idempotency_key = $2',
      [FUND_ID, key]
    );
    expect(receipts.rowCount).toBe(0);

    const retried = await send();
    expect(retried.status).toBe(200);
    expect(retried.headers['idempotency-replay']).toBeUndefined();
    expect(retried.body.data).toMatchObject({ imported: 2, skipped: 0, failed: 0, total: 2 });
  });
});
