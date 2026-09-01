import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';
import type { CurrentForecastV2 } from '../../shared/contracts/current-forecast-v2.contract';
import type { CurrentForecastDatabase } from '../../server/services/current-forecast-v2-service';
import { persistCurrentForecastShadowReconciliation } from '../../server/services/current-forecast-shadow-service';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const modeService = vi.hoisted(() => ({
  CURRENT_FORECAST_CALCULATION_KEY: 'current_forecast',
  resolveCurrentForecastModeResolution: vi.fn(),
}));
const forecastService = vi.hoisted(() => ({
  getOrCreateCurrentForecastV2WithReceipt: vi.fn(),
  resolveCurrentForecastPlanVersionId: vi.fn(),
  runCurrentForecastV2: vi.fn(),
}));

vi.mock('../../server/services/current-forecast-calc-mode-resolver', () => modeService);
vi.mock('../../server/services/current-forecast-v2-service', () => forecastService);

import { runManualCurrentForecastRecompute } from '../../server/services/current-forecast-shadow-trigger';

const skipIfNoDocker =
  !process.env.TEST_DATABASE_URL && !process.env.CI && process.platform === 'win32';

let adminPool: Pool | undefined;
let pool: Pool | undefined;
let database: CurrentForecastDatabase | undefined;
let databaseName = '';
let connectionString = '';
let startedTestContainers = false;
let nextFundId = 229_055_100;

