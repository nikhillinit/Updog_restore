import { sql, type SQLWrapper } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CreateVehicleFinancingParticipationRequestSchema } from '../../shared/contracts/investment-ledger/participation.contract';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import * as schema from '../../shared/schema';
import { setupTestDB } from '../helpers/testcontainers';

const STARTUP_TIMEOUT_MS = 120_000;
const FUND_BASE = 117_400_000;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Query = SQLWrapper | string;
type TransactionalDb = Db & {
  transaction: <T>(callback: (transaction: TransactionalDb) => Promise<T>) => Promise<T>;
};

interface LedgerContext {
  fundId: number;
  vehicleId: number;
  companyId: number;
  identityId: number;
  eventId: number;
  trancheId: number;
}

interface ParticipationServiceModule {
  createVehicleFinancingParticipation: (input: {
    fundId: number;
    trancheId: number;
    actorId: number | null;
    idempotencyKey: string;
    request: unknown;
    database: TransactionalDb;
  }) => Promise<{
    value: {
      participation: { id: number; version: number };
      compat: { sourceHash: string };
    };
    replayed: boolean;
  }>;
}

interface FinancingEventServiceModule {
  recordFinancingTranche: (input: {
    fundId: number;
    eventId: number;
    actorId: number | null;
    idempotencyKey: string;
    request: unknown;
    database: TransactionalDb;
  }) => Promise<{
    value: { id: number };
    replayed: boolean;
  }>;
}

interface LedgerCorrectionServiceModule {
  correctVehicleParticipationLedger: (input: {
    fundId: number;
    trancheId: number;
    actorId: number | null;
    idempotencyKey: string;
    request: unknown;
    database: TransactionalDb;
  }) => Promise<{
    value: {
      correctedTranche: { id: number; version: number; supersededByTrancheId: number | null };
      participationSuccessors: Array<{
        id: number;
        version: number;
        supersededByParticipationId: number | null;
      }>;
    };
    replayed: boolean;
  }>;
}

interface LegacyGuardServiceModule {
  createLegacyInvestmentWithLedgerGuard: (
    investment: {
      fundId: number;
      companyId: number;
      investmentDate: Date;
      amount: string;
      round: string;
    },
    database: {
      transaction: <T>(
        callback: (transaction: {
          execute: (query: Query) => Promise<unknown>;
          insert: typeof db.insert;
        }) => Promise<T>
      ) => Promise<T>;
    }
  ) => Promise<unknown>;
}

interface FundCompanyActualsFactsServiceModule {
  buildFundCompanyActualsFacts: (input: {
    fundId: number;
    asOfDate: string;
    now?: Date;
    database: TransactionalDb;
  }) => Promise<{
    facts: Array<{
      fundId: number;
      companyId: number;
      investmentIds: number[];
      activeRoundIds: number[];
      initialInvestmentAmount: string;
      followOnInvestmentAmount: string;
    }>;
  }>;
}

let container: Awaited<ReturnType<typeof setupTestDB>> | undefined;
let pool: Pool | undefined;
let db: TransactionalDb;
let participationService: ParticipationServiceModule;
let financingEventService: FinancingEventServiceModule;
let correctionService: LedgerCorrectionServiceModule;
let legacyGuardService: LegacyGuardServiceModule;
let factsService: FundCompanyActualsFactsServiceModule;
let closeApplicationPool: (() => Promise<void>) | undefined;
let originalDatabaseUrl: string | undefined;
let originalUseRealDbInVitest: string | undefined;

