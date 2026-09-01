import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import type { CurrentForecastRecomputeCommand } from '../../../shared/schema/current-forecast-recompute-commands';

const modeService = vi.hoisted(() => ({
  resolveCurrentForecastModeResolution: vi.fn(),
}));
const forecastService = vi.hoisted(() => ({
  getOrCreateCurrentForecastV2WithReceipt: vi.fn(),
  resolveCurrentForecastPlanVersionId: vi.fn(),
  runCurrentForecastV2: vi.fn(),
}));
const shadowService = vi.hoisted(() => ({
  buildCurrentForecastShadowRecord: vi.fn(),
  persistCurrentForecastShadowFailure: vi.fn(),
  persistCurrentForecastShadowReconciliation: vi.fn(),
  runCurrentForecastShadowBase: vi.fn(),
}));
const referenceService = vi.hoisted(() => ({
  createCandidateCurrentForecastReference: vi.fn(),
  currentForecastReferenceIdempotencyKey: vi.fn(),
}));

vi.mock('../../../server/db', () => ({ db: {} }));
vi.mock('../../../server/lib/logger', () => ({
  logger: { child: () => ({ error: vi.fn() }) },
}));
vi.mock('../../../server/services/current-forecast-calc-mode-resolver', () => modeService);
vi.mock('../../../server/services/current-forecast-v2-service', () => forecastService);
vi.mock('../../../server/services/current-forecast-shadow-service', () => shadowService);
vi.mock('../../../server/services/current-forecast-reference-service', () => referenceService);

import { runManualCurrentForecastRecompute } from '../../../server/services/current-forecast-shadow-trigger';

const ROUTE = 'POST /api/funds/:fundId/current-forecast/recompute';
const FUND_ID = 7;
const IDEMPOTENCY_KEY = 'manual-recompute-1';
const COMMAND_ID = 81;
const receipt = {
  fundSnapshotId: 901,
  result: {
    fundId: FUND_ID,
    financialFactsSnapshotId: '31',
    currentPlanVersionId: '21',
  },
};

function requestHash(fundId = FUND_ID) {
  return canonicalSha256({ route: ROUTE, fundId });
}

function command(
  overrides: Partial<CurrentForecastRecomputeCommand> = {}
): CurrentForecastRecomputeCommand {
  return {
    id: COMMAND_ID,
    fundId: FUND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    requestHash: requestHash(),
    status: 'pending',
    failureCode: null,
    shadowReconciliationId: null,
    createdReconciliation: false,
    startedAt: new Date('2026-08-31T12:00:00.000Z'),
    finalizedAt: null,
    createdBy: 101,
    ...overrides,
  };
}

interface HarnessOptions {
  existing?: CurrentForecastRecomputeCommand;
  stalePending?: boolean;
  loseFinalCas?: boolean;
  transactionError?: Error;
}

function makeHarness(options: HarnessOptions = {}) {
  let row = options.existing;
  const updatePatches: Array<Record<string, unknown>> = [];
  const transactionDb = {} as Record<string, unknown>;

  const applyUpdate = (patch: Record<string, unknown>) => {
    updatePatches.push(patch);
    if (!row || row.status !== 'pending') return [];
    if (patch['failureCode'] === 'stale_pending' && !options.stalePending) return [];
    if (patch['status'] === 'completed' && options.loseFinalCas) return [];

    row = {
      ...row,
      ...patch,
      finalizedAt: patch['finalizedAt'] === undefined ? row.finalizedAt : new Date(),
    } as CurrentForecastRecomputeCommand;
    return [row];
  };

  const database = {
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (row) return [];
            row = command({
              fundId: values['fundId'] as number,
              idempotencyKey: values['idempotencyKey'] as string,
              requestHash: values['requestHash'] as string,
              createdBy: values['createdBy'] as number | null,
            });
            return [{ id: row.id }];
          }),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => (row ? [row] : [])),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => applyUpdate(patch)),
        })),
      })),
    })),
    transaction: vi.fn(async (work: (tx: unknown) => unknown) => {
      // The claim transaction runs first; `transactionError` models the
      // execution transaction failing to start once the claim is owned.
      if (options.transactionError && row?.status === 'pending') throw options.transactionError;
      return work(transactionDb);
    }),
  };

  Object.assign(transactionDb, {
    execute: vi.fn(async () => ({ rows: [] })),
    insert: database.insert,
    select: database.select,
    update: database.update,
  });

  return {
    database,
    transactionDb,
    updatePatches,
    row: () => row,
  };
}

function input(database: unknown) {
  return {
    fundId: FUND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    actorId: 101,
    database: database as never,
  };
}

