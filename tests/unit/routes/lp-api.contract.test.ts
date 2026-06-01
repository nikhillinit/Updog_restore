import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryChain = PromiseLike<unknown[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const dbState = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    insertValues: [] as unknown[],
  };

  function next(): unknown[] {
    return state.selectResults.shift() ?? [];
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

  const db = {
    select: vi.fn(() => makeQuery(next())),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((payload: unknown) => {
        state.insertValues.push({ table, payload });
        return Promise.resolve();
      }),
    })),
  };

  return { db, state };
});

const calculatorState = vi.hoisted(() => ({
  calculateSummary: vi.fn(),
  calculateCapitalAccount: vi.fn(),
  calculateProRataHoldings: vi.fn(),
  calculatePerformance: vi.fn(),
}));

const lpAccessState = vi.hoisted(() => ({ mode: 'lp' as 'lp' | 'non-lp' }));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: 'lp-user',
      sub: 'lp-user',
      email: 'lp@example.com',
      role: 'lp',
      roles: ['lp'],
      fundIds: [7],
      lpId: 9001,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    next();
  },
}));

vi.mock('../../../server/middleware/requireLPAccess', () => ({
  requireLPAccess: (req: Request, res: Response, next: NextFunction) => {
    if (lpAccessState.mode === 'non-lp') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'LP access required. This endpoint is only available to Limited Partners.',
      });
    }
    req.lpProfile = {
      id: 9001,
      name: 'Contract LP',
      email: 'lp@example.com',
      entityType: 'institution',
      fundIds: [7],
    };
    return next();
  },
  requireLPFundAccess: (req: Request, res: Response, next: NextFunction) => {
    const fundId = Number(req.params['fundId']);
    if (req.lpProfile?.fundIds.includes(fundId)) return next();
    return res
      .status(403)
      .json({ error: 'FORBIDDEN', message: `You do not have access to fund ${fundId}.` });
  },
}));

vi.mock('../../../server/middleware/schema-isolation', () => ({
  enforceSchemaIsolation: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  handleSchemaViolation: (_err: unknown, _req: Request, _res: Response, next: NextFunction) =>
    next(),
}));

vi.mock('../../../server/db', () => ({ db: dbState.db }));

vi.mock('../../../server/services/lp-calculator', () => ({
  lpCalculator: calculatorState,
}));

vi.mock('../../../server/queues/report-generation-queue', () => ({
  isReportQueueAvailable: vi.fn(() => true),
  enqueueReportGeneration: vi.fn(async () => ({ jobId: 'job-1', estimatedWaitMs: 0 })),
}));

vi.mock('../../../server/observability/lp-metrics', () => ({
  recordLPRequest: vi.fn(),
  recordCacheHit: vi.fn(),
  recordError: vi.fn(),
  recordDataPoints: vi.fn(),
  startTimer: vi.fn(() => () => 0),
}));

vi.mock('../../../server/services/lp-audit-logger', () => {
  const noop = vi.fn(async () => undefined);
  return {
    lpAuditLogger: {
      logProfileView: noop,
      logSummaryView: noop,
      logCapitalAccountView: noop,
      logFundDetailView: noop,
      logHoldingsView: noop,
      logPerformanceView: noop,
      logBenchmarkView: noop,
      logReportGeneration: noop,
      logReportListView: noop,
      logReportStatusView: noop,
      logReportDownload: noop,
      logSettingsUpdate: noop,
    },
  };
});

vi.mock('../../../server/lib/crypto/cursor-signing', () => ({
  createCursor: vi.fn(
    ({ offset, limit }: { offset: number; limit: number }) => `cursor:${offset}:${limit}`
  ),
  verifyCursor: vi.fn((cursor: string) => {
    const match = /^cursor:(\d+):(\d+)$/.exec(cursor);
    if (!match) throw new Error('bad cursor');
    return { offset: Number(match[1]), limit: Number(match[2]) };
  }),
}));

vi.mock('../../../server/lib/crypto/pii-sanitizer', () => ({
  sanitizeForLogging: (value: unknown) => value,
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getFund: vi.fn(async (id: number) => ({ id, name: `Fund ${id}` })),
  },
}));

