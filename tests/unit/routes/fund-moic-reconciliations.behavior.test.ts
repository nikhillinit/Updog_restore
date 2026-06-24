import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import type { FundMoicRankingSources } from '../../../server/services/fund-moic-ranking-service';

const FIXED_AT = new Date('2026-06-24T00:00:00.000Z');

const authState = vi.hoisted(() => ({
  user: null as null | { id: number; role: string; fundIds: number[] },
}));

const ranking = vi.hoisted(() => ({ getFundMoicRankingSources: vi.fn() }));
const evidence = vi.hoisted(() => ({ buildRoundsToModelEvidence: vi.fn() }));

const dbHolder = vi.hoisted(() => {
  const state = {
    selectQueue: [] as unknown[][],
    conflictOnInsert: false,
    throwOnInsert: false,
    idSeq: 1,
    selectCalls: 0,
    insertAttempts: 0,
    lastInsertValues: undefined as undefined | Record<string, unknown>,
    inserted: [] as Array<Record<string, unknown>>,
  };
  const fixedAt = new Date('2026-06-24T00:00:00.000Z');
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            state.selectCalls += 1;
            return state.selectQueue.shift() ?? [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        state.lastInsertValues = values;
        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              state.insertAttempts += 1;
              if (state.throwOnInsert) throw new Error('transient insert failure');
              if (state.conflictOnInsert) return [];
              const row = { ...values, id: state.idSeq++, requestedAt: fixedAt };
              state.inserted.push(row);
              return [row];
            },
          }),
        };
      },
    }),
  };
  return { db, state };
});

vi.mock('../../../server/db', () => ({ db: dbHolder.db }));

vi.mock('../../../server/services/rounds-to-model-evidence-service', () => ({
  buildRoundsToModelEvidence: evidence.buildRoundsToModelEvidence,
}));

vi.mock('../../../server/services/fund-moic-ranking-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-moic-ranking-service')>();
  return { ...actual, getFundMoicRankingSources: ranking.getFundMoicRankingSources };
});

// Partial-mock auth: reproduce the real 401, inject identity otherwise; keep
// requireFundAccess + requireRole real so guard logic is genuinely exercised.
vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return {
    ...actual,
    requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
      if (!authState.user) return res.sendStatus(401);
      (req as Request & { user: unknown }).user = { ...authState.user };
      next();
    },
  };
});

import fundMoicRouter from '../../../server/routes/fund-moic';

const rankingItem = (investmentId: string, value: number) => ({
  rank: 1,
  investmentId,
  investmentName: investmentId,
  reservesMoic: { value, description: 'desc', formula: 'formula' },
});

const sourceBundle = (overrides: Partial<FundMoicRankingSources> = {}): FundMoicRankingSources => ({
  legacy: {
    fundId: 1,
    provenance: {
      source: 'portfolio_companies',
      calculation: 'reserves_moic_rankings',
      metricBasis: 'planned_reserves',
      sourceRecordCount: 1,
    },
    generatedAt: '2026-06-24T00:00:00.000Z',
    rankings: [rankingItem('1', 0)],
  },
  candidate: {
    fundId: 1,
    provenance: {
      source: 'portfolio_companies',
      calculation: 'reserves_moic_rankings',
      metricBasis: 'planned_reserves',
      sourceRecordCount: 1,
    },
    generatedAt: '2026-06-24T00:00:00.000Z',
    rankings: [rankingItem('1', 2.8)],
  },
  moicInputSummary: {
    sourceVersion: 'moic-exit-probability-v1',
    explicitExitProbabilityCount: 1,
    defaultedExitProbabilityCount: 0,
    activationBlockingDefaultedExitProbabilityCount: 0,
    explicitReserveExitMultipleCount: 1,
    defaultedReserveExitMultipleCount: 0,
    activationBlockingDefaultedReserveExitMultipleCount: 0,
  },
  moicSourceInputHash: 'source-hash-a',
  ...overrides,
});

const requestHashFor = (fundId: number, moicSourceInputHash: string): string =>
  canonicalSha256({
    kind: 'moic_reconciliation',
    fundId,
    calculationKey: 'fund_moic_rankings_exit_probability',
    contractVersion: '2.1.0',
    moicSourceInputHash,
  });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', fundMoicRouter);
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) =>
    res.status(500).json({ error: 'internal_error' })
  );
  return app;
}