describe('runManualCurrentForecastRecompute', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    modeService.resolveCurrentForecastModeResolution.mockResolvedValue({
      mode: 'shadow',
      cutoverReferenceId: null,
    });
    forecastService.getOrCreateCurrentForecastV2WithReceipt.mockResolvedValue(receipt);
    forecastService.runCurrentForecastV2.mockResolvedValue(receipt.result);
    shadowService.buildCurrentForecastShadowRecord.mockReturnValue({ record: { fundId: FUND_ID } });
    shadowService.persistCurrentForecastShadowReconciliation.mockResolvedValue({
      id: 501,
      created: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes the transaction to forecast execution and reconciliation persistence', async () => {
    const harness = makeHarness();

    await expect(runManualCurrentForecastRecompute(input(harness.database))).resolves.toEqual({
      status: 'completed',
      shadowReconciliationId: 501,
      replayed: false,
    });

    expect(forecastService.runCurrentForecastV2).toHaveBeenCalledWith(
      expect.objectContaining({ database: harness.transactionDb })
    );
    expect(shadowService.persistCurrentForecastShadowReconciliation).toHaveBeenCalledWith(
      expect.anything(),
      harness.transactionDb
    );
    expect(harness.updatePatches).toContainEqual(
      expect.objectContaining({
        status: 'completed',
        shadowReconciliationId: 501,
        createdReconciliation: true,
      })
    );
  });

  it('claims under the per-fund advisory lock inside its own transaction', async () => {
    const harness = makeHarness();
    const transactionExecute = harness.transactionDb['execute'] as ReturnType<typeof vi.fn>;

    await runManualCurrentForecastRecompute(input(harness.database));

    expect(harness.database.transaction).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(transactionExecute.mock.calls[0]?.[0])).toContain(
      'pg_advisory_xact_lock'
    );
    expect(transactionExecute.mock.invocationCallOrder[0]).toBeLessThan(
      harness.database.insert.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('replays a terminal command without executing forecast work', async () => {
    const harness = makeHarness({
      existing: command({ status: 'completed', shadowReconciliationId: 44 }),
    });

    await expect(runManualCurrentForecastRecompute(input(harness.database))).resolves.toEqual({
      status: 'completed',
      shadowReconciliationId: 44,
      replayed: true,
    });
    expect(forecastService.getOrCreateCurrentForecastV2WithReceipt).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different request hash', async () => {
    const harness = makeHarness({ existing: command({ requestHash: 'f'.repeat(64) }) });

    await expect(runManualCurrentForecastRecompute(input(harness.database))).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
  });

  it('returns 409 while a fresh command remains pending', async () => {
    const harness = makeHarness({ existing: command() });

    await expect(runManualCurrentForecastRecompute(input(harness.database))).rejects.toMatchObject({
      status: 409,
      code: 'RECOMPUTE_IN_FLIGHT',
    });
  });

  it('terminalizes a pending command stale for at least 90 seconds', async () => {
    const harness = makeHarness({ existing: command(), stalePending: true });

    await expect(runManualCurrentForecastRecompute(input(harness.database))).resolves.toEqual({
      status: 'failed',
      failureCode: 'stale_pending',
      replayed: true,
    });
  });

  it('skips execution when current-forecast mode is ineligible', async () => {
    const harness = makeHarness();
    modeService.resolveCurrentForecastModeResolution.mockResolvedValueOnce({
      mode: 'on',
      cutoverReferenceId: 33,
    });

    await expect(runManualCurrentForecastRecompute(input(harness.database))).resolves.toEqual({
      status: 'skipped',
      replayed: false,
    });
    expect(forecastService.getOrCreateCurrentForecastV2WithReceipt).not.toHaveBeenCalled();
  });

  it('stores only a sanitized failure code when execution throws', async () => {
    const harness = makeHarness();
    forecastService.getOrCreateCurrentForecastV2WithReceipt.mockRejectedValueOnce(
      new Error('postgres://secret-user:secret-password@internal-host/fund')
    );

    await expect(runManualCurrentForecastRecompute(input(harness.database))).resolves.toEqual({
      status: 'failed',
      failureCode: 'execution_error',
      replayed: false,
    });
    expect(JSON.stringify(harness.row())).not.toContain('secret-password');
  });

  it('terminalizes execution after the 30 second deadline', async () => {
    vi.useFakeTimers();
    const harness = makeHarness();
    modeService.resolveCurrentForecastModeResolution.mockReturnValueOnce(
      new Promise(() => undefined)
    );

    const result = runManualCurrentForecastRecompute(input(harness.database));
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(result).resolves.toEqual({
      status: 'failed',
      failureCode: 'execution_timeout',
      replayed: false,
    });
  });

  it('does not fall back to non-transactional writes when transaction startup fails', async () => {
    const harness = makeHarness({
      transactionError: new Error('Transactions are not supported by this database driver'),
    });

    await expect(runManualCurrentForecastRecompute(input(harness.database))).resolves.toEqual({
      status: 'failed',
      failureCode: 'execution_error',
      replayed: false,
    });
    expect(forecastService.runCurrentForecastV2).not.toHaveBeenCalled();
  });

  it('does not report completion after losing the final pending-state CAS', async () => {
    const harness = makeHarness({ loseFinalCas: true });

    await expect(runManualCurrentForecastRecompute(input(harness.database))).rejects.toThrow(
      'lost its pending claim'
    );
  });

  it('records created=false when reconciliation persistence reuses an existing row', async () => {
    const harness = makeHarness();
    shadowService.persistCurrentForecastShadowReconciliation.mockResolvedValueOnce({
      id: 502,
      created: false,
    });

    await runManualCurrentForecastRecompute(input(harness.database));

    expect(harness.updatePatches).toContainEqual(
      expect.objectContaining({
        status: 'completed',
        shadowReconciliationId: 502,
        createdReconciliation: false,
      })
    );
  });

  it('does not create a candidate reference for manual recompute completion', async () => {
    const harness = makeHarness();

    await runManualCurrentForecastRecompute(input(harness.database));

    expect(referenceService.createCandidateCurrentForecastReference).not.toHaveBeenCalled();
  });
});
