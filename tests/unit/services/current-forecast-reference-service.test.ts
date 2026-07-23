import { describe, expect, it, vi } from 'vitest';

import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { IdempotentCommandError } from '../../../server/lib/idempotent-command';
import {
  CURRENT_FORECAST_ACTIVATE_ROUTE,
  CURRENT_FORECAST_REFERENCE_CONTRACT_VERSION,
  CurrentForecastReferenceError,
  activateCurrentForecast,
  advanceCurrentForecastPointer,
  createCandidateCurrentForecastReference,
  createRollbackCurrentForecastReference,
  currentForecastReferenceIdempotencyKey,
  getAcceptedCurrentForecastReferenceHead,
  verifyGreenCandidateWithLedger,
  type CurrentForecastReferenceBasis,
  type CurrentForecastReferenceDatabase,
} from '../../../server/services/current-forecast-reference-service';

const INPUT_HASH = 'a'.repeat(64);
const RESULT_HASH = 'b'.repeat(64);
const ASSUMPTIONS_HASH = 'c'.repeat(64);

const basis: CurrentForecastReferenceBasis = {
  fundSnapshotId: 11,
  currentPlanVersionId: 21,
  financialFactsSnapshotId: 31,
  inputHash: INPUT_HASH,
  resultHash: RESULT_HASH,
  assumptionsHash: ASSUMPTIONS_HASH,
  engineVersion: 'current-forecast-v2-engine/1.0.0',
  methodologyVersion: 'cohort-projection-v2/1.0.0',
};

function snakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    fund_id: 7,
    calculation_key: 'current_forecast',
    fund_snapshot_id: 11,
    current_plan_version_id: 21,
    financial_facts_snapshot_id: 31,
    input_hash: INPUT_HASH,
    result_hash: RESULT_HASH,
    assumptions_hash: ASSUMPTIONS_HASH,
    engine_version: 'current-forecast-v2-engine/1.0.0',
    methodology_version: 'cohort-projection-v2/1.0.0',
    candidate: true,
    superseded_by_reference_id: null,
    reason: null,
    created_by: null,
    idempotency_key: 'key-1',
    request_hash: 'unused',
    created_at: '2026-07-20T00:00:00.000Z',
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
  return {
    database: database as unknown as CurrentForecastReferenceDatabase,
    tx,
    database_raw: database,
  };
}

function expectedRequestHash(extra: Record<string, unknown> = {}) {
  return canonicalSha256({
    fundId: 7,
    contractVersion: CURRENT_FORECAST_REFERENCE_CONTRACT_VERSION,
    ...basis,
    reason: null,
    sourceReferenceId: null,
    ...extra,
  });
}

describe('currentForecastReferenceIdempotencyKey', () => {
  it('builds the deterministic cfref key', () => {
    expect(
      currentForecastReferenceIdempotencyKey({
        fundId: 7,
        inputHash: INPUT_HASH,
        resultHash: RESULT_HASH,
      })
    ).toBe(`cfref:7:${INPUT_HASH}:${RESULT_HASH}`);
  });
});