import lpApiRouter from '../../../server/routes/lp-api';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(lpApiRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function resetState() {
  dbState.state.selectResults = [];
  dbState.state.insertValues = [];
  dbState.db.select.mockClear();
  dbState.db.insert.mockClear();

  calculatorState.calculateSummary.mockReset();
  calculatorState.calculateCapitalAccount.mockReset();
  calculatorState.calculateProRataHoldings.mockReset();
  calculatorState.calculatePerformance.mockReset();
  lpAccessState.mode = 'lp';
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'txn-1',
    activityType: 'capital_call',
    amountCents: BigInt(1_250_000_00),
    activityDate: new Date('2026-01-15T00:00:00.000Z'),
    effectiveDate: new Date('2026-01-15T00:00:00.000Z'),
    description: 'Capital call',
    runningBalanceCents: BigInt(1_250_000_00),
    ...overrides,
  };
}

describe('LP API route contracts', () => {
  beforeEach(() => resetState());

  it('GET /api/lp/profile returns the stable LP profile shape', async () => {
    const response = await request(makeApp()).get('/api/lp/profile');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'email',
      'entityType',
      'fundCount',
      'id',
      'name',
    ]);
    expect(response.body).toEqual({
      id: 9001,
      name: 'Contract LP',
      email: 'lp@example.com',
      entityType: 'institution',
      fundCount: 1,
    });
  });

  it('GET /api/lp/summary returns cents-as-strings and ratio fields', async () => {
    calculatorState.calculateSummary.mockResolvedValueOnce({
      lpId: 9001,
      lpName: 'Contract LP',
      totalCommittedCents: BigInt(10_000_000_00),
      totalCalledCents: BigInt(4_000_000_00),
      totalDistributedCents: BigInt(1_000_000_00),
      totalNAVCents: BigInt(9_000_000_00),
      totalUnfundedCents: BigInt(6_000_000_00),
      fundCount: 1,
      irr: 0.102454,
      moic: 2.5,
    });

    const response = await request(makeApp()).get('/api/lp/summary');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      lpId: 9001,
      lpName: 'Contract LP',
      totalCommitted: '1000000000',
      totalCalled: '400000000',
      totalDistributed: '100000000',
      totalNAV: '900000000',
      totalUnfunded: '600000000',
      fundCount: 1,
      irr: 0.102454,
      moic: 2.5,
    });
  });

  it('GET /api/lp/capital-account preserves signed cursor pagination fields', async () => {
    dbState.state.selectResults.push([{ id: 'commitment-1', lpId: 9001, fundId: 7 }]);
    calculatorState.calculateCapitalAccount.mockResolvedValueOnce([
      transaction({ id: 'txn-1' }),
      transaction({ id: 'txn-2', amountCents: BigInt(2_500_000_00) }),
      transaction({ id: 'txn-3' }),
    ]);

    const response = await request(makeApp()).get('/api/lp/capital-account?limit=2');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['hasMore', 'nextCursor', 'transactions']);
    expect(response.body.hasMore).toBe(true);
    expect(response.body.nextCursor).toBe('cursor:2:2');
    expect(response.body.transactions).toHaveLength(2);
    expect(Object.keys(response.body.transactions[0]).sort()).toEqual([
      'activityDate',
      'activityType',
      'amount',
      'description',
      'effectiveDate',
      'id',
      'runningBalance',
    ]);
    expect(response.body.transactions[0].amount).toBe('125000000');
  });

  it('GET /api/lp/capital-account rejects malformed cursors before data reads', async () => {
    const response = await request(makeApp()).get('/api/lp/capital-account?cursor=not-signed');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'INVALID_CURSOR',
      message: 'Pagination cursor is invalid or tampered',
    });
    expect(dbState.db.select).not.toHaveBeenCalled();
  });

  it('GET /api/lp/funds/:fundId/detail locks detail payload shape', async () => {
    dbState.state.selectResults.push([
      {
        id: 'commitment-7',
        lpId: 9001,
        fundId: 7,
        commitmentAmountCents: BigInt(10_000_000_00),
        commitmentDate: new Date('2024-01-01T00:00:00.000Z'),
        status: 'active',
      },
    ]);
    calculatorState.calculateCapitalAccount.mockResolvedValueOnce([
      transaction({ runningBalanceCents: BigInt(4_000_000_00) }),
    ]);

    const response = await request(makeApp()).get('/api/lp/funds/7/detail?asOfDate=2026-12-31');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      fundId: 7,
      commitmentId: 'commitment-7',
      commitmentAmount: '1000000000',
      commitmentDate: '2024-01-01T00:00:00.000Z',
      status: 'active',
      capitalAccount: {
        asOfDate: '2026-12-31',
        calledCapital: '400000000',
        transactionCount: 1,
      },
    });
  });

  it.each([['/api/lp/funds/99/detail'], ['/api/lp/funds/99/holdings']])(
    'rejects LP fund scope for %s before calculators run',
    async (path) => {
      const response = await request(makeApp()).get(path);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'FORBIDDEN',
        message: 'You do not have access to fund 99.',
      });
      expect(calculatorState.calculateCapitalAccount).not.toHaveBeenCalled();
      expect(calculatorState.calculateProRataHoldings).not.toHaveBeenCalled();
    }
  );

  it('GET /api/lp/funds/:fundId/holdings locks aggregate fields', async () => {
    calculatorState.calculateProRataHoldings.mockResolvedValueOnce([
      { companyId: 1, companyName: 'Alpha', lpProRataValue: 150 },
      { companyId: 2, companyName: 'Beta', lpProRataValue: 350 },
    ]);

    const response = await request(makeApp()).get('/api/lp/funds/7/holdings');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      fundId: 7,
      holdings: [
        { companyId: 1, companyName: 'Alpha', lpProRataValue: 150 },
        { companyId: 2, companyName: 'Beta', lpProRataValue: 350 },
      ],
      totalHoldings: 2,
      totalValue: 500,
    });
  });

  it('GET /api/lp/performance locks granularity and dataPoints fields', async () => {
    dbState.state.selectResults.push([{ id: 'commitment-7', lpId: 9001, fundId: 7 }]);
    calculatorState.calculatePerformance.mockResolvedValueOnce([
      { date: '2026-03-31', irr: 0.1, moic: 1.2, benchmarkIRR: 0.08 },
    ]);

    const response = await request(makeApp()).get(
      '/api/lp/performance?fundId=7&granularity=quarterly'
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      performance: [{ date: '2026-03-31', irr: 0.1, moic: 1.2, benchmarkIRR: 0.08 }],
      granularity: 'quarterly',
      dataPoints: 1,
    });
  });

  it('POST /api/lp/reports/generate returns 202 queued response', async () => {
    const response = await request(makeApp())
      .post('/api/lp/reports/generate')
      .send({
        reportType: 'quarterly',
        dateRange: { startDate: '2026-01-01', endDate: '2026-03-31' },
        format: 'pdf',
        fundIds: [7],
        sections: ['summary', 'capital_account'],
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      reportId: expect.any(String),
      status: 'pending',
      message: 'Report generation queued',
    });
    expect(dbState.state.insertValues).toHaveLength(1);
  });

  it('POST /api/lp/reports/generate preserves validation-error envelope', async () => {
    const response = await request(makeApp())
      .post('/api/lp/reports/generate')
      .send({
        reportType: 'quarterly',
        dateRange: { startDate: '2026-04-01', endDate: '2026-03-31' },
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'VALIDATION_ERROR',
      field: 'dateRange.startDate',
    });
  });

  it('GET and PUT /api/lp/settings lock default and echo shapes', async () => {
    const getResponse = await request(makeApp()).get('/api/lp/settings');
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual({
      notifications: {
        emailCapitalCalls: true,
        emailDistributions: true,
        emailQuarterlyReports: true,
        emailAnnualReports: true,
        emailMarketUpdates: false,
      },
      display: {
        currency: 'USD',
        numberFormat: 'US',
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
      },
    });

    const putResponse = await request(makeApp())
      .put('/api/lp/settings')
      .send({ display: { currency: 'EUR', numberFormat: 'EU' } });

    expect(putResponse.status).toBe(200);
    expect(putResponse.body).toEqual({
      success: true,
      message: 'Settings updated successfully',
      settings: { display: { currency: 'EUR', numberFormat: 'EU' } },
    });
  });

  it('POST /api/lp/reports/generate rejects funds the LP is not committed to', async () => {
    const response = await request(makeApp())
      .post('/api/lp/reports/generate')
      .send({
        reportType: 'quarterly',
        dateRange: { startDate: '2026-01-01', endDate: '2026-03-31' },
        format: 'pdf',
        fundIds: [99],
        sections: ['summary'],
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'FORBIDDEN' });
    expect(dbState.state.insertValues).toHaveLength(0);
  });
});