describe('vehicle financing participations real PostgreSQL', () => {
  beforeAll(async () => {
    originalDatabaseUrl = process.env['DATABASE_URL'];
    originalUseRealDbInVitest = process.env['USE_REAL_DB_IN_VITEST'];
    const connectionString =
      process.env.TEST_DATABASE_URL ?? (await startContainer()).connectionUri;
    // Dynamic service imports read server/db at module load, after the disposable DB exists.
    Object.assign(process.env, {
      DATABASE_URL: connectionString,
      USE_REAL_DB_IN_VITEST: '1',
    });
    vi.resetModules();
    ({ closeDatabasePool: closeApplicationPool } = await import('../../server/db'));
    pool = new Pool({ connectionString, max: 10 });
    db = drizzle(pool, { schema }) as TransactionalDb;
    participationService =
      (await import('../../server/services/investment-ledger/participation-service')) as unknown as ParticipationServiceModule;
    financingEventService =
      (await import('../../server/services/investment-ledger/financing-event-service')) as unknown as FinancingEventServiceModule;
    correctionService =
      (await import('../../server/services/investment-ledger/ledger-correction-service')) as unknown as LedgerCorrectionServiceModule;
    legacyGuardService =
      (await import('../../server/services/investment-ledger/legacy-compat-guard-service')) as unknown as LegacyGuardServiceModule;
    factsService =
      (await import('../../server/services/fund-actuals/fund-company-actuals-facts-service')) as unknown as FundCompanyActualsFactsServiceModule;
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    let cleanupFailed = false;
    let firstCleanupError: unknown;
    const recordCleanupError = (error: unknown): void => {
      if (!cleanupFailed) {
        cleanupFailed = true;
        firstCleanupError = error;
      }
    };
    const runCleanup = async (operation: (() => Promise<void>) | undefined): Promise<void> => {
      try {
        await operation?.();
      } catch (error) {
        recordCleanupError(error);
      }
    };

    try {
      const applicationPoolCloser = closeApplicationPool;
      closeApplicationPool = undefined;
      await runCleanup(applicationPoolCloser);

      const directPool = pool;
      pool = undefined;
      await runCleanup(directPool ? () => directPool.end() : undefined);

      const startedContainer = container;
      container = undefined;
      await runCleanup(startedContainer ? () => startedContainer.stop() : undefined);
    } finally {
      try {
        if (originalDatabaseUrl === undefined) {
          delete process.env['DATABASE_URL'];
        } else {
          process.env['DATABASE_URL'] = originalDatabaseUrl;
        }
        if (originalUseRealDbInVitest === undefined) {
          delete process.env['USE_REAL_DB_IN_VITEST'];
        } else {
          process.env['USE_REAL_DB_IN_VITEST'] = originalUseRealDbInVitest;
        }
      } catch (error) {
        recordCleanupError(error);
      }
      try {
        vi.resetModules();
      } catch (error) {
        recordCleanupError(error);
      }
    }

    if (cleanupFailed) {
      throw firstCleanupError;
    }
  });

  it('commits exactly one participation head when concurrent create requests race', async () => {
    const context = await seedLedgerContext(1);
    const request = participationRequest(context.vehicleId, '100.000000');

    const outcomes = await Promise.allSettled([
      createParticipation(context, request, 'task10-head-race-a'),
      createParticipation(context, request, 'task10-head-race-b'),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(await countRows('vehicle_financing_participations', context.fundId)).toBe(1);
    expect(await countCurrentParticipationHeads(context)).toBe(1);
  });

  it('commits exactly one row when legacy investment and participation requests race same wire', async () => {
    const context = await seedLedgerContext(2);
    const request = participationRequest(context.vehicleId, '101.000000');
    let legacyInsertCanProceed = false;
    let markLegacyInsertReached: (() => void) | undefined;
    let releaseLegacyInsert: (() => void) | undefined;
    const legacyInsertReached = new Promise<void>((resolve) => {
      markLegacyInsertReached = resolve;
    });
    const legacyInsertGate = new Promise<void>((resolve) => {
      releaseLegacyInsert = () => {
        legacyInsertCanProceed = true;
        resolve();
      };
    });
    const legacyDatabase = {
      transaction: async <T>(
        callback: (transaction: {
          execute: (query: unknown) => Promise<unknown>;
          insert: typeof db.insert;
        }) => Promise<T>
      ): Promise<T> =>
        db.transaction(async (transaction) =>
          callback({
            execute: (query) => transaction.execute(query),
            insert: ((table: typeof schema.investments) => ({
              values: (value: typeof schema.investments.$inferInsert) => ({
                returning: async () => {
                  markLegacyInsertReached?.();
                  await legacyInsertGate;
                  expect(legacyInsertCanProceed).toBe(true);
                  return transaction.insert(table).values(value).returning();
                },
              }),
            })) as typeof db.insert,
          })
        ),
    };

    const legacy = legacyGuardService.createLegacyInvestmentWithLedgerGuard(
      {
        fundId: context.fundId,
        companyId: context.companyId,
        investmentDate: new Date('2026-01-15T00:00:00.000Z'),
        amount: '101.00',
        round: 'Series A',
      },
      legacyDatabase
    );
    await legacyInsertReached;
    const participation = createParticipation(context, request, 'task10-legacy-race');
    releaseLegacyInsert?.();

    const outcomes = await Promise.allSettled([legacy, participation]);
    const committed = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    expect(committed).toHaveLength(1);
    expect(await countRows('investments', context.fundId)).toBe(1);
  });

  it('rejects duplicate cash-flow source_hash values for one fund', async () => {
    const context = await seedLedgerContext(3);
    const result = await createParticipation(
      context,
      participationRequest(context.vehicleId, '102.000000'),
      'task10-source-hash'
    );
    const sourceHash = result.value.compat.sourceHash;

    await expect(
      db.execute(sql`
        INSERT INTO cash_flow_events (
          fund_id, vehicle_id, company_id, event_type, amount, currency, event_date,
          perspective, payload, status, source_hash, vehicle_participation_id
        ) VALUES (
          ${context.fundId}, ${context.vehicleId}, ${context.companyId},
          'portfolio_investment', '102.000000', 'USD',
          ${new Date('2026-01-15T00:00:00.000Z')}, 'vehicle',
          '{}'::jsonb, 'approved', ${sourceHash}, ${result.value.participation.id}
        )
      `)
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('rolls back participation, compat, observation, and correction rows on final-step failure', async () => {
    const context = await seedLedgerContext(4);
    const request = participationRequest(context.vehicleId, '103.000000');
    const before = await persistenceCounts(context.fundId);

    const failingDb = withDatabaseOverrides(db, {
      transaction: async <T>(callback: (transaction: TransactionalDb) => Promise<T>): Promise<T> =>
        db.transaction(async (transaction) => {
          await callback(transaction as unknown as TransactionalDb);
          throw new Error('task10 final-step failure injection');
        }),
    });
    await expect(
      createParticipation(context, request, 'task10-final-step', failingDb)
    ).rejects.toThrow('task10 final-step failure injection');

    expect(await persistenceCounts(context.fundId)).toEqual(before);
  });

  it('rejects stale identity linkage observed inside the participation transaction', async () => {
    const context = await seedLedgerContext(5);
    const request = participationRequest(context.vehicleId, '104.000000');
    let identityLinkRemoved = false;
    const raceDb = withDatabaseOverrides(db, {
      transaction: async <T>(callback: (transaction: TransactionalDb) => Promise<T>): Promise<T> =>
        db.transaction(async (transaction) => {
          const wrappedTx = withDatabaseOverrides(transaction as unknown as TransactionalDb, {
            execute: async (query: Query) => {
              if (!identityLinkRemoved) {
                identityLinkRemoved = true;
                await db.execute(sql`
                  UPDATE portfolio_company_identity_links
                  SET active = false, deactivated_at = now()
                  WHERE fund_id = ${context.fundId}
                    AND company_identity_id = ${context.identityId}
                `);
              }
              return transaction.execute(query);
            },
          });
          return callback(wrappedTx);
        }),
    });

    await expect(
      createParticipation(context, request, 'task10-stale-identity', raceDb)
    ).rejects.toMatchObject({ code: 'IDENTITY_LINK_REQUIRED' });
    expect(await countRows('vehicle_financing_participations', context.fundId)).toBe(0);
    expect(await countRows('investments', context.fundId)).toBe(0);
    expect(await countRows('cash_flow_events', context.fundId)).toBe(0);
  });

  it('supersedes tranche and participation heads in three-step order without violating partial unique indexes', async () => {
    const context = await seedLedgerContext(6);
    const participation = await createParticipation(
      context,
      participationRequest(context.vehicleId, '105.000000'),
      'task10-supersede-create'
    );
    const correctionRequest = ledgerCorrectionRequest(participation.value.participation.id);

    const correction = await correctionService.correctVehicleParticipationLedger({
      fundId: context.fundId,
      trancheId: context.trancheId,
      actorId: null,
      idempotencyKey: 'task10-supersede-correct',
      request: correctionRequest,
      database: db,
    });

    expect(correction.replayed).toBe(false);
    expect(correction.value.correctedTranche.version).toBe(2);
    expect(correction.value.correctedTranche.supersededByTrancheId).toBeNull();
    expect(correction.value.participationSuccessors).toHaveLength(1);
    expect(correction.value.participationSuccessors[0]?.version).toBe(2);
    expect(correction.value.participationSuccessors[0]?.supersededByParticipationId).toBeNull();
    expect(await countCurrentParticipationHeads(context)).toBe(1);
    expect(await countCurrentTrancheHeads(context.fundId, context.eventId)).toBe(1);
  });

  it('persists participation compatibility literals consumed by fund-company actuals facts', async () => {
    const context = await seedLedgerContext(7);
    const result = await createParticipation(
      context,
      participationRequest(context.vehicleId, '123.456789', '12.34567890'),
      'task10-facts-parity'
    );

    const persisted = oneRow(
      await db.execute(sql`
        SELECT
          i.id::integer AS "investmentId",
          i.amount::text AS "investmentAmount",
          i.share_price_cents::text AS "investmentSharePriceCents",
          i.shares_acquired::text AS "investmentSharesAcquired",
          i.cost_basis_cents::text AS "investmentCostBasisCents",
          r.id::integer AS "roundId",
          r.investment_amount::text AS "roundInvestmentAmount",
          l.share_price_cents::text AS "lotSharePriceCents",
          l.shares_acquired::text AS "lotSharesAcquired",
          l.cost_basis_cents::text AS "lotCostBasisCents",
          c.amount::text AS "cashFlowAmount",
          c.perspective AS "cashFlowPerspective",
          c.event_type AS "cashFlowEventType",
          c.status AS "cashFlowStatus"
        FROM investments i
        JOIN investment_rounds r
          ON r.vehicle_participation_id = i.vehicle_participation_id
        JOIN investment_lots l
          ON l.vehicle_participation_id = i.vehicle_participation_id
        JOIN cash_flow_events c
          ON c.vehicle_participation_id = i.vehicle_participation_id
        WHERE i.fund_id = ${context.fundId}
          AND i.vehicle_participation_id = ${result.value.participation.id}
      `)
    );

    expect(persisted).toMatchObject({
      investmentAmount: '123.46',
      investmentSharePriceCents: '1000',
      investmentSharesAcquired: '12.34567890',
      investmentCostBasisCents: '12346',
      roundInvestmentAmount: '123.456789',
      lotSharePriceCents: '1000',
      lotSharesAcquired: '12.34567890',
      lotCostBasisCents: '12346',
      cashFlowAmount: '123.456789',
      cashFlowPerspective: 'vehicle',
      cashFlowEventType: 'portfolio_investment',
      cashFlowStatus: 'approved',
    });

    const facts = await factsService.buildFundCompanyActualsFacts({
      fundId: context.fundId,
      asOfDate: '2026-01-31',
      now: new Date('2026-01-31T12:00:00.000Z'),
      database: db,
    });

    expect(facts.facts).toHaveLength(1);
    expect(facts.facts[0]).toMatchObject({
      fundId: context.fundId,
      companyId: context.companyId,
      investmentIds: [persisted['investmentId']],
      activeRoundIds: [persisted['roundId']],
      initialInvestmentAmount: '123.456789',
      followOnInvestmentAmount: '0.000000',
    });
  });
});

async function startContainer(): Promise<{ connectionUri: string }> {
  container = await setupTestDB();
  return { connectionUri: container.getConnectionUri() };
}

function participationRequest(
  vehicleId: number,
  participationAmount: string,
  sharesAcquired = '10.00000000'
): unknown {
  return CreateVehicleFinancingParticipationRequestSchema.parse({
    vehicleId,
    participationAmount,
    sharesAcquired,
  });
}

function ledgerCorrectionRequest(participationId: number): unknown {
  return {
    expectedTrancheVersion: 1,
    correctedTranche: {
      closingDate: '2026-02-01',
      securityType: 'equity',
      investmentAmount: '1200.000000',
      pricePerShare: '10.000000',
      postMoneyValuation: '12000000.000000',
    },
    dependents: [
      {
        participationId,
        expectedVersion: 1,
        acknowledgements: {
          termsReviewed: true,
          compatibilityRewriteAccepted: true,
        },
      },
    ],
  };
}

function withDatabaseOverrides(
  database: TransactionalDb,
  overrides: Partial<Pick<TransactionalDb, 'execute' | 'transaction'>>
): TransactionalDb {
  return new Proxy(database, {
    get(target, property) {
      if (Object.prototype.hasOwnProperty.call(overrides, property)) {
        return Reflect.get(overrides, property);
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function createParticipation(
  context: LedgerContext,
  request: unknown,
  idempotencyKey: string,
  database: TransactionalDb = db
): Promise<{
  value: { participation: { id: number; version: number }; compat: { sourceHash: string } };
  replayed: boolean;
}> {
  return participationService.createVehicleFinancingParticipation({
    fundId: context.fundId,
    trancheId: context.trancheId,
    actorId: null,
    idempotencyKey,
    request,
    database,
  });
}

async function seedLedgerContext(offset: number): Promise<LedgerContext> {
  const fundId = FUND_BASE + offset;
  await db.execute(sql`
    INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
    VALUES (${fundId}, ${`Task10 Fund ${offset}`}, '1000000.00', '0.0200', '0.2000', 2026)
  `);
  const companyId = insertedId(
    await db.execute(sql`
    INSERT INTO portfoliocompanies (
      fund_id, name, sector, stage, investment_amount, status
    ) VALUES (
      ${fundId}, ${`Task10 Company ${offset}`}, 'SaaS', 'Series A', '0.00', 'active'
    )
    RETURNING id
  `)
  );
  const vehicleId = insertedId(
    await db.execute(sql`
    INSERT INTO vehicles (
      fund_id, vehicle_slug, vehicle_type, name, committed_capital, currency, status
    ) VALUES (
      ${fundId}, ${`task10-spv-${offset}`}, 'spv', ${`Task10 SPV ${offset}`},
      '500000.000000', 'USD', 'active'
    )
    RETURNING id
  `)
  );
  const identityId = insertedId(
    await db.execute(sql`
    INSERT INTO company_identities (
      fund_id, canonical_name, source_portfolio_company_id
    ) VALUES (
      ${fundId}, ${`Task10 Company ${offset}`}, ${companyId}
    )
    RETURNING id
  `)
  );
  await db.execute(sql`
    INSERT INTO portfolio_company_identity_links (
      fund_id, portfolio_company_id, company_identity_id, link_type, active
    ) VALUES (
      ${fundId}, ${companyId}, ${identityId}, 'operator_resolution', true
    )
  `);
  const event = await createEventAndTranche(fundId, identityId, offset);
  return { fundId, vehicleId, companyId, identityId, ...event };
}

async function createEventAndTranche(
  fundId: number,
  identityId: number,
  offset: number
): Promise<{ eventId: number; trancheId: number }> {
  const eventId = insertedId(
    await db.execute(sql`
    INSERT INTO financing_events (
      fund_id, company_identity_id, event_key, round_name, security_type,
      event_date, currency, round_size, post_money_valuation, price_per_share,
      idempotency_key, request_hash
    ) VALUES (
      ${fundId}, ${identityId}, ${`series-a-${offset}`}, 'Series A', 'equity',
      '2026-01-15', 'USD', '1000.000000', '10000000.000000', '10.000000',
      ${`task10-event-${offset}`}, ${canonicalSha256({ fundId, offset, role: 'event' })}
    )
    RETURNING id
  `)
  );
  const trancheRequest = {
    trancheKey: 'primary',
    closingDate: '2026-01-15',
    securityType: 'equity',
    investmentAmount: '1000.000000',
    pricePerShare: '10.000000',
    postMoneyValuation: '10000000.000000',
  };
  const recorded = await financingEventService.recordFinancingTranche({
    fundId,
    eventId,
    actorId: null,
    idempotencyKey: `task10-tranche-${fundId}`,
    request: trancheRequest,
    database: db,
  });
  return { eventId, trancheId: recorded.value.id };
}

async function countRows(tableName: string, fundId: number): Promise<number> {
  return scalar(sql`
    SELECT count(*)::integer AS count
    FROM ${sql.identifier(tableName)}
    WHERE fund_id = ${fundId}
  `);
}

async function countCurrentParticipationHeads(context: LedgerContext): Promise<number> {
  return scalar(sql`
    SELECT count(*)::integer AS count
    FROM vehicle_financing_participations
    WHERE fund_id = ${context.fundId}
      AND vehicle_id = ${context.vehicleId}
      AND financing_event_id = ${context.eventId}
      AND tranche_key = 'primary'
      AND superseded_by_participation_id IS NULL
  `);
}

async function countCurrentTrancheHeads(fundId: number, eventId: number): Promise<number> {
  return scalar(sql`
    SELECT count(*)::integer AS count
    FROM financing_tranches
    WHERE fund_id = ${fundId}
      AND financing_event_id = ${eventId}
      AND tranche_key = 'primary'
      AND superseded_by_tranche_id IS NULL
  `);
}

async function persistenceCounts(fundId: number): Promise<Record<string, number>> {
  return {
    participations: await countRows('vehicle_financing_participations', fundId),
    investments: await countRows('investments', fundId),
    rounds: await countRows('investment_rounds', fundId),
    cashFlowEvents: await countRows('cash_flow_events', fundId),
    observations: await countRows('source_observations', fundId),
    reconciliationCases: await countRows('reconciliation_cases', fundId),
    lots: await scalar(sql`
      SELECT count(*)::integer AS count
      FROM investment_lots lot
      JOIN investments investment ON investment.id = lot.investment_id
      WHERE investment.fund_id = ${fundId}
    `),
  };
}

async function scalar(query: Query): Promise<number> {
  const rows = readRows(await db.execute(query));
  const value = rows[0]?.['count'];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseInt(value, 10);
  throw new Error('Expected count result.');
}

function insertedId(result: unknown): number {
  const value = readRows(result)[0]?.['id'];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseInt(value, 10);
  throw new Error('Expected inserted id.');
}

function readRows(result: unknown): Array<Record<string, unknown>> {
  if (
    result !== null &&
    typeof result === 'object' &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }
  if (Array.isArray(result)) {
    return result.filter(
      (row): row is Record<string, unknown> => row !== null && typeof row === 'object'
    );
  }
  return [];
}

function oneRow(result: unknown): Record<string, unknown> {
  const rows = readRows(result);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}
