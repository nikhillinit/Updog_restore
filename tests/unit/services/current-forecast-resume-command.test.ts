import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { describe, expect, it, vi } from 'vitest';
import { NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE } from '../../../server/lib/transaction-support';

import {
  CURRENT_FORECAST_RESUME_ROUTE,
  CurrentForecastResumePreCutoverError,
  resumeCurrentForecast,
} from '../../../server/services/current-forecast-resume-command';
import { FundCalculationModeVersionConflictError } from '../../../server/services/fund-calculation-mode-service';
import type { FundCalculationModeDatabase } from '../../../server/services/fund-calculation-mode-service';

const ACTIVATED_AT = '2026-07-01T00:00:00.000Z';
const CUTOVER_REFERENCE_ID = 41;

function makeDatabase(rows: unknown[][]) {
  const queue = [...rows];
  const execute = vi.fn(async () => ({ rows: queue.shift() ?? [] }));
  const tx = {
    execute,
  };
  const database = {
    execute,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };
  return {
    database: database as unknown as FundCalculationModeDatabase,
    tx,
    transaction: database.transaction,
    execute,
  };
}

function modeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    configured_mode: 'on',
    kill_switch_active: false,
    activated_at: ACTIVATED_AT,
    cutover_reference_id: CUTOVER_REFERENCE_ID,
    version: 3,
    ...overrides,
  };
}

function resumeParams(overrides: Record<string, unknown> = {}) {
  return {
    fundId: 7,
    expectedVersion: 3,
    idempotencyKey: 'resume-1',
    actorId: 101,
    ...overrides,
  };
}

describe('resumeCurrentForecast', () => {
  it.each([
    ['kill_switch', { configured_mode: 'on', kill_switch_active: true }],
    ['configured_off', { configured_mode: 'off', kill_switch_active: false }],
    ['configured_shadow', { configured_mode: 'shadow', kill_switch_active: false }],
  ])('re-arms live serving from %s', async (_cause, heldState) => {
    const updatedMode = modeRow({ configured_mode: 'on', kill_switch_active: false, version: 4 });
    const { database } = makeDatabase([[{ id: 1 }], [modeRow(heldState)], [updatedMode], []]);

    const result = await resumeCurrentForecast({ ...resumeParams(), database });

    expect(result).toEqual({
      replayed: false,
      response: {
        calculationKey: 'current_forecast',
        configuredMode: 'on',
        killSwitchActive: false,
        activatedAt: ACTIVATED_AT,
        cutoverReferenceId: CUTOVER_REFERENCE_ID,
        version: 4,
      },
    });
  });

  it('rejects pre-cutover mode rows before writing recovery state', async () => {
    const { database, tx } = makeDatabase([[{ id: 1 }], [modeRow({ activated_at: null })]]);

    await expect(resumeCurrentForecast({ ...resumeParams(), database })).rejects.toBeInstanceOf(
      CurrentForecastResumePreCutoverError
    );
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it('preserves activation and pointer fields in the recovery response', async () => {
    const updatedMode = modeRow({
      configured_mode: 'on',
      kill_switch_active: false,
      activated_at: new Date(ACTIVATED_AT),
      cutover_reference_id: CUTOVER_REFERENCE_ID,
      version: 8,
    });
    const { database } = makeDatabase([[{ id: 1 }], [modeRow({ version: 7 })], [updatedMode], []]);

    const result = await resumeCurrentForecast({
      ...resumeParams({ expectedVersion: 7, idempotencyKey: 'resume-preserve' }),
      database,
    });

    expect(result.response).toMatchObject({
      activatedAt: ACTIVATED_AT,
      cutoverReferenceId: CUTOVER_REFERENCE_ID,
    });
  });

  it('rejects stale expected versions', async () => {
    const { database } = makeDatabase([[{ id: 1 }], [modeRow({ version: 4 })]]);

    await expect(resumeCurrentForecast({ ...resumeParams(), database })).rejects.toEqual(
      new FundCalculationModeVersionConflictError(3, 4)
    );
  });

  it('replays a completed request with the same idempotency key', async () => {
    const response = {
      calculationKey: 'current_forecast' as const,
      configuredMode: 'on' as const,
      killSwitchActive: false as const,
      activatedAt: ACTIVATED_AT,
      cutoverReferenceId: CUTOVER_REFERENCE_ID,
      version: 4,
    };
    const request = resumeParams();
    const requestHash = canonicalSha256({
      route: CURRENT_FORECAST_RESUME_ROUTE,
      fundId: request.fundId,
      calculationKey: 'current_forecast',
      expectedVersion: request.expectedVersion,
    });
    const { database } = makeDatabase([
      [],
      [{ request_hash: requestHash, response_body: response, status: 'completed' }],
    ]);

    const result = await resumeCurrentForecast({ ...request, database });

    expect(result).toEqual({ response, replayed: true });
  });

  it('falls back to the plain executor for neon-http transactionless mode', async () => {
    const { database, transaction, execute } = makeDatabase([
      [{ id: 1 }],
      [modeRow({ configured_mode: 'off', kill_switch_active: true })],
      [modeRow({ version: 4, configured_mode: 'on', kill_switch_active: false })],
      [],
    ]);
    transaction.mockRejectedValueOnce(new Error(NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE));

    const result = await resumeCurrentForecast({ ...resumeParams(), database });

    expect(result.replayed).toBe(false);
    expect(result.response).toMatchObject({ configuredMode: 'on', killSwitchActive: false });
    expect(transaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