const post = (fundId: number | string, key?: string) => {
  const req = request(buildApp()).post(`/api/admin/funds/${fundId}/moic/reconciliations`);
  return key === undefined ? req.send({}) : req.set('Idempotency-Key', key).send({});
};

const ADMIN = { id: 101, role: 'admin', fundIds: [1] };

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  Object.assign(dbHolder.state, {
    selectQueue: [],
    conflictOnInsert: false,
    throwOnInsert: false,
    idSeq: 1,
    selectCalls: 0,
    insertAttempts: 0,
    lastInsertValues: undefined,
    inserted: [],
  });
  ranking.getFundMoicRankingSources.mockResolvedValue(sourceBundle());
  evidence.buildRoundsToModelEvidence.mockResolvedValue({
    coverage: { activeRoundCount: 0, activeOverrideCount: 0, warningsByCode: {} },
  });
});

const expectZeroDownstream = () => {
  expect(ranking.getFundMoicRankingSources).not.toHaveBeenCalled();
  expect(evidence.buildRoundsToModelEvidence).not.toHaveBeenCalled();
  expect(dbHolder.state.selectCalls).toBe(0);
  expect(dbHolder.state.insertAttempts).toBe(0);
};

describe('fund MOIC reconciliation route - behavioral state machine', () => {
  it('401 when unauthenticated, with zero downstream work', async () => {
    authState.user = null;
    const res = await post(1, 'key-401');
    expect(res.status).toBe(401);
    expectZeroDownstream();
  });

  it('400 on non-numeric fundId via requireFundAccess, zero downstream', async () => {
    authState.user = ADMIN;
    const res = await post('not-a-number', 'key-400');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bad Request', message: 'Invalid fund ID' });
    expectZeroDownstream();
  });

  it('428 when Idempotency-Key header is missing, zero downstream', async () => {
    authState.user = ADMIN;
    const res = await post(1);
    expect(res.status).toBe(428);
    expect(res.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expectZeroDownstream();
  });

  it('428 when Idempotency-Key is whitespace only (proves .trim()), zero downstream', async () => {
    authState.user = ADMIN;
    const res = await post(1, '   ');
    expect(res.status).toBe(428);
    expect(res.body).toEqual({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required',
    });
    expectZeroDownstream();
  });

  it('403 for a non-admin who HAS fund access (isolates requireRole), zero downstream', async () => {
    authState.user = { id: 102, role: 'analyst', fundIds: [1] };
    const res = await post(1, 'key-403-role');
    expect(res.status).toBe(403);
    expectZeroDownstream();
  });

  it('403 for an admin WITHOUT fund access (isolates requireFundAccess), zero downstream', async () => {
    authState.user = { id: 101, role: 'admin', fundIds: [999] };
    const res = await post(1, 'key-403-access');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden', message: 'You do not have access to fund 1' });
    expectZeroDownstream();
  });

  it('201 first run: persists requestedBy=101, one ranking, one evidence, one insert', async () => {
    authState.user = ADMIN;
    dbHolder.state.selectQueue = [[]];
    const res = await post(1, 'idem-201');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ runId: '1', createdAt: FIXED_AT.toISOString(), replayed: false });
    expect(dbHolder.state.lastInsertValues).toMatchObject({
      fundId: 1,
      idempotencyKey: 'idem-201',
      requestedBy: 101,
    });
    expect(ranking.getFundMoicRankingSources).toHaveBeenCalledTimes(1);
    expect(evidence.buildRoundsToModelEvidence).toHaveBeenCalledTimes(1);
    expect(dbHolder.state.insertAttempts).toBe(1);
  });

  it('200 replay by a different admin: same run, requestedBy unchanged, no evidence/insert', async () => {
    authState.user = ADMIN;
    dbHolder.state.selectQueue = [[]];
    const created = await post(1, 'idem-replay');
    expect(created.status).toBe(201);
    const createdRow = dbHolder.state.inserted[0];

    Object.assign(dbHolder.state, { selectCalls: 0, insertAttempts: 0 });
    ranking.getFundMoicRankingSources.mockClear();
    evidence.buildRoundsToModelEvidence.mockClear();
    authState.user = { id: 202, role: 'admin', fundIds: [1] };
    dbHolder.state.selectQueue = [[createdRow]];

    const replay = await post(1, 'idem-replay');
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ runId: '1', createdAt: FIXED_AT.toISOString(), replayed: true });
    expect(ranking.getFundMoicRankingSources).toHaveBeenCalledTimes(1);
    expect(evidence.buildRoundsToModelEvidence).not.toHaveBeenCalled();
    expect(dbHolder.state.insertAttempts).toBe(0);
    expect(createdRow?.requestedBy).toBe(101);
  });

  it('trim-normalized replay: "  idem-trim  " then "idem-trim" hit the same run', async () => {
    authState.user = ADMIN;
    dbHolder.state.selectQueue = [[]];
    const first = await post(1, '  idem-trim  ');
    expect(first.status).toBe(201);
    expect(dbHolder.state.lastInsertValues).toMatchObject({ idempotencyKey: 'idem-trim' });
    const row = dbHolder.state.inserted[0];

    Object.assign(dbHolder.state, { insertAttempts: 0 });
    dbHolder.state.selectQueue = [[row]];
    const second = await post(1, 'idem-trim');
    expect(second.status).toBe(200);
    expect(second.body.runId).toBe('1');
    expect(dbHolder.state.insertAttempts).toBe(0);
  });

  it('201 same key on a different fund creates an independent run (fund-scoped idempotency)', async () => {
    authState.user = { id: 101, role: 'admin', fundIds: [1, 2] };
    dbHolder.state.selectQueue = [[]];
    const f1 = await post(1, 'shared-key');
    expect(f1.status).toBe(201);
    expect(f1.body.runId).toBe('1');

    dbHolder.state.selectQueue = [[]];
    const f2 = await post(2, 'shared-key');
    expect(f2.status).toBe(201);
    expect(f2.body.runId).toBe('2');
    expect(dbHolder.state.insertAttempts).toBe(2);
  });

  it('409 when a pre-seeded row has a mismatched request hash (same fund), no insert', async () => {
    authState.user = ADMIN;
    const seeded = {
      id: 9,
      requestedAt: FIXED_AT,
      requestHash: `mismatch:${requestHashFor(1, 'source-hash-a')}`,
    };
    dbHolder.state.selectQueue = [[seeded]];
    const res = await post(1, 'idem-409');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'idempotency_conflict',
      message: 'Idempotency-Key reused with a different request',
    });
    expect(dbHolder.state.insertAttempts).toBe(0);
  });

  it('race match: empty first select, conflicting insert returns [], reload returns matching row -> 200', async () => {
    authState.user = ADMIN;
    const competitor = {
      id: 5,
      requestedAt: FIXED_AT,
      requestHash: requestHashFor(1, 'source-hash-a'),
    };
    dbHolder.state.selectQueue = [[], [competitor]];
    dbHolder.state.conflictOnInsert = true;
    const res = await post(1, 'idem-race-match');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ runId: '5', createdAt: FIXED_AT.toISOString(), replayed: true });
    expect(dbHolder.state.selectCalls).toBe(2);
    expect(dbHolder.state.insertAttempts).toBe(1);
  });

  it('race mismatch: conflicting insert returns [], reload returns mismatched row -> 409', async () => {
    authState.user = ADMIN;
    const competitor = {
      id: 6,
      requestedAt: FIXED_AT,
      requestHash: `mismatch:${requestHashFor(1, 'source-hash-a')}`,
    };
    dbHolder.state.selectQueue = [[], [competitor]];
    dbHolder.state.conflictOnInsert = true;
    const res = await post(1, 'idem-race-mismatch');
    expect(res.status).toBe(409);
    expect(dbHolder.state.selectCalls).toBe(2);
    expect(dbHolder.state.insertAttempts).toBe(1);
  });

  it('transient insert failure -> 500, then retry with the same key -> 201, exactly one row', async () => {
    authState.user = ADMIN;
    dbHolder.state.selectQueue = [[]];
    dbHolder.state.throwOnInsert = true;
    const failed = await post(1, 'idem-transient');
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: 'internal_error' });
    expect(dbHolder.state.inserted).toHaveLength(0);

    dbHolder.state.throwOnInsert = false;
    dbHolder.state.selectQueue = [[]];
    const retried = await post(1, 'idem-transient');
    expect(retried.status).toBe(201);
    expect(dbHolder.state.inserted).toHaveLength(1);
  });
});
