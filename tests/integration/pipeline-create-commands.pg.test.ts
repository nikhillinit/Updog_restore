import { Pool, type PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';
import { manageIsolatedDatabasePool } from '../helpers/isolated-postgres-database';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';

// F_1.17.0 PR 1b: durable create receipts for deal create, deal import confirm,
// and portfolio-company create, proven through makeApp's request transaction.

let admin: Pool;
let observer: Pool;
let databaseName = '';
let dbModule: typeof import('../../server/db');
let jwtModule: typeof import('../../server/lib/auth/jwt');
let app: ReturnType<(typeof import('../../server/app'))['makeApp']>;
let startedTestContainers = false;
const originalEnvironment = { ...process.env };
const FUND_ID = 229_171_001;
const RECEIPT_COLUMNS = ['createIdempotencyKey', 'createRequestHash'];
let writer = '';
let otherWriter = '';
let revokedWriter = '';

function token(sub: number, role: string): string {
  return jwtModule.signToken({
    sub: String(sub),
    email: `${role}-${sub}@example.com`,
    role,
    orgId: 'pr1b-org',
    fundIds: [FUND_ID],
  });
}

function deal(companyName: string) {
  return {
    fundId: FUND_ID,
    companyName,
    sector: 'SaaS',
    stage: 'Seed',
    sourceType: 'Referral',
    status: 'lead',
    priority: 'medium',
  };
}

function importRow(companyName: string, dealSize: number) {
  return { companyName, sector: 'AI / ML', stage: 'Seed', sourceType: 'Referral', dealSize };
}

function company(name: string) {
  return {
    fundId: FUND_ID,
    name,
    sector: 'SaaS',
    stage: 'Seed',
    investmentAmount: '100000.00',
    status: 'active',
  };
}

function post(path: string, key: string, body: unknown, bearer = writer) {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${bearer}`)
    .set('Idempotency-Key', key)
    .send(body as object);
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const result = await observer.query<{ n: string }>(sql, params);
  return Number(result.rows[0]?.n ?? 0);
}

const dealCount = (name: string) =>
  count('SELECT count(*) AS n FROM deal_opportunities WHERE fund_id = $1 AND company_name = $2', [
    FUND_ID,
    name,
  ]);
const receiptCount = (key: string) =>
  count('SELECT count(*) AS n FROM deal_pipeline_commands WHERE idempotency_key = $1', [key]);
const mutationReceiptCount = () =>
  count(
    `SELECT (SELECT count(*) FROM deal_pipeline_commands WHERE fund_id = $1)
          + (SELECT count(*) FROM portfolio_company_update_receipts WHERE fund_id = $1)
          + (SELECT count(*) FROM fund_workflow_commands WHERE fund_id = $1)
          + (SELECT count(*) FROM fund_scenario_calculation_commands WHERE fund_id = $1) AS n`,
    [FUND_ID]
  );
// Every durable effect a create can have in this fund.
const fundState = async () => ({
  deals: await count('SELECT count(*) AS n FROM deal_opportunities WHERE fund_id = $1', [FUND_ID]),
  activities: await count(
    `SELECT count(*) AS n FROM pipeline_activities a
       JOIN deal_opportunities d ON d.id = a.opportunity_id WHERE d.fund_id = $1`,
    [FUND_ID]
  ),
  companies: await count('SELECT count(*) AS n FROM portfoliocompanies WHERE fund_id = $1', [
    FUND_ID,
  ]),
  receipts: await mutationReceiptCount(),
});

const companyCount = (name: string) =>
  count('SELECT count(*) AS n FROM portfoliocompanies WHERE fund_id = $1 AND name = $2', [
    FUND_ID,
    name,
  ]);

// Polls until `expected` lock waiters exist, so the barrier is released while
// both requests are in flight and well inside the inherited 2 s lock_timeout.
async function waitForWaiters(where: string, expected: number): Promise<void> {
  const deadline = Date.now() + 1_500;
  while (Date.now() < deadline) {
    const waiting = await count(
      `SELECT count(*) AS n FROM pg_locks l LEFT JOIN pg_class c ON c.oid = l.relation
        WHERE l.granted = false AND (${where})`,
      []
    );
    if (waiting >= expected) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${expected} lock waiter(s): ${where}`);
}

async function withBarrier<T>(lockSql: string, run: (barrier: PoolClient) => Promise<T>) {
  const barrier = await observer.connect();
  try {
    await barrier.query('BEGIN');
    await barrier.query(lockSql);
    return await run(barrier);
  } finally {
    await barrier.query('ROLLBACK').catch(() => undefined);
    barrier.release();
  }
}

