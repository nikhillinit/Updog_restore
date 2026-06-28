import { and, eq, sql } from 'drizzle-orm';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { investmentRounds } from '@shared/schema';
import { applyInvestmentRoundConstraints } from '../helpers/apply-investment-round-constraints';
import { runDrizzlePush } from './helpers/run-drizzle-push';
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

    it('holds idempotency-key stability across a repeated create soak', async () => {
      expect(runtime).toBeDefined();
      const active = runtime!;
      const body = baseRoundBody(active.testFundId);
      const idempotencyKey = 'soak-k1';
      let firstBody: RoundResponseBody | undefined;

      for (let attempt = 0; attempt < 25; attempt += 1) {
        const response = await request(active.app)
          .post(`/api/investments/${active.testInvestmentId}/rounds`)
          .set('Idempotency-Key', idempotencyKey)
          .send(body);

        expect(response.status, JSON.stringify(response.body)).toBe(attempt === 0 ? 201 : 200);
        expect(response.body).toEqual(
          expect.objectContaining({
            id: expect.any(Number),
            etag: expect.any(String),
          })
        );

        const responseBody = response.body as RoundResponseBody;
        if (attempt === 0) {
          firstBody = responseBody;
        } else {
          expect(firstBody).toBeDefined();
          expect(responseBody.id).toBe(firstBody?.id);
          expect(responseBody.etag).toBe(firstBody?.etag);
        }
      }

      expect(firstBody).toBeDefined();
      const [roundCount] = await active.database
        .select({ count: sql<number>`count(*)::int` })
        .from(investmentRounds)
        .where(
          and(
            eq(investmentRounds.investmentId, active.testInvestmentId),
            eq(investmentRounds.idempotencyKey, idempotencyKey)
          )
        );

      expect(roundCount?.count).toBe(1);
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

    // P1 controlled soak proof. The cases above prove each investment-round
    // contract once; these prove the same contracts hold under sustained,
    // repeated traffic (no duplicate persistence on replay, no row leakage from
    // rejected writes, deterministic conflict detection, supersede-chain
    // integrity). Reuses this file's testcontainer + router + supertest harness.
    describe('controlled soak proof', () => {
      const rawSoakIterations = Number.parseInt(
        process.env['INVESTMENT_ROUNDS_SOAK_ITERATIONS'] ?? '50',
        10
      );
      const SOAK_ITERATIONS = Number.isFinite(rawSoakIterations)
        ? Math.min(Math.max(rawSoakIterations, 1), 500)
        : 50;
      const SOAK_TIMEOUT_MS = 120_000;

      // Each soak case seeds its own dedicated investment so absolute-count
      // assertions are order-independent and isolated from the cases above.
      async function seedSoakInvestment(label: string): Promise<number> {
        expect(runtime).toBeDefined();
        const active = runtime!;
        const schema: SchemaModule = await import('@shared/schema');

        const [company] = await active.database
          .insert(schema.portfolioCompanies)
          .values({
            fundId: active.testFundId,
            name: label,
            sector: 'Software',
            stage: 'Series A',
            investmentAmount: '1000000.00',
            investmentDate: new Date('2026-02-01T00:00:00.000Z'),
            currentValuation: '10000000.00',
            status: 'active',
          })
          .returning({ id: schema.portfolioCompanies.id });
        if (!company) {
          throw new Error('Failed to seed soak portfolio company');
        }

        const [investment] = await active.database
          .insert(schema.investments)
          .values({
            fundId: active.testFundId,
            companyId: company.id,
            investmentDate: new Date('2026-02-01T00:00:00.000Z'),
            amount: '1000000.00',
            round: 'Seed',
            ownershipPercentage: '0.1000',
            valuationAtInvestment: '10000000.00',
          })
          .returning({ id: schema.investments.id });
        if (!investment) {
          throw new Error('Failed to seed soak investment');
        }

        return investment.id;
      }

      it(
        'sustains idempotent create and replay with no duplicate persistence',
        async () => {
          const active = runtime!;
          const investmentId = await seedSoakInvestment('SoakReplayCo');
          const createdIds = new Set<number>();

          for (let i = 0; i < SOAK_ITERATIONS; i += 1) {
            const key = `soak-create-${i}`;
            const body = { ...baseRoundBody(active.testFundId), roundName: `Soak Round ${i}` };

            const created = await request(active.app)
              .post(`/api/investments/${investmentId}/rounds`)
              .set('Idempotency-Key', key)
              .send(body);
            expect(created.status, JSON.stringify(created.body)).toBe(201);
            const id = (created.body as RoundResponseBody).id;

            // Replaying the same key + body must always return the same row.
            for (let replay = 0; replay < 3; replay += 1) {
              const replayed = await request(active.app)
                .post(`/api/investments/${investmentId}/rounds`)
                .set('Idempotency-Key', key)
                .send(body);
              expect(replayed.status, JSON.stringify(replayed.body)).toBe(200);
              expect((replayed.body as RoundResponseBody).id).toBe(id);
            }

            createdIds.add(id);
          }

          expect(createdIds.size).toBe(SOAK_ITERATIONS);

          const list = await request(active.app).get(`/api/investments/${investmentId}/rounds`);
          expect(list.status, JSON.stringify(list.body)).toBe(200);
          const listedIds = (list.body as RoundListResponseBody).data.map((round) => round.id);
          expect(listedIds.length).toBe(SOAK_ITERATIONS);
          expect(new Set(listedIds)).toEqual(createdIds);
        },
        SOAK_TIMEOUT_MS
      );

      it(
        'rejects every reused key whose body changed (deterministic conflict)',
        async () => {
          const active = runtime!;
          const investmentId = await seedSoakInvestment('SoakConflictCo');

          for (let i = 0; i < SOAK_ITERATIONS; i += 1) {
            const key = `soak-conflict-${i}`;
            const body = { ...baseRoundBody(active.testFundId), roundName: `Soak Conflict ${i}` };

            const created = await request(active.app)
              .post(`/api/investments/${investmentId}/rounds`)
              .set('Idempotency-Key', key)
              .send(body);
            expect(created.status, JSON.stringify(created.body)).toBe(201);

            const conflicting = await request(active.app)
              .post(`/api/investments/${investmentId}/rounds`)
              .set('Idempotency-Key', key)
              .send({ ...body, roundName: `Soak Conflict Mutated ${i}` });
            expect(conflicting.status, JSON.stringify(conflicting.body)).toBe(409);
            expect(conflicting.body).toEqual({ error: 'idempotency_key_reused' });
          }

          // Conflicts must never persist a second row for the key.
          const list = await request(active.app).get(`/api/investments/${investmentId}/rounds`);
          expect(list.status, JSON.stringify(list.body)).toBe(200);
          expect((list.body as RoundListResponseBody).data.length).toBe(SOAK_ITERATIONS);
        },
        SOAK_TIMEOUT_MS
      );

      it(
        'upholds precondition and cross-fund guards across sustained traffic',
        async () => {
          const active = runtime!;
          const investmentId = await seedSoakInvestment('SoakGuardCo');

          for (let i = 0; i < SOAK_ITERATIONS; i += 1) {
            const body = { ...baseRoundBody(active.testFundId), roundName: `Soak Guard ${i}` };

            const missingKey = await request(active.app)
              .post(`/api/investments/${investmentId}/rounds`)
              .send(body);
            expect(missingKey.status, JSON.stringify(missingKey.body)).toBe(428);

            const crossFund = await request(active.otherFundApp)
              .post(`/api/investments/${investmentId}/rounds`)
              .set('Idempotency-Key', `soak-guard-${i}`)
              .send(body);
            expect(crossFund.status, JSON.stringify(crossFund.body)).toBe(403);
          }

          // Rejected writes must not leak rows into the ledger.
          const list = await request(active.app).get(`/api/investments/${investmentId}/rounds`);
          expect(list.status, JSON.stringify(list.body)).toBe(200);
          expect((list.body as RoundListResponseBody).data.length).toBe(0);
        },
        SOAK_TIMEOUT_MS
      );

      it(
        'keeps the supersede chain append-only under repeated correction',
        async () => {
          const active = runtime!;
          const investmentId = await seedSoakInvestment('SoakChainCo');
          const chainLength = Math.min(SOAK_ITERATIONS, 25);

          const base = await request(active.app)
            .post(`/api/investments/${investmentId}/rounds`)
            .set('Idempotency-Key', 'soak-chain-base')
            .send({ ...baseRoundBody(active.testFundId), roundName: 'Soak Chain Base' });
          expect(base.status, JSON.stringify(base.body)).toBe(201);

          let headId = (base.body as RoundResponseBody).id;
          const supersededIds: number[] = [];

          for (let i = 0; i < chainLength; i += 1) {
            const corrected = await request(active.app)
              .post(`/api/investments/${investmentId}/rounds`)
              .set('Idempotency-Key', `soak-chain-${i}`)
              .send({
                ...baseRoundBody(active.testFundId),
                roundName: `Soak Chain Correction ${i}`,
                supersedesRoundId: headId,
              });
            expect(corrected.status, JSON.stringify(corrected.body)).toBe(201);

            // Re-superseding a round that was just superseded must always 409.
            const doubleSupersede = await request(active.app)
              .post(`/api/investments/${investmentId}/rounds`)
              .set('Idempotency-Key', `soak-chain-double-${i}`)
              .send({
                ...baseRoundBody(active.testFundId),
                roundName: `Soak Chain Double ${i}`,
                supersedesRoundId: headId,
              });
            expect(doubleSupersede.status, JSON.stringify(doubleSupersede.body)).toBe(409);
            expect(doubleSupersede.body).toEqual({ error: 'round_already_superseded' });

            supersededIds.push(headId);
            headId = (corrected.body as RoundResponseBody).id;
          }

          const list = await request(active.app).get(`/api/investments/${investmentId}/rounds`);
          expect(list.status, JSON.stringify(list.body)).toBe(200);
          const activeIds = (list.body as RoundListResponseBody).data.map((round) => round.id);
          // Exactly one active head survives in the filtered view; superseded
          // rounds are retained in the ledger (proven by the direct DB read
          // below), never deleted.
          expect(activeIds.length).toBe(1);
          expect(activeIds).toContain(headId);
          for (const supersededId of supersededIds) {
            expect(activeIds).not.toContain(supersededId);
          }

          // Append-only ledger proof: the list endpoint filters superseded rows
          // out, so read the table directly. Every write is retained -- base +
          // one row per correction = chainLength + 1 -- and the
          // supersedesRoundId links form a single unbroken chain from the
          // active head back to the base.
          const persisted = await active.database
            .select({
              id: investmentRounds.id,
              supersedesRoundId: investmentRounds.supersedesRoundId,
            })
            .from(investmentRounds)
            .where(eq(investmentRounds.investmentId, investmentId));

          expect(persisted.length).toBe(chainLength + 1);

          const baseId = (base.body as RoundResponseBody).id;
          const linkById = new Map<number, number | null>(
            persisted.map((row): [number, number | null] => [row.id, row.supersedesRoundId])
          );
          // Exactly one root (the base) has no predecessor.
          expect([...linkById.values()].filter((link) => link === null)).toHaveLength(1);
          expect(linkById.get(baseId)).toBeNull();

          // Walk head -> base via supersedesRoundId; the chain must visit every
          // persisted row exactly once and terminate at the base.
          const walked: number[] = [];
          let cursor: number | null = headId;
          while (cursor !== null) {
            walked.push(cursor);
            expect(linkById.has(cursor)).toBe(true);
            cursor = linkById.get(cursor) ?? null;
          }
          expect(walked).toHaveLength(chainLength + 1);
          expect(walked[walked.length - 1]).toBe(baseId);
          expect(new Set(walked).size).toBe(walked.length);
        },
        SOAK_TIMEOUT_MS
      );
    });
  }
);
