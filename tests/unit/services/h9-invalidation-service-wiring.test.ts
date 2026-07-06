import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spy on the H9 invalidation seam. The wiring under test must call it AFTER a
// real mutation (not on idempotent replays). Mocking the seam keeps these
// direct-call tests off the real metrics-aggregator dependency graph.
const { invalidateH9Artifacts } = vi.hoisted(() => ({
  invalidateH9Artifacts: vi.fn(async () => undefined),
}));

vi.mock('../../../server/services/h9-artifact-invalidation-service', () => ({
  invalidateH9Artifacts,
}));

import { createRound } from '../../../server/services/investments/investment-round-service';
import { updateFundMoicInputs } from '../../../server/services/fund-moic-input-service';
import { updateFundMoicCalculationMode } from '../../../server/services/fund-calculation-mode-service';
import { createPlanningFmvOverride } from '../../../server/services/lp-reporting/planning-fmv-override-service';
import { canonicalSha256 } from '@shared/lib/canonical-hash';

const FUND_ID = 7;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- rounds: createRound ----------------------------------------------------

function roundInput() {
  return {
    investmentId: 1,
    fundId: FUND_ID,
    roundName: 'Series A',
    securityType: 'equity',
    roundDate: '2026-06-01',
    currency: 'USD',
    investmentAmount: '1000000',
    roundSize: null,
    preMoneyValuation: null,
    idempotencyKey: 'idem-round-created',
    createdBy: 1,
  };
}

function roundRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    investmentId: 1,
    fundId: FUND_ID,
    roundName: 'Series A',
    securityType: 'equity',
    roundDate: '2026-06-01',
    currency: 'USD',
    investmentAmount: '1000000',
    roundSize: null,
    preMoneyValuation: null,
    idempotencyKey: 'idem-round-created',
    requestHash: 'persisted-request-hash',
    supersedesRoundId: null,
    createdBy: 1,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    rowXmin: '100',
    ...overrides,
  };
}

function roundDb(opts: { insertReturns: unknown[]; existing?: unknown[] }) {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => opts.insertReturns),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => opts.existing ?? []),
        })),
      })),
    })),
  };
}

describe('createRound -> H9 invalidation wiring', () => {
  it('invalidates H9 artifacts when a new round is created', async () => {
    const result = await createRound(roundInput() as never, {
      database: roundDb({ insertReturns: [roundRecord()] }) as never,
    });

    expect(result.kind).toBe('created');
    expect(invalidateH9Artifacts).toHaveBeenCalledWith(FUND_ID);
  });

  it('does NOT invalidate on an idempotent key reuse (no row written)', async () => {
    // insert returns [] -> existing lookup returns a row with a different
    // requestHash -> kind 'key_reused' (no new write was persisted).
    const result = await createRound(roundInput() as never, {
      database: roundDb({
        insertReturns: [],
        existing: [roundRecord({ requestHash: 'a-different-request-hash' })],
      }) as never,
    });

    expect(result.kind).toBe('key_reused');
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });
});

// ---- MOIC inputs: updateFundMoicInputs --------------------------------------

function transactionDb(replayed: boolean) {
  // The mutation services do `return database.transaction(cb)`; the wiring must
  // fire after the transaction resolves on a real (non-replayed) mutation. The
  // mock resolves a canned result without invoking the callback, so no inner
  // transaction internals need stubbing.
  return {
    transaction: vi.fn(async () => ({ response: { ok: true }, replayed })),
  };
}

describe('updateFundMoicInputs -> H9 invalidation wiring', () => {
  const params = () => ({
    fundId: FUND_ID,
    companyId: 1,
    expectedVersion: 0,
    exitProbability: null,
    exitMoicBps: null,
    idempotencyKey: 'idem-inputs',
    actorId: 1,
  });

  it('invalidates when the MOIC input update is applied', async () => {
    await updateFundMoicInputs({ ...params(), database: transactionDb(false) as never });

    expect(invalidateH9Artifacts).toHaveBeenCalledWith(FUND_ID);
  });

  it('does NOT invalidate on an idempotent replay', async () => {
    await updateFundMoicInputs({ ...params(), database: transactionDb(true) as never });

    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });
});

// ---- calculation mode: updateFundMoicCalculationMode ------------------------

