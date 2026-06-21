import { execFileSync } from 'node:child_process';

import { sql } from 'drizzle-orm';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { applyInvestmentRoundConstraints } from '../helpers/apply-investment-round-constraints';
import { setupTestDB } from '../helpers/testcontainers';

const STARTUP_TIMEOUT_MS = 90_000;

type DbModule = typeof import('../../server/db');
type SchemaModule = typeof import('@shared/schema');

interface Runtime {
  app: express.Express;
  otherFundApp: express.Express;
  container: Awaited<ReturnType<typeof setupTestDB>>;
  database: DbModule['db'];
  closeDatabasePool: DbModule['closeDatabasePool'];
  testFundId: number;
  otherFundId: number;
  testInvestmentId: number;
}

interface RoundResponseBody {
  id: number;
  etag: string;
}

interface RoundListResponseBody {
  data: Array<{ id: number }>;
}

let runtime: Runtime | undefined;
let startedContainer: Awaited<ReturnType<typeof setupTestDB>> | undefined;
let teardownDatabase: DbModule['db'] | undefined;
let closeTeardownDatabasePool: DbModule['closeDatabasePool'] | undefined;

function runDrizzlePush(connectionString: string): void {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npxCommand, ['drizzle-kit', 'push', '--force'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
    },
    stdio: 'pipe',
  });
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

function installTestUser(fundIds: number[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.user = {
      id: 'test-user',
      sub: '1',
      fundIds,
    } as Express.User;
    next();
  };
}

function buildApp(investmentsRouter: Router, fundIds: number[]): express.Express {
  const app = express();
  app.use(express.json());
  app.use(installTestUser(fundIds));
  app.use('/api', investmentsRouter);
  return app;
}

async function seedFixtures(
  database: DbModule['db'],
  schema: SchemaModule
): Promise<{ testFundId: number; otherFundId: number; testInvestmentId: number }> {
  await database
    .insert(schema.users)
    .values({ id: 1, username: 'test-user', password: 'not-used' })
    .onConflictDoNothing();

  const [testFund] = await database
    .insert(schema.funds)
    .values({
      name: 'Investment Round Test Fund',
      size: '100000000.00',
      managementFee: '0.0200',
      carryPercentage: '0.2000',
      vintageYear: 2026,
    })
    .returning({ id: schema.funds.id });
  const [otherFund] = await database
    .insert(schema.funds)
    .values({
      name: 'Other Investment Round Fund',
      size: '50000000.00',
      managementFee: '0.0200',
      carryPercentage: '0.2000',
      vintageYear: 2026,
    })
    .returning({ id: schema.funds.id });

  if (!testFund || !otherFund) {
    throw new Error('Failed to seed test funds');
  }

  const [company] = await database
    .insert(schema.portfolioCompanies)
    .values({
      fundId: testFund.id,
      name: 'RoundCo',
      sector: 'Software',
      stage: 'Series A',
      investmentAmount: '1000000.00',
      investmentDate: new Date('2026-01-15T00:00:00.000Z'),
      currentValuation: '10000000.00',
      status: 'active',
    })
    .returning({ id: schema.portfolioCompanies.id });
  if (!company) {
    throw new Error('Failed to seed portfolio company');
  }

  const [investment] = await database
    .insert(schema.investments)
    .values({
      fundId: testFund.id,
      companyId: company.id,
      investmentDate: new Date('2026-01-15T00:00:00.000Z'),
      amount: '1000000.00',
      round: 'Seed',
      ownershipPercentage: '0.1000',
      valuationAtInvestment: '10000000.00',
    })
    .returning({ id: schema.investments.id });
  if (!investment) {
    throw new Error('Failed to seed investment');
  }

  return {
    testFundId: testFund.id,
    otherFundId: otherFund.id,
    testInvestmentId: investment.id,
  };
}

function baseRoundBody(fundId: number) {
  return {
    fundId,
    roundName: 'Series A',
    securityType: 'equity',
    roundDate: '2026-01-15',
    currency: 'USD',
    investmentAmount: '1000000',
  } as const;
}

