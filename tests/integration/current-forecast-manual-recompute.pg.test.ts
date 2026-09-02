import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';
import type { CurrentForecastV2 } from '../../shared/contracts/current-forecast-v2.contract';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import type { CurrentForecastDatabase } from '../../server/services/current-forecast-v2-service';
import { CURRENT_FORECAST_FUND_LOCK_CLASS } from '../../server/services/current-forecast-fund-lock';
import {
  activateCurrentForecast,
  createCandidateCurrentForecastReference,
  type CurrentForecastReferenceDatabase,
} from '../../server/services/current-forecast-reference-service';
import { persistCurrentForecastShadowReconciliation } from '../../server/services/current-forecast-shadow-service';
import { updateCurrentForecastCalculationMode } from '../../server/services/fund-calculation-mode-service';
import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';
import { runMigrationsWithConnectionString } from '../helpers/testcontainers-migration';

const modeService = vi.hoisted(() => ({
  CURRENT_FORECAST_CALCULATION_KEY: 'current_forecast',
  currentForecastModeReaderForDatabase: vi.fn(() => vi.fn()),
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

  it('stamps a lock-waiting manual claim inside the new shadow interval when reconciliation deduplicates', async () => {
    const fundId = await insertFund();
    const fixture = await seedActivationFixture(fundId);
    const result = forecastResult(fundId, '1'.repeat(64), '2'.repeat(64));
    mockReceipt(result);
    forecastService.runCurrentForecastV2.mockResolvedValue(result);
    const organic = await persistCurrentForecastShadowReconciliation(
      reconciliationRecord(fundId, result.inputHash, result.resultHash),
      requiredDatabase()
    );
    const holder = await requiredPool().connect();
    let holderOpen = false;

    try {
      await holder.query('BEGIN');
      holderOpen = true;
      await holder.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [
        CURRENT_FORECAST_FUND_LOCK_CLASS,
        fundId,
      ]);

      const manual = runManualCurrentForecastRecompute({
        fundId,
        idempotencyKey: `lock-wait-dedup-${fundId}`,
        actorId: null,
        database: requiredDatabase(),
      });
      await waitForFundLockWaiter(fundId);
      expect(await commandCount(fundId)).toBe(0);

      await holder.query(
        `
          UPDATE fund_calculation_modes
          SET shadow_started_at = clock_timestamp(), version = version + 1
          WHERE fund_id = $1 AND calculation_key = 'current_forecast'
        `,
        [fundId]
      );
      await holder.query('COMMIT');
      holderOpen = false;

      await expect(manual).resolves.toEqual({
        status: 'completed',
        shadowReconciliationId: organic.id,
        replayed: false,
      });
    } finally {
      if (holderOpen) await holder.query('ROLLBACK');
      holder.release();
    }

    const ordering = await requiredPool().query<{
      created_reconciliation: boolean;
      started_after_reset: boolean;
    }>(
      `
        SELECT
          command.created_reconciliation,
          command.started_at >= mode.shadow_started_at AS started_after_reset
        FROM current_forecast_recompute_commands AS command
        JOIN fund_calculation_modes AS mode
          ON mode.fund_id = command.fund_id
         AND mode.calculation_key = 'current_forecast'
        WHERE command.fund_id = $1 AND command.idempotency_key = $2
      `,
      [fundId, `lock-wait-dedup-${fundId}`]
    );
    expect
      .soft(ordering.rows)
      .toEqual([{ created_reconciliation: false, started_after_reset: true }]);

    await expect
      .soft(
        activateCurrentForecast({
          fundId,
          referenceId: fixture.referenceId,
          expectedVersion: 2,
          idempotencyKey: `lock-wait-dedup-activate-${fundId}`,
          actorId: null,
          database: referenceDatabase(),
          verifyGreenCandidate: async () => [],
        })
      )
      .rejects.toMatchObject({
        name: 'CurrentForecastActivationBlockedError',
        blockers: ['manual_recompute_since_shadow_start'],
      });
  });

  it('recovers a pending command that becomes stale while its claim waits on the fund lock', async () => {
    const fundId = await insertFund();
    const idempotencyKey = `stale-while-waiting-${fundId}`;
    await requiredPool().query(
      `
        INSERT INTO current_forecast_recompute_commands (
          fund_id, idempotency_key, request_hash, status,
          created_reconciliation, started_at
        )
        VALUES ($1, $2, $3, 'pending', false, clock_timestamp())
      `,
      [
        fundId,
        idempotencyKey,
        canonicalSha256({
          route: 'POST /api/funds/:fundId/current-forecast/recompute',
          fundId,
        }),
      ]
    );

    const holder = await requiredPool().connect();
    let holderOpen = false;
    try {
      await holder.query('BEGIN');
      holderOpen = true;
      await holder.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [
        CURRENT_FORECAST_FUND_LOCK_CLASS,
        fundId,
      ]);

      const recovery = runManualCurrentForecastRecompute({
        fundId,
        idempotencyKey,
        actorId: null,
        database: requiredDatabase(),
      });
      await waitForFundLockWaiter(fundId);

      const fresh = await holder.query<{ initially_fresh: boolean }>(
        `
          UPDATE current_forecast_recompute_commands
          SET started_at = clock_timestamp() - INTERVAL '87 seconds'
          WHERE fund_id = $1 AND idempotency_key = $2
          RETURNING clock_timestamp() - started_at < INTERVAL '90 seconds' AS initially_fresh
        `,
        [fundId, idempotencyKey]
      );
      expect(fresh.rows).toEqual([{ initially_fresh: true }]);

      await holder.query('SELECT pg_sleep(5)');
      const margin = await holder.query<{ seconds_over_threshold: string }>(
        `
          SELECT EXTRACT(EPOCH FROM (clock_timestamp() - started_at)) - 90
            AS seconds_over_threshold
          FROM current_forecast_recompute_commands
          WHERE fund_id = $1 AND idempotency_key = $2
        `,
        [fundId, idempotencyKey]
      );
      expect(Number(margin.rows[0]?.seconds_over_threshold)).toBeGreaterThan(1.5);

      await holder.query('COMMIT');
      holderOpen = false;
      await expect(recovery).resolves.toEqual({
        status: 'failed',
        failureCode: 'stale_pending',
        replayed: true,
      });
    } finally {
      if (holderOpen) await holder.query('ROLLBACK');
      holder.release();
    }
  });

  it('stamps stale recovery after a shadow boundary advanced while waiting on the fund lock', async () => {
    const fundId = await insertFund();
    const fixture = await seedActivationFixture(fundId);
    const idempotencyKey = `stale-recovery-boundary-${fundId}`;
    await requiredPool().query(
      `
        INSERT INTO current_forecast_recompute_commands (
          fund_id, idempotency_key, request_hash, status,
          created_reconciliation, started_at
        )
        VALUES (
          $1, $2, $3, 'pending', false,
          clock_timestamp() - INTERVAL '2 minutes'
        )
      `,
      [
        fundId,
        idempotencyKey,
        canonicalSha256({
          route: 'POST /api/funds/:fundId/current-forecast/recompute',
          fundId,
        }),
      ]
    );
    const holder = await requiredPool().connect();
    let holderOpen = false;

    try {
      await holder.query('BEGIN');
      holderOpen = true;
      await holder.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [
        CURRENT_FORECAST_FUND_LOCK_CLASS,
        fundId,
      ]);

      const recovery = runManualCurrentForecastRecompute({
        fundId,
        idempotencyKey,
        actorId: null,
        database: requiredDatabase(),
      });
      await waitForFundLockWaiter(fundId);

      await holder.query(
        `
          UPDATE fund_calculation_modes
          SET shadow_started_at = clock_timestamp(), version = version + 1
          WHERE fund_id = $1 AND calculation_key = 'current_forecast'
        `,
        [fundId]
      );
      await holder.query('COMMIT');
      holderOpen = false;

      await expect(recovery).resolves.toEqual({
        status: 'failed',
        failureCode: 'stale_pending',
        replayed: true,
      });
    } finally {
      if (holderOpen) await holder.query('ROLLBACK');
      holder.release();
    }

    const ordering = await requiredPool().query<{ finalized_after_reset: boolean }>(
      `
        SELECT command.finalized_at >= mode.shadow_started_at AS finalized_after_reset
        FROM current_forecast_recompute_commands AS command
        JOIN fund_calculation_modes AS mode
          ON mode.fund_id = command.fund_id
         AND mode.calculation_key = 'current_forecast'
        WHERE command.fund_id = $1 AND command.idempotency_key = $2
      `,
      [fundId, idempotencyKey]
    );
    expect.soft(ordering.rows).toEqual([{ finalized_after_reset: true }]);

    await expect
      .soft(
        activateCurrentForecast({
          fundId,
          referenceId: fixture.referenceId,
          expectedVersion: 2,
          idempotencyKey: `stale-recovery-activate-${fundId}`,
          actorId: null,
          database: referenceDatabase(),
          verifyGreenCandidate: async () => [],
        })
      )
      .rejects.toMatchObject({
        name: 'CurrentForecastActivationBlockedError',
        blockers: ['manual_recompute_since_shadow_start'],
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

  it('orders manual completion after a concurrent shadow reset before activation', async () => {
    const fundId = await insertFund();
    const fixture = await seedActivationFixture(fundId);
    const result = forecastResult(fundId, '7'.repeat(64), '8'.repeat(64));
    const transactionStarted = deferred<void>();
    const release = deferred<void>();

    await updateCurrentForecastCalculationMode({
      fundId,
      expectedVersion: 1,
      configuredMode: 'off',
      idempotencyKey: `reset-race-off-${fundId}`,
      actorId: null,
      sources: { sourceInputHash: `reset-race-off-${fundId}` },
      database: referenceDatabase(),
    });

    mockReceipt(result);
    forecastService.runCurrentForecastV2.mockImplementationOnce(
      async ({ database: transaction }: { database: CurrentForecastDatabase }) => {
        await transaction.execute(sql`SELECT NOW()`);
        transactionStarted.resolve(undefined);
        await release.promise;
        return result;
      }
    );

    const manual = runManualCurrentForecastRecompute({
      fundId,
      idempotencyKey: `reset-race-manual-${fundId}`,
      actorId: null,
      database: requiredDatabase(),
    });
    await transactionStarted.promise;

    try {
      const reset = await updateCurrentForecastCalculationMode({
        fundId,
        expectedVersion: 2,
        configuredMode: 'shadow',
        idempotencyKey: `reset-race-shadow-${fundId}`,
        actorId: null,
        sources: { sourceInputHash: `reset-race-shadow-${fundId}` },
        database: referenceDatabase(),
      });
      expect(reset.response).toMatchObject({ configuredMode: 'shadow', version: 3 });
    } finally {
      release.resolve(undefined);
    }
    await expect(manual).resolves.toMatchObject({ status: 'completed', replayed: false });

    const ordering = await requiredPool().query<{
      status: string;
      created_reconciliation: boolean;
      finalized_after_reset: boolean;
    }>(
      `
        SELECT command.status,
               command.created_reconciliation,
               command.finalized_at >= mode.shadow_started_at AS finalized_after_reset
        FROM current_forecast_recompute_commands AS command
        JOIN fund_calculation_modes AS mode
          ON mode.fund_id = command.fund_id
         AND mode.calculation_key = 'current_forecast'
        WHERE command.fund_id = $1
          AND command.idempotency_key = $2
      `,
      [fundId, `reset-race-manual-${fundId}`]
    );
    expect.soft(ordering.rows[0]).toEqual({
      status: 'completed',
      created_reconciliation: true,
      finalized_after_reset: true,
    });

    await expect
      .soft(
        activateCurrentForecast({
          fundId,
          referenceId: fixture.referenceId,
          expectedVersion: 3,
          idempotencyKey: `reset-race-activate-${fundId}`,
          actorId: null,
          database: referenceDatabase(),
          verifyGreenCandidate: async () => [],
        })
      )
      .rejects.toMatchObject({
        name: 'CurrentForecastActivationBlockedError',
        blockers: ['manual_recompute_since_shadow_start'],
      });
  });

  it('serializes failed terminalization after a shadow reset and blocks activation', async () => {
    const fundId = await insertFund();
    const fixture = await seedActivationFixture(fundId);
    const terminalizationStarted = deferred<void>();
    const releaseTerminalization = deferred<void>();
    const idempotencyKey = `failed-reset-race-${fundId}`;

    forecastService.getOrCreateCurrentForecastV2WithReceipt.mockImplementationOnce(async () => {
      terminalizationStarted.resolve(undefined);
      await releaseTerminalization.promise;
      throw new Error('synthetic manual recompute failure');
    });

    const manual = runManualCurrentForecastRecompute({
      fundId,
      idempotencyKey,
      actorId: null,
      database: requiredDatabase(),
    });
    await terminalizationStarted.promise;

    const holder = await requiredPool().connect();
    let holderOpen = false;
    try {
      await holder.query('BEGIN');
      holderOpen = true;
      await holder.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [
        CURRENT_FORECAST_FUND_LOCK_CLASS,
        fundId,
      ]);
      await holder.query(
        `
          UPDATE fund_calculation_modes
          SET shadow_started_at = clock_timestamp(), version = version + 1
          WHERE fund_id = $1 AND calculation_key = 'current_forecast'
        `,
        [fundId]
      );

      releaseTerminalization.resolve(undefined);
      await Promise.race([
        waitForFundLockWaiter(fundId),
        manual.then(() => {
          throw new Error('Failed terminalization completed without waiting on fund lock.');
        }),
      ]);

      await holder.query('COMMIT');
      holderOpen = false;
    } finally {
      releaseTerminalization.resolve(undefined);
      if (holderOpen) await holder.query('ROLLBACK');
      holder.release();
    }

    await expect(manual).resolves.toEqual({
      status: 'failed',
      failureCode: 'execution_error',
      replayed: false,
    });
    const ordering = await requiredPool().query<{ finalized_after_reset: boolean }>(
      `
        SELECT command.finalized_at >= mode.shadow_started_at AS finalized_after_reset
        FROM current_forecast_recompute_commands AS command
        JOIN fund_calculation_modes AS mode
          ON mode.fund_id = command.fund_id
          AND mode.calculation_key = 'current_forecast'
        WHERE command.fund_id = $1 AND command.idempotency_key = $2
      `,
      [fundId, idempotencyKey]
    );
    expect(ordering.rows).toEqual([{ finalized_after_reset: true }]);

    await expect(
      activateCurrentForecast({
        fundId,
        referenceId: fixture.referenceId,
        expectedVersion: 2,
        idempotencyKey: `failed-reset-race-activate-${fundId}`,
        actorId: null,
        database: referenceDatabase(),
        verifyGreenCandidate: async () => [],
      })
    ).rejects.toMatchObject({
      name: 'CurrentForecastActivationBlockedError',
      blockers: ['manual_recompute_since_shadow_start'],
    });
  });

  it('serializes skipped terminalization after a shadow reset and blocks activation', async () => {
    const fundId = await insertFund();
    const fixture = await seedActivationFixture(fundId);
    const terminalizationStarted = deferred<void>();
    const releaseTerminalization = deferred<void>();
    const idempotencyKey = `skipped-reset-race-${fundId}`;

    modeService.resolveCurrentForecastModeResolution.mockImplementationOnce(async () => {
      terminalizationStarted.resolve(undefined);
      await releaseTerminalization.promise;
      return { mode: 'on', cutoverReferenceId: fixture.referenceId };
    });

    const manual = runManualCurrentForecastRecompute({
      fundId,
      idempotencyKey,
      actorId: null,
      database: requiredDatabase(),
    });
    await terminalizationStarted.promise;

    const holder = await requiredPool().connect();
    let holderOpen = false;
    try {
      await holder.query('BEGIN');
      holderOpen = true;
      await holder.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [
        CURRENT_FORECAST_FUND_LOCK_CLASS,
        fundId,
      ]);
      await holder.query(
        `
          UPDATE fund_calculation_modes
          SET shadow_started_at = clock_timestamp(), version = version + 1
          WHERE fund_id = $1 AND calculation_key = 'current_forecast'
        `,
        [fundId]
      );

      releaseTerminalization.resolve(undefined);
      await Promise.race([
        waitForFundLockWaiter(fundId),
        manual.then(() => {
          throw new Error('Skipped terminalization completed without waiting on fund lock.');
        }),
      ]);

      await holder.query('COMMIT');
      holderOpen = false;
    } finally {
      releaseTerminalization.resolve(undefined);
      if (holderOpen) await holder.query('ROLLBACK');
      holder.release();
    }

    await expect(manual).resolves.toEqual({ status: 'skipped', replayed: false });
    const ordering = await requiredPool().query<{ finalized_after_reset: boolean }>(
      `
        SELECT command.finalized_at >= mode.shadow_started_at AS finalized_after_reset
        FROM current_forecast_recompute_commands AS command
        JOIN fund_calculation_modes AS mode
          ON mode.fund_id = command.fund_id
          AND mode.calculation_key = 'current_forecast'
        WHERE command.fund_id = $1 AND command.idempotency_key = $2
      `,
      [fundId, idempotencyKey]
    );
    expect(ordering.rows).toEqual([{ finalized_after_reset: true }]);

    await expect(
      activateCurrentForecast({
        fundId,
        referenceId: fixture.referenceId,
        expectedVersion: 2,
        idempotencyKey: `skipped-reset-race-activate-${fundId}`,
        actorId: null,
        database: referenceDatabase(),
        verifyGreenCandidate: async () => [],
      })
    ).rejects.toMatchObject({
      name: 'CurrentForecastActivationBlockedError',
      blockers: ['manual_recompute_since_shadow_start'],
    });
  });

  it('blocks a pre-boundary manual command while pending and after deduplicated completion', async () => {
    const fundId = await insertFund();
    const fixture = await seedActivationFixture(fundId);
    const result = forecastResult(fundId, '3'.repeat(64), '4'.repeat(64));
    const computationStarted = deferred<void>();
    const releaseComputation = deferred<void>();
    mockReceipt(result);
    forecastService.runCurrentForecastV2.mockImplementationOnce(async () => {
      computationStarted.resolve(undefined);
      await releaseComputation.promise;
      return result;
    });
    const organic = await persistCurrentForecastShadowReconciliation(
      reconciliationRecord(fundId, result.inputHash, result.resultHash),
      requiredDatabase()
    );

    const manual = runManualCurrentForecastRecompute({
      fundId,
      idempotencyKey: `pre-boundary-pending-${fundId}`,
      actorId: null,
      database: requiredDatabase(),
    });
    await computationStarted.promise;

    await updateCurrentForecastCalculationMode({
      fundId,
      expectedVersion: 1,
      configuredMode: 'off',
      idempotencyKey: `pre-boundary-off-${fundId}`,
      actorId: null,
      sources: { sourceInputHash: `pre-boundary-off-${fundId}` },
      database: referenceDatabase(),
    });
    await updateCurrentForecastCalculationMode({
      fundId,
      expectedVersion: 2,
      configuredMode: 'shadow',
      idempotencyKey: `pre-boundary-shadow-${fundId}`,
      actorId: null,
      sources: { sourceInputHash: `pre-boundary-shadow-${fundId}` },
      database: referenceDatabase(),
    });

    const pendingActivation = await activateCurrentForecast({
      fundId,
      referenceId: fixture.referenceId,
      expectedVersion: 3,
      idempotencyKey: `pre-boundary-pending-activate-${fundId}`,
      actorId: null,
      database: rollbackOnlyReferenceDatabase(),
      verifyGreenCandidate: async () => [],
    }).then(
      (value) => ({ status: 'resolved' as const, value }),
      (error: unknown) => ({ status: 'rejected' as const, error })
    );

    releaseComputation.resolve(undefined);
    await expect(manual).resolves.toEqual({
      status: 'completed',
      shadowReconciliationId: organic.id,
      replayed: false,
    });
    expect.soft(pendingActivation).toMatchObject({
      status: 'rejected',
      error: {
        name: 'CurrentForecastActivationBlockedError',
        blockers: ['manual_recompute_since_shadow_start'],
      },
    });

    const residue = await requiredPool().query<{
      created_reconciliation: boolean;
      finalized_after_reset: boolean;
    }>(
      `
        SELECT
          command.created_reconciliation,
          command.finalized_at >= mode.shadow_started_at AS finalized_after_reset
        FROM current_forecast_recompute_commands AS command
        JOIN fund_calculation_modes AS mode
          ON mode.fund_id = command.fund_id
         AND mode.calculation_key = 'current_forecast'
        WHERE command.fund_id = $1 AND command.idempotency_key = $2
      `,
      [fundId, `pre-boundary-pending-${fundId}`]
    );
    expect(residue.rows).toEqual([{ created_reconciliation: false, finalized_after_reset: true }]);

    await expect
      .soft(
        activateCurrentForecast({
          fundId,
          referenceId: fixture.referenceId,
          expectedVersion: 3,
          idempotencyKey: `pre-boundary-completed-activate-${fundId}`,
          actorId: null,
          database: referenceDatabase(),
          verifyGreenCandidate: async () => [],
        })
      )
      .rejects.toMatchObject({
        name: 'CurrentForecastActivationBlockedError',
        blockers: ['manual_recompute_since_shadow_start'],
      });
  });

  it('serializes a shadow reset after locked manual reconciliation persistence', async () => {
    const fundId = await insertFund();
    await seedActivationFixture(fundId);
    const result = forecastResult(fundId, '9'.repeat(64), 'a'.repeat(64));
    const completionLockAcquired = deferred<void>();
    const releaseManual = deferred<void>();

    await updateCurrentForecastCalculationMode({
      fundId,
      expectedVersion: 1,
      configuredMode: 'off',
      idempotencyKey: `manual-first-off-${fundId}`,
      actorId: null,
      sources: { sourceInputHash: `manual-first-off-${fundId}` },
      database: referenceDatabase(),
    });

    mockReceipt(result);
    forecastService.runCurrentForecastV2.mockResolvedValue(result);

    const manual = runManualCurrentForecastRecompute({
      fundId,
      idempotencyKey: `manual-first-recompute-${fundId}`,
      actorId: null,
      database: pauseAfterSecondFundLock({
        database: requiredDatabase(),
        acquired: completionLockAcquired,
        release: releaseManual,
      }),
    });
    let reset: ReturnType<typeof updateCurrentForecastCalculationMode> | undefined;
    try {
      await Promise.race([
        completionLockAcquired.promise,
        manual.then(() => {
          throw new Error('Manual recompute completed before its second fund-lock acquisition.');
        }),
      ]);

      reset = updateCurrentForecastCalculationMode({
        fundId,
        expectedVersion: 2,
        configuredMode: 'shadow',
        idempotencyKey: `manual-first-shadow-${fundId}`,
        actorId: null,
        sources: { sourceInputHash: `manual-first-shadow-${fundId}` },
        database: referenceDatabase(),
      });
      await waitForFundLockWaiter(fundId);

      const beforeRelease = await requiredPool().query<{
        configured_mode: string;
        shadow_started_at: Date | null;
        version: number;
      }>(
        `
          SELECT configured_mode, shadow_started_at, version
          FROM fund_calculation_modes
          WHERE fund_id = $1 AND calculation_key = 'current_forecast'
        `,
        [fundId]
      );
      expect(beforeRelease.rows).toEqual([
        { configured_mode: 'off', shadow_started_at: null, version: 2 },
      ]);
    } finally {
      releaseManual.resolve(undefined);
    }
    await expect(manual).resolves.toMatchObject({ status: 'completed', replayed: false });
    if (!reset) throw new Error('Shadow reset did not start.');
    await expect(reset).resolves.toMatchObject({
      replayed: false,
      response: { configuredMode: 'shadow', version: 3 },
    });

    const ordering = await requiredPool().query<{ finalized_before_reset: boolean }>(
      `
        SELECT command.finalized_at < mode.shadow_started_at AS finalized_before_reset
        FROM current_forecast_recompute_commands AS command
        JOIN fund_calculation_modes AS mode
          ON mode.fund_id = command.fund_id
         AND mode.calculation_key = 'current_forecast'
        WHERE command.fund_id = $1
          AND command.idempotency_key = $2
      `,
      [fundId, `manual-first-recompute-${fundId}`]
    );
    expect(ordering.rows).toEqual([{ finalized_before_reset: true }]);
  });

  it('preserves shadow boundary microseconds on same-interval updates', async () => {
    const fundId = await insertFund();
    await seedActivationFixture(fundId);
    const shadowStartedAt = '2026-08-01 00:00:00.123456+00';

    await requiredPool().query(
      `
        UPDATE fund_calculation_modes
        SET shadow_started_at = $2::timestamptz
        WHERE fund_id = $1 AND calculation_key = 'current_forecast'
      `,
      [fundId, shadowStartedAt]
    );

    await expect(
      updateCurrentForecastCalculationMode({
        fundId,
        expectedVersion: 1,
        configuredMode: 'shadow',
        killSwitchActive: true,
        idempotencyKey: `precision-stay-shadow-${fundId}`,
        actorId: null,
        sources: { sourceInputHash: hex64(`input-${fundId}`) },
        database: referenceDatabase(),
      })
    ).resolves.toMatchObject({
      response: { configuredMode: 'shadow', killSwitchActive: true, version: 2 },
      replayed: false,
    });

    const persisted = await requiredPool().query<{ shadow_started_at: string }>(
      `
        SELECT shadow_started_at::text AS shadow_started_at
        FROM fund_calculation_modes
        WHERE fund_id = $1 AND calculation_key = 'current_forecast'
      `,
      [fundId]
    );
    expect(persisted.rows).toEqual([{ shadow_started_at: shadowStartedAt }]);
  });

  it('compares manual-run boundaries at PostgreSQL timestamp precision', async () => {
    const fundId = await insertFund();
    const fixture = await seedActivationFixture(fundId);
    const shadowStartedAt = '2026-08-01 00:00:00.123789+00';
    const manualTimestamp = '2026-08-01 00:00:00.123456+00';

    await requiredPool().query(
      `
        UPDATE fund_calculation_modes
        SET shadow_started_at = $2::timestamptz
        WHERE fund_id = $1 AND calculation_key = 'current_forecast'
      `,
      [fundId, shadowStartedAt]
    );
    await requiredPool().query(
      `
        INSERT INTO current_forecast_recompute_commands (
          fund_id, idempotency_key, request_hash, status,
          created_reconciliation, started_at, finalized_at
        )
        VALUES ($1, $2, $3, 'skipped', false, $4::timestamptz, $4::timestamptz)
      `,
      [fundId, `precision-${fundId}`, hex64(`precision-${fundId}`), manualTimestamp]
    );

    await expect(
      activateCurrentForecast({
        fundId,
        referenceId: fixture.referenceId,
        expectedVersion: 1,
        idempotencyKey: `precision-activate-${fundId}`,
        actorId: null,
        database: referenceDatabase(),
        verifyGreenCandidate: async () => [],
      })
    ).resolves.toMatchObject({
      replayed: false,
      response: { configuredMode: 'on', version: 2 },
    });
  });

  it('serializes the manual claim against the activation check-and-flip in both orderings', async () => {
    // Ordering A: a claim that commits first blocks the flip. A raw session
    // holds the per-fund lock so the claim's own lock acquisition is observable.
    const fundA = await insertFund();
    const fixtureA = await seedActivationFixture(fundA);
    const resultA = forecastResult(fundA, '5'.repeat(64), '6'.repeat(64));
    mockReceipt(resultA);
    forecastService.runCurrentForecastV2.mockResolvedValue(resultA);

    const holder = await requiredPool().connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [
        CURRENT_FORECAST_FUND_LOCK_CLASS,
        fundA,
      ]);
      const claim = runManualCurrentForecastRecompute({
        fundId: fundA,
        idempotencyKey: 'ordering-a',
        actorId: null,
        database: requiredDatabase(),
      });
      await waitForFundLockWaiter(fundA);
      expect(await commandCount(fundA)).toBe(0);
      await holder.query('COMMIT');
      await expect(claim).resolves.toMatchObject({ status: 'completed', replayed: false });
    } finally {
      holder.release();
    }

    await expect(
      activateCurrentForecast({
        fundId: fundA,
        referenceId: fixtureA.referenceId,
        expectedVersion: 1,
        idempotencyKey: `activate-${fundA}`,
        actorId: null,
        database: referenceDatabase(),
        verifyGreenCandidate: async () => [],
      })
    ).rejects.toMatchObject({
      name: 'CurrentForecastActivationBlockedError',
      blockers: ['manual_recompute_since_shadow_start'],
    });
    expect(await activationState(fundA)).toEqual({
      configured_mode: 'shadow',
      activated: false,
      version: 1,
      candidate: true,
      requests: 0,
    });

    // Ordering B: a flip that commits first leaves the late claim as a harmless
    // post-flip row. The activation holds the lock while its green check is
    // parked; fund A's command row must not block another fund.
    const fundB = await insertFund();
    const fixtureB = await seedActivationFixture(fundB);
    const entered = deferred<void>();
    const release = deferred<void>();
    const activation = activateCurrentForecast({
      fundId: fundB,
      referenceId: fixtureB.referenceId,
      expectedVersion: 1,
      idempotencyKey: `activate-${fundB}`,
      actorId: null,
      database: referenceDatabase(),
      verifyGreenCandidate: async () => {
        entered.resolve(undefined);
        await release.promise;
        return [];
      },
    });
    await entered.promise;
    modeService.resolveCurrentForecastModeResolution.mockResolvedValue({
      mode: 'on',
      cutoverReferenceId: fixtureB.referenceId,
    });
    const lateClaim = runManualCurrentForecastRecompute({
      fundId: fundB,
      idempotencyKey: 'ordering-b',
      actorId: null,
      database: requiredDatabase(),
    });
    await waitForFundLockWaiter(fundB);
    expect(await commandCount(fundB)).toBe(0);
    release.resolve(undefined);

    await expect(activation).resolves.toMatchObject({
      replayed: false,
      response: { configuredMode: 'on', cutoverReferenceId: fixtureB.referenceId, version: 2 },
    });
    await expect(lateClaim).resolves.toEqual({ status: 'skipped', replayed: false });
    const postFlip = await requiredPool().query(
      `
        SELECT mode.configured_mode,
               mode.activated_at IS NOT NULL AS activated,
               command.status,
               command.started_at >= mode.activated_at AS started_after_flip
        FROM fund_calculation_modes AS mode
        JOIN current_forecast_recompute_commands AS command ON command.fund_id = mode.fund_id
        WHERE mode.fund_id = $1 AND mode.calculation_key = 'current_forecast'
      `,
      [fundB]
    );
    expect(postFlip.rows).toEqual([
      { configured_mode: 'on', activated: true, status: 'skipped', started_after_flip: true },
    ]);
  });

  it('replays a concurrent same-key activation after waiting on the per-fund lock', async () => {
    const fundId = await insertFund();
    const fixture = await seedActivationFixture(fundId);
    const entered = deferred<void>();
    const release = deferred<void>();
    let greenChecks = 0;
    const input = {
      fundId,
      referenceId: fixture.referenceId,
      expectedVersion: 1,
      idempotencyKey: `activate-same-key-${fundId}`,
      actorId: null,
      database: referenceDatabase(),
      verifyGreenCandidate: async () => {
        greenChecks += 1;
        entered.resolve(undefined);
        await release.promise;
        return [];
      },
    };

    const first = activateCurrentForecast(input);
    await entered.promise;
    const second = activateCurrentForecast(input);
    await waitForFundLockWaiter(fundId);
    release.resolve(undefined);

    const [winner, follower] = await Promise.all([first, second]);
    expect(winner.replayed).toBe(false);
    expect(follower).toEqual({ response: winner.response, replayed: true });
    expect(greenChecks).toBe(1);
    expect(await activationState(fundId)).toEqual({
      configured_mode: 'on',
      activated: true,
      version: 2,
      candidate: false,
      requests: 1,
    });
  });
});

