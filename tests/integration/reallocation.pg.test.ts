import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyAllocationUpdates,
  type AllocationWriteUpdate,
} from '../../server/services/allocation-write-service';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';
import { manageIsolatedDatabasePool } from '../helpers/isolated-postgres-database';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';

const ORIGINAL_ENV = { ...process.env };
const ACTOR_ID = 7;
const ORG_ID = '00000000-0000-0000-0000-000000000071';

type App = ReturnType<(typeof import('../../server/app'))['makeApp']>;
type JwtModule = typeof import('../../server/lib/auth/jwt');

interface CompanyRow {
  id: number;
  planned_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_version: number;
  last_allocation_at: Date | null;
}

interface Fixture {
  fundId: number;
  companyIds: [number, number];
}

let admin: Pool;
let pool: Pool;
let app: App;
let jwtModule: JwtModule;
let dbModule: typeof import('../../server/db');
let databaseName = '';
let startedTestContainers = false;
let fundSequence = 770_000;

function bounded<T>(operation: Promise<T>, timeoutMs = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('reallocation test exceeded its bound')),
        timeoutMs
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function token(fundId: number): string {
  return jwtModule.signToken({
    sub: String(ACTOR_ID),
    email: 'reallocation-test@example.com',
    role: 'admin',
    orgId: ORG_ID,
    fundIds: [fundId],
  });
}

function commit(fundId: number, proposedAllocations: unknown[], reason = 'integration test') {
  return request(app)
    .post(`/api/funds/${fundId}/reallocation/commit`)
    .set('Authorization', `Bearer ${token(fundId)}`)
    .send({ proposed_allocations: proposedAllocations, reason });
}

function preview(fundId: number, proposedAllocations: unknown[]) {
  return request(app)
    .post(`/api/funds/${fundId}/reallocation/preview`)
    .set('Authorization', `Bearer ${token(fundId)}`)
    .send({ proposed_allocations: proposedAllocations });
}

function proposal(companyId: number, planned: number, expectedVersion = 1, cap?: number) {
  return {
    company_id: companyId,
    planned_reserves_cents: planned,
    ...(cap === undefined ? {} : { allocation_cap_cents: cap }),
    expected_version: expectedVersion,
  };
}

function writerUpdate(
  companyId: number,
  planned: number,
  cap: number | null,
  reason: string
): AllocationWriteUpdate {
  return {
    company_id: companyId,
    planned_reserves_cents: planned,
    allocation_cap_cents: cap,
    allocation_reason: reason,
    expected_version: 1,
  };
}

async function seedFund(
  options: {
    planned?: [number, number];
    caps?: [number | null, number | null];
  } = {}
): Promise<Fixture> {
  const fundId = fundSequence++;
  const companyIds: [number, number] = [fundId, fundId + 1];
  const planned = options.planned ?? [100, 200];
  const caps = options.caps ?? [1_000, 2_000];

  await pool.query(
    `INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
     VALUES ($1, $2, 100000000, '0.0200', '0.2000', 2026)`,
    [fundId, `Reallocation ${fundId}`]
  );
  await pool.query(
    `INSERT INTO portfoliocompanies
       (id, fund_id, name, sector, stage, investment_amount, status,
        planned_reserves_cents, allocation_cap_cents, allocation_version)
     VALUES
       ($1, $3, 'Company A', 'Technology', 'Seed', 1000000, 'active', $4, $5, 1),
       ($2, $3, 'Company B', 'Healthcare', 'Series A', 2000000, 'active', $6, $7, 1)`,
    [companyIds[0], companyIds[1], fundId, planned[0], caps[0], planned[1], caps[1]]
  );
  return { fundId, companyIds };
}

async function readRows(companyIds: number[]): Promise<CompanyRow[]> {
  const result = await pool.query<CompanyRow>(
    `SELECT id, planned_reserves_cents::int, allocation_cap_cents::int, allocation_version,
            last_allocation_at
       FROM portfoliocompanies
      WHERE id = ANY($1::int[])
      ORDER BY id`,
    [companyIds]
  );
  return result.rows;
}

async function cleanTables(): Promise<void> {
  await pool.query('DELETE FROM reallocation_audit');
  await pool.query('DELETE FROM fund_events');
  await pool.query('DELETE FROM portfoliocompanies');
  await pool.query('DELETE FROM funds');
}

async function dropAuditFailure(): Promise<void> {
  await pool.query('DROP TRIGGER IF EXISTS reallocation_audit_test_failure ON reallocation_audit');
  await pool.query('DROP FUNCTION IF EXISTS reallocation_audit_test_failure()');
}

