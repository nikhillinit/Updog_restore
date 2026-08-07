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
const NOW_ISO = '2026-06-25T00:00:00.000Z';

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

function executeQueueDb(rowsPerStatement: unknown[][]) {
  // The claim-last rewrites execute guarded CTE statements directly on the
  // database handle (no callback transaction); the double replays canned rows
  // per statement in order.
  const queue = [...rowsPerStatement];
  return {
    execute: vi.fn(async () => ({ rows: queue.shift() ?? [] })),
  };
}

const MOIC_INPUT_ROUTE = 'PUT /api/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId';

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
  const moicResponse = () => ({
    fundId: FUND_ID,
    companyId: 1,
    allocationVersion: 1,
    exitProbability: null,
    exitMoicBps: null,
  });

  it('invalidates when the MOIC input update is applied', async () => {
    const database = executeQueueDb([
      [
        {
          company_exists: true,
          actual_version: 0,
          existing_request_id: null,
          claim_id: 1,
          response_body: moicResponse(),
        },
      ],
    ]);
    await updateFundMoicInputs({ ...params(), database: database as never });

    expect(invalidateH9Artifacts).toHaveBeenCalledWith(FUND_ID);
  });

  it('does NOT invalidate on an idempotent replay', async () => {
    const input = params();
    const requestHash = canonicalSha256({
      route: MOIC_INPUT_ROUTE,
      fundId: input.fundId,
      companyId: input.companyId,
      expectedVersion: input.expectedVersion,
      exitProbability: input.exitProbability,
      exitMoicBps: input.exitMoicBps,
    });
    const database = executeQueueDb([
      [
        {
          company_exists: true,
          actual_version: 1,
          existing_request_id: 9,
          claim_id: null,
          response_body: null,
        },
      ],
      [{ request_hash: requestHash, response_body: moicResponse(), status: 'completed' }],
    ]);
    await updateFundMoicInputs({ ...input, database: database as never });

    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });
});

// ---- calculation mode: updateFundMoicCalculationMode ------------------------

describe('updateFundMoicCalculationMode -> H9 invalidation wiring', () => {
  // 'off' mode carries no blockers, so the wiring path (not mode semantics)
  // stays the thing under test after the claim-last rewrite.
  const params = () => ({
    fundId: FUND_ID,
    expectedVersion: 0,
    configuredMode: 'off' as const,
    idempotencyKey: 'idem-mode',
    actorId: 1,
    // Pass sources so the ranking fetch is skipped; the preview builder
    // reads factsSource.status and the input summary.
    sources: {
      moicSourceInputHash: 'h',
      factsSource: { status: 'available' },
      moicInputSummary: { sourceVersion: 'v', inputHash: 'h', generatedAt: NOW_ISO },
    } as never,
    now: new Date('2026-06-25T00:00:00.000Z'),
  });

  it('invalidates when the calculation-mode change is applied', async () => {
    const database = executeQueueDb([
      // read-only mode-row preflight: absent
      [],
      // claim-last CTE statement: mutation + completed ledger row
      [
        {
          mode_exists: false,
          actual_version: null,
          existing_request_id: null,
          mode_write_id: 1,
          claim_id: 2,
        },
      ],
    ]);
    await updateFundMoicCalculationMode({ ...params(), database: database as never });

    expect(invalidateH9Artifacts).toHaveBeenCalledWith(FUND_ID);
  });

  it('does NOT invalidate on an idempotent replay', async () => {
    const input = params();
    const requestHash = canonicalSha256({
      route: 'PUT /api/admin/funds/:fundId/calculation-modes/fund-moic-rankings',
      fundId: input.fundId,
      calculationKey: 'fund_moic_rankings_exit_probability',
      expectedVersion: input.expectedVersion,
      configuredMode: input.configuredMode,
      killSwitchActive: null,
      acceptedReconciliationRunId: null,
    });
    const database = executeQueueDb([
      [],
      [
        {
          mode_exists: false,
          actual_version: null,
          existing_request_id: 5,
          mode_write_id: null,
          claim_id: null,
        },
      ],
      [
        {
          request_hash: requestHash,
          response_body: {
            calculationKey: 'fund_moic_rankings_exit_probability',
            configuredMode: 'off',
            version: 1,
          },
          status: 'completed',
        },
      ],
    ]);
    await updateFundMoicCalculationMode({ ...input, database: database as never });

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