async function seedActivationFixture(fundId: number): Promise<{ referenceId: number }> {
  const pool = requiredPool();
  await pool.query(
    `
      INSERT INTO fund_calculation_modes (fund_id, calculation_key, configured_mode, shadow_started_at, version)
      VALUES ($1, 'current_forecast', 'shadow', NOW() - INTERVAL '1 hour', 1)
    `,
    [fundId]
  );
  const factsSnapshotId = await insertedId(
    `
      INSERT INTO financial_facts_snapshots (
        fund_id, policy_version, payload_schema_id, as_of_date, knowledge_cutoff,
        vehicle_scope, vehicle_ids, selection_set_hash, source_facts_input_hash,
        snapshot_input_hash, payload, consumer_evaluations, idempotency_key, request_hash
      ) VALUES (
        $1, 'financial-facts-policy/1.2.0', 'financial-facts-payload/3', '2026-06-30', NOW(),
        'fund_all', '[]'::jsonb, $2, $3, $4, '{}'::jsonb, '[]'::jsonb, $5, $6
      )
      RETURNING id
    `,
    [
      fundId,
      hex64(`selection-${fundId}`),
      hex64(`source-${fundId}`),
      hex64(`snapshot-${fundId}`),
      `facts-${fundId}`,
      hex64(`request-${fundId}`),
    ]
  );
  const planVersionId = await insertedId(
    `
      INSERT INTO current_plan_versions (
        fund_id, version, source_config_id, source_config_version,
        source_facts_snapshot_id, deployable_capital_usd, plan_transformation_version,
        allocations, pacing_assumptions, cohort_assumptions, reserve_policy_version,
        assumptions_hash, idempotency_key, request_hash
      ) VALUES (
        $1, 1, 1, 1, $2, '10000000.000000', 'plan-transformation/1.0.0',
        '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'reserve-policy/1.0.0', $3, $4, $5
      )
      RETURNING id
    `,
    [fundId, factsSnapshotId, hex64(`plan-${fundId}`), `plan-${fundId}`, hex64('plan-req')]
  );
  const fundSnapshotId = await insertedId(
    `
      INSERT INTO fund_snapshots (fund_id, type, payload, calc_version, correlation_id, snapshot_time)
      VALUES ($1, 'CURRENT_FORECAST_V2', '{}'::jsonb, 'cf-v2/1.0.0', $2, NOW())
      RETURNING id
    `,
    [fundId, `00000000-0000-4000-8000-${String(fundId).padStart(12, '0')}`]
  );
  const reference = await createCandidateCurrentForecastReference({
    fundId,
    basis: {
      fundSnapshotId,
      currentPlanVersionId: planVersionId,
      financialFactsSnapshotId: factsSnapshotId,
      inputHash: hex64(`input-${fundId}`),
      resultHash: hex64(`result-${fundId}`),
      assumptionsHash: hex64(`assumptions-${fundId}`),
      engineVersion: 'current-forecast-v2-engine/1.0.0',
      methodologyVersion: 'cohort-projection-v2/1.0.0',
    },
    idempotencyKey: `cfref-${fundId}`,
    database: referenceDatabase(),
  });
  return { referenceId: reference.row.id };
}

