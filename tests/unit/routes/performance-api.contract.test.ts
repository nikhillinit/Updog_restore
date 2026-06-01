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
  };

  return { db, state };
});

const {
  getFundMock,
  calculateTimeseriesMock,
  calculateBreakdownMock,
  calculateComparisonMock,
  startTimerMock,
  recordPerformanceRequestMock,
  recordCacheHitMock,
  recordCacheMissMock,
  recordCalculationMock,
  recordDataPointsMock,
  recordErrorMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getFundMock: vi.fn(),
  calculateTimeseriesMock: vi.fn(),
  calculateBreakdownMock: vi.fn(),
  calculateComparisonMock: vi.fn(),
  startTimerMock: vi.fn(),
  recordPerformanceRequestMock: vi.fn(),
  recordCacheHitMock: vi.fn(),
  recordCacheMissMock: vi.fn(),
  recordCalculationMock: vi.fn(),
  recordDataPointsMock: vi.fn(),
  recordErrorMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/lib/auth/jwt')>()),
  requireAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: 'u1',
      sub: 'u1',
      email: 'u@example.com',
      roles: ['user'],
      ip: '127.0.0.1',
      userAgent: 'vitest',
      fundIds: [1],
    };
    next();
  },
}));

vi.mock('../../../server/db', () => ({ db: dbState.db }));

vi.mock('../../../server/storage', () => ({
  storage: {
    getFund: getFundMock,
  },
}));

vi.mock('../../../server/services/performance-calculator', () => ({
  performanceCalculator: {
    calculateTimeseries: calculateTimeseriesMock,
    calculateBreakdown: calculateBreakdownMock,
    calculateComparison: calculateComparisonMock,
  },
}));

vi.mock('../../../server/observability/performance-metrics', () => ({
  startTimer: startTimerMock,
  recordPerformanceRequest: recordPerformanceRequestMock,
  recordCacheHit: recordCacheHitMock,
  recordCacheMiss: recordCacheMissMock,
  recordCalculation: recordCalculationMock,
  recordDataPoints: recordDataPointsMock,
  recordError: recordErrorMock,
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

import performanceApiRouter from '../../../server/routes/performance-api';

type RouteCase = readonly [route: string, pathForFund: (fundId: number) => string];

const protectedRoutes = [
  [
    '/api/funds/:fundId/performance/metrics',
    (fundId: number) => `/api/funds/${fundId}/performance/metrics`,
  ],
  ['/api/funds/:fundId/pacing-history', (fundId: number) => `/api/funds/${fundId}/pacing-history`],
  [
    '/api/funds/:fundId/performance/timeseries',
    (fundId: number) => `/api/funds/${fundId}/performance/timeseries`,
  ],
  [
    '/api/funds/:fundId/performance/breakdown',
    (fundId: number) => `/api/funds/${fundId}/performance/breakdown`,
  ],
  [
    '/api/funds/:fundId/performance/comparison',
    (fundId: number) => `/api/funds/${fundId}/performance/comparison`,
  ],
] as const satisfies readonly RouteCase[];

const dataLayerControlRoutes = protectedRoutes.slice(0, 2);
const validationControlRoutes = protectedRoutes.slice(2);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(performanceApiRouter);
  return app;
}

function resetState() {
  dbState.state.selectResults = [];
  dbState.db.select.mockClear();

  getFundMock.mockReset();
  getFundMock.mockResolvedValue({ id: 1, name: 'Performance Fund' });

  calculateTimeseriesMock.mockReset();
  calculateBreakdownMock.mockReset();
  calculateComparisonMock.mockReset();

  startTimerMock.mockReset();
  startTimerMock.mockReturnValue(() => 5);
  recordPerformanceRequestMock.mockReset();
  recordCacheHitMock.mockReset();
  recordCacheMissMock.mockReset();
  recordCalculationMock.mockReset();
  recordDataPointsMock.mockReset();
  recordErrorMock.mockReset();
  loggerErrorMock.mockReset();
}

function expectNoCalculatorCalls() {
  expect(calculateTimeseriesMock).not.toHaveBeenCalled();
  expect(calculateBreakdownMock).not.toHaveBeenCalled();
  expect(calculateComparisonMock).not.toHaveBeenCalled();
}

describe('performance API fund-access contract', () => {
  beforeEach(() => resetState());

  it.each(protectedRoutes)(
    'denies unauthorized fund access for %s',
    async (_route, pathForFund) => {
      const response = await request(makeApp()).get(pathForFund(2));

      expect(response.status).toBe(403);
      expect(response.status).not.toBe(404);
      expect(response.body.error).toBe('Forbidden');
      expect(dbState.db.select).not.toHaveBeenCalled();
      expect(getFundMock).not.toHaveBeenCalled();
      expectNoCalculatorCalls();
    }
  );

  it.each(dataLayerControlRoutes)(
    'allows authorized fund access for %s',
    async (_route, pathForFund) => {
      dbState.state.selectResults.push([]);

      const response = await request(makeApp()).get(pathForFund(1));

      expect(response.status).not.toBe(403);
      expect(dbState.db.select).toHaveBeenCalled();
    }
  );

  it.each(validationControlRoutes)(
    'lets authorized validation routes pass the guard for %s',
    async (_route, pathForFund) => {
      const response = await request(makeApp()).get(pathForFund(1));

      expect(response.status).not.toBe(403);
    }
  );
});
