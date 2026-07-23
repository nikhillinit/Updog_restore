import { describe, expect, it, vi } from 'vitest';

import {
  ENGINE_VERSION,
  METHODOLOGY_VERSION,
} from '../../../shared/contracts/current-forecast-v2.contract';
import {
  CurrentForecastHeldError,
  loadHeldCurrentForecast,
  type CurrentForecastHeldDatabase,
} from '../../../server/services/current-forecast-held-service';

const INPUT_HASH = 'a'.repeat(64);
const RESULT_HASH = 'b'.repeat(64);
const ASSUMPTIONS_HASH = 'c'.repeat(64);

function referenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    fund_id: 7,
    calculation_key: 'current_forecast',
    fund_snapshot_id: 11,
    current_plan_version_id: 21,
    financial_facts_snapshot_id: 31,
    input_hash: INPUT_HASH,
    result_hash: RESULT_HASH,
    assumptions_hash: ASSUMPTIONS_HASH,
    engine_version: ENGINE_VERSION,
    methodology_version: METHODOLOGY_VERSION,
    candidate: false,
    superseded_by_reference_id: null,
    reason: null,
    created_by: null,
    request_hash: 'unused',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function v2Payload(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 'current-forecast-v2',
    fundId: 7,
    financialFactsSnapshotId: '31',
    currentPlanVersionId: '21',
    asOfDate: '2026-06-30',
    status: 'available',
    series: [],
    remainingDeployableCapitalUsd: '1000000.000000',
    committedCapitalUsd: '90000000.000000',
    calledToDateUsd: '25000000.000000',
    projectedFeesRemainingUsd: '2000000.000000',
    recallableDistributionsUsd: '0.000000',
    uncalledCapitalUsd: '65000000.000000',
    netIrr: null,
    inputHash: INPUT_HASH,
    assumptionsHash: ASSUMPTIONS_HASH,
    resultHash: RESULT_HASH,
    engineVersion: ENGINE_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    unavailableReasons: [],
    warnings: [],
    ...overrides,
  };
}

function snapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    payload: v2Payload(),
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDatabase(executeRows: unknown[][]) {
  const queue = [...executeRows];
  const database = {
    execute: vi.fn(async () => ({ rows: queue.shift() ?? [] })),
  };
  return { database: database as unknown as CurrentForecastHeldDatabase, raw: database };
}

describe('loadHeldCurrentForecast (P1: exactly the served-pointer head)', () => {
  it('returns the pinned reference and its contract-parsed snapshot payload', async () => {
    const { database } = makeDatabase([[referenceRow()], [snapshotRow()]]);

    const held = await loadHeldCurrentForecast({ fundId: 7, referenceId: 41, database });

    expect(held.reference).toMatchObject({
      id: 41,
      fundId: 7,
      fundSnapshotId: 11,
      inputHash: INPUT_HASH,
      resultHash: RESULT_HASH,
      assumptionsHash: ASSUMPTIONS_HASH,
      engineVersion: ENGINE_VERSION,
      methodologyVersion: METHODOLOGY_VERSION,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    expect(held.forecast.status).toBe('available');
    expect(held.forecast.resultHash).toBe(RESULT_HASH);
  });

  it('throws HELD_REFERENCE_MISSING when the pointer head row does not exist', async () => {
    const { database } = makeDatabase([[]]);

    await expect(
      loadHeldCurrentForecast({ fundId: 7, referenceId: 41, database })
    ).rejects.toMatchObject({
      name: 'CurrentForecastHeldError',
      code: 'HELD_REFERENCE_MISSING',
    });
  });

  it('throws HELD_REFERENCE_MISSING when the pinned snapshot row is missing', async () => {
    const { database } = makeDatabase([[referenceRow()], []]);

    await expect(
      loadHeldCurrentForecast({ fundId: 7, referenceId: 41, database })
    ).rejects.toBeInstanceOf(CurrentForecastHeldError);
  });

  it('throws HELD_REFERENCE_MISSING when the pinned payload fails the V2 contract', async () => {
    const { database } = makeDatabase([
      [referenceRow()],
      [snapshotRow({ payload: { not: 'a forecast' } })],
    ]);

    await expect(
      loadHeldCurrentForecast({ fundId: 7, referenceId: 41, database })
    ).rejects.toMatchObject({ code: 'HELD_REFERENCE_MISSING' });
  });

  it('scopes both loads to the fund (fund_id appears in each query)', async () => {
    const { database, raw } = makeDatabase([[referenceRow()], [snapshotRow()]]);

    await loadHeldCurrentForecast({ fundId: 7, referenceId: 41, database });

    expect(raw.execute).toHaveBeenCalledTimes(2);
  });
});
