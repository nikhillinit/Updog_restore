/**
 * @group integration
 * @group testcontainers
 *
 * Real-Postgres proof for construction-reconciliation persistence, source
 * fencing, idempotent replay, and advisory-lock serialization.
 *
 * Supported modes:
 *   1. TEST_DATABASE_URL=postgres://... (disposable test database)
 *   2. RUN_DOCKER_CONSTRUCTION_RECONCILIATION=1 (local Docker)
 *   3. CI testcontainers workers
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1,
  FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
  FinancialFactsPayloadV1Schema,
} from '../../shared/contracts/financial-facts-snapshot-v1.contract';
import { buildSnapshotInputHash } from '../../shared/lib/financial-facts/snapshot-hashes';
import { combinedSchema } from '../../server/db-schema';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const STARTUP_TIMEOUT_MS = 120_000;
const cloudDbUrl = process.env['TEST_DATABASE_URL'];
const useDocker =
  process.env['RUN_DOCKER_CONSTRUCTION_RECONCILIATION'] === '1' ||
  process.env['CI'] === 'true' ||
  process.env['CI'] === '1';
const skipTest = !cloudDbUrl && !useDocker;

const originalEnv = {
  DATABASE_URL: process.env['DATABASE_URL'],
  NEON_DATABASE_URL: process.env['NEON_DATABASE_URL'],
  USE_REAL_DB_IN_VITEST: process.env['USE_REAL_DB_IN_VITEST'],
};

let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer | null = null;
let adminPool: Pool;
let modulePool: Pool;
let moduleDb: ReturnType<typeof drizzle<typeof combinedSchema>>;
let connectionString: string;
let reconciliationService: typeof import('../../server/services/construction-reconciliation-service');

function restoreEnvironment(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function resetSchema(): Promise<void> {
  await adminPool.query('DROP EXTENSION IF EXISTS vector CASCADE');
  await adminPool.query('DROP EXTENSION IF EXISTS pgcrypto CASCADE');
  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool.query('CREATE SCHEMA public');
  await adminPool.query('GRANT ALL ON SCHEMA public TO public');
  await adminPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
  try {
    await adminPool.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
  } catch {
    // Some TEST_DATABASE_URL providers do not expose pgvector.
  }
}

function makeFact(fundId: number, amount = '10.000000') {
  return {
    fundId,
    companyId: 101,
    companyName: 'Example Co',
    investmentIds: [],
    activeRoundIds: [],
    approvedPlanningFmvMarkId: null,
    planningFmvStatus: 'none' as const,
    initialInvestmentAmount: amount,
    followOnInvestmentAmount: '0.000000',
    amountOnlyNonEquityAmount: '0.000000',
    latestRoundDate: null,
    latestRoundValuation: null,
    latestPlanningFmvDate: null,
    latestPlanningFmvValue: null,
    currency: 'USD',
    currencyStatus: 'base_currency' as const,
    supersedeLineage: [],
    warnings: [],
    provenance: {
      trustState: 'LIVE' as const,
      core: {
        sourceKind: 'computed' as const,
        actionability: 'actionable' as const,
        sourceEngine: 'construction-reconciliation-test',
        engineVersion: 'test-v1',
        inputHash: 'c'.repeat(64),
        assumptionsHash: 'd'.repeat(64),
        isFinanciallyActionable: true,
        warnings: [],
      },
      structuredWarnings: [],
    },
    inputHash: 'e'.repeat(64),
  };
}

function makeFactsPayload(fundId: number, amount = '10.000000') {
  return FinancialFactsPayloadV1Schema.parse({
    companyActuals: {
      fundId,
      asOfDate: '2026-07-21',
      facts: [makeFact(fundId, amount)],
      inputHash: 'f'.repeat(64),
    },
    sourceObservationIds: [],
    workingValueSelectionIds: [],
    participationTermRefs: [],
    cashFlowSeries: {
      series: [],
      totals: {
        contributions: '0.000000',
        distributions: '0.000000',
        recallableDistributions: '0.000000',
      },
      warnings: [],
    },
    marksSeries: { marks: [], periodNav: [], warnings: [] },
    vehicleRoster: [],
  });
}

function makeAllocations() {
  return [
    {
      allocationId: 'seed',
      name: 'Seed',
      stageFocus: 'Seed',
      initialCapitalUsd: '70.000000',
      followOnCapitalUsd: '50.000000',
      avgInitialCheckUsd: '10.000000',
      pacingQuarters: 1,
      followOnStrategy: 'amount',
      followOnParticipationPct: null,
    },
  ];
}

function makePacingAssumptions() {
  return {
    contractVersion: 'current-plan-pacing-v1',
    deploymentQuarters: 1,
    quarterlyDeploymentPcts: ['1.000000000000'],
    followOnReservePct: '0.000000000000',
    annualFeeDragPct: '0.000000000000',
  };
}

function makeCohortAssumptions() {
  return {
    contractVersion: 'current-plan-cohort-v1',
    averageInitialCheckUsd: '10.000000',
    stageDistribution: [{ stage: 'Seed', pct: '1.000000000000' }],
    graduationMatrix: [],
    exitAssumptions: [],
  };
}

async function seedFund(): Promise<number> {
  const result = await adminPool.query<{ id: number }>(`
    INSERT INTO funds (
      name, size, management_fee, carry_percentage, vintage_year, status, base_currency
    )
    VALUES ('Construction reconciliation fund', 100.00, 0.0200, 0.2000, 2026, 'active', 'USD')
    RETURNING id
  `);
  return result.rows[0]!.id;
}

async function insertFactsSnapshot(
  fundId: number,
  suffix: string,
  supersedesSnapshotId: number | null = null,
  amount = '10.000000'
): Promise<number> {
  const payload = makeFactsPayload(fundId, amount);
  const snapshotInputHash = buildSnapshotInputHash({
    fundId,
    vehicleIds: [],
    asOfDate: '2026-07-21',
    knowledgeCutoff: '2026-07-21T12:00:00.000Z',
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1,
    selectionSetHash: '1'.repeat(64),
    payload,
  });
  const result = await adminPool.query<{ id: number }>(
    `
      INSERT INTO financial_facts_snapshots (
        fund_id, policy_version, payload_schema_id, as_of_date, knowledge_cutoff,
        vehicle_scope, vehicle_ids, selection_set_hash, source_facts_input_hash,
        snapshot_input_hash, payload, consumer_evaluations, idempotency_key, request_hash,
        supersedes_snapshot_id
      )
      VALUES (
        $1, $2, $3, '2026-07-21', '2026-07-21T12:00:00.000Z', 'fund_all', $4::jsonb,
        $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12
      )
      RETURNING id
    `,
    [
      fundId,
      FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
      FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1,
      JSON.stringify([]),
      '1'.repeat(64),
      '2'.repeat(64),
      snapshotInputHash,
      JSON.stringify(payload),
      JSON.stringify([]),
      `facts-${fundId}-${suffix}`,
      '3'.repeat(64),
      supersedesSnapshotId,
    ]
  );
  return result.rows[0]!.id;
}

async function insertPlanVersion(
  fundId: number,
  factsSnapshotId: number,
  suffix: string,
  version = 1,
  supersedesVersionId: number | null = null,
  supersededByVersionId: number | null = null
): Promise<number> {
  const result = await adminPool.query<{ id: number }>(
    `
      INSERT INTO current_plan_versions (
        fund_id, version, source_config_id, source_config_version, source_facts_snapshot_id,
        deployable_capital_usd, plan_transformation_version, allocations, pacing_assumptions,
        cohort_assumptions, reserve_policy_version, assumptions_hash, supersedes_version_id,
        superseded_by_version_id, idempotency_key, request_hash
      )
      VALUES (
        $1, $2, 2, 1, $3, '100.000000', 'fund-config-to-current-plan/1.0.0', $4::jsonb,
        $5::jsonb, $6::jsonb, 'reserve-policy/1.0.0', $7, $8, $9, $10, $11
      )
      RETURNING id
    `,
    [
      fundId,
      version,
      factsSnapshotId,
      JSON.stringify(makeAllocations()),
      JSON.stringify(makePacingAssumptions()),
      JSON.stringify(makeCohortAssumptions()),
      '4'.repeat(64),
      supersedesVersionId,
      supersededByVersionId,
      `plan-${fundId}-${suffix}`,
      '5'.repeat(64),
    ]
  );
  return result.rows[0]!.id;
}

async function seedContext(suffix: string): Promise<{
  fundId: number;
  factsSnapshotId: number;
  planVersionId: number;
}> {
  const fundId = await seedFund();
  const factsSnapshotId = await insertFactsSnapshot(fundId, `${suffix}-facts`);
  const planVersionId = await insertPlanVersion(fundId, factsSnapshotId, `${suffix}-plan`);
  return { fundId, factsSnapshotId, planVersionId };
}

function requestFor(context: { fundId: number; factsSnapshotId: number; planVersionId: number }) {
  return {
    contractVersion: 'construction-reconciliation/1.0.0' as const,
    fundId: context.fundId,
    currentPlanVersionId: context.planVersionId,
    financialFactsSnapshotId: context.factsSnapshotId,
  };
}

async function countReconciliationRows(fundId: number): Promise<number> {
  const result = await adminPool.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM fund_snapshots
      WHERE fund_id = $1 AND type = 'CONSTRUCTION_RECONCILIATION'
    `,
    [fundId]
  );
  return Number(result.rows[0]!.count);
}

async function reconciliationRows(
  fundId: number
): Promise<Array<{ id: number; stateHash: string | null; idempotencyKey: string | null }>> {
  const result = await adminPool.query<{
    id: number;
    state_hash: string | null;
    idempotency_key: string | null;
  }>(
    `
      SELECT id, state_hash, metadata->>'idempotencyKey' AS idempotency_key
      FROM fund_snapshots
      WHERE fund_id = $1 AND type = 'CONSTRUCTION_RECONCILIATION'
      ORDER BY id
    `,
    [fundId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    stateHash: row.state_hash,
    idempotencyKey: row.idempotency_key,
  }));
}

async function supersedeFacts(context: {
  fundId: number;
  factsSnapshotId: number;
}): Promise<number> {
  return insertFactsSnapshot(context.fundId, 'successor', context.factsSnapshotId, '11.000000');
}

async function supersedePlan(context: {
  fundId: number;
  factsSnapshotId: number;
  planVersionId: number;
}): Promise<number> {
  const successorId = await insertPlanVersion(
    context.fundId,
    context.factsSnapshotId,
    'successor',
    2,
    context.planVersionId,
    context.planVersionId
  );
  await adminPool.query(
    'UPDATE current_plan_versions SET superseded_by_version_id = $1 WHERE id = $2',
    [successorId, context.planVersionId]
  );
  await adminPool.query(
    'UPDATE current_plan_versions SET superseded_by_version_id = NULL WHERE id = $1',
    [successorId]
  );
  return successorId;
}

describe.skipIf(skipTest)('construction reconciliation real PostgreSQL behavior', () => {
  beforeAll(async () => {
    if (cloudDbUrl) {
      connectionString = cloudDbUrl;
      adminPool = new Pool({ connectionString, max: 10 });
    } else {
      const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
      container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
        .withDatabase('test_db')
        .withUsername('test_user')
        .withPassword('test_password')
        .start();
      connectionString = container.getConnectionUri();
      adminPool = new Pool({ connectionString, max: 10 });
    }

    await resetSchema();
    await runMigrationsWithConnectionString(connectionString);

    Object.assign(process.env, {
      DATABASE_URL: connectionString,
      USE_REAL_DB_IN_VITEST: '1',
    });
    delete process.env['NEON_DATABASE_URL'];
    vi.resetModules();

    modulePool = new Pool({ connectionString, max: 10 });
    moduleDb = drizzle(modulePool, { schema: combinedSchema });
    reconciliationService =
      await import('../../server/services/construction-reconciliation-service');
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await modulePool?.end();
    await adminPool?.end();
    await container?.stop();
    restoreEnvironment();
    vi.resetModules();
  }, STARTUP_TIMEOUT_MS);

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE funds RESTART IDENTITY CASCADE');
  });

  it('refuses a plan owned by another fund without persisting a snapshot', async () => {
    const first = await seedContext('wrong-fund-first');
    const second = await seedContext('wrong-fund-second');

    await expect(
      reconciliationService.runConstructionReconciliation({
        fundId: first.fundId,
        idempotencyKey: 'wrong-fund-key',
        request: {
          ...requestFor(first),
          currentPlanVersionId: second.planVersionId,
        },
        database: moduleDb,
      })
    ).rejects.toMatchObject({ code: 'FUND_SCOPE_NOT_FOUND', status: 404 });

    await expect(countReconciliationRows(first.fundId)).resolves.toBe(0);
  });

  it('refuses a superseded plan and superseded facts snapshot with zero persistence', async () => {
    const stalePlanContext = await seedContext('stale-plan');
    await supersedePlan(stalePlanContext);

    await expect(
      reconciliationService.runConstructionReconciliation({
        fundId: stalePlanContext.fundId,
        idempotencyKey: 'stale-plan-key',
        request: requestFor(stalePlanContext),
        database: moduleDb,
      })
    ).rejects.toMatchObject({ code: 'CURRENT_PLAN_VERSION_NOT_HEAD', status: 409 });
    await expect(countReconciliationRows(stalePlanContext.fundId)).resolves.toBe(0);

    const staleFactsContext = await seedContext('stale-facts');
    await supersedeFacts(staleFactsContext);

    await expect(
      reconciliationService.runConstructionReconciliation({
        fundId: staleFactsContext.fundId,
        idempotencyKey: 'stale-facts-key',
        request: requestFor(staleFactsContext),
        database: moduleDb,
      })
    ).rejects.toMatchObject({ code: 'FINANCIAL_FACTS_SNAPSHOT_NOT_CURRENT', status: 409 });
    await expect(countReconciliationRows(staleFactsContext.fundId)).resolves.toBe(0);
  });

  it('replays the same key before source validation and rejects key reuse', async () => {
    const context = await seedContext('replay');
    const request = requestFor(context);
    const first = await reconciliationService.runConstructionReconciliation({
      fundId: context.fundId,
      idempotencyKey: 'replay-key',
      request,
      database: moduleDb,
    });
    expect(first.replayed).toBe(false);

    await supersedeFacts(context);

    const replay = await reconciliationService.runConstructionReconciliation({
      fundId: context.fundId,
      idempotencyKey: 'replay-key',
      request,
      database: moduleDb,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.envelope).toEqual(first.envelope);

    await expect(
      reconciliationService.runConstructionReconciliation({
        fundId: context.fundId,
        idempotencyKey: 'replay-key',
        request: { ...request, financialFactsSnapshotId: context.factsSnapshotId + 1 },
        database: moduleDb,
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE', status: 409 });

    await expect(countReconciliationRows(context.fundId)).resolves.toBe(1);
  });

  it('resolves the current facts head when the request omits financialFactsSnapshotId', async () => {
    const context = await seedContext('resolved-facts');
    const successorFactsId = await supersedeFacts(context);
    const { financialFactsSnapshotId: _omitted, ...requestWithoutFacts } = requestFor(context);

    const outcome = await reconciliationService.runConstructionReconciliation({
      fundId: context.fundId,
      idempotencyKey: 'resolved-facts-key',
      request: requestWithoutFacts,
      database: moduleDb,
    });

    expect(outcome.replayed).toBe(false);
    expect(outcome.persisted).toBe(true);
    const metadataResult = await adminPool.query<{
      resolved: string;
      requested: string | null;
    }>(
      `
        SELECT metadata->>'financialFactsSnapshotId' AS resolved,
               metadata->>'requestedFactsSnapshotId' AS requested
        FROM fund_snapshots
        WHERE fund_id = $1 AND type = 'CONSTRUCTION_RECONCILIATION'
      `,
      [context.fundId]
    );
    expect(metadataResult.rows).toHaveLength(1);
    expect(Number(metadataResult.rows[0]!.resolved)).toBe(successorFactsId);
    expect(metadataResult.rows[0]!.requested).toBeNull();

    // Replay with the same omitted-field request still returns the stored row
    // even after facts advance again.
    await insertFactsSnapshot(
      context.fundId,
      'resolved-facts-second-successor',
      successorFactsId,
      '12.000000'
    );
    await expect(
      reconciliationService.runConstructionReconciliation({
        fundId: context.fundId,
        idempotencyKey: 'resolved-facts-key',
        request: requestWithoutFacts,
        database: moduleDb,
      })
    ).resolves.toMatchObject({ replayed: true });
    await expect(countReconciliationRows(context.fundId)).resolves.toBe(1);
  });

  it('creates one row per key for identical economic input and replays both keys', async () => {
    const context = await seedContext('distinct-keys');
    const request = requestFor(context);

    const first = await reconciliationService.runConstructionReconciliation({
      fundId: context.fundId,
      idempotencyKey: 'distinct-key-a',
      request,
      database: moduleDb,
    });
    const second = await reconciliationService.runConstructionReconciliation({
      fundId: context.fundId,
      idempotencyKey: 'distinct-key-b',
      request,
      database: moduleDb,
    });
    const rows = await reconciliationRows(context.fundId);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.idempotencyKey))).toEqual(
      new Set(['distinct-key-a', 'distinct-key-b'])
    );
    expect(new Set(rows.map((row) => row.stateHash))).toHaveLength(1);

    await expect(
      reconciliationService.runConstructionReconciliation({
        fundId: context.fundId,
        idempotencyKey: 'distinct-key-a',
        request,
        database: moduleDb,
      })
    ).resolves.toMatchObject({ replayed: true });
    await expect(
      reconciliationService.runConstructionReconciliation({
        fundId: context.fundId,
        idempotencyKey: 'distinct-key-b',
        request,
        database: moduleDb,
      })
    ).resolves.toMatchObject({ replayed: true });
    await expect(countReconciliationRows(context.fundId)).resolves.toBe(2);
  });

  it('serializes concurrent same-key writers into exactly one persisted row', async () => {
    const context = await seedContext('concurrent-same-key');
    const request = requestFor(context);

    const outcomes = await Promise.all([
      reconciliationService.runConstructionReconciliation({
        fundId: context.fundId,
        idempotencyKey: 'concurrent-same-key',
        request,
        database: moduleDb,
      }),
      reconciliationService.runConstructionReconciliation({
        fundId: context.fundId,
        idempotencyKey: 'concurrent-same-key',
        request,
        database: moduleDb,
      }),
    ]);

    expect(outcomes.filter((outcome) => !outcome.replayed)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.replayed)).toHaveLength(1);
    await expect(countReconciliationRows(context.fundId)).resolves.toBe(1);
  });

  it('serializes concurrent different-key writers into distinct rows sharing stateHash', async () => {
    const context = await seedContext('concurrent-different-keys');
    const request = requestFor(context);

    const outcomes = await Promise.all([
      reconciliationService.runConstructionReconciliation({
        fundId: context.fundId,
        idempotencyKey: 'concurrent-different-key-a',
        request,
        database: moduleDb,
      }),
      reconciliationService.runConstructionReconciliation({
        fundId: context.fundId,
        idempotencyKey: 'concurrent-different-key-b',
        request,
        database: moduleDb,
      }),
    ]);
    const rows = await reconciliationRows(context.fundId);

    expect(outcomes.every((outcome) => !outcome.replayed)).toBe(true);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.stateHash))).toHaveLength(1);
  });
});
