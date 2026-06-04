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

const storageState = vi.hoisted(() => ({
  getFund: vi.fn(),
}));

const calculatorState = vi.hoisted(() => ({
  calculateTimeseries: vi.fn(),
  calculateBreakdown: vi.fn(),
  calculateComparison: vi.fn(),
}));

const metricsState = vi.hoisted(() => ({
  startTimer: vi.fn(() => () => 0),
  recordPerformanceRequest: vi.fn(),
  recordCacheMiss: vi.fn(),
  recordCalculation: vi.fn(),
  recordDataPoints: vi.fn(),
  recordError: vi.fn(),
}));

const loggerState = vi.hoisted(() => ({
  error: vi.fn(),
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
    getFund: storageState.getFund,
  },
}));

vi.mock('../../../server/services/performance-calculator', () => ({
  performanceCalculator: {
    calculateTimeseries: calculatorState.calculateTimeseries,
    calculateBreakdown: calculatorState.calculateBreakdown,
    calculateComparison: calculatorState.calculateComparison,
  },
}));

vi.mock('../../../server/observability/performance-metrics', () => ({
  startTimer: metricsState.startTimer,
  recordPerformanceRequest: metricsState.recordPerformanceRequest,
  recordCacheMiss: metricsState.recordCacheMiss,
  recordCalculation: metricsState.recordCalculation,
  recordDataPoints: metricsState.recordDataPoints,
  recordError: metricsState.recordError,
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    error: loggerState.error,
  },
}));

import performanceApiRouter from '../../../server/routes/performance-api';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(performanceApiRouter);
  return app;
}

describe('performance API fundId parse contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.state.selectResults = [];
  });

  it('GET /api/funds/1e1/performance/metrics rejects before the handler reads', async () => {
    const response = await request(makeApp()).get('/api/funds/1e1/performance/metrics');

    expect(response.status).toBe(400);
    expect(dbState.db.select).not.toHaveBeenCalled();
  });

  it('GET /api/funds/1e1/pacing-history rejects before the handler reads', async () => {
    const response = await request(makeApp()).get('/api/funds/1e1/pacing-history');

    expect(response.status).toBe(400);
    expect(dbState.db.select).not.toHaveBeenCalled();
  });
});
