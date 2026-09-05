/**
 * @group integration
 * @group testcontainers
 *
 * Real-PostgreSQL proofs for actuals-pilot publication atomicity, replay,
 * authorization, serialization, and unknown-COMMIT recovery.
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
import { combinedSchema } from '../../server/db-schema';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import type {
  PublishConnection,
  PublishQueryResult,
} from '../../server/services/lp-reporting/actuals-pilot-publish-service';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

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

async function tableCounts(): Promise<Record<string, number>> {
  const tables = await adminPool.query<{ tablename: string }>(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  const counts: Record<string, number> = {};
  for (const { tablename } of tables.rows) {
    const quoted = `"${tablename.replace(/"/g, '""')}"`;
    const result = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${quoted}`
    );
    counts[tablename] = Number(result.rows[0]!.count);
  }
  return counts;
}

function expectOnlyPublisherTablesChanged(
  before: Record<string, number>,
  after: Record<string, number>
): void {
  const allowed = new Set([
    'source_artifacts',
    'cash_flow_events',
    'valuation_marks',
    'financial_facts_snapshots',
  ]);
  for (const [table, count] of Object.entries(before)) {
    if (!allowed.has(table)) expect(after[table], table).toBe(count);
  }
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

function advisoryBarrierConnect(): () => Promise<PublishConnection> {
  let arrivals = 0;
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  return connectWith(() => async (text, _params, next) => {
    if (text.includes('pg_advisory_xact_lock')) {
      arrivals += 1;
      if (arrivals === 2) releaseBarrier();
      await barrier;
    }
    return next();
  });
}

async function resetPilot(): Promise<void> {
  await adminPool.query('TRUNCATE TABLE funds, users RESTART IDENTITY CASCADE');
  seeded = await seedPilot();
}

function pgError(code: '40001' | '40P01', message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe.skipIf(!runDocker)('actuals-pilot publisher PostgreSQL schedules', () => {
  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('actuals_publish_test')
      .withUsername('actuals_publish_user')
      .withPassword('actuals_publish_password')
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
    globalModulePool = (await import('../../server/db')).pool as {
      end?: () => Promise<void>;
    };
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
  });

  it(
    'PG-1 keeps UTC cutoff admission and persisted identity stable from a non-UTC session',
    async () => {
      const sourceExternalRef = 'pg-future-utc-cutoff';
      const sourceHash = previewModule.computeActualsPilotRowSourceHash(
        seeded.fundId,
        sourceExternalRef
      );
      const rowContentHash = previewModule.computeActualsPilotRowContentHash({
        templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
        rowSourceHash: sourceHash,
        canonicalEconomicFields: {
          eventType: 'lp_distribution',
          effectiveDate: '2026-04-01',
          amount: '999.000000',
          currency: 'USD',
          deploymentCategory: null,
          description: 'Future UTC event',
          expenseCategory: null,
          distributionType: 'gain',
          recallable: false,
        },
        resolvedCompanyId: null,
        resolvedVehicleId: seeded.vehicleId,
      });
      const future = await adminPool.query<{ id: number }>(
        `INSERT INTO cash_flow_events (
           fund_id, vehicle_id, company_id, event_type, amount, currency,
           event_date, perspective, description, payload, status, imported_from,
           source_hash, created_by
         ) VALUES (
           $1, $2, NULL, 'lp_distribution', 999.000000, 'USD',
           '2026-04-01T00:30:00.000Z', 'lp_net', 'Future UTC event', $3::jsonb,
           'approved', 'actuals_pilot_v1', $4, $5
         )
         RETURNING id`,
        [
          seeded.fundId,
          seeded.vehicleId,
          JSON.stringify({
            contractVersion: 'actuals-pilot-cash-flow/1.0.0',
            sourceExternalRef,
            rowContentHash,
            templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
            settlementStatus: null,
            deploymentCategory: null,
            expenseCategory: null,
            distributionType: 'gain',
            recallable: false,
          }),
          sourceHash,
          seeded.actorId,
        ]
      );
      const futureRowId = future.rows[0]!.id;
      const fixture = await publishFixture();
      let sawTransactionUtc = false;
      const connect = connectWith(() => {
        let sessionInitialized = false;
        return async (text, _params, next, execute) => {
          if (!sessionInitialized) {
            sessionInitialized = true;
            await execute(`SET TIME ZONE 'America/Los_Angeles'`);
          }
          if (/SET LOCAL TIME ZONE 'UTC'/i.test(text)) {
            sawTransactionUtc = true;
          }
          return next();
        };
      });
      const created = await publish(fixture, {
        connect,
        now: () => new Date('2026-03-31T12:00:00.000Z'),
      });

      expect(sawTransactionUtc).toBe(true);
      expect(created.statusCode).toBe(201);
      expect(created.receipt.admitted.ledger.approvedRowIds).not.toContain(futureRowId);

      const reader = await publisherPool.connect();
      try {
        const readAtZone = async (timeZone: string) => {
          await reader.query(`SET TIME ZONE '${timeZone}'`);
          const result = await reader.query<{
            sourceFactsInputHash: string;
            snapshotInputHash: string;
            knowledgeCutoff: Date;
            payload: Record<string, unknown>;
          }>(
            `SELECT
               source_facts_input_hash AS "sourceFactsInputHash",
               snapshot_input_hash AS "snapshotInputHash",
               knowledge_cutoff AS "knowledgeCutoff",
               payload
             FROM financial_facts_snapshots
             WHERE id = $1`,
            [created.receipt.facts.snapshotId]
          );
          const row = result.rows[0]!;
          return {
            sourceFactsInputHash: row.sourceFactsInputHash,
            snapshotInputHash: row.snapshotInputHash,
            knowledgeCutoff: row.knowledgeCutoff.toISOString(),
            payload: row.payload,
          };
        };
        const utcRead = await readAtZone('UTC');
        const nonUtcRead = await readAtZone('America/Los_Angeles');

        expect(nonUtcRead).toEqual(utcRead);
        const receiptCore = utcRead.payload['admissionReceiptCore'] as {
          operationHash: string;
          admitted: typeof created.receipt.admitted;
          facts: typeof created.receipt.facts;
        };
        expect(created.receipt.operationHash).toBe(receiptCore.operationHash);
        expect(created.receipt.admitted).toEqual(receiptCore.admitted);
        expect(created.receipt.facts).toMatchObject(receiptCore.facts);
        expect(receiptCore.admitted.ledger.approvedRowIds).not.toContain(futureRowId);
        expect(utcRead.knowledgeCutoff).toBe('2026-03-31T12:00:00.000Z');
        expect(utcRead.sourceFactsInputHash).toBe(
          created.receipt.basisRef.sourceFactsInputHash
        );
        expect(utcRead.snapshotInputHash).toBe(created.receipt.basisRef.snapshotInputHash);
      } finally {
        reader.release();
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-1 atomically publishes once, replays exact receipt after artifact purge, and changes no unrelated tables',
    async () => {
      const fixture = await publishFixture();
      const before = await tableCounts();

      const created = await publish(fixture);
      expect(created.statusCode).toBe(201);
      expect(created.replayed).toBe(false);
      expect(created.receipt.fundId).toBe(seeded.fundId);
      expect(created.receipt.facts.etag).toBe(
        `"financial-facts:${created.receipt.facts.snapshotId}:${created.receipt.facts.snapshotInputHash}"`
      );
      expect(created.receipt.admitted.ledger.approvedCount).toBe(2);
      expect(created.receipt.admitted.valuation?.approvedCount).toBe(1);

      const persisted = await adminPool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM financial_facts_snapshots
      WHERE fund_id = ${seeded.fundId}
        AND policy_version = 'financial-facts-policy/1.4.0'
        AND payload_schema_id = 'financial-facts-payload/5'
    `);
      expect(persisted.rows[0]!.count).toBe('1');
      await adminPool.query(
        `UPDATE source_artifacts SET payload = NULL, purged_at = now() WHERE fund_id = $1`,
        [seeded.fundId]
      );

      const replay = await publish(fixture);
      expect(replay.statusCode).toBe(200);
      expect(replay.replayed).toBe(true);
      expect(JSON.stringify(replay.receipt)).toBe(JSON.stringify(created.receipt));

      const after = await tableCounts();
      expect(after['source_artifacts']).toBe((before['source_artifacts'] ?? 0) + 2);
      expect(after['cash_flow_events']).toBe((before['cash_flow_events'] ?? 0) + 2);
      expect(after['valuation_marks']).toBe((before['valuation_marks'] ?? 0) + 1);
      expect(after['financial_facts_snapshots']).toBe(
        (before['financial_facts_snapshots'] ?? 0) + 1
      );
      expectOnlyPublisherTablesChanged(before, after);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-1 refuses a non-cent-exact database commitment before publication writes',
    async () => {
      const fixture = await publishFixture();
      await adminPool.query(
        'UPDATE vehicles SET committed_capital = 1000000.001 WHERE id = $1',
        [seeded.vehicleId]
      );
      const before = await tableCounts();

      await expect(publish(fixture)).rejects.toMatchObject({
        statusCode: 422,
        code: 'SUBCENT_USD_UNSUPPORTED',
      });

      expect(await tableCounts()).toEqual(before);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-1 reuses coherent same-as-of ledger artifacts before and after payload purge',
    async () => {
      for (const purgeLedgerArtifact of [false, true]) {
        await resetPilot();
        const fixture = await publishFixture();
        const ledger = fixture.request.ledger;
        const ledgerPayload = Buffer.from(ledger.payload, 'base64');
        const artifactRequestHash = canonicalSha256({
          contractVersion: 'actuals-pilot-source-artifact/1.0.0',
          fundId: seeded.fundId,
          asOfDate: fixture.request.asOfDate,
          templateVersion: ledger.templateVersion,
          payloadSha256: ledger.expectedPayloadSha256,
          byteCount: ledgerPayload.byteLength,
          canonicalRowsHash: ledger.expectedCanonicalRowsHash,
          previewHash: ledger.expectedPreviewHash,
        });
        const artifact = await adminPool.query<{ id: number }>(
          `INSERT INTO source_artifacts (
             fund_id, source_type, file_name, media_type, byte_count,
             payload_sha256, payload, purge_after, purged_at, created_by,
             idempotency_key, request_hash
           ) VALUES (
             $1, 'csv', $2, 'text/csv', $3,
             $4, $5, $6, $7, $8,
             $9, $10
           )
           RETURNING id`,
          [
            seeded.fundId,
            ledger.fileName,
            ledgerPayload.byteLength,
            ledger.expectedPayloadSha256,
            purgeLedgerArtifact ? null : ledgerPayload,
            '2026-06-29T00:00:00.000Z',
            purgeLedgerArtifact ? '2026-03-31T00:00:00.000Z' : null,
            seeded.actorId,
            `ap1:ledger:${fixture.request.asOfDate}:${ledger.expectedPreviewHash}`,
            artifactRequestHash,
          ]
        );
        const ledgerArtifactId = artifact.rows[0]!.id;
        const before = await tableCounts();
        const created = await publish(fixture);

        expect(created.statusCode).toBe(201);
        expect(created.receipt.admitted.ledger).toMatchObject({
          sourceArtifactId: ledgerArtifactId,
          approvedCount: 2,
        });
        expect(created.receipt.admitted.valuation?.approvedCount).toBe(1);
        const after = await tableCounts();
        expect(after['source_artifacts']).toBe((before['source_artifacts'] ?? 0) + 1);
        expect(after['cash_flow_events']).toBe((before['cash_flow_events'] ?? 0) + 2);
        expect(after['valuation_marks']).toBe((before['valuation_marks'] ?? 0) + 1);
        expect(after['financial_facts_snapshots']).toBe(
          (before['financial_facts_snapshots'] ?? 0) + 1
        );
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-2 enforces actor-first same-key authorization and refuses changed operation hashes without writes',
    async () => {
      const fixture = await publishFixture();
      await publish(fixture);
      const before = await tableCounts();

      const changed = await publishFixture({
        idempotencyKey: fixture.idempotencyKey,
        evidenceNote: 'Different frozen operation.',
      });
      await expect(publish(changed)).rejects.toMatchObject({
        statusCode: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
      });

      const other = await adminPool.query<{ id: number }>(`
      INSERT INTO users (username, password, role) VALUES ('other-admin', 'x', 'admin') RETURNING id
    `);
      await adminPool.query('INSERT INTO user_fund_grants (user_id, fund_id) VALUES ($1, $2)', [
        other.rows[0]!.id,
        seeded.fundId,
      ]);
      await expect(
        publishModule.publishActualsPilot(
          {
            fundId: seeded.fundId,
            actorId: other.rows[0]!.id,
            idempotencyKey: fixture.idempotencyKey,
            ifMatch: fixture.ifMatch,
            request: fixture.request,
          },
          { connect: connectWith(() => async (_text, _params, next) => next()) }
        )
      ).rejects.toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });

      await adminPool.query('DELETE FROM user_fund_grants WHERE user_id = $1 AND fund_id = $2', [
        seeded.actorId,
        seeded.fundId,
      ]);
      await expect(publish(fixture)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });

      await adminPool.query('INSERT INTO user_fund_grants (user_id, fund_id) VALUES ($1, $2)', [
        seeded.actorId,
        seeded.fundId,
      ]);
      for (const [update, statusCode, code] of [
        ['is_active = false', 404, 'RESOURCE_NOT_FOUND'],
        ['is_active = true, is_release_canary_principal = true', 404, 'RESOURCE_NOT_FOUND'],
        ["is_release_canary_principal = false, role = 'service'", 404, 'RESOURCE_NOT_FOUND'],
        ["role = 'partner'", 403, 'INSUFFICIENT_ROLE'],
      ] as const) {
        await adminPool.query(`UPDATE users SET ${update} WHERE id = $1`, [seeded.actorId]);
        await expect(publish(fixture)).rejects.toMatchObject({ statusCode, code });
      }

      const after = await tableCounts();
      for (const table of [
        'source_artifacts',
        'cash_flow_events',
        'valuation_marks',
        'financial_facts_snapshots',
      ]) {
        expect(after[table], table).toBe(before[table]);
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-3 serializes same-key publishers into one 201 and one byte-identical 200 replay',
    async () => {
      const fixture = await publishFixture();
      const connect = advisoryBarrierConnect();

      const [left, right] = await Promise.all([
        publish(fixture, { connect }),
        publish(fixture, { connect }),
      ]);
      expect([left.statusCode, right.statusCode].sort()).toEqual([200, 201]);
      expect(JSON.stringify(left.receipt)).toBe(JSON.stringify(right.receipt));
      const snapshots = await adminPool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM financial_facts_snapshots WHERE fund_id = $1',
        [seeded.fundId]
      );
      expect(snapshots.rows[0]!.count).toBe('1');

      await resetPilot();
      const root = await publishFixture();
      const rootConnect = advisoryBarrierConnect();
      const rootResults = await Promise.allSettled([
        publish(root, { connect: rootConnect }),
        publish(
          { ...root, idempotencyKey: '20000000-0000-4000-8000-000000000002' },
          { connect: rootConnect }
        ),
      ]);
      expect(rootResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(rootResults.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(rootResults.find((result) => result.status === 'fulfilled')?.value.statusCode).toBe(
        201
      );
      expect(rootResults.find((result) => result.status === 'rejected')?.reason).toMatchObject({
        statusCode: 412,
        code: 'FACTS_HEAD_PRECONDITION_FAILED',
      });

      await resetPilot();
      const base = await publish(await publishFixture());
      const successor = await publishFixture({
        idempotencyKey: '30000000-0000-4000-8000-000000000003',
        ifMatch: base.receipt.facts.etag,
        valuationRows: null,
        ledgerRows: [
          [
            'lp_distribution',
            '2026-03-20',
            '5000.00',
            'USD',
            '',
            'main',
            '',
            'Distribution',
            '',
            'return_of_capital',
            'false',
            'pg-distribution-successor',
          ],
        ],
        coverage: {
          ledger: 'incremental_since_prior_head',
          priorFactsSnapshotId: base.receipt.facts.snapshotId,
          evidenceNote: 'Concurrent successor proof.',
        },
      });
      const successorConnect = advisoryBarrierConnect();
      const successorResults = await Promise.allSettled([
        publish(successor, { connect: successorConnect }),
        publish(
          { ...successor, idempotencyKey: '40000000-0000-4000-8000-000000000004' },
          { connect: successorConnect }
        ),
      ]);
      expect(successorResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(successorResults.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(
        successorResults.find((result) => result.status === 'fulfilled')?.value.statusCode
      ).toBe(201);
      expect(successorResults.find((result) => result.status === 'rejected')?.reason).toMatchObject(
        { statusCode: 412, code: 'FACTS_HEAD_PRECONDITION_FAILED' }
      );
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-4 retries the whole transaction when a stale SERIALIZABLE snapshot waits behind the fund lock',
    async () => {
      const fixture = await publishFixture();
      let staleLockReached!: () => void;
      const staleAtLock = new Promise<void>((resolve) => {
        staleLockReached = resolve;
      });
      let releaseStale!: () => void;
      const staleCanLock = new Promise<void>((resolve) => {
        releaseStale = resolve;
      });
      let staleBegins = 0;
      const staleConnect = connectWith(() => async (text, _params, next, execute) => {
        if (/BEGIN/i.test(text)) staleBegins += 1;
        if (text.includes('pg_advisory_xact_lock') && staleBegins === 1) {
          await execute('SELECT count(*) FROM financial_facts_snapshots WHERE fund_id = $1', [
            seeded.fundId,
          ]);
          staleLockReached();
          await staleCanLock;
        }
        return next();
      });

      const stale = publish(fixture, { connect: staleConnect });
      await staleAtLock;
      const winner = await publish(fixture);
      releaseStale();
      const recovered = await stale;

      expect(winner.statusCode).toBe(201);
      expect(recovered.statusCode).toBe(200);
      expect(recovered.receipt).toEqual(winner.receipt);
      expect(staleBegins).toBeGreaterThanOrEqual(2);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-5 recovers a coherent winner after COMMIT acknowledgement loss with no second mutation',
    async () => {
      const fixture = await publishFixture();
      let lost = false;
      let mutationBegins = 0;
      const connect = connectWith(() => async (text, _params, next) => {
        if (/BEGIN ISOLATION LEVEL SERIALIZABLE/i.test(text)) mutationBegins += 1;
        if (/^COMMIT\b/i.test(text) && !lost) {
          lost = true;
          await next();
          throw new Error('simulated COMMIT acknowledgement loss');
        }
        return next();
      });

      const recovered = await publish(fixture, { connect });
      expect(recovered.statusCode).toBe(200);
      expect(recovered.replayed).toBe(true);
      expect(recovered.mutationAttempts).toBe(1);
      expect(mutationBegins).toBe(1);
      const snapshots = await adminPool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM financial_facts_snapshots WHERE fund_id = $1',
        [seeded.fundId]
      );
      expect(snapshots.rows[0]!.count).toBe('1');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-5 refuses corrupt recovered receipt state after COMMIT acknowledgement loss',
    async () => {
      const fixture = await publishFixture();
      let firstCommit = true;
      const connect = connectWith(() => async (text, _params, next) => {
        if (/^COMMIT\b/i.test(text) && firstCommit) {
          firstCommit = false;
          await next();
          await adminPool.query(
            `UPDATE financial_facts_snapshots SET request_hash = $1 WHERE fund_id = $2`,
            ['f'.repeat(64), seeded.fundId]
          );
          throw new Error('simulated lost COMMIT acknowledgement');
        }
        return next();
      });

      await expect(publish(fixture, { connect })).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
      });
      const snapshots = await adminPool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM financial_facts_snapshots WHERE fund_id = $1',
        [seeded.fundId]
      );
      expect(snapshots.rows[0]!.count).toBe('1');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-5 rechecks actor grant before projecting a recovered receipt',
    async () => {
      const fixture = await publishFixture();
      let firstCommit = true;
      const connect = connectWith(() => async (text, _params, next) => {
        if (/^COMMIT\b/i.test(text) && firstCommit) {
          firstCommit = false;
          await next();
          await adminPool.query(
            'DELETE FROM user_fund_grants WHERE user_id = $1 AND fund_id = $2',
            [seeded.actorId, seeded.fundId]
          );
          throw new Error('simulated lost COMMIT acknowledgement');
        }
        return next();
      });

      await expect(publish(fixture, { connect })).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-6 returns mutation outcome unknown when the post-lock oracle cannot complete',
    async () => {
      const fixture = await publishFixture();
      let firstCommit = true;
      const connect = connectWith((connectionNumber) => async (text, _params, next, execute) => {
        if (connectionNumber === 1 && /^COMMIT\b/i.test(text) && firstCommit) {
          firstCommit = false;
          await execute('ROLLBACK');
          throw new Error('simulated unknown rolled-back COMMIT');
        }
        if (connectionNumber === 2 && text.includes('pg_advisory_xact_lock')) {
          throw new Error('simulated incomplete reconciliation oracle');
        }
        return next();
      });

      await expect(publish(fixture, { connect })).rejects.toMatchObject({
        statusCode: 503,
        code: 'MUTATION_OUTCOME_UNKNOWN',
      });
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-6 proves absence after rollback, permits one recovery mutation, and never consumes a third attempt',
    async () => {
      const fixture = await publishFixture();
      let serializableAttempts = 0;
      let firstCommit = true;
      let recoveryInsertInjected = false;
      const connect = connectWith(() => async (text, _params, next, execute) => {
        if (/BEGIN ISOLATION LEVEL SERIALIZABLE/i.test(text)) serializableAttempts += 1;
        if (/^COMMIT\b/i.test(text) && firstCommit) {
          firstCommit = false;
          await execute('ROLLBACK');
          throw new Error('simulated unknown rolled-back COMMIT');
        }
        if (
          !firstCommit &&
          !recoveryInsertInjected &&
          /source_artifacts/i.test(text) &&
          /INSERT INTO/i.test(text)
        ) {
          recoveryInsertInjected = true;
          throw pgError('40001', 'forced recovery serialization failure');
        }
        return next();
      });

      await expect(publish(fixture, { connect })).rejects.toMatchObject({
        statusCode: 503,
        code: 'PUBLISH_RETRY_EXHAUSTED',
      });
      expect(serializableAttempts).toBe(2);
      const counts = await adminPool.query<{ artifacts: string; snapshots: string }>(`
      SELECT
        (SELECT count(*)::text FROM source_artifacts WHERE fund_id = ${seeded.fundId}) AS artifacts,
        (SELECT count(*)::text FROM financial_facts_snapshots WHERE fund_id = ${seeded.fundId}) AS snapshots
    `);
      expect(counts.rows[0]).toEqual({ artifacts: '0', snapshots: '0' });
    },
    TEST_TIMEOUT_MS
  );

  it.each([
    ['coherent winner', 'winner', null],
    ['proven absence', 'absent', 'PUBLISH_RETRY_EXHAUSTED'],
    ['incomplete second oracle', 'unknown', 'MUTATION_OUTCOME_UNKNOWN'],
  ] as const)(
    'PG-6 reconciles attempt-2 ambiguity as %s without mutation attempt 3',
    async (_label, outcome, expectedCode) => {
      const fixture = await publishFixture();
      let serializableAttempts = 0;
      const connectionsSeen = new Set<number>();
      const connect = connectWith((connectionNumber) => async (text, _params, next, execute) => {
        connectionsSeen.add(connectionNumber);
        if (/BEGIN ISOLATION LEVEL SERIALIZABLE/i.test(text)) {
          serializableAttempts += 1;
        }
        if (connectionNumber === 1 && /^COMMIT\b/i.test(text)) {
          await execute('ROLLBACK');
          throw new Error('simulated attempt-1 unknown rolled-back COMMIT');
        }
        if (connectionNumber === 3 && /^COMMIT\b/i.test(text)) {
          if (outcome === 'winner') {
            await next();
          } else {
            await execute('ROLLBACK');
          }
          throw new Error('simulated attempt-2 ambiguous COMMIT');
        }
        if (
          outcome === 'unknown' &&
          connectionNumber === 4 &&
          text.includes('pg_advisory_xact_lock')
        ) {
          throw new Error('simulated incomplete second reconciliation oracle');
        }
        return next();
      });

      if (expectedCode === null) {
        const recovered = await publish(fixture, { connect });
        expect(recovered).toMatchObject({
          statusCode: 200,
          replayed: true,
          mutationAttempts: 2,
        });
      } else {
        await expect(publish(fixture, { connect })).rejects.toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });
      }

      expect(serializableAttempts).toBe(2);
      expect(Math.max(...connectionsSeen)).toBe(4);
      const counts = await adminPool.query<{ artifacts: string; snapshots: string }>(`
        SELECT
          (SELECT count(*)::text FROM source_artifacts WHERE fund_id = ${seeded.fundId}) AS artifacts,
          (SELECT count(*)::text FROM financial_facts_snapshots WHERE fund_id = ${seeded.fundId}) AS snapshots
      `);
      expect(counts.rows[0]).toEqual(
        outcome === 'winner'
          ? { artifacts: '2', snapshots: '1' }
          : { artifacts: '0', snapshots: '0' }
      );
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-7 destroys a pooled client when failed mutation rollback is uncertain',
    async () => {
      const fixture = await publishFixture();
      const releases: Array<boolean | undefined> = [];
      let insertFailed = false;
      const connect = connectWith(
        () => async (text, _params, next) => {
          if (!insertFailed && /INSERT INTO source_artifacts/i.test(text)) {
            insertFailed = true;
            throw new Error('simulated mutation failure before COMMIT');
          }
          if (/^ROLLBACK\b/i.test(text)) {
            throw new Error('simulated rollback failure');
          }
          return next();
        },
        (destroy) => releases.push(destroy)
      );

      await expect(publish(fixture, { connect })).rejects.toThrow(
        'simulated mutation failure before COMMIT'
      );
      expect(releases).toEqual([true]);
      const counts = await adminPool.query<{ artifacts: string; snapshots: string }>(`
        SELECT
          (SELECT count(*)::text FROM source_artifacts WHERE fund_id = ${seeded.fundId}) AS artifacts,
          (SELECT count(*)::text FROM financial_facts_snapshots WHERE fund_id = ${seeded.fundId}) AS snapshots
      `);
      expect(counts.rows[0]).toEqual({ artifacts: '0', snapshots: '0' });
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-7 retries 40001 then 40P01 as fresh SERIALIZABLE transactions and leaves no partial writes',
    async () => {
      const fixture = await publishFixture();
      let attempts = 0;
      let retryFailures = 0;
      const connect = connectWith(() => async (text, _params, next) => {
        if (/BEGIN ISOLATION LEVEL SERIALIZABLE/i.test(text)) attempts += 1;
        if (retryFailures < 2 && /source_artifacts/i.test(text) && /INSERT INTO/i.test(text)) {
          const code = retryFailures === 0 ? '40001' : '40P01';
          retryFailures += 1;
          throw pgError(code, 'forced whole-transaction retry');
        }
        return next();
      });

      const result = await publish(fixture, { connect });
      expect(result.statusCode).toBe(201);
      expect(result.mutationAttempts).toBe(3);
      expect(attempts).toBe(3);
      const snapshots = await adminPool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM financial_facts_snapshots WHERE fund_id = $1',
        [seeded.fundId]
      );
      expect(snapshots.rows[0]!.count).toBe('1');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-7 returns retry exhausted after all three ordinary mutation attempts fail',
    async () => {
      const fixture = await publishFixture();
      let attempts = 0;
      const connect = connectWith(() => async (text, _params, next) => {
        if (/BEGIN ISOLATION LEVEL SERIALIZABLE/i.test(text)) attempts += 1;
        if (/source_artifacts/i.test(text) && /INSERT INTO/i.test(text)) {
          throw pgError(attempts === 2 ? '40P01' : '40001', 'forced retry exhaustion');
        }
        return next();
      });

      await expect(publish(fixture, { connect })).rejects.toMatchObject({
        statusCode: 503,
        code: 'PUBLISH_RETRY_EXHAUSTED',
      });
      expect(attempts).toBe(3);
      const counts = await adminPool.query<{ artifacts: string; snapshots: string }>(`
        SELECT
          (SELECT count(*)::text FROM source_artifacts WHERE fund_id = ${seeded.fundId}) AS artifacts,
          (SELECT count(*)::text FROM financial_facts_snapshots WHERE fund_id = ${seeded.fundId}) AS snapshots
      `);
      expect(counts.rows[0]).toEqual({ artifacts: '0', snapshots: '0' });
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-8 refuses non-pilot contamination before any publisher write',
    async () => {
      const fixture = await publishFixture();
      await adminPool.query(
        `
        INSERT INTO cash_flow_events (
          fund_id, vehicle_id, event_type, amount, currency, event_date,
          perspective, payload, status, imported_from, source_hash, created_by
        )
        VALUES ($1, $2, 'fund_expense', 1.000000, 'USD', now(), 'fund_gross',
          '{}'::jsonb, 'approved', 'legacy_import', $3, $4)
      `,
        [seeded.fundId, seeded.vehicleId, 'b'.repeat(64), seeded.actorId]
      );
      const before = await tableCounts();

      await expect(publish(fixture)).rejects.toMatchObject({
        code: 'FUND_LEDGER_NOT_PILOT_OWNED',
      });
      expect(await tableCounts()).toEqual(before);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-8 refuses preview-hash drift, historical successors, and orphan cumulative pilot rows',
    async () => {
      const drifted = await publishFixture();
      drifted.request.ledger.expectedPreviewHash = 'f'.repeat(64);
      await expect(publish(drifted)).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_CSV',
      });

      const first = await publish(await publishFixture());
      const historical = await publishFixture({
        idempotencyKey: '60000000-0000-4000-8000-000000000006',
        asOfDate: '2026-03-30',
        ifMatch: first.receipt.facts.etag,
        valuationRows: null,
        ledgerRows: [
          [
            'lp_distribution',
            '2026-03-20',
            '1.00',
            'USD',
            '',
            'main',
            '',
            'Historical',
            '',
            'return_of_capital',
            'false',
            'pg-historical-refusal',
          ],
        ],
        coverage: {
          ledger: 'incremental_since_prior_head',
          priorFactsSnapshotId: first.receipt.facts.snapshotId,
          evidenceNote: 'Historical refusal proof.',
        },
      });
      await expect(publish(historical)).rejects.toMatchObject({
        statusCode: 422,
        code: 'HISTORICAL_AS_OF_NOT_HEAD_ELIGIBLE',
      });

      await adminPool.query(
        `
          INSERT INTO cash_flow_events (
            fund_id, vehicle_id, company_id, event_type, amount, currency,
            event_date, perspective, description, payload, status, imported_from,
            source_hash, created_by
          )
          SELECT fund_id, vehicle_id, company_id, event_type, amount, currency,
            event_date, perspective, 'orphan',
            jsonb_set(payload, '{rowContentHash}', to_jsonb($1::text)), status,
            imported_from, $1, created_by
          FROM cash_flow_events
          WHERE fund_id = $2 AND imported_from = 'actuals_pilot_v1'
          ORDER BY id
          LIMIT 1
        `,
        ['e'.repeat(64), seeded.fundId]
      );
      const orphanSuccessor = await publishFixture({
        idempotencyKey: '70000000-0000-4000-8000-000000000007',
        ifMatch: first.receipt.facts.etag,
        valuationRows: null,
        ledgerRows: [
          [
            'lp_distribution',
            '2026-03-21',
            '2.00',
            'USD',
            '',
            'main',
            '',
            'Orphan basis',
            '',
            'gain',
            'false',
            'pg-orphan-refusal',
          ],
        ],
        coverage: {
          ledger: 'incremental_since_prior_head',
          priorFactsSnapshotId: first.receipt.facts.snapshotId,
          evidenceNote: 'Orphan cumulative row refusal proof.',
        },
      });
      await expect(publish(orphanSuccessor)).rejects.toMatchObject({
        statusCode: 409,
        code: 'FUND_LEDGER_NOT_PILOT_OWNED',
      });
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-8 refuses same-ID predecessor content corruption without new writes',
    async () => {
      const first = await publish(await publishFixture());
      const corruptedRowId = first.receipt.admitted.ledger.approvedRowIds[0]!;
      await adminPool.query(
        'UPDATE cash_flow_events SET amount = amount + 1 WHERE id = $1 AND fund_id = $2',
        [corruptedRowId, seeded.fundId]
      );
      const before = await tableCounts();
      const successor = await publishFixture({
        idempotencyKey: '71000000-0000-4000-8000-000000000001',
        ifMatch: first.receipt.facts.etag,
        valuationRows: null,
        ledgerRows: [
          [
            'lp_distribution',
            '2026-03-20',
            '1.00',
            'USD',
            '',
            'main',
            '',
            'Corruption refusal',
            '',
            'return_of_capital',
            'false',
            'pg-corrupt-predecessor-row',
          ],
        ],
        coverage: {
          ledger: 'incremental_since_prior_head',
          priorFactsSnapshotId: first.receipt.facts.snapshotId,
          evidenceNote: 'Same-ID predecessor row corruption refusal proof.',
        },
      });

      await expect(publish(successor)).rejects.toMatchObject({
        statusCode: 409,
        code: 'FUND_LEDGER_NOT_PILOT_OWNED',
      });
      expect(await tableCounts()).toEqual(before);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-8 refuses a missing predecessor admitted row-set member without new writes',
    async () => {
      const first = await publish(await publishFixture());
      const missingRowId = first.receipt.admitted.ledger.approvedRowIds[0]!;
      await adminPool.query(
        'DELETE FROM cash_flow_events WHERE id = $1 AND fund_id = $2',
        [missingRowId, seeded.fundId]
      );
      const before = await tableCounts();
      const successor = await publishFixture({
        idempotencyKey: '71000000-0000-4000-8000-000000000003',
        ifMatch: first.receipt.facts.etag,
        valuationRows: null,
        ledgerRows: [
          [
            'lp_distribution',
            '2026-03-20',
            '1.00',
            'USD',
            '',
            'main',
            '',
            'Missing predecessor refusal',
            '',
            'return_of_capital',
            'false',
            'pg-missing-predecessor-row',
          ],
        ],
        coverage: {
          ledger: 'incremental_since_prior_head',
          priorFactsSnapshotId: first.receipt.facts.snapshotId,
          evidenceNote: 'Missing predecessor admitted row-set refusal proof.',
        },
      });

      await expect(publish(successor)).rejects.toMatchObject({
        statusCode: 409,
        code: 'FUND_LEDGER_NOT_PILOT_OWNED',
      });
      expect(await tableCounts()).toEqual(before);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-8 refuses poisoned predecessor receipt coherence without new writes',
    async () => {
      const first = await publish(await publishFixture());
      await adminPool.query(
        `UPDATE financial_facts_snapshots
         SET payload = jsonb_set(
           payload,
           '{admissionReceiptCore,operationHash}',
           to_jsonb($1::text)
         )
         WHERE id = $2 AND fund_id = $3`,
        ['f'.repeat(64), first.receipt.facts.snapshotId, seeded.fundId]
      );
      const before = await tableCounts();
      const successor = await publishFixture({
        idempotencyKey: '71000000-0000-4000-8000-000000000002',
        ifMatch: first.receipt.facts.etag,
        valuationRows: null,
        ledgerRows: [
          [
            'lp_distribution',
            '2026-03-20',
            '1.00',
            'USD',
            '',
            'main',
            '',
            'Poisoned receipt refusal',
            '',
            'return_of_capital',
            'false',
            'pg-poisoned-predecessor-receipt',
          ],
        ],
        coverage: {
          ledger: 'incremental_since_prior_head',
          priorFactsSnapshotId: first.receipt.facts.snapshotId,
          evidenceNote: 'Poisoned predecessor receipt refusal proof.',
        },
      });

      await expect(publish(successor)).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
      });
      expect(await tableCounts()).toEqual(before);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'PG-9 publishes an incremental successor from locked accepted cumulative basis',
    async () => {
      const first = await publish(await publishFixture());
      await adminPool.query(
        `UPDATE cash_flow_events
         SET status = 'locked', locked_at = now(), locked_by = $1
         WHERE fund_id = $2 AND imported_from = 'actuals_pilot_v1'`,
        [seeded.actorId, seeded.fundId]
      );
      const successor = await publishFixture({
        idempotencyKey: '50000000-0000-4000-8000-000000000005',
        ifMatch: first.receipt.facts.etag,
        ledgerRows: [
          [
            'lp_distribution',
            '2026-03-20',
            '5000.00',
            'USD',
            '',
            'main',
            '',
            'Distribution',
            '',
            'return_of_capital',
            'false',
            'pg-distribution-parity',
          ],
        ],
        coverage: {
          ledger: 'incremental_since_prior_head',
          priorFactsSnapshotId: first.receipt.facts.snapshotId,
          evidenceNote: 'Locked cumulative basis proof.',
        },
      });
      const result = await publish(successor);
      const snapshot = await adminPool.query<{ payload: Record<string, unknown> }>(
        'SELECT payload FROM financial_facts_snapshots WHERE id = $1',
        [result.receipt.facts.snapshotId]
      );
      const payload = snapshot.rows[0]!.payload;
      expect(payload).toMatchObject({
        admissionReceiptCore: {
          admitted: {
            ledger: { approvedCount: 1 },
            valuation: { approvedCount: 0 },
          },
        },
      });
      expect(JSON.stringify(payload)).toContain('100000.000000');
      expect(JSON.stringify(payload)).toContain('5000.000000');

      const financialProjection = (value: Record<string, unknown>) => {
        const capital = value['capitalActuals'] as Record<
          string,
          {
            value: string | null;
            availability: string;
            reasonCodes: string[];
          }
        >;
        const cash = value['cashFlowSeries'] as {
          totals: Record<string, string>;
          series: unknown[];
        };
        const governedMetric = (metric: (typeof capital)[string]) => ({
          value: metric.value,
          availability: metric.availability,
          reasonCodes: metric.reasonCodes,
        });
        return {
          cashFlowSeries: cash,
          paidInCapital: governedMetric(capital['paidInCapital']!),
          deployedCapital: governedMetric(capital['deployedCapital']!),
          distributionsToPartners: governedMetric(
            capital['distributionsToPartners']!
          ),
          portfolioFmv: governedMetric(capital['portfolioFmv']!),
        };
      };
      const incrementalProjection = financialProjection(payload);

      await resetPilot();
      const inception = await publish(
        await publishFixture({
          idempotencyKey: '80000000-0000-4000-8000-000000000008',
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
              'Distribution',
              '',
              'return_of_capital',
              'false',
              'pg-distribution-parity',
            ],
          ],
        })
      );
      const inceptionSnapshot = await adminPool.query<{ payload: Record<string, unknown> }>(
        'SELECT payload FROM financial_facts_snapshots WHERE id = $1',
        [inception.receipt.facts.snapshotId]
      );
      expect(financialProjection(inceptionSnapshot.rows[0]!.payload)).toEqual(
        incrementalProjection
      );
    },
    TEST_TIMEOUT_MS
  );
});