describe('createCandidateCurrentForecastReference', () => {
  it('inserts a candidate row and returns the mapped record', async () => {
    const { database, database_raw } = makeDatabase([[snakeRow()]]);

    const result = await createCandidateCurrentForecastReference({
      fundId: 7,
      basis,
      idempotencyKey: 'key-1',
      database,
    });

    expect(result.replayed).toBe(false);
    expect(result.row).toMatchObject({
      id: 42,
      fundId: 7,
      calculationKey: 'current_forecast',
      candidate: true,
      supersededByReferenceId: null,
      inputHash: INPUT_HASH,
      resultHash: RESULT_HASH,
    });
    expect(database_raw.execute).toHaveBeenCalledTimes(1);
  });

  it('replays an existing row when the same request is re-issued', async () => {
    const { database } = makeDatabase([[], [snakeRow({ request_hash: expectedRequestHash() })]]);

    const result = await createCandidateCurrentForecastReference({
      fundId: 7,
      basis,
      idempotencyKey: 'key-1',
      database,
    });

    expect(result.replayed).toBe(true);
    expect(result.row.id).toBe(42);
  });

  it('rejects idempotency-key reuse with a different request', async () => {
    const { database } = makeDatabase([[], [snakeRow({ request_hash: 'f'.repeat(64) })]]);

    await expect(
      createCandidateCurrentForecastReference({
        fundId: 7,
        basis,
        idempotencyKey: 'key-1',
        database,
      })
    ).rejects.toMatchObject({
      name: 'IdempotentCommandError',
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
    expect(IdempotentCommandError).toBeDefined();
  });
});

describe('getAcceptedCurrentForecastReferenceHead', () => {
  it('returns null when no accepted head exists', async () => {
    const { database } = makeDatabase([[]]);

    expect(await getAcceptedCurrentForecastReferenceHead({ fundId: 7, database })).toBeNull();
  });

  it('returns the mapped accepted head', async () => {
    const { database } = makeDatabase([[snakeRow({ candidate: false })]]);

    const head = await getAcceptedCurrentForecastReferenceHead({ fundId: 7, database });

    expect(head).toMatchObject({ id: 42, candidate: false, supersededByReferenceId: null });
  });
});

describe('advanceCurrentForecastPointer', () => {
  const eligibleModeRow = {
    id: 9,
    configured_mode: 'on',
    kill_switch_active: false,
    activated_at: '2026-07-01T00:00:00.000Z',
    cutover_reference_id: 41,
    version: 3,
  };

  it('supersedes the old head, flips the target, and advances the pointer in one tx', async () => {
    const { database, tx } = makeDatabase([
      [eligibleModeRow],
      [snakeRow({ id: 42 })],
      [],
      [],
      [{ cutover_reference_id: 42, version: 4 }],
    ]);

    const result = await advanceCurrentForecastPointer({
      fundId: 7,
      referenceId: 42,
      actorId: 101,
      database,
    });

    expect(result).toEqual({ cutoverReferenceId: 42, version: 4 });
    expect(tx.execute).toHaveBeenCalledTimes(5);
  });

  it('is a no-op when the target is already the served head', async () => {
    const { database, tx } = makeDatabase([
      [{ ...eligibleModeRow, cutover_reference_id: 42 }],
      [snakeRow({ id: 42, candidate: false })],
    ]);

    const result = await advanceCurrentForecastPointer({
      fundId: 7,
      referenceId: 42,
      actorId: 101,
      database,
    });

    expect(result).toEqual({ cutoverReferenceId: 42, version: 3 });
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['kill switch active', { ...eligibleModeRow, kill_switch_active: true }],
    ['configured shadow', { ...eligibleModeRow, configured_mode: 'shadow' }],
    ['not activated', { ...eligibleModeRow, activated_at: null }],
  ])('refuses to advance when %s', async (_label, modeRow) => {
    const { database, tx } = makeDatabase([[modeRow]]);

    await expect(
      advanceCurrentForecastPointer({ fundId: 7, referenceId: 42, actorId: 101, database })
    ).rejects.toMatchObject({
      name: 'CurrentForecastReferenceError',
      code: 'pointer_advance_requires_on',
    });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('refuses to advance when no mode row exists', async () => {
    const { database } = makeDatabase([[]]);

    await expect(
      advanceCurrentForecastPointer({ fundId: 7, referenceId: 42, actorId: 101, database })
    ).rejects.toMatchObject({ code: 'pointer_advance_requires_on' });
  });

  it('refuses a missing reference', async () => {
    const { database } = makeDatabase([[eligibleModeRow], []]);

    await expect(
      advanceCurrentForecastPointer({ fundId: 7, referenceId: 42, actorId: 101, database })
    ).rejects.toMatchObject({ code: 'reference_not_found', status: 404 });
  });

  it('refuses a superseded reference', async () => {
    const { database } = makeDatabase([
      [eligibleModeRow],
      [snakeRow({ id: 42, superseded_by_reference_id: 43 })],
    ]);

    await expect(
      advanceCurrentForecastPointer({ fundId: 7, referenceId: 42, actorId: 101, database })
    ).rejects.toMatchObject({ code: 'reference_superseded', status: 409 });
    expect(CurrentForecastReferenceError).toBeDefined();
  });
});

describe('createRollbackCurrentForecastReference', () => {
  it('clones the source basis into a new candidate under the caller key', async () => {
    const sourceRow = snakeRow({ id: 40, candidate: false, superseded_by_reference_id: 41 });
    const insertedRow = snakeRow({
      id: 50,
      idempotency_key: 'admin-rollback-1',
      reason: 'roll back to pre-incident head',
    });
    const { database, database_raw } = makeDatabase([[sourceRow], [insertedRow]]);

    const result = await createRollbackCurrentForecastReference({
      fundId: 7,
      sourceReferenceId: 40,
      reason: 'roll back to pre-incident head',
      idempotencyKey: 'admin-rollback-1',
      createdBy: 101,
      database,
    });

    expect(result.replayed).toBe(false);
    expect(result.row).toMatchObject({
      id: 50,
      candidate: true,
      reason: 'roll back to pre-incident head',
    });
    expect(database_raw.execute).toHaveBeenCalledTimes(2);
  });

  it('404s when the source reference does not exist for the fund', async () => {
    const { database } = makeDatabase([[]]);

    await expect(
      createRollbackCurrentForecastReference({
        fundId: 7,
        sourceReferenceId: 40,
        reason: 'nope',
        idempotencyKey: 'admin-rollback-2',
        createdBy: 101,
        database,
      })
    ).rejects.toMatchObject({ code: 'reference_not_found', status: 404 });
  });
});

describe('activateCurrentForecast', () => {
  const dormantModeRow = {
    id: 9,
    configured_mode: 'shadow',
    kill_switch_active: false,
    activated_at: null,
    cutover_reference_id: null,
    version: 3,
  };
  const verifyGreen = () => vi.fn(async () => [] as string[]);

  function activationRequestHash() {
    return canonicalSha256({
      route: CURRENT_FORECAST_ACTIVATE_ROUTE,
      fundId: 7,
      referenceId: 42,
      expectedVersion: 3,
    });
  }

  it('atomically writes on + activated_at + pointer and flips the candidate (P2)', async () => {
    const { database, tx } = makeDatabase([
      [{ id: 1 }],
      [dormantModeRow],
      [snakeRow({ id: 42 })],
      [],
      [],
      [
        {
          cutover_reference_id: 42,
          version: 4,
          activated_at: '2026-07-22T00:00:00.000Z',
        },
      ],
      [],
    ]);

    const result = await activateCurrentForecast({
      fundId: 7,
      referenceId: 42,
      expectedVersion: 3,
      idempotencyKey: 'activate-1',
      actorId: 101,
      database,
      verifyGreenCandidate: verifyGreen(),
    });

    expect(result.replayed).toBe(false);
    expect(result.response).toEqual({
      calculationKey: 'current_forecast',
      configuredMode: 'on',
      activatedAt: '2026-07-22T00:00:00.000Z',
      cutoverReferenceId: 42,
      version: 4,
    });
    // claim, lock, reference load, supersede, candidate flip, mode update,
    // ledger completion -- ALL on the one transaction (P2 atomicity).
    expect(tx.execute).toHaveBeenCalledTimes(7);
  });

  it('replays a completed activation without re-writing', async () => {
    const stored = {
      calculationKey: 'current_forecast',
      configuredMode: 'on',
      activatedAt: '2026-07-22T00:00:00.000Z',
      cutoverReferenceId: 42,
      version: 4,
    };
    const { database, tx } = makeDatabase([
      [],
      [
        {
          request_hash: activationRequestHash(),
          response_body: stored,
          status: 'completed',
        },
      ],
    ]);

    const result = await activateCurrentForecast({
      fundId: 7,
      referenceId: 42,
      expectedVersion: 3,
      idempotencyKey: 'activate-1',
      actorId: 101,
      database,
      verifyGreenCandidate: verifyGreen(),
    });

    expect(result.replayed).toBe(true);
    expect(result.response).toEqual(stored);
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it('rejects idempotency-key reuse with a different activation request', async () => {
    const { database } = makeDatabase([
      [],
      [{ request_hash: 'different', response_body: null, status: 'completed' }],
    ]);

    await expect(
      activateCurrentForecast({
        fundId: 7,
        referenceId: 42,
        expectedVersion: 3,
        idempotencyKey: 'activate-1',
        actorId: 101,
        database,
        verifyGreenCandidate: verifyGreen(),
      })
    ).rejects.toMatchObject({ name: 'FundCalculationModeIdempotencyConflictError' });
  });

  it('throws a version conflict on a stale expectedVersion', async () => {
    const { database } = makeDatabase([[{ id: 1 }], [{ ...dormantModeRow, version: 5 }]]);

    await expect(
      activateCurrentForecast({
        fundId: 7,
        referenceId: 42,
        expectedVersion: 3,
        idempotencyKey: 'activate-2',
        actorId: 101,
        database,
        verifyGreenCandidate: verifyGreen(),
      })
    ).rejects.toMatchObject({ name: 'FundCalculationModeVersionConflictError' });
  });

  it('refuses to activate twice', async () => {
    const { database } = makeDatabase([
      [{ id: 1 }],
      [{ ...dormantModeRow, activated_at: '2026-07-01T00:00:00.000Z' }],
    ]);

    await expect(
      activateCurrentForecast({
        fundId: 7,
        referenceId: 42,
        expectedVersion: 3,
        idempotencyKey: 'activate-3',
        actorId: 101,
        database,
        verifyGreenCandidate: verifyGreen(),
      })
    ).rejects.toMatchObject({ code: 'already_activated', status: 409 });
  });

  it('blocks on green-candidate blockers without writing', async () => {
    const { database, tx } = makeDatabase([[{ id: 1 }], [dormantModeRow], [snakeRow({ id: 42 })]]);

    await expect(
      activateCurrentForecast({
        fundId: 7,
        referenceId: 42,
        expectedVersion: 3,
        idempotencyKey: 'activate-4',
        actorId: 101,
        database,
        verifyGreenCandidate: vi.fn(async () => ['shadow_green_required']),
      })
    ).rejects.toMatchObject({
      name: 'CurrentForecastActivationBlockedError',
      blockers: ['shadow_green_required'],
    });
    expect(tx.execute).toHaveBeenCalledTimes(3);
  });

  it('includes kill_switch_active among activation blockers', async () => {
    const { database } = makeDatabase([
      [{ id: 1 }],
      [{ ...dormantModeRow, kill_switch_active: true }],
      [snakeRow({ id: 42 })],
    ]);

    await expect(
      activateCurrentForecast({
        fundId: 7,
        referenceId: 42,
        expectedVersion: 3,
        idempotencyKey: 'activate-5',
        actorId: 101,
        database,
        verifyGreenCandidate: verifyGreen(),
      })
    ).rejects.toMatchObject({
      name: 'CurrentForecastActivationBlockedError',
      blockers: ['kill_switch_active'],
    });
  });

  it('404s a missing reference', async () => {
    const { database } = makeDatabase([[{ id: 1 }], [dormantModeRow], []]);

    await expect(
      activateCurrentForecast({
        fundId: 7,
        referenceId: 42,
        expectedVersion: 3,
        idempotencyKey: 'activate-6',
        actorId: 101,
        database,
        verifyGreenCandidate: verifyGreen(),
      })
    ).rejects.toMatchObject({ code: 'reference_not_found', status: 404 });
  });
});

describe('verifyGreenCandidateWithLedger', () => {
  const candidateReference = {
    id: 42,
    fundId: 7,
    calculationKey: 'current_forecast',
    fundSnapshotId: 11,
    currentPlanVersionId: 21,
    financialFactsSnapshotId: 31,
    inputHash: INPUT_HASH,
    resultHash: RESULT_HASH,
    assumptionsHash: ASSUMPTIONS_HASH,
    engineVersion: 'current-forecast-v2-engine/1.0.0',
    methodologyVersion: 'cohort-projection-v2/1.0.0',
    candidate: true,
    supersededByReferenceId: null,
    reason: null,
    createdBy: null,
    createdAt: '2026-07-20T00:00:00.000Z',
  };

  function makeExecutor(executeRows: unknown[][]) {
    const queue = [...executeRows];
    return { execute: vi.fn(async () => ({ rows: queue.shift() ?? [] })) };
  }

  it('returns no blockers for a green candidate', async () => {
    const executor = makeExecutor([[{ id: 5 }], [{ reconciliation_status: 'match' }], []]);

    expect(
      await verifyGreenCandidateWithLedger({
        executor,
        fundId: 7,
        reference: candidateReference,
      })
    ).toEqual([]);
  });

  it('flags a non-candidate or superseded reference', async () => {
    const executor = makeExecutor([[{ id: 5 }], [{ reconciliation_status: 'match' }], []]);

    expect(
      await verifyGreenCandidateWithLedger({
        executor,
        fundId: 7,
        reference: { ...candidateReference, candidate: false },
      })
    ).toContain('activation_requires_green_candidate');
  });

  it('flags a missing CURRENT_FORECAST_V2 snapshot', async () => {
    const executor = makeExecutor([[], [{ reconciliation_status: 'match' }], []]);

    expect(
      await verifyGreenCandidateWithLedger({
        executor,
        fundId: 7,
        reference: candidateReference,
      })
    ).toContain('current_forecast_snapshot_missing');
  });

  it('flags a basis hash with no green shadow match', async () => {
    const executor = makeExecutor([[{ id: 5 }], [], []]);

    expect(
      await verifyGreenCandidateWithLedger({
        executor,
        fundId: 7,
        reference: candidateReference,
      })
    ).toContain('shadow_green_required');
  });

  it('flags unexplained divergences (failed shadow rows block green, P3)', async () => {
    const executor = makeExecutor([[{ id: 5 }], [{ reconciliation_status: 'match' }], [{ id: 8 }]]);

    expect(
      await verifyGreenCandidateWithLedger({
        executor,
        fundId: 7,
        reference: candidateReference,
      })
    ).toContain('unexplained_divergence_present');
  });
});
