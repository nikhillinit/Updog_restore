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

function makeDatabase(executeRows: unknown[][], boundaryTimestamp?: string) {
  const queue = [...executeRows];
  const execute = vi.fn(async (query: unknown) => ({
    rows:
      boundaryTimestamp && JSON.stringify(query).includes('clock_timestamp')
        ? [{ now: boundaryTimestamp }]
        : (queue.shift() ?? []),
  }));
  const tx = {
    execute,
  };
  const database = {
    execute,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };

  return { database, tx };
}

function modeMutation(overrides: Record<string, unknown> = {}) {
  return [
    {
      mode_exists: true,
      actual_version: 1,
      claim_id: 100,
      completed_id: 100,
      deleted_id: null,
      response_body: null,
      ...overrides,
    },
  ];
}

describe('current-forecast calculation mode service', () => {
  it('creates the current_forecast row in off mode at version 1', async () => {
    const { database, tx } = makeDatabase([
      [],
      modeMutation({ mode_exists: false, actual_version: null }),
    ]);

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
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it('enters shadow without an accepted reconciliation and starts residency', async () => {
    const { database } = makeDatabase(
      [[], [modeRow()], modeMutation({ actual_version: 1 })],
      '2026-07-22 12:00:00.000000+00'
    );

    const result = await updateCurrentForecastCalculationMode({
      fundId: 7,
      expectedVersion: 1,
      configuredMode: 'shadow',
      idempotencyKey: 'forecast-shadow-1',
      actorId: 42,
      database: database as never,
      now,
    });

    expect(result.response).toMatchObject({
      configuredMode: 'shadow',
      effectiveMode: 'shadow',
      shadowStartedAt: now.toISOString(),
      residencyStatus: 'pending',
    });
    expect(result.response.blockers).not.toContain('accepted_reconciliation_required');
    expect(result.replayed).toBe(false);
  });

  it('uses the database timestamp for a fresh shadow boundary when now is injected', async () => {
    const boundary = '2026-07-22T12:00:00.123456Z';
    const { database, tx } = makeDatabase(
      [[], [modeRow()], modeMutation({ actual_version: 1 })],
      boundary
    );

    await updateCurrentForecastCalculationMode({
      fundId: 7,
      expectedVersion: 1,
      configuredMode: 'shadow',
      idempotencyKey: 'forecast-shadow-precise-clock',
      actorId: 42,
      database: database as never,
      sources: { sourceInputHash: 'forecast-source' },
      now,
    });

    const boundaryQuery = tx.execute.mock.calls
      .map(([query]) => JSON.stringify(query))
      .find((query) => query.includes('clock_timestamp'));
    const persistedQuery = JSON.stringify(tx.execute.mock.calls.at(-1)?.[0]);
    expect(boundaryQuery).toContain('to_char');
    expect(boundaryQuery).toContain('UTC');
    expect(boundaryQuery).toContain('HH24:MI:SS.US');
    expect(boundaryQuery).not.toContain('::text');
    expect(persistedQuery).toContain(boundary);
    expect(persistedQuery).not.toContain(now.toISOString());
  });
});