describe('LP API self-scoping negative controls', () => {
  beforeEach(() => resetState());

  const nonLpRoutes = [
    ['get', '/api/lp/profile'],
    ['get', '/api/lp/summary'],
    ['get', '/api/lp/capital-account'],
    ['get', '/api/lp/funds/7/detail'],
    ['get', '/api/lp/funds/7/holdings'],
    ['get', '/api/lp/performance'],
    ['get', '/api/lp/performance/benchmark'],
    [
      'post',
      '/api/lp/reports/generate',
      {
        reportType: 'quarterly',
        dateRange: { startDate: '2026-01-01', endDate: '2026-03-31' },
        format: 'pdf',
        fundIds: [7],
        sections: ['summary'],
      },
    ],
    ['get', '/api/lp/reports'],
    ['get', '/api/lp/reports/report-123'],
    ['get', '/api/lp/reports/report-123/download'],
    ['get', '/api/lp/settings'],
    ['put', '/api/lp/settings', {}],
  ] as const;

  function issueRequest(method: 'get' | 'post' | 'put', path: string, body?: unknown) {
    const app = request(makeApp());
    if (method === 'get') return app.get(path);
    const pendingRequest = method === 'post' ? app.post(path) : app.put(path);
    return body === undefined ? pendingRequest : pendingRequest.send(body);
  }

  it.each(nonLpRoutes)(
    '%s %s rejects non-LP callers before data reads',
    async (method, path, body) => {
      lpAccessState.mode = 'non-lp';

      const response = await issueRequest(method, path, body);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
      expect(dbState.db.select).not.toHaveBeenCalled();
      expect(dbState.db.insert).not.toHaveBeenCalled();
      expect(calculatorState.calculateSummary).not.toHaveBeenCalled();
      expect(calculatorState.calculateCapitalAccount).not.toHaveBeenCalled();
      expect(calculatorState.calculateProRataHoldings).not.toHaveBeenCalled();
      expect(calculatorState.calculatePerformance).not.toHaveBeenCalled();
    }
  );

  function collectPredicateAtoms(node: unknown, params: unknown[], cols: string[]): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if ('value' in n && !('queryChunks' in n)) params.push((n as { value: unknown }).value);
    if (typeof (n as { name?: unknown }).name === 'string') cols.push((n as { name: string }).name);
    const chunks = (n as { queryChunks?: unknown }).queryChunks;
    if (Array.isArray(chunks)) for (const c of chunks) collectPredicateAtoms(c, params, cols);
    const inner = n as { sql?: unknown; left?: unknown; right?: unknown };
    if (inner.sql) collectPredicateAtoms(inner.sql, params, cols);
    if (inner.left) collectPredicateAtoms(inner.left, params, cols);
    if (inner.right) collectPredicateAtoms(inner.right, params, cols);
  }

  function wherePredicateAtoms(selectCallIndex = 0): { params: unknown[]; cols: string[] } {
    const queryObj = dbState.db.select.mock.results[selectCallIndex]?.value as
      | { where?: { mock?: { calls?: unknown[][] } } }
      | undefined;
    const pred = queryObj?.where?.mock?.calls?.[0]?.[0];
    const params: unknown[] = [];
    const cols: string[] = [];
    collectPredicateAtoms(pred, params, cols);
    return { params, cols };
  }

  function expectLpPredicateScope(selectCallIndex = 0): void {
    const { params, cols } = wherePredicateAtoms(selectCallIndex);
    expect(params.length).toBeGreaterThan(0);
    expect(params).toContain(9001);
    expect(params).not.toContain(8888);
    expect(cols.some((c) => /lp_?id/i.test(c))).toBe(true);
  }

  it('GET /api/lp/summary passes the authenticated LP id to the calculator', async () => {
    calculatorState.calculateSummary.mockResolvedValueOnce({
      lpId: 9001,
      lpName: 'Contract LP',
      totalCommittedCents: BigInt(0),
      totalCalledCents: BigInt(0),
      totalDistributedCents: BigInt(0),
      totalNAVCents: BigInt(0),
      totalUnfundedCents: BigInt(0),
      fundCount: 1,
      irr: 0,
      moic: 0,
    });

    const response = await request(makeApp()).get('/api/lp/summary');

    expect(response.status).toBe(200);
    expect(calculatorState.calculateSummary).toHaveBeenCalledWith(9001);
  });

  it('GET /api/lp/funds/7/holdings passes the authenticated LP id and fund id to the calculator', async () => {
    calculatorState.calculateProRataHoldings.mockResolvedValueOnce([]);

    const response = await request(makeApp()).get('/api/lp/funds/7/holdings');

    expect(response.status).toBe(200);
    expect(calculatorState.calculateProRataHoldings).toHaveBeenCalledWith(9001, 7);
  });

  it('GET /api/lp/capital-account scopes the commitment lookup by authenticated LP id', async () => {
    dbState.state.selectResults.push([{ id: 'c1', lpId: 9001, fundId: 7 }]);
    calculatorState.calculateCapitalAccount.mockResolvedValueOnce([]);

    const response = await request(makeApp()).get('/api/lp/capital-account?limit=2');

    expect(response.status).toBe(200);
    expectLpPredicateScope();
  });

  it('GET /api/lp/funds/7/detail scopes the commitment lookup by authenticated LP id', async () => {
    dbState.state.selectResults.push([
      {
        id: 'c7',
        lpId: 9001,
        fundId: 7,
        commitmentAmountCents: BigInt(0),
        commitmentDate: new Date('2024-01-01T00:00:00.000Z'),
        status: 'active',
      },
    ]);
    calculatorState.calculateCapitalAccount.mockResolvedValueOnce([]);

    const response = await request(makeApp()).get('/api/lp/funds/7/detail');

    expect(response.status).toBe(200);
    expectLpPredicateScope();
  });

  it('GET /api/lp/performance scopes the commitment lookup by authenticated LP id', async () => {
    dbState.state.selectResults.push([{ id: 'c1', lpId: 9001, fundId: 7 }]);
    calculatorState.calculatePerformance.mockResolvedValueOnce([]);

    const response = await request(makeApp()).get('/api/lp/performance?fundId=7');

    expect(response.status).toBe(200);
    expectLpPredicateScope();
  });

  it('GET /api/lp/performance/benchmark scopes the commitment lookup by authenticated LP id', async () => {
    dbState.state.selectResults.push([{ id: 'c1', lpId: 9001, fundId: 7 }]);
    calculatorState.calculatePerformance.mockResolvedValueOnce([]);

    const response = await request(makeApp()).get('/api/lp/performance/benchmark?fundId=7');

    expect(response.status).toBe(200);
    expectLpPredicateScope();
  });

  it('GET /api/lp/reports scopes the report list lookup by authenticated LP id', async () => {
    dbState.state.selectResults.push([]);

    const response = await request(makeApp()).get('/api/lp/reports');

    expect(response.status).toBe(200);
    expectLpPredicateScope();
  });

  it('GET /api/lp/reports/report-123 scopes the report status lookup by authenticated LP id', async () => {
    dbState.state.selectResults.push([]);

    const response = await request(makeApp()).get('/api/lp/reports/report-123');

    expect(response.status).toBe(404);
    expectLpPredicateScope();
  });

  it('GET /api/lp/reports/report-123/download scopes the report download lookup by authenticated LP id', async () => {
    dbState.state.selectResults.push([]);

    const response = await request(makeApp()).get('/api/lp/reports/report-123/download');

    expect(response.status).toBe(404);
    expectLpPredicateScope();
  });

  // Profile and settings are static/echo endpoints covered by the existing shape-lock tests.
});
