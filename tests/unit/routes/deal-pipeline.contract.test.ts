import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestId } from '../../../server/middleware/requestId';
import { clearIdempotencyCache } from '../../../server/middleware/idempotency';

type QueryChain = PromiseLike<unknown[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

type MutationChain = PromiseLike<unknown[]> & {
  values: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
};

const mockState = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    insertReturningResults: [] as unknown[][],
    updateReturningResults: [] as unknown[][],
    insertValues: [] as unknown[],
    updateSets: [] as unknown[],
  };

  function next(queue: unknown[][]): unknown[] {
    return queue.shift() ?? [];
  }

  function thenFor(result: unknown[]): QueryChain['then'] {
    return (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected);
  }

  function makeQuery(result: unknown[]): QueryChain {
    const query = {
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve(result)),
      then: thenFor(result),
    } as QueryChain;

    return query;
  }

  function makeInsertMutation(table: unknown): MutationChain {
    const result: unknown[] = [];
    const mutation = {
      values: vi.fn((payload: unknown) => {
        state.insertValues.push({ table, payload });
        return mutation;
      }),
      set: vi.fn(() => mutation),
      where: vi.fn(() => mutation),
      returning: vi.fn(() => Promise.resolve(next(state.insertReturningResults))),
      then: thenFor(result),
    } as MutationChain;

    return mutation;
  }

  function makeUpdateMutation(table: unknown): MutationChain {
    const result: unknown[] = [];
    const mutation = {
      values: vi.fn(() => mutation),
      set: vi.fn((payload: unknown) => {
        state.updateSets.push({ table, payload });
        return mutation;
      }),
      where: vi.fn(() => mutation),
      returning: vi.fn(() => Promise.resolve(next(state.updateReturningResults))),
      then: thenFor(result),
    } as MutationChain;

    return mutation;
  }

  const db = {
    select: vi.fn(() => makeQuery(next(state.selectResults))),
    insert: vi.fn((table: unknown) => makeInsertMutation(table)),
    update: vi.fn((table: unknown) => makeUpdateMutation(table)),
  };

  return { db, state };
});

const redisState = vi.hoisted(() => {
  const store = new Map<string, string>();
  const redis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    setex: vi.fn(async (key: string, _ttl: number, value: string | number | Buffer) => {
      store.set(key, String(value));
      return 'OK';
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  };

  return { redis, store };
});

vi.mock('../../../server/db', () => ({
  db: mockState.db,
}));

vi.mock('../../../server/db/redis-circuit', () => ({
  redis: redisState.redis,
}));

import dealPipelineRouter from '../../../server/routes/deal-pipeline';

function resetDbMock() {
  mockState.state.selectResults = [];
  mockState.state.insertReturningResults = [];
  mockState.state.updateReturningResults = [];
  mockState.state.insertValues = [];
  mockState.state.updateSets = [];
  mockState.db.select.mockClear();
  mockState.db.insert.mockClear();
  mockState.db.update.mockClear();
}

function resetRedisMock() {
  redisState.store.clear();
  redisState.redis.get.mockClear();
  redisState.redis.setex.mockClear();
  redisState.redis.del.mockClear();
}

function makeUser(fundIds: number[] = [1], role = 'analyst'): Express.User {
  return {
    id: 'test-user',
    sub: 'test-user',
    email: 'test@example.com',
    role,
    roles: [role],
    fundIds,
    ip: '127.0.0.1',
    userAgent: 'vitest',
  };
}

function makeApp(fundIds: number[] = [1], role = 'analyst') {
  const app = express();
  app.use(requestId());
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = makeUser(fundIds, role);
    next();
  });
  app.use('/api/deals', dealPipelineRouter);
  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  return app;
}

function validDealPayload(overrides: Record<string, unknown> = {}) {
  return {
    fundId: 1,
    companyName: 'Contract Co',
    sector: 'SaaS',
    stage: 'Seed',
    sourceType: 'Referral',
    status: 'lead',
    priority: 'medium',
    ...overrides,
  };
}

function dealRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    fundId: 1,
    companyName: 'Contract Co',
    sector: 'SaaS',
    stage: 'Seed',
    sourceType: 'Referral',
    status: 'lead',
    priority: 'medium',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function cursorFor(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

async function waitForIdempotencyCache() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

async function expectIdempotentReplay({
  key,
  arrange,
  act,
  expectedInsertCount,
  expectedUpdateCount,
}: {
  key: string;
  arrange: () => void;
  act: () => request.Test;
  expectedInsertCount: number;
  expectedUpdateCount: number;
}) {
  arrange();

  const first = await act().set('Idempotency-Key', key);

  expect(first.status).toBeGreaterThanOrEqual(200);
  expect(first.status).toBeLessThan(300);
  expect(first.headers['idempotency-replay']).toBeUndefined();
  expect(mockState.state.insertValues).toHaveLength(expectedInsertCount);
  expect(mockState.state.updateSets).toHaveLength(expectedUpdateCount);

  await waitForIdempotencyCache();

  const second = await act().set('Idempotency-Key', key);

  expect(second.status).toBe(first.status);
  expect(second.body).toEqual(first.body);
  expect(second.headers['idempotency-replay']).toBe('true');
  expect(mockState.state.insertValues).toHaveLength(expectedInsertCount);
  expect(mockState.state.updateSets).toHaveLength(expectedUpdateCount);
}

describe('deal pipeline route contracts', () => {
  beforeEach(() => {
    clearIdempotencyCache();
    resetDbMock();
    resetRedisMock();
  });

  afterEach(() => {
    clearIdempotencyCache();
    resetDbMock();
    resetRedisMock();
  });

  it('rejects invalid opportunity IDs before DB access', async () => {
    const app = makeApp();

    const getResponse = await request(app).get('/api/deals/opportunities/not-a-number');
    const putResponse = await request(app)
      .put('/api/deals/opportunities/not-a-number')
      .send(validDealPayload());
    const deleteResponse = await request(app).delete('/api/deals/opportunities/not-a-number');
    const stageResponse = await request(app)
      .post('/api/deals/not-a-number/stage')
      .send({ status: 'qualified' });

    for (const response of [getResponse, putResponse, deleteResponse, stageResponse]) {
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'invalid_id',
        message: 'Deal ID must be a number',
      });
    }
    expect(mockState.db.select).not.toHaveBeenCalled();
    expect(mockState.db.update).not.toHaveBeenCalled();
    expect(mockState.db.insert).not.toHaveBeenCalled();
  });

  it('rejects malformed cursors without querying deals', async () => {
    const response = await request(makeApp()).get('/api/deals/opportunities?cursor=not-json');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'invalid_cursor',
      message: 'The provided cursor is invalid or expired',
    });
    expect(mockState.db.select).not.toHaveBeenCalled();
  });

  it('rejects structurally valid cursors with invalid timestamps without querying deals', async () => {
    const cursor = cursorFor({ createdAt: 'not-a-date', id: 101 });
    const response = await request(makeApp()).get(`/api/deals/opportunities?cursor=${cursor}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'invalid_cursor',
      message: 'The provided cursor is invalid or expired',
    });
    expect(mockState.db.select).not.toHaveBeenCalled();
  });

  it('lists deals with filters and locks cursor pagination envelope', async () => {
    mockState.state.selectResults.push([
      dealRow({ id: 30, companyName: 'Gamma Contract', createdAt: new Date('2026-01-03Z') }),
      dealRow({ id: 20, companyName: 'Beta Contract', createdAt: new Date('2026-01-02Z') }),
      dealRow({ id: 10, companyName: 'Alpha Contract', createdAt: new Date('2026-01-01Z') }),
    ]);

    const response = await request(makeApp()).get(
      '/api/deals/opportunities?limit=2&status=lead&priority=medium&fundId=1&search=Contract'
    );

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['data', 'pagination', 'success']);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((deal: { id: number }) => deal.id)).toEqual([30, 20]);
    expect(response.body.pagination).toEqual({
      hasMore: true,
      nextCursor: cursorFor({ createdAt: '2026-01-02T00:00:00.000Z', id: 20 }),
      count: 2,
    });
  });

  it('returns 404 with request id propagation for missing deal reads and mutations', async () => {
    mockState.state.selectResults.push([], [], []);
    const app = makeApp();

    const getResponse = await request(app).get('/api/deals/opportunities/404');
    const putResponse = await request(app)
      .put('/api/deals/opportunities/404')
      .send({ companyName: 'Missing Co' });
    const deleteResponse = await request(app).delete('/api/deals/opportunities/404');

    for (const response of [getResponse, putResponse, deleteResponse]) {
      expect(response.status).toBe(404);
      expect(response.headers['x-request-id']).toEqual(expect.any(String));
      expect(response.body).toEqual({
        error: 'not_found',
        message: 'Deal not found',
      });
    }
    expect(mockState.db.update).not.toHaveBeenCalled();
  });

  it('rejects invalid import and bulk payloads before DB access', async () => {
    const app = makeApp();

    const preview = await request(app)
      .post('/api/deals/opportunities/import/preview')
      .send({ rows: [{ companyName: '', sector: 'Nope' }] });
    const confirm = await request(app)
      .post('/api/deals/opportunities/import')
      .send({ rows: [{ companyName: '', sector: 'Nope' }] });
    const bulkStatus = await request(app)
      .post('/api/deals/opportunities/bulk/status')
      .send({ dealIds: [], status: 'qualified' });
    const bulkArchive = await request(app)
      .post('/api/deals/opportunities/bulk/archive')
      .send({ dealIds: [] });

    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({
      total: 1,
      valid: 0,
      invalid: 1,
      toImport: 0,
    });
    expect(confirm.status).toBe(400);
    expect(confirm.body).toMatchObject({ error: 'validation_error' });
    expect(bulkStatus.status).toBe(400);
    expect(bulkStatus.body).toMatchObject({ error: 'validation_error' });
    expect(bulkArchive.status).toBe(400);
    expect(bulkArchive.body).toMatchObject({ error: 'validation_error' });
    expect(mockState.db.insert).not.toHaveBeenCalled();
    expect(mockState.db.update).not.toHaveBeenCalled();
  });

  it('keeps cross-fund writes scoped while allowing team-member reads across surfaces', async () => {
    const app = makeApp([1]);

    const createBodyScope = await request(app)
      .post('/api/deals/opportunities')
      .send(validDealPayload({ fundId: 2 }));
    const listQueryScope = await request(app).get('/api/deals/opportunities?fundId=2');
    const updateBodyScope = await request(app)
      .put('/api/deals/opportunities/101')
      .send({ fundId: 2 });
    const pipelineQueryScope = await request(app).get('/api/deals/pipeline?fundId=2');
    const previewBodyScope = await request(app)
      .post('/api/deals/opportunities/import/preview')
      .send({ fundId: 2, rows: [validDealPayload({ companyName: 'Preview Co' })] });
    const confirmBodyScope = await request(app)
      .post('/api/deals/opportunities/import')
      .send({ fundId: 2, rows: [validDealPayload({ companyName: 'Import Co' })] });

    // Writes (non-safe methods) stay fund-scoped: cross-fund mutations denied before DB access.
    for (const response of [createBodyScope, updateBodyScope, previewBodyScope, confirmBodyScope]) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        code: 'FUND_ACCESS_DENIED',
      });
    }
    // Universal read: cross-fund GET reads are allowed for team members.
    for (const response of [listQueryScope, pipelineQueryScope]) {
      expect(response.status).not.toBe(403);
    }
    expect(mockState.db.insert).not.toHaveBeenCalled();
    expect(mockState.db.update).not.toHaveBeenCalled();
  });

  it('denies restricted principals before any deal mutation across all write routes', async () => {
    const deniedRequests = [
      request(makeApp([1], 'lp'))
        .put('/api/deals/opportunities/301')
        .send({ companyName: 'Denied Co' }),
      request(makeApp([1], 'lp')).delete('/api/deals/opportunities/301'),
      request(makeApp([1], 'lp'))
        .post('/api/deals/301/stage')
        .send({ status: 'qualified' }),
      request(makeApp([1], 'lp'))
        .post('/api/deals/301/diligence')
        .send({
          category: 'Financial',
          item: 'Review financials',
          status: 'pending',
          priority: 'medium',
        }),
      request(makeApp([1], 'lp'))
        .post('/api/deals/opportunities/bulk/status')
        .send({ dealIds: [301], status: 'qualified' }),
      request(makeApp([1], 'lp'))
        .post('/api/deals/opportunities/bulk/archive')
        .send({ dealIds: [301] }),
    ];

    const responses = await Promise.all(deniedRequests);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(mockState.db.select).not.toHaveBeenCalled();
    expect(mockState.db.insert).not.toHaveBeenCalled();
    expect(mockState.db.update).not.toHaveBeenCalled();
  });

  it('returns 404 for inaccessible ID-only writes before any mutation', async () => {
    mockState.state.selectResults.push([], [], [], [], [], []);

    const responses = await Promise.all([
      request(makeApp()).put('/api/deals/opportunities/310').send({ companyName: 'Missing Co' }),
      request(makeApp()).delete('/api/deals/opportunities/310'),
      request(makeApp()).post('/api/deals/310/stage').send({ status: 'qualified' }),
      request(makeApp()).post('/api/deals/310/diligence').send({
        category: 'Financial',
        item: 'Review financials',
        status: 'pending',
        priority: 'medium',
      }),
      request(makeApp())
        .post('/api/deals/opportunities/bulk/status')
        .send({ dealIds: [310], status: 'qualified' }),
      request(makeApp()).post('/api/deals/opportunities/bulk/archive').send({ dealIds: [310] }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404]);
    expect(mockState.db.insert).not.toHaveBeenCalled();
    expect(mockState.db.update).not.toHaveBeenCalled();
  });

  it('hides cross-fund ID-only resources while explicit fund scope stays forbidden', async () => {
    mockState.state.selectResults.push([dealRow({ id: 311, fundId: 2 })]);
    const idOnly = await request(makeApp([1]))
      .post('/api/deals/311/stage')
      .send({ status: 'qualified' });

    const explicit = await request(makeApp([1]))
      .put('/api/deals/opportunities/311')
      .send({ fundId: 2, companyName: 'Denied Co' });

    expect(idOnly.status).toBe(404);
    expect(explicit.status).toBe(403);
    expect(explicit.body).toMatchObject({
      error: 'Forbidden',
      code: 'FUND_ACCESS_DENIED',
    });
    expect(mockState.db.insert).not.toHaveBeenCalled();
    expect(mockState.db.update).not.toHaveBeenCalled();
  });

  it('allows TEAM_WRITE_ROLES through all deal write guards', async () => {
    const writeCases = [
      {
        setup: () => {
          mockState.state.selectResults.push([dealRow({ id: 302 })], [dealRow({ id: 302 })]);
          mockState.state.updateReturningResults.push([dealRow({ id: 302 })]);
        },
        invoke: (app: ReturnType<typeof express>) =>
          request(app).put('/api/deals/opportunities/302').send({ companyName: 'Allowed Co' }),
      },
      {
        setup: () => {
          mockState.state.selectResults.push([dealRow({ id: 303 })], [dealRow({ id: 303 })]);
          mockState.state.updateReturningResults.push([dealRow({ id: 303, status: 'passed' })]);
        },
        invoke: (app: ReturnType<typeof express>) =>
          request(app).delete('/api/deals/opportunities/303'),
      },
      {
        setup: () => {
          mockState.state.selectResults.push([dealRow({ id: 304 })], [dealRow({ id: 304 })]);
          mockState.state.updateReturningResults.push([dealRow({ id: 304, status: 'qualified' })]);
        },
        invoke: (app: ReturnType<typeof express>) =>
          request(app).post('/api/deals/304/stage').send({ status: 'qualified' }),
      },
      {
        setup: () => {
          mockState.state.selectResults.push([dealRow({ id: 305 })], [dealRow({ id: 305 })]);
          mockState.state.insertReturningResults.push([
            { id: 1, opportunityId: 305, item: 'Review financials' },
          ]);
        },
        invoke: (app: ReturnType<typeof express>) =>
          request(app).post('/api/deals/305/diligence').send({
            category: 'Financial',
            item: 'Review financials',
            status: 'pending',
            priority: 'medium',
          }),
      },
      {
        setup: () => {
          mockState.state.selectResults.push([dealRow({ id: 306 })], [dealRow({ id: 306 })]);
          mockState.state.updateReturningResults.push([dealRow({ id: 306, status: 'qualified' })]);
        },
        invoke: (app: ReturnType<typeof express>) =>
          request(app)
            .post('/api/deals/opportunities/bulk/status')
            .send({ dealIds: [306], status: 'qualified' }),
      },
      {
        setup: () => {
          mockState.state.selectResults.push([dealRow({ id: 307 })], [dealRow({ id: 307 })]);
          mockState.state.updateReturningResults.push([dealRow({ id: 307, status: 'passed' })]);
        },
        invoke: (app: ReturnType<typeof express>) =>
          request(app).post('/api/deals/opportunities/bulk/archive').send({ dealIds: [307] }),
      },
    ];

    for (const role of ['analyst', 'partner', 'admin']) {
      for (const writeCase of writeCases) {
        resetDbMock();
        resetRedisMock();
        clearIdempotencyCache();
        writeCase.setup();

        const response = await writeCase.invoke(makeApp([1], role));
        expect(response.status, `${role} should access deal write route`).toBeGreaterThanOrEqual(200);
        expect(response.status, `${role} should access deal write route`).toBeLessThan(300);
      }
    }
  });

  it.each([
    '/api/deals/opportunities/bulk/status',
    '/api/deals/opportunities/bulk/archive',
  ])('rejects mixed-fund bulk deal IDs atomically on %s', async (path) => {
    mockState.state.selectResults.push([
      dealRow({ id: 308, fundId: 1 }),
      dealRow({ id: 309, fundId: 2 }),
    ]);

    const response = request(makeApp([1]))
      .post(path)
      .send(
        path.endsWith('/status')
          ? { dealIds: [308, 309], status: 'qualified' }
          : { dealIds: [308, 309] }
      );

    const result = await response;

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'mixed_fund_deals' });
    expect(mockState.db.update).not.toHaveBeenCalled();
    expect(mockState.db.insert).not.toHaveBeenCalled();
  });

  it('replays create without duplicate deal or activity inserts', async () => {
    await expectIdempotentReplay({
      key: 'deal-create-once',
      arrange: () => {
        mockState.state.insertReturningResults.push([dealRow({ id: 201 })]);
      },
      act: () => request(makeApp()).post('/api/deals/opportunities').send(validDealPayload()),
      expectedInsertCount: 2,
      expectedUpdateCount: 0,
    });
  });

  it('replays import without duplicate row inserts', async () => {
    await expectIdempotentReplay({
      key: 'deal-import-once',
      arrange: () => {
        mockState.state.selectResults.push([]);
      },
      act: () =>
        request(makeApp())
          .post('/api/deals/opportunities/import')
          .send({ fundId: 1, rows: [validDealPayload({ companyName: 'Import Co' })] }),
      expectedInsertCount: 1,
      expectedUpdateCount: 0,
    });
  });

  it('replays stage change without duplicate update or activity insert', async () => {
    await expectIdempotentReplay({
      key: 'deal-stage-once',
      arrange: () => {
        mockState.state.selectResults.push([dealRow({ id: 202, status: 'lead' })]);
        mockState.state.selectResults.push([dealRow({ id: 202, status: 'lead' })]);
        mockState.state.updateReturningResults.push([dealRow({ id: 202, status: 'qualified' })]);
      },
      act: () =>
        request(makeApp())
          .post('/api/deals/202/stage')
          .send({ status: 'qualified', notes: 'contract pin' }),
      expectedInsertCount: 1,
      expectedUpdateCount: 1,
    });
  });

  it('replays delete without duplicate archive update or activity insert', async () => {
    await expectIdempotentReplay({
      key: 'deal-delete-once',
      arrange: () => {
        mockState.state.selectResults.push([dealRow({ id: 203, status: 'lead' })]);
        mockState.state.selectResults.push([dealRow({ id: 203, status: 'lead' })]);
        mockState.state.updateReturningResults.push([dealRow({ id: 203, status: 'passed' })]);
      },
      act: () => request(makeApp()).delete('/api/deals/opportunities/203'),
      expectedInsertCount: 1,
      expectedUpdateCount: 1,
    });
  });

  it('replays bulk status without duplicate updates or activity inserts', async () => {
    await expectIdempotentReplay({
      key: 'deal-bulk-status-once',
      arrange: () => {
        mockState.state.selectResults.push([dealRow({ id: 204, status: 'lead' })]);
        mockState.state.selectResults.push([dealRow({ id: 204, status: 'lead' })]);
      },
      act: () =>
        request(makeApp())
          .post('/api/deals/opportunities/bulk/status')
          .send({ dealIds: [204], status: 'qualified', notes: 'contract pin' }),
      expectedInsertCount: 1,
      expectedUpdateCount: 1,
    });
  });

  it('replays bulk archive without duplicate updates or activity inserts', async () => {
    await expectIdempotentReplay({
      key: 'deal-bulk-archive-once',
      arrange: () => {
        mockState.state.selectResults.push([dealRow({ id: 205, status: 'lead' })]);
        mockState.state.selectResults.push([dealRow({ id: 205, status: 'lead' })]);
      },
      act: () =>
        request(makeApp())
          .post('/api/deals/opportunities/bulk/archive')
          .send({ dealIds: [205] }),
      expectedInsertCount: 1,
      expectedUpdateCount: 1,
    });
  });
});