describe.skipIf(skipIfNoDocker)('manual current-forecast recompute PostgreSQL proof', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }

    adminPool = new Pool({ connectionString: testDatabaseConnectionString(), max: 1 });
    databaseName = `cf_manual_recompute_${process.pid}_${Date.now()}`.toLowerCase();
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    connectionString = databaseConnectionString(databaseName);
    await runMigrationsWithConnectionString(connectionString);
    pool = new Pool({ connectionString, max: 8 });
    database = drizzle(pool, { schema }) as unknown as CurrentForecastDatabase;
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    if (adminPool && databaseName.startsWith('cf_manual_recompute_')) {
      await adminPool.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`
      );
      await adminPool.end();
    }
    if (startedTestContainers) await cleanupTestContainers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    modeService.resolveCurrentForecastModeResolution.mockResolvedValue({
      mode: 'shadow',
      cutoverReferenceId: null,
    });
  });

  it('returns the existing reconciliation for a duplicate non-null result hash', async () => {
    const fundId = await insertFund();
    const record = reconciliationRecord(fundId, 'a'.repeat(64), 'b'.repeat(64));

    const created = await persistCurrentForecastShadowReconciliation(record, requiredDatabase());
    const duplicate = await persistCurrentForecastShadowReconciliation(record, requiredDatabase());

    expect(created.created).toBe(true);
    expect(duplicate).toEqual({ id: created.id, created: false });
  });

  it('returns the existing reconciliation for a duplicate null result hash', async () => {
    const fundId = await insertFund();
    const record = reconciliationRecord(fundId, 'c'.repeat(64), null);

    const created = await persistCurrentForecastShadowReconciliation(record, requiredDatabase());
    const duplicate = await persistCurrentForecastShadowReconciliation(record, requiredDatabase());

    expect(created.created).toBe(true);
    expect(duplicate).toEqual({ id: created.id, created: false });
  });

  it('executes one core recompute while a concurrent duplicate reports in-flight', async () => {
    const fundId = await insertFund();
    const barrier = deferred<void>();
    const started = deferred<void>();
    const result = forecastResult(fundId, 'd'.repeat(64), 'e'.repeat(64));
    mockReceipt(result);
    forecastService.runCurrentForecastV2.mockImplementationOnce(async () => {
      started.resolve(undefined);
      await barrier.promise;
      return result;
    });

    const first = runManualCurrentForecastRecompute({
      fundId,
      idempotencyKey: 'concurrent-same-key',
      actorId: null,
      database: requiredDatabase(),
    });
    await started.promise;

    await expect(
      runManualCurrentForecastRecompute({
        fundId,
        idempotencyKey: 'concurrent-same-key',
        actorId: null,
        database: requiredDatabase(),
      })
    ).rejects.toMatchObject({ code: 'RECOMPUTE_IN_FLIGHT' });

    barrier.resolve(undefined);
    await expect(first).resolves.toMatchObject({ status: 'completed', replayed: false });
    expect(forecastService.runCurrentForecastV2).toHaveBeenCalledTimes(1);
  });

  it('links a manual command to an organic reconciliation without claiming creation', async () => {
    const fundId = await insertFund();
    const result = forecastResult(fundId, 'f'.repeat(64), '1'.repeat(64));
    mockReceipt(result);
    forecastService.runCurrentForecastV2.mockResolvedValue(result);
    const organic = await persistCurrentForecastShadowReconciliation(
      reconciliationRecord(fundId, result.inputHash, result.resultHash),
      requiredDatabase()
    );

    const outcome = await runManualCurrentForecastRecompute({
      fundId,
      idempotencyKey: 'organic-dedup',
      actorId: null,
      database: requiredDatabase(),
    });

    expect(outcome).toEqual({
      status: 'completed',
      shadowReconciliationId: organic.id,
      replayed: false,
    });
    const command = await requiredPool().query<{
      shadow_reconciliation_id: number;
      created_reconciliation: boolean;
      reference_count: string;
    }>(
      `
        SELECT
          command.shadow_reconciliation_id,
          command.created_reconciliation,
          (
            SELECT COUNT(*)
            FROM current_forecast_references
            WHERE fund_id = $1
          ) AS reference_count
        FROM current_forecast_recompute_commands command
        WHERE command.fund_id = $1 AND command.idempotency_key = 'organic-dedup'
      `,
      [fundId]
    );
    expect(command.rows[0]).toEqual({
      shadow_reconciliation_id: organic.id,
      created_reconciliation: false,
      reference_count: '0',
    });
  });

  it('rolls back snapshot and reconciliation when stale finalization wins the pending CAS', async () => {
    const fundId = await insertFund();
    const result = forecastResult(fundId, '2'.repeat(64), '3'.repeat(64));
    const inserted = deferred<void>();
    const release = deferred<void>();
    mockReceipt(result);
    forecastService.runCurrentForecastV2.mockImplementationOnce(
      async ({ database: transaction }: { database: CurrentForecastDatabase }) => {
        await transaction.insert(schema.fundSnapshots).values({
          fundId,
          type: 'CURRENT_FORECAST_V2',
          payload: result,
          calcVersion: 'cf-v2/1.0.0',
          correlationId: `00000000-0000-4000-8000-${String(fundId).padStart(12, '0')}`,
          snapshotTime: new Date('2026-08-31T23:59:00.000Z'),
        });
        inserted.resolve(undefined);
        await release.promise;
        return result;
      }
    );

    const execution = runManualCurrentForecastRecompute({
      fundId,
      idempotencyKey: 'lost-final-cas',
      actorId: null,
      database: requiredDatabase(),
    });
    await inserted.promise;
    await requiredPool().query(
      `
        UPDATE current_forecast_recompute_commands
        SET status = 'failed', failure_code = 'stale_pending', finalized_at = NOW()
        WHERE fund_id = $1 AND idempotency_key = 'lost-final-cas' AND status = 'pending'
      `,
      [fundId]
    );
    release.resolve(undefined);

    await expect(execution).resolves.toEqual({
      status: 'failed',
      failureCode: 'stale_pending',
      replayed: false,
    });
    const residue = await requiredPool().query<{
      snapshots: string;
      reconciliations: string;
      references: string;
      shadow_reconciliation_id: number | null;
      created_reconciliation: boolean;
    }>(
      `
        SELECT
          (SELECT COUNT(*) FROM fund_snapshots WHERE fund_id = $1 AND type = 'CURRENT_FORECAST_V2') AS snapshots,
          (SELECT COUNT(*) FROM substrate_shadow_reconciliations WHERE fund_id = $1 AND calculation_key = 'current_forecast') AS reconciliations,
          (SELECT COUNT(*) FROM current_forecast_references WHERE fund_id = $1) AS references,
          (
            SELECT shadow_reconciliation_id
            FROM current_forecast_recompute_commands
            WHERE fund_id = $1 AND idempotency_key = 'lost-final-cas'
          ) AS shadow_reconciliation_id,
          (
            SELECT created_reconciliation
            FROM current_forecast_recompute_commands
            WHERE fund_id = $1 AND idempotency_key = 'lost-final-cas'
          ) AS created_reconciliation
      `,
      [fundId]
    );
    expect(residue.rows[0]).toEqual({
      snapshots: '0',
      reconciliations: '0',
      references: '0',
      shadow_reconciliation_id: null,
      created_reconciliation: false,
    });
  });
});

function mockReceipt(result: CurrentForecastV2): void {
  forecastService.getOrCreateCurrentForecastV2WithReceipt.mockResolvedValue({
    fundSnapshotId: 901,
    result,
  });
}

function forecastResult(fundId: number, inputHash: string, resultHash: string): CurrentForecastV2 {
  return {
    fundId,
    financialFactsSnapshotId: '31',
    currentPlanVersionId: '21',
    status: 'available',
    inputHash,
    resultHash,
    assumptionsHash: '4'.repeat(64),
    methodologyVersion: 'cohort-projection-v2/1.0.0',
  } as CurrentForecastV2;
}

function reconciliationRecord(fundId: number, inputHash: string, resultHash: string | null) {
  return {
    fundId,
    calculationKey: 'current_forecast',
    configuredMode: 'shadow',
    effectiveMode: 'shadow',
    killSwitchActive: false,
    substrateState: resultHash === null ? 'unavailable' : 'available',
    reconciliationStatus: resultHash === null ? 'mismatch' : 'match',
    inputHash,
    resultHash,
    assumptionsHash: '4'.repeat(64),
    mismatches: resultHash === null ? ['facts_gap'] : [],
  } as const;
}

async function insertFund(): Promise<number> {
  const fundId = nextFundId++;
  await requiredPool().query(
    `
      INSERT INTO funds (id, name, size, management_fee, carry_percentage, vintage_year)
      VALUES ($1, $2, 10000000, '0.0200', '0.2000', 2026)
    `,
    [fundId, `Manual recompute proof ${fundId}`]
  );
  return fundId;
}

function requiredPool(): Pool {
  if (!pool) throw new Error('PostgreSQL proof pool not initialized.');
  return pool;
}

function requiredDatabase(): CurrentForecastDatabase {
  if (!database) throw new Error('PostgreSQL proof database not initialized.');
  return database;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function testDatabaseConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
}

function databaseConnectionString(database: string): string {
  const base = new URL(testDatabaseConnectionString());
  base.pathname = `/${database}`;
  return base.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