async function installAuditFailure(companyId: number): Promise<void> {
  await pool.query(`
    CREATE FUNCTION reallocation_audit_test_failure() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.changes_json->>'company_id' = '${companyId}' THEN
        RAISE EXCEPTION 'forced reallocation audit failure';
      END IF;
      RETURN NEW;
    END;
    $$`);
  await pool.query(`
    CREATE TRIGGER reallocation_audit_test_failure
    BEFORE INSERT ON reallocation_audit
    FOR EACH ROW EXECUTE FUNCTION reallocation_audit_test_failure()`);
}

async function waitForBlockedReallocation(): Promise<void> {
  await bounded(
    (async () => {
      while (true) {
        const result = await pool.query(
          `SELECT pid
             FROM pg_stat_activity
            WHERE datname = current_database()
              AND state = 'active'
              AND wait_event_type = 'Lock'
              AND query ILIKE '%portfoliocompanies%'
              AND query NOT ILIKE '%pg_stat_activity%'`
        );
        if (result.rowCount) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    })()
  );
}

async function runWriter(
  fundId: number,
  updates: AllocationWriteUpdate[],
  client?: PoolClient
): Promise<{ ok: true; result: unknown } | { ok: false; error: unknown }> {
  const ownedClient = client ?? (await pool.connect());
  try {
    await ownedClient.query('BEGIN');
    const result = await applyAllocationUpdates(ownedClient, {
      fundId,
      updates,
      userId: ACTOR_ID,
    });
    await ownedClient.query('COMMIT');
    return { ok: true, result };
  } catch (error) {
    await ownedClient.query('ROLLBACK').catch(() => undefined);
    return { ok: false, error };
  } finally {
    if (!client) ownedClient.release();
  }
}

function versionOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : undefined;
}

