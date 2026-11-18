import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { db as applicationDb } from '../../server/db';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

type Service = typeof import('../../server/services/lp-reporting/vehicle-onboarding-service');
type Retention =
  typeof import('../../server/services/financial-observations/artifact-retention-service');
let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer;
let admin: Pool;
let service: Service;
let retention: Retention;
let database: typeof applicationDb;
let modulePool: { end?: () => Promise<void> };
let fundId: number;
let actorId: number;
const envKeys = ['DATABASE_URL', 'NEON_DATABASE_URL', 'USE_REAL_DB_IN_VITEST'] as const;
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const runDocker =
  process.env['RUN_DOCKER_VEHICLE_ONBOARDING'] === '1' ||
  ['1', 'true'].includes(process.env['CI'] ?? '');
const now = new Date('2028-01-01T00:00:00.000Z');

async function declareVehicle() {
  return service.onboardMainFundVehicle(
    {
      fundId,
      actorId,
      idempotencyKey: randomUUID(),
      context: {
        userId: String(actorId),
        fundId: String(fundId),
        role: 'admin',
        orgId: '',
        email: 'storage@example.invalid',
      },
      request: {
        contractVersion: 'vehicle-onboarding/1.0.0',
        vehicleSlug: 'main-fund',
        name: 'Synthetic main fund',
        committedCapital: '1000000.00',
        source: { sourceType: 'manual', content: 'Synthetic commitment: USD 1,000,000.' },
        sourceLocator: 'Declaration, paragraph 1',
        attestation: 'source-supports-commitment/1.0.0',
      },
    },
    { connect: () => admin.connect(), readPilotFundId: () => fundId }
  );
}

async function cloneArtifact(
  sourceId: number,
  ownerFundId = fundId,
  connection: Pool | PoolClient = admin
): Promise<number> {
  const result = await connection.query<{ id: number }>(
    `INSERT INTO source_artifacts
       (fund_id, source_type, media_type, byte_count, payload_sha256, payload,
        purge_after, created_by, idempotency_key, request_hash)
     SELECT $2, source_type, media_type, byte_count, payload_sha256, payload,
       '2027-01-01', created_by, $3, request_hash FROM source_artifacts WHERE id = $1 RETURNING id`,
    [sourceId, ownerFundId, randomUUID()]
  );
  return result.rows[0]!.id;
}

async function createEnvelope(
  database: typeof applicationDb,
  sourceArtifactId: number,
  vehicleId: number
) {
  const { createCapitalEnvelopeVersion } =
    await import('../../server/services/internal-economics/capital-envelope-service');
  return createCapitalEnvelopeVersion({
    fundId,
    actorId,
    idempotencyKey: randomUUID(),
    database,
    request: {
      mainFundVehicleId: vehicleId,
      lpCommitmentUsd: '900000.000000',
      gpCommitmentUsd: '100000.000000',
      totalCommitmentUsd: '1000000.000000',
      currency: 'USD',
      effectiveAt: '2026-11-04T00:00:00.000Z',
      sourceArtifactId,
      sourceConfigId: 1,
      sourceConfigVersion: 1,
      sourceConfigHash: 'a'.repeat(64),
      attestedBy: actorId,
      attestedAt: '2026-11-04T00:00:00.000Z',
    },
  });
}

function cloneReceipt(
  client: Pick<PoolClient, 'query'> | Pool,
  sourceId: number,
  amount = '1000000.00',
  vehicleId: number | null = null
) {
  return client.query(
    `INSERT INTO vehicle_onboarding_commands
       (fund_id, actor_id, vehicle_id, operation, contract_version, idempotency_key,
        request_hash, vehicle_slug, name, vehicle_type, currency, status, committed_capital,
        source_artifact_id, source_artifact_sha256, source_locator, attestation_version,
        outcome, response_status, response_body)
     SELECT fund_id, actor_id, COALESCE($4::integer, vehicle_id), operation, contract_version, $1,
       request_hash, vehicle_slug, name, vehicle_type, currency, status, $3,
       $2, source_artifact_sha256, source_locator, attestation_version,
       outcome, response_status, response_body
     FROM vehicle_onboarding_commands ORDER BY id LIMIT 1 RETURNING id`,
    [randomUUID(), sourceId, amount, vehicleId]
  );
}

