import { describe, expect, it, vi } from 'vitest';

import { CURRENT_FORECAST_CALCULATION_KEY } from '../../../server/services/current-forecast-calc-mode-resolver';
import { updateCurrentForecastCalculationMode } from '../../../server/services/fund-calculation-mode-service';

const now = new Date('2026-07-22T12:00:00.000Z');

function modeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    configured_mode: 'off',
    kill_switch_active: false,
    shadow_started_at: null,
    last_reconciliation_run_id: null,
    last_moic_source_input_hash: null,
    last_candidate_output_hash: null,
    version: 1,
    ...overrides,
  };
}

function makeDatabase(executeRows: unknown[][]) {
  const queue = [...executeRows];
  const tx = {
    execute: vi.fn(async () => ({ rows: queue.shift() ?? [] })),
  };
  const database = {
    execute: vi.fn(async () => ({ rows: queue.shift() ?? [] })),
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };

  return { database, tx };
}

describe('current-forecast calculation mode service', () => {
  it('creates the current_forecast row in off mode at version 1', async () => {
    const { database, tx } = makeDatabase([[{ id: 100 }], [], [modeRow()], []]);

    const result = await updateCurrentForecastCalculationMode({
      fundId: 7,
      expectedVersion: 0,
      configuredMode: 'off',
      idempotencyKey: 'forecast-off-1',
      actorId: 42,
      database: database as never,
      now,
    });

    expect(result).toEqual({
      response: {
        calculationKey: CURRENT_FORECAST_CALCULATION_KEY,
        configuredMode: 'off',
        effectiveMode: 'off',
        killSwitchActive: false,
        shadowStartedAt: null,
        eligibleAt: null,
        residencyDaysRequired: 7,
        residencyStatus: 'not_applicable',
        currentSourceMatchesAccepted: false,
        unreconciledEditsPresent: false,
        blockers: [],
        version: 1,
      },
      replayed: false,
    });
    expect(tx.execute).toHaveBeenCalledTimes(4);
  });
});