describe('updateFundMoicCalculationMode -> H9 invalidation wiring', () => {
  const params = () => ({
    fundId: FUND_ID,
    expectedVersion: 0,
    configuredMode: 'shadow' as const,
    idempotencyKey: 'idem-mode',
    actorId: 1,
    // Pass sources so the ranking fetch is skipped (callback never runs anyway).
    sources: { moicSourceInputHash: 'h' } as never,
    now: new Date('2026-06-25T00:00:00.000Z'),
  });

  it('invalidates when the calculation-mode change is applied', async () => {
    await updateFundMoicCalculationMode({ ...params(), database: transactionDb(false) as never });

    expect(invalidateH9Artifacts).toHaveBeenCalledWith(FUND_ID);
  });

  it('does NOT invalidate on an idempotent replay', async () => {
    await updateFundMoicCalculationMode({ ...params(), database: transactionDb(true) as never });

    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });
});

// ---- Planning-FMV marks: createPlanningFmvOverride --------------------------

function planningFmvInput() {
  return {
    fundId: FUND_ID,
    idempotencyKey: 'idem-planning-mark',
    actor: { userId: 1 },
    body: {
      companyId: 1,
      markDate: '2026-06-01',
      fairValue: '1000000',
      currency: 'USD' as const,
      confidenceLevel: 'medium' as const,
      reason: 'quarterly planning update',
      source: {
        allocationVersion: 1,
        plannedReservesCents: 1000000,
        allocationReason: 'quarterly planning update',
      },
    },
  };
}

function planningFmvMark(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    fundId: FUND_ID,
    companyId: 1,
    markDate: '2026-06-01',
    asOfDate: '2026-06-01',
    fairValue: '1000000',
    currency: 'USD',
    confidenceLevel: 'medium',
    status: 'approved',
    priorMarkId: null,
    methodologyNotes: 'quarterly planning update',
    approvedBy: 1,
    approvedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function planningFmvResponse(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 501,
    idempotencyKey: 'idem-planning-mark',
    replayed: false,
    valuationMark: planningFmvMark(),
    ...overrides,
  };
}

function pendingPlanningFmvRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    fundId: FUND_ID,
    companyId: 1,
    valuationMarkId: null,
    idempotencyKey: 'idem-planning-mark',
    requestHash: 'pending-request-hash',
    sourceHash: 'pending-source-hash',
    status: 'pending',
    responseBody: null,
    failureCode: null,
    failureMessage: null,
    createdBy: 1,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    completedAt: null,
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function completedPlanningFmvRequest(overrides: Record<string, unknown> = {}) {
  const input = planningFmvInput();

  return pendingPlanningFmvRequest({
    valuationMarkId: 101,
    requestHash: canonicalSha256({ fundId: input.fundId, body: input.body }),
    status: 'completed',
    responseBody: planningFmvResponse(),
    completedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  });
}

function planningFmvDb(opts: {
  insertReturns: unknown[];
  existing?: unknown[];
  transactionResult?: unknown;
  transactionError?: Error;
}) {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => opts.insertReturns),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => opts.existing ?? []),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
    transaction: vi.fn(async () => {
      if (opts.transactionError) {
        throw opts.transactionError;
      }
      return opts.transactionResult;
    }),
  };
}

describe('createPlanningFmvOverride -> H9 invalidation wiring', () => {
  it('invalidates H9 artifacts when a new Planning FMV mark is written', async () => {
    const result = await createPlanningFmvOverride(planningFmvInput(), {
      database: planningFmvDb({
        insertReturns: [pendingPlanningFmvRequest()],
        transactionResult: planningFmvResponse(),
      }) as never,
    });

    expect(result.replayed).toBe(false);
    expect(invalidateH9Artifacts).toHaveBeenCalledWith(FUND_ID);
  });

  it('does NOT invalidate on an idempotent replay (no mark written)', async () => {
    const result = await createPlanningFmvOverride(planningFmvInput(), {
      database: planningFmvDb({
        insertReturns: [],
        existing: [completedPlanningFmvRequest()],
      }) as never,
    });

    expect(result.replayed).toBe(true);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });

  it('does NOT invalidate when the mark write fails', async () => {
    const writeError = new Error('Planning FMV write failed');

    await expect(
      createPlanningFmvOverride(planningFmvInput(), {
        database: planningFmvDb({
          insertReturns: [pendingPlanningFmvRequest()],
          transactionError: writeError,
        }) as never,
      })
    ).rejects.toBe(writeError);

    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });
});