async function asOrdinaryRole<T>(
  currentFundId: number | null,
  action: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE onboarding_storage_reader');
    await client.query(
      `SELECT set_config('app.current_fund', $1, true), set_config('app.current_user', $2, true),
        set_config('app.current_role', 'admin', true)`,
      [currentFundId === null ? '' : String(currentFundId), String(actorId)]
    );
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** A background-worker connection: non-owner role, no request scope, no fund context. */
async function asOrdinaryWorker<T>(action: (workerDb: typeof applicationDb) => Promise<T>) {
  const { createClientDatabase } = await import('../../server/db');
  const client = await admin.connect();
  try {
    await client.query('SET ROLE onboarding_storage_reader');
    return await action(createClientDatabase(client) as unknown as typeof applicationDb);
  } finally {
    await client.query('RESET ROLE');
    client.release();
  }
}

async function inRequestScope<T>(
  role: string,
  action: (scopedDb: typeof applicationDb) => Promise<T>,
  contextOverrides: { userId?: string; fundId?: string } = {}
): Promise<T> {
  const { requestDatabaseStorage } = await import('../../server/db/request-context');
  const { createClientDatabase } = await import('../../server/db');
  const client = await admin.connect();
  try {
    return await createClientDatabase(client).transaction(async (scopedDb) => {
      await client.query('SET LOCAL ROLE onboarding_storage_reader');
      await client.query("SET LOCAL lock_timeout = '1s'");
      await client.query(
        `SELECT set_config('app.current_fund', '', true), set_config('app.current_user', $1, true),
          set_config('app.current_role', $2, true)`,
        [String(actorId), role]
      );
      expect(
        (await client.query("SELECT current_setting('app.current_fund', true) AS fund")).rows[0]
          .fund
      ).toBe('');
      return requestDatabaseStorage.run(
        {
          context: {
            userId: String(actorId),
            role,
            orgId: '',
            email: 'storage@example.invalid',
            ...contextOverrides,
          },
          db: scopedDb,
          client,
          completed: false,
          runOwnedTransaction: async (callback) => callback(client),
        },
        () => action(scopedDb)
      );
    });
  } finally {
    client.release();
  }
}

describe.skipIf(!runDocker)('vehicle declaration storage PostgreSQL', { retry: 0 }, () => {
  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('vehicle_storage')
      .start();
    const url = container.getConnectionUri();
    admin = new Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 2000 });
    const migrations = await runMigrationsWithConnectionString(
      url,
      '0062_vehicle_onboarding_commands'
    );
    expect(migrations.applied.map((entry) => entry.name)).toContain(
      '0062_vehicle_onboarding_commands'
    );
    await admin.query(await readFile('migrations/0062_vehicle_onboarding_commands.sql', 'utf8'));
    await admin.query(`CREATE ROLE onboarding_storage_reader NOLOGIN NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO onboarding_storage_reader;
      GRANT SELECT ON users, user_fund_grants TO onboarding_storage_reader;
      GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO onboarding_storage_reader;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO onboarding_storage_reader;
      GRANT SELECT, INSERT, UPDATE, DELETE ON vehicle_onboarding_commands TO onboarding_storage_reader;
      GRANT USAGE, SELECT ON SEQUENCE vehicle_onboarding_commands_id_seq TO onboarding_storage_reader`);
    Object.assign(process.env, { DATABASE_URL: url, USE_REAL_DB_IN_VITEST: '1' });
    delete process.env['NEON_DATABASE_URL'];
    vi.resetModules();
    service = await import('../../server/services/lp-reporting/vehicle-onboarding-service');
    retention =
      await import('../../server/services/financial-observations/artifact-retention-service');
    const module = await import('../../server/db');
    database = module.db;
    modulePool = module.pool as typeof modulePool;
  }, 120_000);
  afterAll(async () => {
    await modulePool?.end?.();
    await admin?.end();
    await container?.stop();
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }, 120_000);
  beforeEach(async () => {
    await admin.query('TRUNCATE funds, users RESTART IDENTITY CASCADE');
    fundId = (
      await admin.query<{ id: number }>(
        `INSERT INTO funds (name,size,management_fee,carry_percentage,vintage_year,status,is_active,base_currency,data_origin)
       VALUES ('Synthetic storage fund',2000000,0.02,0.2,2026,'active',true,'USD','production') RETURNING id`
      )
    ).rows[0]!.id;
    actorId = (
      await admin.query<{ id: number }>(
        `INSERT INTO users (username,password,role,is_active,is_release_canary_principal)
       VALUES ('storage-admin','x','admin',true,false) RETURNING id`
      )
    ).rows[0]!.id;
    await admin.query('INSERT INTO user_fund_grants (user_id,fund_id) VALUES ($1,$2)', [
      actorId,
      fundId,
    ]);
  });

  it('enforces immutable receipts, cent amounts and same-fund sources, and permits fund disposal', async () => {
    const first = await declareVehicle();
    await expect(
      admin.query('UPDATE vehicle_onboarding_commands SET name = name')
    ).rejects.toThrow();
    const freshSource = await cloneArtifact(first.body.sourceArtifactId);
    await expect(cloneReceipt(admin, freshSource, '1.001')).rejects.toMatchObject({
      code: '23514',
    });
    const otherFund = (
      await admin.query<{ id: number }>(
        `INSERT INTO funds (name,size,management_fee,carry_percentage,vintage_year)
       VALUES ('Other synthetic fund',10,0.02,0.2,2026) RETURNING id`
      )
    ).rows[0]!.id;
    const foreignSource = await cloneArtifact(first.body.sourceArtifactId, otherFund);
    await expect(cloneReceipt(admin, foreignSource)).rejects.toMatchObject({ code: '23503' });
    const foreignVehicle = (
      await admin.query<{ id: number }>(
        `INSERT INTO vehicles (fund_id,vehicle_slug,vehicle_type,name,committed_capital,currency,status)
       SELECT $2,vehicle_slug,vehicle_type,name,committed_capital,currency,status
       FROM vehicles WHERE id = $1 RETURNING id`,
        [first.body.vehicleId, otherFund]
      )
    ).rows[0]!.id;
    await expect(
      cloneReceipt(admin, freshSource, '1000000.00', foreignVehicle)
    ).rejects.toMatchObject({ code: '23503' });
    await admin.query('DELETE FROM funds WHERE id = $1', [fundId]);
    expect(
      (await admin.query('SELECT count(*)::int AS count FROM vehicle_onboarding_commands')).rows[0]
        .count
    ).toBe(0);
  });

  it('fund-scopes ordinary-role reads and requires a live grant for append', async () => {
    const first = await declareVehicle();
    expect(
      (
        await asOrdinaryRole(fundId, (client) =>
          client.query('SELECT id FROM vehicle_onboarding_commands')
        )
      ).rows
    ).toHaveLength(1);
    expect(
      (
        await asOrdinaryRole(fundId + 1, (client) =>
          client.query('SELECT id FROM vehicle_onboarding_commands')
        )
      ).rows
    ).toHaveLength(0);
    expect(
      (
        await asOrdinaryRole(null, (client) =>
          client.query('SELECT id FROM vehicle_onboarding_commands')
        )
      ).rows
    ).toHaveLength(0);
    const allowedSource = await cloneArtifact(first.body.sourceArtifactId);
    expect(
      (await asOrdinaryRole(fundId, (client) => cloneReceipt(client, allowedSource))).rows
    ).toHaveLength(1);
    await admin.query('DELETE FROM user_fund_grants WHERE user_id = $1', [actorId]);
    const deniedSource = await cloneArtifact(first.body.sourceArtifactId);
    await expect(
      asOrdinaryRole(fundId, (client) => cloneReceipt(client, deniedSource))
    ).rejects.toMatchObject({ code: '42501' });
    expect(
      (
        await asOrdinaryRole(fundId, (client) =>
          client.query('DELETE FROM vehicle_onboarding_commands RETURNING id')
        )
      ).rows
    ).toHaveLength(0);
    expect(
      (
        await asOrdinaryRole(fundId, (client) =>
          client.query('UPDATE vehicle_onboarding_commands SET name = name RETURNING id')
        )
      ).rows
    ).toHaveLength(0);
  });

  it.each(['maintenance', 'admin', 'partner'])(
    'refuses reuse across all consumers with %s scope',
    async (role) => {
      const first = await declareVehicle();
      const sourceId = first.body.sourceArtifactId;
      const { assertArtifactNotVehicleOnboardingOwned } =
        await import('../../server/services/financial-observations/vehicle-onboarding-artifact-ownership');
      const ordinarySource = await cloneArtifact(sourceId);
      await expect(
        assertArtifactNotVehicleOnboardingOwned(database, fundId, ordinarySource)
      ).resolves.toBeUndefined();
      const assertConsumersRefuse = async (database: typeof applicationDb) => {
        const refusal = { code: 'ARTIFACT_RESERVED_FOR_VEHICLE_ONBOARDING' };
        const { stageImportBatch } =
          await import('../../server/services/financial-observations/import-batch-staging-service');
        await expect(
          stageImportBatch({
            fundId,
            actorId,
            sourceArtifactId: sourceId,
            mappingProfileId: 1,
            dataBasis: 'observed_actual',
            idempotencyKey: randomUUID(),
            database,
          })
        ).rejects.toMatchObject(refusal);
        const { buildFinancialFactsSnapshot } =
          await import('../../server/services/financial-facts-snapshot-service');
        await expect(
          buildFinancialFactsSnapshot({
            fundId,
            actorId,
            asOfDate: '2026-11-04',
            openingAccountingStateArtifactId: sourceId,
            idempotencyKey: randomUUID(),
            database,
          })
        ).rejects.toMatchObject(refusal);
        await expect(
          createEnvelope(database, sourceId, first.body.vehicleId)
        ).rejects.toMatchObject({
          cause: { code: '23514', constraint: 'vehicle_onboarding_envelope_source_exclusive' },
        });
      };
      if (role === 'maintenance') {
        await assertConsumersRefuse(database);
      } else {
        await admin.query('UPDATE users SET role = $1 WHERE id = $2', [role, actorId]);
        await inRequestScope(role, assertConsumersRefuse);
      }
      const counts = (
        await admin.query(`SELECT (SELECT count(*)::int FROM import_batches) AS batches,
      (SELECT count(*)::int FROM financial_facts_snapshots) AS snapshots,
      (SELECT count(*)::int FROM internal_capital_envelope_versions) AS envelopes`)
      ).rows[0];
      expect(counts).toEqual({ batches: 0, snapshots: 0, envelopes: 0 });
    }
  );

  it('enforces the envelope trigger under an ordinary role without fund context while ordinary sources work', async () => {
    const first = await declareVehicle();
    const sourceId = await cloneArtifact(first.body.sourceArtifactId);
    await inRequestScope('admin', async (scopedDb) => {
      await expect(
        createEnvelope(scopedDb, first.body.sourceArtifactId, first.body.vehicleId)
      ).rejects.toMatchObject({
        cause: { code: '23514', constraint: 'vehicle_onboarding_envelope_source_exclusive' },
      });
      const envelope = await createEnvelope(scopedDb, sourceId, first.body.vehicleId);
      expect(envelope.sourceArtifactId).toBe(sourceId);
    });
    const privileges = (
      await admin.query<{ direct: boolean }>(
        "SELECT has_function_privilege('onboarding_storage_reader', 'public.vehicle_onboarding_refuse_envelope_source()', 'EXECUTE') AS direct"
      )
    ).rows[0];
    expect(privileges?.direct).toBe(false);
  });

  it('refuses guessed uncommitted source identity before a later FK wait can admit shared evidence', async () => {
    const first = await declareVehicle();
    const writer = await admin.connect();
    try {
      await writer.query('BEGIN');
      const pendingSourceId = await cloneArtifact(first.body.sourceArtifactId, fundId, writer);
      await cloneReceipt(writer, pendingSourceId);
      await inRequestScope('admin', async (scopedDb) => {
        await expect(
          createEnvelope(scopedDb, pendingSourceId, first.body.vehicleId)
        ).rejects.toMatchObject({
          cause: {
            code: '23503',
            constraint: 'internal_capital_envelope_versions_source_artifact_fund_fk',
          },
        });
      });
      await writer.query('COMMIT');
      await expect(
        createEnvelope(database, pendingSourceId, first.body.vehicleId)
      ).rejects.toMatchObject({
        cause: { code: '23514', constraint: 'vehicle_onboarding_envelope_source_exclusive' },
      });
      expect(
        (await admin.query('SELECT count(*)::int AS count FROM internal_capital_envelope_versions'))
          .rows[0].count
      ).toBe(0);
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
    }
  });

  it('keeps ordinary admin evidence usable without widening onboarding command authority', async () => {
    const first = await declareVehicle();
    const ordinarySource = await cloneArtifact(first.body.sourceArtifactId);
    await admin.query('DELETE FROM user_fund_grants WHERE user_id = $1', [actorId]);
    const { assertArtifactNotVehicleOnboardingOwned } =
      await import('../../server/services/financial-observations/vehicle-onboarding-artifact-ownership');
    await inRequestScope('admin', async (scopedDb) => {
      await expect(
        assertArtifactNotVehicleOnboardingOwned(scopedDb, fundId, ordinarySource)
      ).resolves.toBeUndefined();
      await expect(
        assertArtifactNotVehicleOnboardingOwned(scopedDb, fundId, first.body.sourceArtifactId)
      ).rejects.toMatchObject({ code: 'ARTIFACT_RESERVED_FOR_VEHICLE_ONBOARDING' });
    });
  });

  it('answers ownership as a fact for every route-admitted caller without touching the caller transaction', async () => {
    const first = await declareVehicle();
    const ordinarySource = await cloneArtifact(first.body.sourceArtifactId);
    const { assertArtifactNotVehicleOnboardingOwned } =
      await import('../../server/services/financial-observations/vehicle-onboarding-artifact-ownership');
    const { createClientDatabase } = await import('../../server/db');
    const refusal = { code: 'ARTIFACT_RESERVED_FOR_VEHICLE_ONBOARDING' };
    const expectFact = async (scopedDb: typeof applicationDb) => {
      await expect(
        assertArtifactNotVehicleOnboardingOwned(scopedDb, fundId, ordinarySource)
      ).resolves.toBeUndefined();
      await expect(
        assertArtifactNotVehicleOnboardingOwned(scopedDb, fundId, first.body.sourceArtifactId)
      ).rejects.toMatchObject(refusal);
      // The predicate binds no fund and holds no actor or grant row locks.
      const state = (
        await scopedDb.execute(sql`
          SELECT current_setting('app.current_fund', true) AS fund,
            (SELECT count(*)::int FROM pg_locks
              WHERE pid = pg_backend_pid() AND locktype = 'tuple') AS tuple_locks,
            (SELECT count(*)::int FROM pg_locks
              WHERE pid = pg_backend_pid() AND relation IN
                ('users'::regclass, 'user_fund_grants'::regclass)) AS row_locks
        `)
      ).rows[0];
      expect(state).toMatchObject({ fund: '', tuple_locks: 0, row_locks: 0 });
    };

    // Maintenance: ordinary role, no request scope, no fund context.
    await asOrdinaryRole(null, (client) => expectFact(createClientDatabase(client)));
    // Request context no longer matters to the fact lookup.
    for (const override of [{ userId: String(actorId + 1) }, { fundId: String(fundId + 1) }]) {
      await inRequestScope('admin', expectFact, override);
    }
    // Unrestricted non-admin admitted by requireFundAccess without a grant row.
    await admin.query("UPDATE users SET role = 'partner' WHERE id = $1", [actorId]);
    await admin.query('DELETE FROM user_fund_grants WHERE user_id = $1', [actorId]);
    await inRequestScope('partner', expectFact);
    // Release canary principal.
    await admin.query(
      "UPDATE users SET role = 'admin', is_release_canary_principal = true WHERE id = $1",
      [actorId]
    );
    await inRequestScope('admin', expectFact);
  });

  it('reads the table directly without the ownership function only when row security cannot filter it', async () => {
    const first = await declareVehicle();
    const sourceId = first.body.sourceArtifactId;
    const ordinarySource = await cloneArtifact(sourceId);
    await admin.query("UPDATE source_artifacts SET purge_after = '2027-01-01' WHERE id = $1", [
      sourceId,
    ]);
    const { assertArtifactNotVehicleOnboardingOwned } =
      await import('../../server/services/financial-observations/vehicle-onboarding-artifact-ownership');
    const { createClientDatabase } = await import('../../server/db');
    const refusal = { code: 'ARTIFACT_RESERVED_FOR_VEHICLE_ONBOARDING' };
    const client = await admin.connect();
    const clientDb = createClientDatabase(client) as unknown as typeof applicationDb;
    const expectTableRead = async () => {
      await expect(
        assertArtifactNotVehicleOnboardingOwned(clientDb, fundId, ordinarySource)
      ).resolves.toBeUndefined();
      await expect(
        assertArtifactNotVehicleOnboardingOwned(clientDb, fundId, sourceId)
      ).rejects.toMatchObject(refusal);
    };
    try {
      await client.query('BEGIN');
      // An earlier 0062 draft: table, policies and no function.
      await client.query(
        'DROP FUNCTION public.vehicle_onboarding_artifact_digest(integer, integer)'
      );
      // The table owner is not filtered, so the direct read is exact.
      await expectTableRead();
      // A non-owner role would be filtered: refuse instead of switching the guard off.
      await client.query('SET LOCAL ROLE onboarding_storage_reader');
      await expect(
        assertArtifactNotVehicleOnboardingOwned(clientDb, fundId, sourceId)
      ).rejects.toMatchObject({ status: 503, code: 'VEHICLE_ONBOARDING_SCHEMA_INCOMPLETE' });
      await expect(retention.purgeVehicleOnboardingArtifacts(now, clientDb)).rejects.toMatchObject({
        code: 'VEHICLE_ONBOARDING_SCHEMA_INCOMPLETE',
      });
      // Schema pushed from Drizzle definitions: table without row security or the function.
      await client.query('RESET ROLE');
      await client.query('ALTER TABLE vehicle_onboarding_commands DISABLE ROW LEVEL SECURITY');
      await client.query('SET LOCAL ROLE onboarding_storage_reader');
      await expectTableRead();
      expect(await retention.purgeVehicleOnboardingArtifacts(now, clientDb)).toBe(1);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('purges only due receipt-owned bytes, preserves replay metadata, and repeats safely', async () => {
    const first = await declareVehicle();
    const sourceId = first.body.sourceArtifactId;
    const ordinarySource = await cloneArtifact(sourceId);
    await admin.query("UPDATE source_artifacts SET purge_after = '2027-01-01' WHERE id = $1", [
      sourceId,
    ]);
    expect(
      await retention.purgeVehicleOnboardingArtifacts(
        new Date('2026-12-01T00:00:00.000Z'),
        database
      )
    ).toBe(0);
    const before = (
      await admin.query(
        'SELECT payload_sha256, byte_count, created_by, idempotency_key FROM source_artifacts WHERE id = $1',
        [sourceId]
      )
    ).rows[0];
    const receiptBefore = (
      await admin.query('SELECT row_to_json(c) AS receipt FROM vehicle_onboarding_commands c')
    ).rows[0].receipt;
    const concurrentPurges = await Promise.all([
      retention.purgeVehicleOnboardingArtifacts(now, database),
      retention.purgeVehicleOnboardingArtifacts(now, database),
    ]);
    expect(concurrentPurges.sort()).toEqual([0, 1]);
    expect(await retention.purgeVehicleOnboardingArtifacts(now, database)).toBe(0);
    const after = (
      await admin.query(
        'SELECT payload, purged_at, payload_sha256, byte_count, created_by, idempotency_key FROM source_artifacts WHERE id = $1',
        [sourceId]
      )
    ).rows[0];
    expect(after).toEqual({ ...before, payload: null, purged_at: now });
    expect(
      (
        await admin.query(
          'SELECT payload IS NOT NULL AS retained FROM source_artifacts WHERE id = $1',
          [ordinarySource]
        )
      ).rows[0].retained
    ).toBe(true);
    expect(
      (await admin.query('SELECT row_to_json(c) AS receipt FROM vehicle_onboarding_commands c'))
        .rows[0].receipt
    ).toEqual(receiptBefore);
  });

  it('protects unexpected batch-shared evidence while ordinary batch retention still purges', async () => {
    const first = await declareVehicle();
    const ordinarySource = await cloneArtifact(first.body.sourceArtifactId);
    await admin.query("UPDATE source_artifacts SET purge_after = '2027-01-01'");
    for (const sourceId of [first.body.sourceArtifactId, ordinarySource]) {
      await admin.query(
        `INSERT INTO import_batches
          (fund_id,source_artifact_id,status,purge_after,idempotency_key,request_hash)
         VALUES ($1,$2,'committed','2027-01-01',$3,$4)`,
        [fundId, sourceId, randomUUID(), 'a'.repeat(64)]
      );
    }
    await retention.runRetentionSweep(now, database);
    const rows = (
      await admin.query<{ id: number; retained: boolean }>(
        'SELECT id, payload IS NOT NULL AS retained FROM source_artifacts ORDER BY id'
      )
    ).rows;
    expect(rows).toEqual([
      { id: first.body.sourceArtifactId, retained: true },
      { id: ordinarySource, retained: false },
    ]);
  });

  it('completes batch retention and keeps shared declaration bytes under a non-owner worker role', async () => {
    const first = await declareVehicle();
    const ordinarySource = await cloneArtifact(first.body.sourceArtifactId);
    await admin.query("UPDATE source_artifacts SET purge_after = '2027-01-01'");
    for (const sourceId of [first.body.sourceArtifactId, ordinarySource]) {
      await admin.query(
        `INSERT INTO import_batches
          (fund_id,source_artifact_id,status,purge_after,idempotency_key,request_hash)
         VALUES ($1,$2,'committed','2027-01-01',$3,$4)`,
        [fundId, sourceId, randomUUID(), 'a'.repeat(64)]
      );
    }
    await asOrdinaryWorker((workerDb) => retention.runRetentionSweep(now, workerDb));
    expect(
      (
        await admin.query<{ id: number; retained: boolean }>(
          'SELECT id, payload IS NOT NULL AS retained FROM source_artifacts ORDER BY id'
        )
      ).rows
    ).toEqual([
      { id: first.body.sourceArtifactId, retained: true },
      { id: ordinarySource, retained: false },
    ]);
    // Both batch purges committed; the reserved one did not abort on ownership scope.
    expect(
      (
        await admin.query<{ purged: boolean }>(
          'SELECT purged_at IS NOT NULL AS purged FROM import_batches ORDER BY id'
        )
      ).rows
    ).toEqual([{ purged: true }, { purged: true }]);
  });

  it('purges due declaration bytes under a non-owner worker role without fund context', async () => {
    const first = await declareVehicle();
    await admin.query("UPDATE source_artifacts SET purge_after = '2027-01-01' WHERE id = $1", [
      first.body.sourceArtifactId,
    ]);
    expect(
      await asOrdinaryWorker((workerDb) => retention.purgeVehicleOnboardingArtifacts(now, workerDb))
    ).toBe(1);
    expect(
      (
        await admin.query(
          'SELECT payload IS NULL AS purged, purged_at FROM source_artifacts WHERE id = $1',
          [first.body.sourceArtifactId]
        )
      ).rows[0]
    ).toEqual({ purged: true, purged_at: now });
  });

  it('protects unexpected direct observation ownership without an import batch', async () => {
    const first = await declareVehicle();
    await admin.query("UPDATE source_artifacts SET purge_after = '2027-01-01'");
    await admin.query(
      `INSERT INTO source_observations
        (fund_id,source_artifact_id,domain,source_type,effective_date,normalized_payload,
         observation_hash,candidate_fingerprint,status)
       VALUES ($1,$2,'ledger_event','manual','2026-11-04','{}',$3,$3,'staged')`,
      [fundId, first.body.sourceArtifactId, 'a'.repeat(64)]
    );
    expect(await retention.purgeVehicleOnboardingArtifacts(now, database)).toBe(0);
    expect(
      (await admin.query('SELECT payload IS NOT NULL AS retained FROM source_artifacts')).rows[0]
        .retained
    ).toBe(true);
  });

  it('fails closed for changed digest or unexpected snapshot ownership', async () => {
    const first = await declareVehicle();
    await admin.query(
      "UPDATE source_artifacts SET purge_after = '2027-01-01', payload_sha256 = $2 WHERE id = $1",
      [first.body.sourceArtifactId, 'b'.repeat(64)]
    );
    expect(await retention.purgeVehicleOnboardingArtifacts(now, database)).toBe(0);
    await admin.query('UPDATE source_artifacts SET payload_sha256 = $2 WHERE id = $1', [
      first.body.sourceArtifactId,
      first.body.sourceArtifactSha256,
    ]);
    await admin.query(
      `INSERT INTO financial_facts_snapshots
      (fund_id,policy_version,payload_schema_id,as_of_date,knowledge_cutoff,vehicle_scope,vehicle_ids,
       selection_set_hash,source_facts_input_hash,snapshot_input_hash,payload,consumer_evaluations,idempotency_key,request_hash)
      VALUES ($1,'1','synthetic','2026-11-04',now(),'fund_all','[]','a','a','a',$2::jsonb,'{}',$3,$4)`,
      [
        fundId,
        JSON.stringify({
          openingAccountingState: { sourceArtifactId: first.body.sourceArtifactId },
        }),
        randomUUID(),
        'a'.repeat(64),
      ]
    );
    await retention.runRetentionSweep(now, database);
    expect(
      (
        await admin.query(
          'SELECT payload IS NOT NULL AS retained FROM source_artifacts WHERE id = $1',
          [first.body.sourceArtifactId]
        )
      ).rows[0].retained
    ).toBe(true);
  });

  it('rechecks a concurrent extension after waiting for the artifact row lock', async () => {
    const first = await declareVehicle();
    const sourceId = first.body.sourceArtifactId;
    await admin.query("UPDATE source_artifacts SET purge_after = '2027-01-01' WHERE id = $1", [
      sourceId,
    ]);
    const extender = await admin.connect();
    const sweeper = await admin.connect();
    const dialect = new PgDialect();
    const sweepDb = {
      execute: async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
        const rendered = dialect.sqlToQuery(query);
        return sweeper.query(rendered.sql, rendered.params);
      },
    } as unknown as typeof applicationDb;
    let sweep: Promise<number> | undefined;
    try {
      await extender.query('BEGIN');
      await extender.query(
        "UPDATE source_artifacts SET retention_extended_until = '2028-02-01' WHERE id = $1",
        [sourceId]
      );
      const pid = (await sweeper.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
        .pid;
      sweep = retention.purgeVehicleOnboardingArtifacts(now, sweepDb);
      let waiting = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const state = (
          await admin.query<{ waiting: boolean }>(
            "SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = $1",
            [pid]
          )
        ).rows[0];
        if (state?.waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      await extender.query('COMMIT');
      expect(await sweep).toBe(0);
      expect(
        (
          await admin.query(
            'SELECT payload IS NOT NULL AS retained FROM source_artifacts WHERE id = $1',
            [sourceId]
          )
        ).rows[0].retained
      ).toBe(true);
      expect(
        await retention.purgeVehicleOnboardingArtifacts(
          new Date('2028-03-01T00:00:00.000Z'),
          database
        )
      ).toBe(1);
    } finally {
      await extender.query('ROLLBACK');
      await sweep?.catch(() => undefined);
      extender.release();
      sweeper.release();
    }
  });
});
