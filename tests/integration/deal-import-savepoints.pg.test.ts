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
    observer = new Pool({ connectionString: url.toString(), max: 2 });
    await observer.query(
      `INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, 'Import savepoint fund', 10000000, '0.0200', '0.2000', 2026)`,
      [FUND_ID]
    );
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

  it('commits the good rows and reports the failing row when one insert fails', async () => {
    const token = jwtModule.signToken({
      sub: '7',
      email: 'import@example.com',
      role: 'admin',
      orgId: 'import-org',
      fundIds: [FUND_ID],
    });

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
});