describe('reallocation PostgreSQL reliability contract', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }

    const baseUrl = new URL(process.env.TEST_DATABASE_URL ?? getPostgresConnectionString());
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(baseUrl.hostname)) {
      throw new Error('Owned local PostgreSQL required');
    }

    admin = new Pool({ connectionString: baseUrl.toString(), max: 1 });
    databaseName = `reallocation_pg_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    baseUrl.pathname = `/${databaseName}`;
    await runMigrationsWithConnectionString(baseUrl.toString());
    pool = new Pool({ connectionString: baseUrl.toString(), max: 12 });
    await pool.query(
      `INSERT INTO users (id, username, password)
       VALUES ($1, $2, 'unused')
       ON CONFLICT (id) DO NOTHING`,
      [ACTOR_ID, `reallocation-${randomUUID()}`]
    );

    Object.assign(process.env, {
      DATABASE_URL: baseUrl.toString(),
      _EXPLICIT_DATABASE_URL: '1',
      USE_REAL_DB_IN_VITEST: '1',
      NODE_ENV: 'test',
      _EXPLICIT_NODE_ENV: 'test',
      REDIS_URL: 'memory://',
      _EXPLICIT_REDIS_URL: '1',
      ENABLE_QUEUES: '0',
      _EXPLICIT_ENABLE_QUEUES: '1',
      RATE_LIMIT_MAX: '1000',
      JWT_SECRET: 'reallocation-pg-local-test-secret-at-least-32-bytes',
      _EXPLICIT_JWT_SECRET: '1',
    });
    delete process.env.NEON_DATABASE_URL;

    dbModule = await import('../../server/db');
    jwtModule = await import('../../server/lib/auth/jwt');
    app = (await import('../../server/app')).makeApp();
  }, 180_000);

  beforeEach(async () => {
    await dropAuditFailure();
    await cleanTables();
  });

  afterEach(async () => {
    await dropAuditFailure();
  });

  afterAll(async () => {
    await dbModule?.closeDatabasePool();
    if (pool && admin && databaseName.startsWith('reallocation_pg_')) {
      await manageIsolatedDatabasePool(pool).dropDatabase(admin, databaseName);
    }
    await admin?.end();
    if (startedTestContainers) await cleanupTestContainers();
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  }, 30_000);

  it('serves real preview success and stale per-row preview conflicts', async () => {
    const fixture = await seedFund();
    const body = [proposal(fixture.companyIds[1], 250), proposal(fixture.companyIds[0], 150)];

    const success = await preview(fixture.fundId, body);
    expect(success.status).toBe(200);
    expect(success.body).toMatchObject({
      validation: { is_valid: true },
      totals: { total_allocated_before: 300, total_allocated_after: 400, delta_cents: 100 },
    });
    expect(success.body.deltas.map((delta: { from_cents: unknown }) => delta.from_cents)).toEqual([
      100, 200,
    ]);

    await pool.query('UPDATE portfoliocompanies SET allocation_version = 2 WHERE id = $1', [
      fixture.companyIds[0],
    ]);
    const stale = await preview(fixture.fundId, body);
    expect(stale.status).toBe(409);
    expect(stale.body.details.current_versions).toEqual([
      { company_id: fixture.companyIds[0], current_version: 2 },
    ]);
  });

  it('updates only proposed rows and preserves untouched mixed versions', async () => {
    const fixture = await seedFund();
    const before = await readRows(fixture.companyIds);
    const response = await commit(fixture.fundId, [proposal(fixture.companyIds[0], 175, 1, 900)]);

    expect(response.status).toBe(200);
    const after = await readRows(fixture.companyIds);
    expect(after[0]).toMatchObject({
      planned_reserves_cents: 175,
      allocation_cap_cents: 900,
      allocation_version: 2,
    });
    expect(after[0]?.last_allocation_at).toBeInstanceOf(Date);
    expect(after[1]).toEqual(before[1]);
  });

  it('rejects stale rows before updates and audits, with sorted current versions', async () => {
    const fixture = await seedFund();
    const before = await readRows(fixture.companyIds);
    const response = await commit(fixture.fundId, [
      proposal(fixture.companyIds[1], 250, 2),
      proposal(fixture.companyIds[0], 150, 2),
    ]);

    expect(response.status).toBe(409);
    expect(response.body.details.current_versions).toEqual([
      { company_id: fixture.companyIds[0], current_version: 1 },
      { company_id: fixture.companyIds[1], current_version: 1 },
    ]);
    expect(await readRows(fixture.companyIds)).toEqual(before);
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM reallocation_audit')).rows[0]
    ).toEqual({ count: 0 });
  });

  it('rolls back all row updates when a later audit insert fails', async () => {
    const fixture = await seedFund();
    const before = await readRows(fixture.companyIds);
    await installAuditFailure(fixture.companyIds[1]);

    const response = await commit(fixture.fundId, [
      proposal(fixture.companyIds[1], 250),
      proposal(fixture.companyIds[0], 150),
    ]);

    expect(response.status).toBe(500);
    expect(await readRows(fixture.companyIds)).toEqual(before);
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM reallocation_audit')).rows[0]
    ).toEqual({ count: 0 });
  });

  it('locks reversed route requests in ID order and returns stale B after a deterministic blocker', async () => {
    const fixture = await seedFund();
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM portfoliocompanies WHERE id = $1 FOR UPDATE', [
        fixture.companyIds[0],
      ]);
      const pending = commit(fixture.fundId, [
        proposal(fixture.companyIds[1], 250),
        proposal(fixture.companyIds[0], 150),
      ]).then((response) => response);
      await waitForBlockedReallocation();
      await holder.query('SELECT id FROM portfoliocompanies WHERE id = $1 FOR UPDATE', [
        fixture.companyIds[1],
      ]);
      await holder.query(
        'UPDATE portfoliocompanies SET allocation_version = allocation_version + 1 WHERE id = $1',
        [fixture.companyIds[1]]
      );
      await holder.query('COMMIT');
      const response = await bounded(pending);
      expect(response.status).toBe(409);
      expect(response.body.details.current_versions).toEqual([
        { company_id: fixture.companyIds[1], current_version: 2 },
      ]);
      expect(JSON.stringify(response.body)).not.toContain('40P01');
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      holder.release();
    }
  });

  it('produces one winner for concurrent reversed route commits without deadlock', async () => {
    const fixture = await seedFund();
    const [first, second] = await Promise.all([
      commit(fixture.fundId, [
        proposal(fixture.companyIds[0], 150),
        proposal(fixture.companyIds[1], 250),
      ]),
      commit(fixture.fundId, [
        proposal(fixture.companyIds[1], 350),
        proposal(fixture.companyIds[0], 450),
      ]),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(JSON.stringify(first.body)).not.toContain('40P01');
    expect(JSON.stringify(second.body)).not.toContain('40P01');
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM reallocation_audit')).rows[0]
    ).toEqual({ count: 2 });
  });

  it('serializes route and shared-writer overlap, and preserves shared-writer audit order', async () => {
    const fixture = await seedFund();
    const updates = [
      writerUpdate(fixture.companyIds[0], 350, 1_500, 'writer'),
      writerUpdate(fixture.companyIds[1], 450, 2_500, 'writer'),
    ];
    const routeBody = updates
      .slice()
      .reverse()
      .map((update) =>
        proposal(
          update.company_id,
          update.planned_reserves_cents,
          1,
          update.allocation_cap_cents ?? undefined
        )
      );
    const [writer, route] = await Promise.all([
      runWriter(fixture.fundId, updates),
      commit(fixture.fundId, routeBody),
    ]);

    if (writer.ok) {
      expect(route.status).toBe(409);
    } else {
      expect(route.status).toBe(200);
      expect(versionOf(writer.error)).toBe(409);
      expect(JSON.stringify(writer.error)).not.toContain('40P01');
    }
    expect(JSON.stringify(route.body)).not.toContain('40P01');

    await cleanTables();
    const secondFixture = await seedFund();
    const forward = [
      writerUpdate(secondFixture.companyIds[0], 350, 1_500, 'first'),
      writerUpdate(secondFixture.companyIds[1], 450, 2_500, 'first'),
    ];
    const reversed = [
      writerUpdate(secondFixture.companyIds[1], 550, 2_500, 'second'),
      writerUpdate(secondFixture.companyIds[0], 650, 1_500, 'second'),
    ];
    const [firstWriter, secondWriter] = await Promise.all([
      runWriter(secondFixture.fundId, forward),
      runWriter(secondFixture.fundId, reversed),
    ]);
    expect([firstWriter.ok, secondWriter.ok].sort()).toEqual([false, true]);
    const rejectedWriter = firstWriter.ok ? secondWriter : firstWriter;
    expect(versionOf(rejectedWriter.error)).toBe(409);
    expect(JSON.stringify(rejectedWriter.error)).not.toContain('40P01');

    await cleanTables();
    const thirdFixture = await seedFund();
    const auditOrder = [
      writerUpdate(thirdFixture.companyIds[1], 350, 2_500, 'audit order'),
      writerUpdate(thirdFixture.companyIds[0], 450, 1_500, 'audit order'),
    ];
    const thirdResult = await runWriter(thirdFixture.fundId, auditOrder);
    expect(thirdResult.ok).toBe(true);
    const payload = (
      await pool.query<{ payload: { updates: Array<{ company_id: number }> } }>(
        `SELECT payload FROM fund_events WHERE fund_id = $1 ORDER BY id DESC LIMIT 1`,
        [thirdFixture.fundId]
      )
    ).rows[0]?.payload;
    expect(payload?.updates.map((update) => update.company_id)).toEqual([
      thirdFixture.companyIds[1],
      thirdFixture.companyIds[0],
    ]);
  });

  it('targets caps by company ID, preserves omitted caps, and returns exact audit rows', async () => {
    const fixture = await seedFund({ planned: [100, 222], caps: [900_000, 222] });
    await pool.query('UPDATE portfoliocompanies SET planned_reserves_cents = $1 WHERE id = $2', [
      fixture.companyIds[1],
      fixture.companyIds[0],
    ]);
    const response = await commit(fixture.fundId, [
      {
        company_id: fixture.companyIds[1],
        planned_reserves_cents: 200,
        expected_version: 1,
      },
      {
        company_id: fixture.companyIds[0],
        planned_reserves_cents: fixture.companyIds[1],
        allocation_cap_cents: 800_000,
        expected_version: 1,
      },
    ]);

    expect(response.status).toBe(200);
    expect(response.body.new_versions).toEqual([
      { company_id: fixture.companyIds[0], new_version: 2 },
      { company_id: fixture.companyIds[1], new_version: 2 },
    ]);
    expect(response.body.audit_ids).toHaveLength(2);
    const rows = await readRows(fixture.companyIds);
    expect(rows).toMatchObject([
      {
        id: fixture.companyIds[0],
        planned_reserves_cents: fixture.companyIds[1],
        allocation_cap_cents: 800_000,
        allocation_version: 2,
      },
      {
        id: fixture.companyIds[1],
        planned_reserves_cents: 200,
        allocation_cap_cents: 222,
        allocation_version: 2,
      },
    ]);

    const audits = (
      await pool.query<{
        id: string;
        baseline_version: number;
        new_version: number;
        changes_json: {
          company_id: number;
          from_cents: number;
          to_cents: number;
          delta_cents: number;
        };
      }>(
        `SELECT id, baseline_version, new_version, changes_json
           FROM reallocation_audit WHERE fund_id = $1 ORDER BY created_at, id`,
        [fixture.fundId]
      )
    ).rows;
    expect(audits).toHaveLength(2);
    expect(
      new Set(response.body.audit_ids.map((item: { audit_id: string }) => item.audit_id))
    ).toEqual(new Set(audits.map((audit) => audit.id)));
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baseline_version: 1,
          new_version: 2,
          changes_json: expect.objectContaining({
            company_id: fixture.companyIds[0],
            from_cents: fixture.companyIds[1],
            to_cents: fixture.companyIds[1],
            delta_cents: 0,
          }),
        }),
        expect.objectContaining({
          baseline_version: 1,
          new_version: 2,
          changes_json: expect.objectContaining({
            company_id: fixture.companyIds[1],
            from_cents: 222,
            to_cents: 200,
            delta_cents: -22,
          }),
        }),
      ])
    );
  });
});