describe('durable create receipts under the request transaction', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    const url = new URL(process.env.TEST_DATABASE_URL ?? getPostgresConnectionString());
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('Owned local PostgreSQL required');
    admin = new Pool({ connectionString: url.toString(), max: 1 });
    databaseName = `pipeline_create_cmd_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    await runMigrationsWithConnectionString(url.toString());
    observer = new Pool({ connectionString: url.toString(), max: 4 });
    await observer.query(
      `INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, 'Durable create receipt fund', 10000000, '0.0200', '0.2000', 2026)`,
      [FUND_ID]
    );
    const users = await observer.query<{ id: number }>(
      `INSERT INTO users (username, password, role, is_active)
       VALUES ('pr1b-writer', 'x', 'admin', true), ('pr1b-other', 'x', 'admin', true)
       RETURNING id`
    );
    const [writerId, otherId] = users.rows.map((row) => row.id);
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
      JWT_SECRET: 'pipeline-create-commands-local-test-secret',
      _EXPLICIT_JWT_SECRET: '1',
    });
    delete process.env.NEON_DATABASE_URL;
    dbModule = await import('../../server/db');
    jwtModule = await import('../../server/lib/auth/jwt');
    app = (await import('../../server/app')).makeApp();
    writer = token(writerId!, 'admin');
    otherWriter = token(otherId!, 'admin');
    // Same subject with its write grant revoked: 'viewer' aliases to analyst (a
    // write role), so 'service', which is outside TEAM_WRITE_ROLES, is used.
    revokedWriter = token(writerId!, 'service');
  }, 180_000);

  afterAll(async () => {
    await dbModule?.closeDatabasePool();
    if (observer && admin && databaseName.startsWith('pipeline_create_cmd_'))
      await manageIsolatedDatabasePool(observer).dropDatabase(admin, databaseName);
    await admin?.end();
    if (startedTestContainers) await cleanupTestContainers();
    for (const key of Object.keys(process.env))
      if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
  }, 30_000);

  it('replays a lost deal-create acknowledgment from its receipt', async () => {
    const first = await post('/api/deals/opportunities', 'deal-lost-ack', deal('Lost Ack Co'));
    const retry = await post('/api/deals/opportunities', 'deal-lost-ack', deal('Lost Ack Co'));

    expect(first.status).toBe(201);
    expect(first.headers['idempotency-replay']).toBeUndefined();
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotency-replay']).toBe('true');
    expect(retry.body).toEqual(first.body);
    expect(await dealCount('Lost Ack Co')).toBe(1);
    expect(await receiptCount('deal-lost-ack')).toBe(1);
    expect(
      await count('SELECT count(*) AS n FROM pipeline_activities WHERE opportunity_id = $1', [
        first.body.data.id,
      ])
    ).toBe(1);
  });

  it('replays a lost import acknowledgment and stores only sanitized row failures', async () => {
    const body = {
      fundId: FUND_ID,
      mode: 'import_all',
      // 1e14 overflows deal_size numeric(15,2) inside PostgreSQL, not Zod.
      rows: [importRow('Import One', 1_000_000), importRow('Import Overflow', 1e14)],
    };
    const first = await post('/api/deals/opportunities/import', 'deal-import-ack', body);
    const retry = await post('/api/deals/opportunities/import', 'deal-import-ack', body);

    expect(first.status).toBe(200);
    expect(first.body.data.failedRows).toEqual([
      { index: 1, message: 'Insert failed', code: '22003' },
    ]);
    expect(JSON.stringify(first.body)).not.toMatch(/Failed query|params:|numeric field/i);
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotency-replay']).toBe('true');
    expect(retry.body).toEqual(first.body);
    expect(await dealCount('Import One')).toBe(1);
    expect(await dealCount('Import Overflow')).toBe(0);
    const stored = await observer.query<{ response_body: unknown }>(
      'SELECT response_body FROM deal_pipeline_commands WHERE idempotency_key = $1',
      ['deal-import-ack']
    );
    expect(stored.rows).toHaveLength(1);
    expect(JSON.stringify(stored.rows[0]!.response_body)).not.toMatch(/Failed query|params:/);
  });

  it('replays a company create as the current public row', async () => {
    const receiptsBefore = await mutationReceiptCount();
    const first = await post('/api/portfolio-companies', 'company-lost-ack', {
      ...company('Receipt Co'),
      // Client-supplied receipt fields are stripped by the create parse.
      createIdempotencyKey: 'client-chosen',
      createRequestHash: 'f'.repeat(64),
    });
    expect(first.status).toBe(201);

    await observer.query('UPDATE portfoliocompanies SET name = $1 WHERE id = $2', [
      'Receipt Co Renamed',
      first.body.id,
    ]);
    const retry = await post('/api/portfolio-companies', 'company-lost-ack', {
      ...company('Receipt Co'),
      createIdempotencyKey: 'client-chosen',
      createRequestHash: 'f'.repeat(64),
    });

    expect(retry.status).toBe(200);
    expect(retry.headers['idempotency-replay']).toBe('true');
    expect(retry.body).toMatchObject({ id: first.body.id, name: 'Receipt Co Renamed' });
    const stored = await observer.query<{ key: string; hash: string }>(
      `SELECT create_idempotency_key AS key, create_request_hash AS hash
         FROM portfoliocompanies WHERE id = $1`,
      [first.body.id]
    );
    expect(stored.rows[0]!.key).toBe('company-lost-ack');
    expect(stored.rows[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0]!.hash).not.toBe('f'.repeat(64));
    // Company create adds a business row only: mutationReceipt residue stays +0.
    expect(await mutationReceiptCount()).toBe(receiptsBefore);
  });

  it('never exposes receipt columns on company create, replay, list, detail, or dashboard', async () => {
    const created = await post('/api/portfolio-companies', 'company-public', company('Public Co'));
    const replayed = await post('/api/portfolio-companies', 'company-public', company('Public Co'));
    const auth = { Authorization: `Bearer ${writer}` };
    const list = await request(app).get(`/api/portfolio-companies?fundId=${FUND_ID}`).set(auth);
    const detail = await request(app)
      .get(`/api/portfolio-companies/${created.body.id}?fundId=${FUND_ID}`)
      .set(auth);
    const dashboard = await request(app).get(`/api/dashboard-summary/${FUND_ID}`).set(auth);

    expect([created.status, replayed.status, list.status, detail.status, dashboard.status]).toEqual(
      [201, 200, 200, 200, 200]
    );
    const listed = Array.isArray(list.body) ? list.body : list.body.companies;
    const dashboardCompanies = dashboard.body.portfolioCompanies;
    for (const row of [
      created.body,
      replayed.body,
      detail.body,
      ...listed,
      ...dashboardCompanies,
    ]) {
      for (const column of RECEIPT_COLUMNS) expect(Object.keys(row)).not.toContain(column);
    }
  });

  it('rejects a changed payload or another actor under the same key', async () => {
    await post('/api/deals/opportunities', 'deal-reuse', deal('Reuse Co'));
    const changed = await post('/api/deals/opportunities', 'deal-reuse', deal('Reuse Co Two'));
    const otherActor = await post(
      '/api/deals/opportunities',
      'deal-reuse',
      deal('Reuse Co'),
      otherWriter
    );
    await post('/api/portfolio-companies', 'company-reuse', company('Reuse Company'));
    const changedCompany = await post(
      '/api/portfolio-companies',
      'company-reuse',
      company('Reuse Company Two')
    );
    const importBody = { fundId: FUND_ID, mode: 'import_all', rows: [importRow('Reuse Imp', 1)] };
    await post('/api/deals/opportunities/import', 'import-reuse', importBody);
    const changedImport = await post('/api/deals/opportunities/import', 'import-reuse', {
      ...importBody,
      rows: [importRow('Reuse Imp Two', 1)],
    });

    for (const response of [changed, otherActor, changedCompany, changedImport]) {
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('IDEMPOTENCY_KEY_REUSE');
    }
    expect(await dealCount('Reuse Co')).toBe(1);
    expect(await dealCount('Reuse Co Two')).toBe(0);
    expect(await companyCount('Reuse Company Two')).toBe(0);
    expect(await dealCount('Reuse Imp Two')).toBe(0);
  });

  // Denied requests on every durable replay path: exact safe body, no replay
  // header, zero mutation, and the authorized retry still replays the original.
  const guardedEndpoints = [
    {
      name: 'deal create',
      path: '/api/deals/opportunities',
      body: () => deal('Guarded Deal Co'),
      secret: 'Guarded Deal Co',
    },
    {
      name: 'deal import',
      path: '/api/deals/opportunities/import',
      body: () => ({
        fundId: FUND_ID,
        mode: 'import_all',
        rows: [importRow('Guarded Import Co', 1)],
      }),
      secret: 'Guarded Import Co',
    },
    {
      name: 'company create',
      path: '/api/portfolio-companies',
      body: () => company('Guarded Company Co'),
      secret: 'Guarded Company Co',
    },
  ];

  it.each(guardedEndpoints)(
    'denies another actor and a revoked same subject on $name without leak or mutation',
    async ({ name, path, body, secret }) => {
      const key = `guarded-${name.replace(' ', '-')}`;
      const first = await post(path, key, body());
      expect([200, 201]).toContain(first.status);
      const before = await fundState();

      const otherActor = await post(path, key, body(), otherWriter);
      expect(otherActor.status).toBe(409);
      expect(otherActor.body).toEqual({
        error: 'IDEMPOTENCY_KEY_REUSE',
        message: 'Idempotency-Key was already used for a different request.',
      });
      expect(otherActor.headers['idempotency-replay']).toBeUndefined();
      expect(JSON.stringify(otherActor.body)).not.toContain(secret);
      expect(await fundState()).toEqual(before);

      const revoked = await post(path, key, body(), revokedWriter);
      expect(revoked.status).toBe(403);
      expect(revoked.body).toEqual({
        error: 'Forbidden',
        code: 'WRITE_ROLE_REQUIRED',
        message: 'A write role is required for this operation',
      });
      expect(revoked.headers['idempotency-replay']).toBeUndefined();
      expect(await fundState()).toEqual(before);

      const restored = await post(path, key, body());
      expect(restored.status).toBe(200);
      expect(restored.headers['idempotency-replay']).toBe('true');
      expect(restored.body).toEqual(first.body);
      expect(await fundState()).toEqual(before);
    }
  );

  it('rolls back a lock-timed-out create and lets the same key create once', async () => {
    const blocked = await withBarrier(
      'LOCK TABLE deal_opportunities IN ACCESS EXCLUSIVE MODE',
      () => post('/api/deals/opportunities', 'deal-rollback', deal('Rollback Co'))
    );

    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('REQUEST_IN_PROGRESS');
    expect(blocked.headers['retry-after']).toBe('2');
    expect(await receiptCount('deal-rollback')).toBe(0);
    expect(await dealCount('Rollback Co')).toBe(0);

    const retry = await post('/api/deals/opportunities', 'deal-rollback', deal('Rollback Co'));
    expect(retry.status).toBe(201);
    expect(await dealCount('Rollback Co')).toBe(1);
  });

  it('rejects a key over 128 characters before any receipt or mutation', async () => {
    const key = 'k'.repeat(129);
    const dealResponse = await post('/api/deals/opportunities', key, deal('Long Key Co'));
    const companyResponse = await post('/api/portfolio-companies', key, company('Long Key Co'));

    expect(dealResponse.status).toBe(400);
    expect(companyResponse.status).toBe(400);
    expect(await dealCount('Long Key Co')).toBe(0);
    expect(await companyCount('Long Key Co')).toBe(0);
  });

  it('serializes same-key deal creates into one mutation', async () => {
    const [a, b] = await withBarrier(
      'LOCK TABLE deal_pipeline_commands IN SHARE MODE',
      async (barrier) => {
        const inFlight = Promise.all([
          post('/api/deals/opportunities', 'deal-race', deal('Race Co')),
          post('/api/deals/opportunities', 'deal-race', deal('Race Co')),
        ]);
        // One request waits to insert its receipt; the other waits on the advisory lock.
        await waitForWaiters(
          `(c.relname = 'deal_pipeline_commands' AND l.mode = 'RowExclusiveLock') OR l.locktype = 'advisory'`,
          2
        );
        await barrier.query('COMMIT');
        return inFlight;
      }
    );

    const created = a.status === 201 ? a : b;
    const other = a.status === 201 ? b : a;
    expect(created.status).toBe(201);
    if (other.status === 200) expect(other.body).toEqual(created.body);
    else expect(other.body.code).toBe('REQUEST_IN_PROGRESS');
    const retry = await post('/api/deals/opportunities', 'deal-race', deal('Race Co'));
    expect(retry.status).toBe(200);
    expect(await dealCount('Race Co')).toBe(1);
    expect(await receiptCount('deal-race')).toBe(1);
  });

  it('serializes same-key company creates into one row', async () => {
    const [a, b] = await withBarrier(
      'LOCK TABLE portfoliocompanies IN SHARE MODE',
      async (barrier) => {
        const inFlight = Promise.all([
          post('/api/portfolio-companies', 'company-race', company('Race Company')),
          post('/api/portfolio-companies', 'company-race', company('Race Company')),
        ]);
        await waitForWaiters(`c.relname = 'portfoliocompanies' AND l.mode = 'RowExclusiveLock'`, 2);
        await barrier.query('COMMIT');
        return inFlight;
      }
    );

    const created = a.status === 201 ? a : b;
    const other = a.status === 201 ? b : a;
    expect(created.status).toBe(201);
    if (other.status === 200) expect(other.body.id).toBe(created.body.id);
    else expect(other.body.code).toBe('REQUEST_IN_PROGRESS');
    expect(await companyCount('Race Company')).toBe(1);
  });

  it('enforces receipt immutability and the company key/hash pairing in PostgreSQL', async () => {
    await expect(
      observer.query(
        `UPDATE deal_pipeline_commands SET response_body = '{}'::jsonb WHERE idempotency_key = $1`,
        ['deal-lost-ack']
      )
    ).rejects.toThrow(/immutable_row_update_forbidden/);
    await expect(
      observer.query(
        `UPDATE portfoliocompanies SET create_request_hash = NULL
          WHERE create_idempotency_key = $1`,
        ['company-lost-ack']
      )
    ).rejects.toMatchObject({ code: '23514' });
  });
});