async function activationState(fundId: number) {
  const result = await requiredPool().query(
    `
      SELECT mode.configured_mode,
             mode.activated_at IS NOT NULL AS activated,
             mode.version,
             (SELECT bool_and(candidate) FROM current_forecast_references WHERE fund_id = $1) AS candidate,
             (SELECT COUNT(*)::int FROM fund_calculation_mode_requests WHERE fund_id = $1) AS requests
      FROM fund_calculation_modes AS mode
      WHERE mode.fund_id = $1 AND mode.calculation_key = 'current_forecast'
    `,
    [fundId]
  );
  return result.rows[0];
}

async function commandCount(fundId: number): Promise<number> {
  const result = await requiredPool().query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM current_forecast_recompute_commands WHERE fund_id = $1',
    [fundId]
  );
  return result.rows[0]?.count ?? 0;
}

async function waitForFundLockWaiter(fundId: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await requiredPool().query<{ waiting: number }>(
      `
        SELECT COUNT(*)::int AS waiting
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND classid = $1::oid
          AND objid = $2::oid
          AND objsubid = 2
          AND NOT granted
      `,
      [CURRENT_FORECAST_FUND_LOCK_CLASS, fundId]
    );
    if ((result.rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No session waited on the current-forecast fund lock for fund ${fundId}.`);
}

function pauseAfterSecondFundLock(params: {
  database: CurrentForecastDatabase;
  acquired: ReturnType<typeof deferred<void>>;
  release: ReturnType<typeof deferred<void>>;
}): CurrentForecastDatabase {
  let acquisitions = 0;
  const wrapTransaction = (transaction: object) =>
    new Proxy(transaction, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (property !== 'execute' || typeof value !== 'function') {
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return async (query: unknown) => {
          const result = await value.call(target, query);
          if (JSON.stringify(query).includes('pg_advisory_xact_lock')) {
            acquisitions += 1;
            if (acquisitions === 2) {
              params.acquired.resolve(undefined);
              await params.release.promise;
            }
          }
          return result;
        };
      },
    });

  return new Proxy(params.database, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== 'transaction' || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (callback: (transaction: object) => unknown, ...args: unknown[]) =>
        value.call(
          target,
          (transaction: object) => callback(wrapTransaction(transaction)),
          ...args
        );
    },
  });
}

async function insertedId(query: string, values: unknown[]): Promise<number> {
  const result = await requiredPool().query<{ id: number }>(query, values);
  const id = result.rows[0]?.id;
  if (typeof id !== 'number') throw new Error('Expected an inserted id.');
  return id;
}

function hex64(seed: string): string {
  let value = '';
  for (let index = 0; value.length < 64; index += 1) {
    value += (seed.charCodeAt(index % seed.length) + index).toString(16).padStart(2, '0');
  }
  return value.slice(0, 64);
}

function referenceDatabase(): CurrentForecastReferenceDatabase {
  return requiredDatabase() as unknown as CurrentForecastReferenceDatabase;
}

function rollbackOnlyReferenceDatabase(): CurrentForecastReferenceDatabase {
  const database = referenceDatabase();
  return new Proxy(database, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== 'transaction' || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (callback: (transaction: object) => Promise<unknown>, ...args: unknown[]) => {
        const rollback = new Error('rollback activation probe');
        let result: unknown;
        try {
          await value.call(
            target,
            async (transaction: object) => {
              result = await callback(transaction);
              throw rollback;
            },
            ...args
          );
        } catch (error) {
          if (error !== rollback) throw error;
        }
        return result;
      };
    },
  });
}

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
