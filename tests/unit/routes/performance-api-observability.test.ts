import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

const {
  authState,
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
} = vi.hoisted(() => {
  const authState = {
    fundAccessAllowed: true,
    requireFundAccessMock: vi.fn((_req: Request, res: Response, next: NextFunction) => {
      if (!authState.fundAccessAllowed) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this fund',
        });
      }
      return next();
    }),
  };

  return {
    authState,
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
  };
});

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireFundAccess: authState.requireFundAccessMock,
}));

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

describe('performance API observability', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    authState.fundAccessAllowed = true;

    app = express();
    app.use(express.json());
    app.use(performanceApiRouter);

    startTimerMock.mockReturnValue(() => 5);
    getFundMock.mockResolvedValue({ id: 1, name: 'Performance Fund' });
    calculateTimeseriesMock.mockResolvedValue([
      {
        date: '2024-01-01',
        actual: { irr: 0.12, tvpi: 1.4, dpi: 0.1, totalValue: 10_000_000 },
        _source: 'database',
      },
    ]);
    calculateBreakdownMock.mockResolvedValue({
      breakdown: [],
      totals: {
        companyCount: 0,
        totalDeployed: 0,
        currentValue: 0,
        averageMOIC: 0,
        portfolioIRR: null,
      },
    });
    calculateComparisonMock.mockResolvedValue({
      comparisons: [],
      deltas: [],
    });
  });

  it('rejects denied fund scope before storage and calculators run', async () => {
    authState.fundAccessAllowed = false;

    const response = await request(app).get(
      '/api/funds/2/performance/timeseries?startDate=2024-01-01&endDate=2024-12-31&granularity=monthly'
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Forbidden',
      message: 'You do not have access to this fund',
    });
    expect(getFundMock).not.toHaveBeenCalled();
    expect(calculateTimeseriesMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      '/api/funds/1/performance/timeseries?startDate=2024-01-01&endDate=2024-12-31&granularity=monthly',
      'timeseries',
    ],
    ['/api/funds/1/performance/breakdown?groupBy=sector', 'breakdown'],
    ['/api/funds/1/performance/comparison?dates=2024-03-31,2024-06-30', 'comparison'],
  ])('records a cache miss for %s', async (path, metricName) => {
    const response = await request(app).get(path);

    expect(response.status).toBe(200);
    expect(response.body.meta.cacheHit).toBe(false);
    expect(recordCacheMissMock).toHaveBeenCalledWith(metricName);
    expect(recordCacheHitMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      '/api/funds/1/performance/timeseries?startDate=2024-01-01&endDate=2024-12-31&granularity=monthly',
      'timeseries',
    ],
    ['/api/funds/1/performance/breakdown?groupBy=sector', 'breakdown'],
    ['/api/funds/1/performance/comparison?dates=2024-03-31,2024-06-30', 'comparisons'],
  ])('returns the raw mounted analytics contract for %s', async (path, payloadKey) => {
    const response = await request(app).get(path);
    const body = response.body as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toHaveProperty(payloadKey);
    expect(body).toHaveProperty('meta');
    expect(body).not.toHaveProperty('success');
    expect(body).not.toHaveProperty('data');
  });

  it.each([
    [
      '/api/funds/1/performance/timeseries?startDate=2024-01-01&endDate=2024-12-31&granularity=monthly',
      'Performance timeseries API error',
      () => calculateTimeseriesMock.mockRejectedValueOnce(new Error('timeseries failed')),
    ],
    [
      '/api/funds/1/performance/breakdown?groupBy=sector',
      'Performance breakdown API error',
      () => calculateBreakdownMock.mockRejectedValueOnce(new Error('breakdown failed')),
    ],
    [
      '/api/funds/1/performance/comparison?dates=2024-03-31,2024-06-30',
      'Performance comparison API error',
      () => calculateComparisonMock.mockRejectedValueOnce(new Error('comparison failed')),
    ],
  ])('logs errors through pino for %s', async (path, message, arrangeError) => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    arrangeError();

    const response = await request(app).get(path);

    expect(response.status).toBe(500);
    expect(loggerErrorMock).toHaveBeenCalledWith({ error: expect.any(Error) }, message);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