describe.skipIf(!process.env.CI && process.platform === 'win32')(
  'investment scenario capability routes',
  () => {
    const originalEnv = { ...process.env };

    beforeAll(async () => {
      const container = await setupTestDB();
      startedContainer = container;
      const connectionString = container.getConnectionUri();

      process.env.NODE_ENV = 'test';
      process.env._EXPLICIT_NODE_ENV = 'test';
      process.env.DATABASE_URL = connectionString;
      process.env._EXPLICIT_DATABASE_URL = connectionString;
      process.env.USE_REAL_DB_IN_VITEST = '1';
      process.env.ALLOW_MEMORY_STORAGE = '0';
      process.env._EXPLICIT_ALLOW_MEMORY_STORAGE = '0';

      runDrizzlePush(connectionString);
      await applyInvestmentRoundConstraints(connectionString);
      vi.resetModules();

      const [{ default: investmentsRouter }, dbModule, schema] = await Promise.all([
        import('../../server/routes/investments'),
        import('../../server/db'),
        import('@shared/schema'),
      ]);
      teardownDatabase = dbModule.db;
      closeTeardownDatabasePool = dbModule.closeDatabasePool;
      const seeded = await seedFixtures(dbModule.db, schema);

      runtime = {
        app: buildApp(investmentsRouter, [seeded.testFundId]),
        otherFundApp: buildApp(investmentsRouter, [seeded.otherFundId]),
        container,
        database: dbModule.db,
        closeDatabasePool: dbModule.closeDatabasePool,
        ...seeded,
      };
    }, STARTUP_TIMEOUT_MS * 2);

    afterAll(async () => {
      try {
        await (runtime?.database ?? teardownDatabase)?.execute(
          sql`TRUNCATE investment_rounds RESTART IDENTITY CASCADE`
        );
        await (runtime?.closeDatabasePool ?? closeTeardownDatabasePool)?.();
        await (runtime?.container ?? startedContainer)?.stop();
      } finally {
        restoreEnv(originalEnv);
        vi.resetModules();
      }
    });

    it('creates, replays, and rejects conflicting investment round idempotency keys', async () => {
      expect(runtime).toBeDefined();
      const active = runtime!;
      const body = baseRoundBody(active.testFundId);

      const created = await request(active.app)
        .post(`/api/investments/${active.testInvestmentId}/rounds`)
        .set('Idempotency-Key', 'k1')
        .send(body);

      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(created.body).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          etag: expect.any(String),
        })
      );
      expect(created.body).not.toHaveProperty('created_by');
      expect(created.body).not.toHaveProperty('request_hash');
      expect(created.body).not.toHaveProperty('idempotency_key');

      const replayed = await request(active.app)
        .post(`/api/investments/${active.testInvestmentId}/rounds`)
        .set('Idempotency-Key', 'k1')
        .send(body);

      expect(replayed.status, JSON.stringify(replayed.body)).toBe(200);
      expect((replayed.body as RoundResponseBody).id).toBe((created.body as RoundResponseBody).id);

      const conflicting = await request(active.app)
        .post(`/api/investments/${active.testInvestmentId}/rounds`)
        .set('Idempotency-Key', 'k1')
        .send({
          ...body,
          roundName: 'Series B',
        });

      expect(conflicting.status, JSON.stringify(conflicting.body)).toBe(409);
      expect(conflicting.body).toEqual({ error: 'idempotency_key_reused' });
    });

    it('requires an Idempotency-Key header for round writes', async () => {
      expect(runtime).toBeDefined();
      const active = runtime!;

      const response = await request(active.app)
        .post(`/api/investments/${active.testInvestmentId}/rounds`)
        .send(baseRoundBody(active.testFundId));

      expect(response.status, JSON.stringify(response.body)).toBe(428);
    });

    it('denies cross-fund round writes', async () => {
      expect(runtime).toBeDefined();
      const active = runtime!;

      const response = await request(active.otherFundApp)
        .post(`/api/investments/${active.testInvestmentId}/rounds`)
        .set('Idempotency-Key', 'k2')
        .send(baseRoundBody(active.testFundId));

      expect(response.status, JSON.stringify(response.body)).toBe(403);
    });

    it('returns 404 when listing rounds for an unknown investment', async () => {
      expect(runtime).toBeDefined();
      const active = runtime!;

      const response = await request(active.app).get('/api/investments/999999/rounds');

      expect(response.status, JSON.stringify(response.body)).toBe(404);
    });

    it('supports append-only supersede and rejects double supersede', async () => {
      expect(runtime).toBeDefined();
      const active = runtime!;

      const r1 = await request(active.app)
        .post(`/api/investments/${active.testInvestmentId}/rounds`)
        .set('Idempotency-Key', 'k3')
        .send({
          ...baseRoundBody(active.testFundId),
          roundName: 'Seed Correction Source',
        });
      expect(r1.status, JSON.stringify(r1.body)).toBe(201);

      const superseder = await request(active.app)
        .post(`/api/investments/${active.testInvestmentId}/rounds`)
        .set('Idempotency-Key', 'k4')
        .send({
          ...baseRoundBody(active.testFundId),
          roundName: 'Seed Corrected',
          supersedesRoundId: (r1.body as RoundResponseBody).id,
        });
      expect(superseder.status, JSON.stringify(superseder.body)).toBe(201);

      const list = await request(active.app).get(
        `/api/investments/${active.testInvestmentId}/rounds`
      );
      expect(list.status, JSON.stringify(list.body)).toBe(200);
      const ids = (list.body as RoundListResponseBody).data.map((round) => round.id);
      expect(ids).toContain((superseder.body as RoundResponseBody).id);
      expect(ids).not.toContain((r1.body as RoundResponseBody).id);

      const doubleSupersede = await request(active.app)
        .post(`/api/investments/${active.testInvestmentId}/rounds`)
        .set('Idempotency-Key', 'k5')
        .send({
          ...baseRoundBody(active.testFundId),
          roundName: 'Second Correction',
          supersedesRoundId: (r1.body as RoundResponseBody).id,
        });

      expect(doubleSupersede.status, JSON.stringify(doubleSupersede.body)).toBe(409);
      expect(doubleSupersede.body).toEqual({ error: 'round_already_superseded' });
    });

    it('keeps performance case writes explicitly unsupported', async () => {
      expect(runtime).toBeDefined();
      const active = runtime!;

      const response = await request(active.app)
        .post(`/api/investments/${active.testInvestmentId}/cases`)
        .send({ name: 'Base Case', probability: 0.5 });

      expect(response.status, JSON.stringify(response.body)).toBe(501);
    });
  }
);
