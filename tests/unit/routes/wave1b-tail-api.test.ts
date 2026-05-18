import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { getUnifiedMetricsMock, invalidateCacheMock, loggerInfoMock } = vi.hoisted(() => ({
  getUnifiedMetricsMock: vi.fn(),
  invalidateCacheMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'user-1', email: 'user@example.com' } as never;
    next();
  },
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
  requireFundAccess: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

vi.mock('../../../server/middleware/rate-limit', () => ({
  adminRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

vi.mock('../../../server/services/metrics-aggregator', () => ({
  metricsAggregator: {
    getUnifiedMetrics: getUnifiedMetricsMock,
    invalidateCache: invalidateCacheMock,
  },
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    info: loggerInfoMock,
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import graduationRouter from '../../../server/routes/graduation';
import { readinessHandler } from '../../../server/routes/readiness';
import fundMetricsRouter from '../../../server/routes/fund-metrics';

describe('Wave 1B route tail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUnifiedMetricsMock.mockResolvedValue({
      irr: 0.21,
      tvpi: 1.8,
    });
    invalidateCacheMock.mockResolvedValue(undefined);
  });

  it('serves graduation defaults and validates invalid project input', async () => {
    const app = express();
    app.use(express.json());
    app.use(graduationRouter);

    const defaultsResponse = await request(app).get('/defaults').expect(200);
    expect(defaultsResponse.body).toBeDefined();

    const invalidResponse = await request(app)
      .post('/project')
      .send({ initialCompanies: 0 })
      .expect(400);

    expect(invalidResponse.body).toEqual({
      error: 'invalid_request',
      message: 'initialCompanies must be a positive number',
    });
  });

  it('reports readiness based on the provided critical breakers', async () => {
    const app = express();
    app.get('/ready', readinessHandler([{ getState: () => 'OPEN', run: vi.fn() }]));
    app.get('/healthy', readinessHandler([{ getState: () => 'CLOSED', run: vi.fn() }]));

    const degradedResponse = await request(app).get('/ready').expect(503);
    expect(degradedResponse.body.ready).toBe(false);

    const healthyResponse = await request(app).get('/healthy').expect(200);
    expect(healthyResponse.body.ready).toBe(true);
  });

  it('returns fund metrics and logs skipCache overrides through the shared logger', async () => {
    const app = express();
    app.use(express.json());
    app.use(fundMetricsRouter);

    const response = await request(app).get('/api/funds/12/metrics?skipCache=true').expect(200);

    expect(response.body).toEqual({
      irr: 0.21,
      tvpi: 1.8,
    });
    expect(getUnifiedMetricsMock).toHaveBeenCalledWith(12, {
      skipCache: true,
      skipProjections: false,
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'metrics.skipCache',
        fundId: 12,
        user: 'user-1',
      }),
      'metrics skipCache override'
    );
  });

  it('preserves the invalid-number contract for fund metrics ids', async () => {
    const app = express();
    app.use(express.json());
    app.use(fundMetricsRouter);

    const response = await request(app).get('/api/funds/abc/metrics').expect(400);

    expect(response.body).toMatchObject({
      error: 'Invalid parameter',
      message: 'fundId must be a finite number',
    });
    expect(getUnifiedMetricsMock).not.toHaveBeenCalled();
  });
});
