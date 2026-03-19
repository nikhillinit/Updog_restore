import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  getUnifiedMetricsMock,
  invalidateCacheMock,
  loggerInfoMock,
  setQueuesMock,
} = vi.hoisted(() => ({
  getUnifiedMetricsMock: vi.fn(),
  invalidateCacheMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  setQueuesMock: vi.fn(),
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

vi.mock('@bull-board/api', () => ({
  createBullBoard: () => ({
    setQueues: setQueuesMock,
  }),
}));

vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: class BullMQAdapter {
    constructor(
      public readonly queue: unknown,
      public readonly options: Record<string, unknown>
    ) {}
  },
}));

vi.mock('@bull-board/express', () => ({
  ExpressAdapter: class ExpressAdapter {
    setBasePath(_path: string) {
      return undefined;
    }

    getRouter() {
      return (req: express.Request, res: express.Response) => {
        res.json({ ok: true, path: req.path });
      };
    }
  },
}));

vi.mock('../../../server/queues/registry', () => ({
  getQueueCatalog: () => [
    {
      key: 'reports',
      displayName: 'Reports',
      owner: 'route',
      healthMode: 'producer',
    },
  ],
  getRegisteredQueueRuntime: () => ({
    getQueue: () => ({ name: 'reports' }),
  }),
}));

import graduationRouter from '../../../server/routes/graduation';
import { readinessHandler } from '../../../server/routes/readiness';
import fundMetricsRouter from '../../../server/routes/fund-metrics';
import queueDashboardRouter from '../../../server/routes/admin/queue-dashboard';

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

    const response = await request(app)
      .get('/api/funds/12/metrics?skipCache=true')
      .expect(200);

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

  it('refreshes bull-board queues before serving the admin dashboard router', async () => {
    const app = express();
    app.use(queueDashboardRouter);

    const response = await request(app).get('/').expect(200);

    expect(response.body).toEqual({ ok: true, path: '/' });
    expect(setQueuesMock).toHaveBeenCalledTimes(1);
    expect(setQueuesMock.mock.calls[0]?.[0]).toHaveLength(1);
  });
});
