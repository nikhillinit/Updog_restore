/**
 * @group integration
 * @group testcontainers
 *
 * Real-PostgreSQL payload-5 consumer identity and refusal proofs.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient, type QueryConfig } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ActualsPreviewResponseV1,
  ActualsPublishRequestV1,
} from '../../shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  ACTUALS_LEDGER_TEMPLATE_HEADER,
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_HEADER,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from '../../shared/contracts/lp-reporting/actuals-pilot-templates';
import { FinancialFactsPayloadV5Schema } from '../../shared/contracts/financial-facts-snapshot-v1.contract';
import { combinedSchema } from '../../server/db-schema';
import type {
  PublishConnection,
  PublishQueryResult,
} from '../../server/services/lp-reporting/actuals-pilot-publish-service';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';
import { mintCurrentPlanVersion } from '../../server/services/current-plan-version-service';
import {
  runCurrentForecastV2WithReceipt,
  type CurrentForecastV2ServiceError,
} from '../../server/services/current-forecast-v2-service';
import {
  createDynamicReserveIntelligenceRun,
  type DynamicReserveIntelligenceDependencies,
  type DynamicReserveIntelligenceServiceError,
} from '../../server/services/reserves/dynamic-reserve-intelligence-service';
import { runConstructionReconciliation } from '../../server/services/construction-reconciliation-service';
import {
  getFinancialFactsSnapshotById,
  getLatestFinancialFactsSnapshot,
} from '../../server/services/financial-facts-snapshot-service';
import { parsePersistedFactsRow } from '../../server/services/financial-facts/parse-persisted-facts-row';
import { projectActualMetricsV2 } from '../../server/services/actual-metrics-v2-projector';
import {
  executeLpEconomicsRun,
  type LpEconomicsRunServiceError,
} from '../../server/services/internal-economics/lp-economics-run-service';
import {
  createAnalysisCheckpointPorts,
  createDraftForPeriod,
  type AnalysisCheckpointServiceError,
} from '../../server/services/internal-analysis/analysis-checkpoint-service';
import { quarterPeriod } from '../../shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import type {
  PinnedMarginalReserveNonFactsSourcesV1,
  PinnedReserveEnvelopeSourcesV1,
} from '../../shared/contracts/dynamic-reserve-intelligence-v1.contract';

const STARTUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 30_000;
const runDocker =
  process.env['RUN_DOCKER_ACTUALS_PILOT_PUBLISH'] === '1' ||
  process.env['CI'] === '1' ||
  process.env['CI'] === 'true';

type PreviewModule =
  typeof import('../../server/services/lp-reporting/actuals-pilot-preview-service');
type PublishModule =
  typeof import('../../server/services/lp-reporting/actuals-pilot-publish-service');
type QueryInterceptor = (
  sql: string,
  params: readonly unknown[] | undefined,
  next: () => Promise<PublishQueryResult>,
  execute: (sql: string, params?: readonly unknown[]) => Promise<PublishQueryResult>
) => Promise<PublishQueryResult>;

interface SeededPilot {
  fundId: number;
  actorId: number;
  vehicleId: number;
  companyId: number;
}

interface PublishFixture {
  request: ActualsPublishRequestV1;
  ifMatch: '"financial-facts:none"' | `"financial-facts:${number}:${string}"`;
  idempotencyKey: string;
}

let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer | undefined;
let adminPool: Pool;
let publisherPool: Pool;
let previewDb: ReturnType<typeof drizzle<typeof combinedSchema>>;
let previewModule: PreviewModule;
let publishModule: PublishModule;
let globalModulePool: { end?: () => Promise<void> } | undefined;
let connectionString = '';
let seeded: SeededPilot;

const originalEnv = {
  DATABASE_URL: process.env['DATABASE_URL'],
  NEON_DATABASE_URL: process.env['NEON_DATABASE_URL'],
  USE_REAL_DB_IN_VITEST: process.env['USE_REAL_DB_IN_VITEST'],
  ACTUALS_PILOT_FUND_ID: process.env['ACTUALS_PILOT_FUND_ID'],
};

function restoreEnvironment(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function resetSchema(): Promise<void> {
  await adminPool.query('DROP EXTENSION IF EXISTS vector CASCADE');
  await adminPool.query('DROP EXTENSION IF EXISTS pgcrypto CASCADE');
  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool.query('CREATE SCHEMA public');
  await adminPool.query('GRANT ALL ON SCHEMA public TO public');
  await adminPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
  await adminPool.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
}

async function seedPilot(): Promise<SeededPilot> {
  const fund = await adminPool.query<{ id: number }>(`
    INSERT INTO funds (
      name, size, management_fee, carry_percentage, vintage_year, status,
      is_active, base_currency, data_origin
    )
    VALUES ('Actuals publish PG fund', 1000000.00, 0.0200, 0.2000, 2026,
      'active', true, 'USD', 'production')
    RETURNING id
  `);
  const fundId = fund.rows[0]!.id;
  const actor = await adminPool.query<{ id: number }>(`
    INSERT INTO users (username, password, role, is_active, is_release_canary_principal)
    VALUES ('actuals-pg-admin', 'x', 'admin', true, false)
    RETURNING id
  `);
  const actorId = actor.rows[0]!.id;
  await adminPool.query('INSERT INTO user_fund_grants (user_id, fund_id) VALUES ($1, $2)', [
    actorId,
    fundId,
  ]);
  const vehicle = await adminPool.query<{ id: number }>(
    `
      INSERT INTO vehicles (
        fund_id, vehicle_slug, vehicle_type, name, committed_capital,
        currency, inception_date, status
      )
      VALUES ($1, 'main', 'main_fund', 'Main fund', 1000000.000000,
        'USD', '2026-01-01', 'active')
      RETURNING id
    `,
    [fundId]
  );
  const vehicleId = vehicle.rows[0]!.id;
  const company = await adminPool.query<{ id: number }>(
    `
      INSERT INTO portfoliocompanies (
        fund_id, name, sector, stage, investment_amount, status
      )
      VALUES ($1, 'Acme Labs', 'Technology', 'Seed', 0.00, 'active')
      RETURNING id
    `,
    [fundId]
  );
  const companyId = company.rows[0]!.id;

  process.env['ACTUALS_PILOT_FUND_ID'] = String(fundId);
  return { fundId, actorId, vehicleId, companyId };
}

function csv(header: string, rows: readonly (readonly string[])[]): Buffer {
  return Buffer.from(`${[header, ...rows.map((row) => row.join(','))].join('\n')}\n`);
}

async function previewFile(
  templateVersion:
    typeof ACTUALS_LEDGER_TEMPLATE_VERSION | typeof ACTUALS_VALUATION_TEMPLATE_VERSION,
  fileName: string,
  payload: Buffer,
  asOfDate = '2026-03-31'
): Promise<ActualsPreviewResponseV1> {
  return previewModule.previewActualsPilot(
    {
      fundId: seeded.fundId,
      request: {
        contractVersion: 'actuals-preview-request/1.0.0',
        templateVersion,
        asOfDate,
        fileName,
        payload: payload.toString('base64'),
      },
    },
    { database: previewDb }
  );
}

async function publishFixture(
  overrides: {
    idempotencyKey?: string;
    evidenceNote?: string;
    ledgerRows?: readonly (readonly string[])[];
    valuationRows?: readonly (readonly string[])[] | null;
    asOfDate?: string;
    coverage?: ActualsPublishRequestV1['coverage'];
    ifMatch?: PublishFixture['ifMatch'];
  } = {}
): Promise<PublishFixture> {
  const asOfDate = overrides.asOfDate ?? '2026-03-31';
  const ledgerPayload = csv(
    ACTUALS_LEDGER_TEMPLATE_HEADER,
    overrides.ledgerRows ?? [
      [
        'settled_contribution',
        '2026-03-01',
        '100000.00',
        'USD',
        '',
        'main',
        '',
        'Capital call',
        '',
        '',
        '',
        'pg-contribution-1',
      ],
      [
        'portfolio_investment',
        '2026-03-15',
        '40000.00',
        'USD',
        'Acme Labs',
        'main',
        'initial',
        'Initial investment',
        '',
        '',
        '',
        'pg-investment-1',
      ],
    ]
  );
  const valuationRows =
    overrides.valuationRows === undefined
      ? [
          [
            'Acme Labs',
            'main',
            asOfDate,
            '55000.00',
            'USD',
            'board_update',
            'high',
            'manual',
            '40000.00',
            'pg-valuation-1',
          ],
        ]
      : overrides.valuationRows;
  const valuationPayload =
    valuationRows === null ? null : csv(ACTUALS_VALUATION_TEMPLATE_HEADER, valuationRows);
  const ledger = await previewFile(
    ACTUALS_LEDGER_TEMPLATE_VERSION,
    'actuals-ledger.csv',
    ledgerPayload,
    asOfDate
  );
  const valuation =
    valuationPayload === null
      ? null
      : await previewFile(
          ACTUALS_VALUATION_TEMPLATE_VERSION,
          'actuals-valuation.csv',
          valuationPayload,
          asOfDate
        );
  expect(ledger.rowCounts.invalid).toBe(0);
  expect(valuation?.rowCounts.invalid ?? 0).toBe(0);

  return {
    idempotencyKey: overrides.idempotencyKey ?? '10000000-0000-4000-8000-000000000001',
    ifMatch: overrides.ifMatch ?? '"financial-facts:none"',
    request: {
      contractVersion: 'actuals-pilot-publish/1.0.0',
      asOfDate,
      ledger: {
        templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
        fileName: 'actuals-ledger.csv',
        payload: ledgerPayload.toString('base64'),
        expectedPayloadSha256: ledger.payloadSha256,
        expectedCanonicalRowsHash: ledger.canonicalRowsHash,
        expectedPreviewHash: ledger.previewHash,
      },
      valuation:
        valuationPayload === null || valuation === null
          ? null
          : {
              templateVersion: ACTUALS_VALUATION_TEMPLATE_VERSION,
              fileName: 'actuals-valuation.csv',
              payload: valuationPayload.toString('base64'),
              expectedPayloadSha256: valuation.payloadSha256,
              expectedCanonicalRowsHash: valuation.canonicalRowsHash,
              expectedPreviewHash: valuation.previewHash,
            },
      coverage: overrides.coverage ?? {
        ledger: 'inception_to_date',
        priorFactsSnapshotId: null,
        evidenceNote: overrides.evidenceNote ?? 'Real PostgreSQL publication proof.',
      },
    },
  };
}

async function publish(
  fixture: PublishFixture,
  options: Parameters<PublishModule['publishActualsPilot']>[1] = {}
) {
  return publishModule.publishActualsPilot(
    {
      fundId: seeded.fundId,
      actorId: seeded.actorId,
      idempotencyKey: fixture.idempotencyKey,
      ifMatch: fixture.ifMatch,
      request: fixture.request,
      requestId: 'req_actuals_pg',
    },
    {
      connect: connectWith(() => async (_text, _params, next) => next()),
      invalidateAfterCommit: async () => undefined,
      ...options,
    }
  );
}

function wrapClient(
  client: PoolClient,
  intercept: QueryInterceptor,
  onRelease?: (destroy?: boolean) => void
): PublishConnection {
  return {
    async query(query: string | QueryConfig, params?: readonly unknown[]) {
      const text = typeof query === 'string' ? query : query.text;
      const values = params ?? (typeof query === 'string' ? undefined : query.values);
      return intercept(
        text,
        values,
        () =>
          (typeof query === 'string'
            ? client.query(query, params as unknown[])
            : client.query({
                ...query,
                values: values as unknown[],
              })) as Promise<PublishQueryResult>,
        (statement, statementParams) =>
          client.query(statement, statementParams as unknown[]) as Promise<PublishQueryResult>
      );
    },
    release(destroy) {
      onRelease?.(destroy);
      client.release(destroy);
    },
  } as PublishConnection;
}

function connectWith(
  makeInterceptor: (connectionNumber: number) => QueryInterceptor,
  onRelease?: (destroy?: boolean) => void
): () => Promise<PublishConnection> {
  let connectionNumber = 0;
  return async () => {
    const client = await publisherPool.connect();
    connectionNumber += 1;
    return wrapClient(client, makeInterceptor(connectionNumber), onRelease);
  };
}

async function resetPilot(): Promise<void> {
  await adminPool.query('TRUNCATE TABLE funds, users RESTART IDENTITY CASCADE');
  seeded = await seedPilot();
}

const PUBLISHED_CONFIG = {
  fundName: 'PG-10 Fund',
  fundSize: 1_000_000,
  fundLife: 10,
  capitalPlanAllocations: [
    {
      id: 'seed',
      name: 'Seed',
      entryRound: 'Seed',
      capitalAllocationPct: 1,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 100_000,
      followOnStrategy: 'amount',
      followOnAmount: 200_000,
      followOnParticipationPct: 0.25,
      investmentHorizonMonths: 24,
    },
  ],
  economicsAssumptions: {
    version: 'v1',
    feeModel: {
      source: 'economics_override',
      tiers: [
        {
          id: 'management-fee',
          name: 'Management fee',
          rate: 0.02,
          basis: 'committed_capital',
          startYear: 1,
          endYear: 10,
        },
      ],
    },
  },
};

async function seedPublishedConfig(): Promise<void> {
  await adminPool.query(
    `INSERT INTO fundconfigs
       (fund_id, version, config, is_draft, is_published, published_at)
     VALUES ($1, 1, $2::jsonb, false, true, now())`,
    [seeded.fundId, JSON.stringify(PUBLISHED_CONFIG)]
  );
  await adminPool.query(
    `INSERT INTO investments
       (fund_id, company_id, investment_date, amount, round, ownership_percentage)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      seeded.fundId,
      seeded.companyId,
      new Date('2026-03-15T00:00:00.000Z'),
      '40000.00',
      'seed',
      '0.1250',
    ]
  );
}

function nonFactsSources(companyId: number): PinnedMarginalReserveNonFactsSourcesV1 {
  return {
    sourceSnapshotDate: '2026-03-31',
    baseCurrency: 'USD',
    companies: [
      {
        companyId,
        stage: 'Seed',
        currentStage: 'Seed',
        sector: 'Technology',
        currentOwnership: '0.125',
        plannedReservesCents: '100000000',
        allocationVersion: 1,
      },
    ],
    approvedAllocations: [
      {
        companyId,
        decisionType: 'follow_on',
        decisionStatus: 'approved',
        finalPlannedReservesCents: '100000000',
        liveAllocationVersion: 1,
        decidedAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
    ],
    publishedAssumptions: {
      configId: 1,
      version: 1,
      publishedAt: '2026-03-30T00:00:00.000Z',
      config: PUBLISHED_CONFIG,
    },
  };
}

function envelopeSources(): PinnedReserveEnvelopeSourcesV1 {
  return {
    fund: {
      sizeDollars: '1000000',
      deployedCapitalDollars: '40000',
      managementFeeRate: '0.02',
      baseCurrency: 'USD',
    },
    investments: [],
    config: {
      fundLifeYears: 10,
      expenses: [{ monthlyAmountDollars: 0, startMonth: 0, endMonth: 120 }],
      recyclingEnabled: true,
      recyclingCapDollars: 0.01,
    },
  };
}

function reserveDependencies(
  mode: 'shadow' | 'on' = 'on'
): Partial<DynamicReserveIntelligenceDependencies> {
  return {
    database: previewDb,
    clock: () => new Date('2026-03-31T12:00:00.000Z'),
    randomId: () => '00000000-0000-4000-8000-000000000014',
    getFundMoicRankingSources: vi.fn().mockResolvedValue({ source: 'pg-10-mode-sources' }),
    resolveFundCalculationMode: vi.fn().mockResolvedValue({
      effectiveMode: mode,
      killSwitchActive: false,
    }),
    buildRoundsToModelEvidence: vi.fn().mockResolvedValue({ coverage: {} }),
    resolveMoicActionability: vi.fn().mockResolvedValue({
      actionability: 'actionable',
      sourceFingerprint: {
        moicSourceInputHash: 'a'.repeat(64),
        roundEvidenceInputHash: 'b'.repeat(64),
        roundEvidenceAssumptionsHash: 'c'.repeat(64),
        fingerprintHash: 'd'.repeat(64),
        policyVersion: 'h9-policy-v1',
      },
    }),
    loadMarginalReserveInputSources: vi.fn().mockImplementation(async (_input, options) => ({
      ...nonFactsSources(seeded.companyId),
      facts: options.facts,
      approvedAllocations: nonFactsSources(seeded.companyId).approvedAllocations.map(
        (allocation) => ({
          ...allocation,
          decidedAt: allocation.decidedAt === null ? null : new Date(allocation.decidedAt),
          updatedAt: new Date(allocation.updatedAt),
        })
      ),
      publishedAssumptions: {
        ...nonFactsSources(seeded.companyId).publishedAssumptions,
        publishedAt: new Date('2026-03-30T00:00:00.000Z'),
      },
    })),
    loadReserveEnvelopeSources: vi.fn().mockResolvedValue(envelopeSources()),
  };
}

async function seedEconomicsPolicy(plan: { sourceConfigId: number; sourceConfigVersion: number }) {
  const artifact = await adminPool.query<{ id: number }>(
    'SELECT id FROM source_artifacts WHERE fund_id = $1 ORDER BY id LIMIT 1',
    [seeded.fundId]
  );
  const envelope = await adminPool.query<{ id: number }>(
    `INSERT INTO internal_capital_envelope_versions (
       fund_id, version, main_fund_vehicle_id, lp_commitment_usd, gp_commitment_usd,
       total_commitment_usd, currency, effective_at, source_artifact_id,
       source_config_id, source_config_version, source_config_hash, attested_by,
       attested_at, envelope_hash, idempotency_key, request_hash
     ) VALUES (
       $1, 1, $2, '1000000.000000', '0.000000', '1000000.000000', 'USD',
       '2026-03-31T12:00:00.000Z', $3, $4, $5, $6, $7,
       '2026-03-31T12:00:00.000Z', $8, 'payload5-envelope-1', $9
     ) RETURNING id`,
    [
      seeded.fundId,
      seeded.vehicleId,
      artifact.rows[0]!.id,
      plan.sourceConfigId,
      plan.sourceConfigVersion,
      '1'.repeat(64),
      seeded.actorId,
      '2'.repeat(64),
      '3'.repeat(64),
    ]
  );
  const policy = await adminPool.query<{ id: number }>(
    `INSERT INTO internal_economics_policy_versions (
       fund_id, version, policy_schema_version, policy_body, normalization_warnings,
       terminal_period_end, terminal_resolution_methodology_version,
       capital_envelope_version_id, assumptions_hash, source_config_id,
       source_config_version, created_by, idempotency_key, request_hash
     ) VALUES (
       $1, 1, 'internal-economics-policy/1.0.0', $2::jsonb, '[]'::jsonb,
       '2036-03-31', 'internal-economics-terminal-resolution/1.0.0',
       $3, $4, $5, $6, $7, 'payload5-policy-1', $8
     ) RETURNING id`,
    [
      seeded.fundId,
      JSON.stringify({
        waterfallTemplate: 'deal_by_deal',
        carryPct: 0.2,
        hurdle: { basis: 'none' },
        managementFeesUsd: '0.000000',
        fundExpenses: [],
        cashBufferQuarters: 0,
        terminalMode: 'hold_unrealized',
        termStartDate: '2026-01-01',
        fundLifeYears: '10',
      }),
      envelope.rows[0]!.id,
      '4'.repeat(64),
      plan.sourceConfigId,
      plan.sourceConfigVersion,
      seeded.actorId,
      '5'.repeat(64),
    ]
  );
  return policy.rows[0]!.id;
}

async function parsedUnsupportedReason(snapshotId: number): Promise<string | undefined> {
  const selected = await getFinancialFactsSnapshotById({
    fundId: seeded.fundId,
    snapshotId,
    database: previewDb,
  });
  if (selected === null) return undefined;
  const parsed = parsePersistedFactsRow(selected);
  if (parsed.kind !== 'facts') return undefined;
  return parsed.snapshot.consumerEvaluations.find(
    (evaluation) => evaluation.consumer === 'periodic_analysis'
  )?.reasons[0];
}

describe.skipIf(!runDocker)('payload-5 PostgreSQL consumer proofs', () => {
  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('payload5_consumers_test')
      .withUsername('payload5_consumers_user')
      .withPassword('payload5_consumers_password')
      .start();
    connectionString = container.getConnectionUri();
    adminPool = new Pool({ connectionString, max: 12 });
    await resetSchema();
    await runMigrationsWithConnectionString(connectionString);
    Object.assign(process.env, {
      DATABASE_URL: connectionString,
      USE_REAL_DB_IN_VITEST: '1',
    });
    delete process.env['NEON_DATABASE_URL'];
    vi.resetModules();
    previewModule =
      await import('../../server/services/lp-reporting/actuals-pilot-preview-service');
    publishModule =
      await import('../../server/services/lp-reporting/actuals-pilot-publish-service');
    globalModulePool = (await import('../../server/db')).pool as { end?: () => Promise<void> };
    publisherPool = new Pool({ connectionString, max: 12 });
    previewDb = drizzle(publisherPool, { schema: combinedSchema });
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await publisherPool?.end();
    await globalModulePool?.end?.();
    await adminPool?.end();
    await container?.stop();
    restoreEnvironment();
    vi.resetModules();
  }, STARTUP_TIMEOUT_MS);

  beforeEach(async () => {
    await resetPilot();
    await seedPublishedConfig();
  });

  it(
    'propagates one publisher-created payload-5 basis through supported persisted consumers',
    async () => {
      const fixture = await publishFixture({
        ledgerRows: [
          [
            'settled_contribution',
            '2026-03-01',
            '100000.00',
            'USD',
            '',
            'main',
            '',
            'Capital call',
            '',
            '',
            '',
            'pg-contribution-1',
          ],
          [
            'portfolio_investment',
            '2026-03-15',
            '40000.00',
            'USD',
            'Acme Labs',
            'main',
            'initial',
            'Initial investment',
            '',
            '',
            '',
            'pg-investment-1',
          ],
          [
            'lp_distribution',
            '2026-03-20',
            '5000.00',
            'USD',
            '',
            'main',
            '',
            'Partner distribution',
            '',
            'return_of_capital',
            'false',
            'pg-distribution-1',
          ],
        ],
      });
      const created = await publish(fixture, {
        now: () => new Date('2026-03-31T12:00:00.000Z'),
      });
      expect(created.statusCode).toBe(201);

      const snapshotId = created.receipt.facts.snapshotId;
      const latest = await getLatestFinancialFactsSnapshot({
        fundId: seeded.fundId,
        database: previewDb,
      });
      const selected = await getFinancialFactsSnapshotById({
        fundId: seeded.fundId,
        snapshotId,
        database: previewDb,
      });
      expect(latest).not.toBeNull();
      expect(selected).not.toBeNull();
      expect(latest).toMatchObject({
        id: snapshotId,
        policyVersion: 'financial-facts-policy/1.4.0',
        payloadSchemaId: 'financial-facts-payload/5',
        snapshotInputHash: created.receipt.basisRef.snapshotInputHash,
        sourceFactsInputHash: created.receipt.basisRef.sourceFactsInputHash,
      });
      expect(selected).toEqual(latest);

      const parsed = parsePersistedFactsRow(latest!);
      expect(parsed.kind).toBe('facts');
      if (parsed.kind !== 'facts') throw new Error('Expected supported payload-5 facts.');
      expect(
        FinancialFactsPayloadV5Schema.parse(parsed.snapshot.payload).capitalActuals
          .distributionsToPartners.value
      ).toBe('5000.000000');
      const reserveEvaluation = parsed.snapshot.consumerEvaluations.find(
        (evaluation) => evaluation.consumer === 'reserve'
      );
      expect(reserveEvaluation).toEqual(
        expect.objectContaining({ status: 'accepted', reasons: [] })
      );
      const metrics = projectActualMetricsV2(parsed.snapshot);
      expect(metrics).toMatchObject({
        performancePerspective: 'fund_net_to_partners',
        value: { distributionsToPartners: { value: '5000.000000' } },
        financialFactsSnapshotId: snapshotId,
        snapshotInputHash: created.receipt.basisRef.snapshotInputHash,
      });

      const plan = await mintCurrentPlanVersion({
        fundId: seeded.fundId,
        idempotencyKey: '20000000-0000-4000-8000-000000000001',
        actorId: seeded.actorId,
        database: previewDb,
      });
      expect(plan.sourceFactsSnapshotId).toBe(String(snapshotId));

      const forecast = await runCurrentForecastV2WithReceipt({
        fundId: seeded.fundId,
        currentPlanVersionId: plan.id,
        financialFactsSnapshotId: String(snapshotId),
        clock: '2026-03-31T12:00:00.000Z',
        database: previewDb,
      });
      const reserve = await createDynamicReserveIntelligenceRun({
        fundId: seeded.fundId,
        financialFactsSnapshotId: snapshotId,
        overlay: [{ companyId: seeded.companyId, plannedReserveCents: 70_00 }],
        idempotencyKey: 'payload5-reserve-on-1',
        actorId: seeded.actorId,
        dependencies: reserveDependencies('on'),
      });
      const shadowReserve = await createDynamicReserveIntelligenceRun({
        fundId: seeded.fundId,
        financialFactsSnapshotId: snapshotId,
        overlay: [{ companyId: seeded.companyId, plannedReserveCents: 70_00 }],
        idempotencyKey: 'payload5-reserve-shadow-1',
        actorId: seeded.actorId,
        dependencies: reserveDependencies('shadow'),
      });
      const construction = await runConstructionReconciliation({
        fundId: seeded.fundId,
        idempotencyKey: 'payload5-construction-1',
        request: {
          contractVersion: 'construction-reconciliation/1.0.0',
          fundId: seeded.fundId,
          currentPlanVersionId: Number(plan.id),
          financialFactsSnapshotId: snapshotId,
        },
        database: previewDb,
      });

      expect(forecast.result.basisRef).toEqual(created.receipt.basisRef);
      expect(reserve.result.basisRef).toEqual(created.receipt.basisRef);
      expect(shadowReserve.result.basisRef).toEqual(created.receipt.basisRef);
      expect(construction.envelope.result.basisRef).toEqual(created.receipt.basisRef);
      expect(construction.persisted).toBe(true);

      const persisted = await adminPool.query<{ type: string; payload: Record<string, unknown> }>(
        `SELECT type, payload
           FROM fund_snapshots
          WHERE fund_id = $1
            AND type IN ('CURRENT_FORECAST_V2', 'RESERVE_INTELLIGENCE', 'CONSTRUCTION_RECONCILIATION')
          ORDER BY id`,
        [seeded.fundId]
      );
      expect(persisted.rows).toHaveLength(4);
      expect(persisted.rows.map((row) => row.type)).toEqual([
        'CURRENT_FORECAST_V2',
        'RESERVE_INTELLIGENCE',
        'RESERVE_INTELLIGENCE',
        'CONSTRUCTION_RECONCILIATION',
      ]);
      for (const row of persisted.rows) {
        expect(row.payload['basisRef'], row.type).toEqual(created.receipt.basisRef);
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'rejects a forecast when the current facts head succeeds the plan facts head',
    async () => {
      const headA = await publish(await publishFixture(), {
        now: () => new Date('2026-03-31T12:00:00.000Z'),
      });
      const planA = await mintCurrentPlanVersion({
        fundId: seeded.fundId,
        idempotencyKey: '20000000-0000-4000-8000-000000000002',
        actorId: seeded.actorId,
        database: previewDb,
      });
      const headB = await publish(
        await publishFixture({
          idempotencyKey: '10000000-0000-4000-8000-000000000002',
          ifMatch: headA.receipt.facts.etag,
          coverage: {
            ledger: 'inception_to_date',
            priorFactsSnapshotId: headA.receipt.facts.snapshotId,
            evidenceNote: 'Successor facts head for current-plan mismatch proof.',
          },
          ledgerRows: [
            [
              'settled_contribution',
              '2026-03-01',
              '100000.00',
              'USD',
              '',
              'main',
              '',
              'Capital call',
              '',
              '',
              '',
              'pg-contribution-1',
            ],
            [
              'portfolio_investment',
              '2026-03-15',
              '40000.00',
              'USD',
              'Acme Labs',
              'main',
              'initial',
              'Initial investment',
              '',
              '',
              '',
              'pg-investment-1',
            ],
            [
              'lp_distribution',
              '2026-03-20',
              '1.00',
              'USD',
              '',
              'main',
              '',
              'Successor partner distribution',
              '',
              'return_of_capital',
              'false',
              'pg-successor-distribution-1',
            ],
          ],
        }),
        { now: () => new Date('2026-03-31T12:01:00.000Z') }
      );

      await expect(
        runCurrentForecastV2WithReceipt({
          fundId: seeded.fundId,
          currentPlanVersionId: planA.id,
          financialFactsSnapshotId: String(headB.receipt.facts.snapshotId),
          clock: '2026-03-31T12:02:00.000Z',
          database: previewDb,
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'CURRENT_FORECAST_BASIS_MISMATCH',
        basisMismatchCode: 'PLAN_FACTS_HEAD_MISMATCH',
      } satisfies Partial<CurrentForecastV2ServiceError>);
      const count = await adminPool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM fund_snapshots WHERE fund_id = $1`,
        [seeded.fundId]
      );
      expect(count.rows[0]?.count).toBe('0');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'blocks forecast and reserve persistence when payload-5 valuation is incomplete',
    async () => {
      const created = await publish(
        await publishFixture({
          valuationRows: null,
        }),
        { now: () => new Date('2026-03-31T12:00:00.000Z') }
      );
      const plan = await mintCurrentPlanVersion({
        fundId: seeded.fundId,
        idempotencyKey: '20000000-0000-4000-8000-000000000003',
        actorId: seeded.actorId,
        database: previewDb,
      });

      await expect(
        runCurrentForecastV2WithReceipt({
          fundId: seeded.fundId,
          currentPlanVersionId: plan.id,
          financialFactsSnapshotId: String(created.receipt.facts.snapshotId),
          clock: '2026-03-31T12:02:00.000Z',
          database: previewDb,
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'FACTS_FORECAST_EVALUATION_BLOCKED',
      } satisfies Partial<CurrentForecastV2ServiceError>);
      await expect(
        createDynamicReserveIntelligenceRun({
          fundId: seeded.fundId,
          financialFactsSnapshotId: created.receipt.facts.snapshotId,
          idempotencyKey: 'payload5-reserve-blocked-1',
          actorId: seeded.actorId,
          dependencies: reserveDependencies('shadow'),
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'FACTS_RESERVE_EVALUATION_BLOCKED',
      } satisfies Partial<DynamicReserveIntelligenceServiceError>);
      const count = await adminPool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM fund_snapshots WHERE fund_id = $1`,
        [seeded.fundId]
      );
      expect(count.rows[0]?.count).toBe('0');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'refuses payload-5 economics and periodic analysis without persisting dependent rows',
    async () => {
      const created = await publish(await publishFixture(), {
        now: () => new Date('2026-03-31T12:00:00.000Z'),
      });
      const plan = await mintCurrentPlanVersion({
        fundId: seeded.fundId,
        idempotencyKey: '20000000-0000-4000-8000-000000000004',
        actorId: seeded.actorId,
        database: previewDb,
      });
      const forecast = await runCurrentForecastV2WithReceipt({
        fundId: seeded.fundId,
        currentPlanVersionId: plan.id,
        financialFactsSnapshotId: String(created.receipt.facts.snapshotId),
        clock: '2026-03-31T12:00:00.000Z',
        database: previewDb,
      });
      const policyVersionId = await seedEconomicsPolicy(plan);

      await expect(
        executeLpEconomicsRun({
          fundId: seeded.fundId,
          actorId: seeded.actorId,
          idempotencyKey: 'payload5-economics-unsupported-1',
          request: {
            policyVersionId,
            factsSnapshotId: created.receipt.facts.snapshotId,
            planVersionId: Number(plan.id),
            forecastSnapshotId: forecast.fundSnapshotId,
            terminalMode: 'hold_unrealized',
            clock: '2026-03-31T12:00:00.000Z',
          },
          database: previewDb,
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'UNSUPPORTED_FACTS_POLICY',
      } satisfies Partial<LpEconomicsRunServiceError>);

      const ports = createAnalysisCheckpointPorts(previewDb);
      await expect(
        createDraftForPeriod(ports, {
          fundId: seeded.fundId,
          period: quarterPeriod(2026, 1),
          actorId: seeded.actorId,
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'UNSUPPORTED_FACTS_POLICY',
      } satisfies Partial<AnalysisCheckpointServiceError>);
      expect(parsedUnsupportedReason(created.receipt.facts.snapshotId)).resolves.toEqual(
        'unsupported_payload_policy'
      );

      const counts = await adminPool.query<{
        economics_runs: string;
        analysis_drafts: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM internal_lp_economics_runs WHERE fund_id = $1) AS economics_runs,
           (SELECT count(*)::text FROM internal_analysis_drafts WHERE fund_id = $1) AS analysis_drafts`,
        [seeded.fundId]
      );
      expect(counts.rows[0]).toEqual({ economics_runs: '0', analysis_drafts: '0' });
    },
    TEST_TIMEOUT_MS
  );
});
