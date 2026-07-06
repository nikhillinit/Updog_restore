import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { getDualForecastMock, authCalls, accessCalls, accessMode } = vi.hoisted(() => ({
  getDualForecastMock: vi.fn(),
  authCalls: [] as string[],
  accessCalls: [] as string[],
  accessMode: { value: 'allow' as 'allow' | 'deny' },
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    authCalls.push(req.path);
    req.user = { id: 'user-1', email: 'user@example.com' } as never;
    next();
  },
  requireFundAccess: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    accessCalls.push(req.params['fundId'] ?? '');
    if (accessMode.value === 'deny') {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  },
}));

vi.mock('../../../server/services/metrics-aggregator', () => ({
  metricsAggregator: {
    getDualForecast: getDualForecastMock,
  },
}));

import dualForecastRouter from '../../../server/routes/dual-forecast';
import { DualForecastResponseSchema } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', dualForecastRouter);
  return app;
}

function dualForecastPayload() {
  return {
    fundId: 12,
    fundName: 'Route Fund',
    asOfDate: '2026-04-01T00:00:00.000Z',
    series: [],
    sources: {
      construction: 'construction_forecast_jcurve',
      current: 'projected_metrics_calculator',
      actual: 'actual_metrics_calculator',
    },
    config: {
      source: 'published',
      version: 1,
      publishedAt: '2026-03-01T00:00:00.000Z',
      fallbackReason: null,
    },
    actualsFacts: null,
    navAnchoring: null,
    currentProjection: { status: 'projected', fallbackReason: null },
    warnings: [],
  };
}

describe('dual forecast route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authCalls.length = 0;
    accessCalls.length = 0;
    accessMode.value = 'allow';
    getDualForecastMock.mockResolvedValue(dualForecastPayload());
  });

  it('serves a mocked payload that satisfies the response contract (fixture guard)', () => {
    const payload = dualForecastPayload();
    expect(DualForecastResponseSchema.parse(payload)).toEqual(payload);
  });

  it('returns the dual forecast for an authorized fund request', async () => {
    const response = await request(makeApp()).get('/api/funds/12/dual-forecast').expect(200);

    expect(response.headers['cache-control']).toBe('private, max-age=60');
    expect(response.body).toMatchObject({
      fundId: 12,
      fundName: 'Route Fund',
    });
    expect(authCalls).toEqual(['/funds/12/dual-forecast']);
    expect(accessCalls).toEqual(['12']);
    expect(getDualForecastMock).toHaveBeenCalledWith(12);
  });

  it('rejects invalid fund ids before invoking the aggregator', async () => {
    const response = await request(makeApp())
      .get('/api/funds/not-a-number/dual-forecast')
      .expect(400);

    expect(response.body).toMatchObject({
      error: 'Invalid parameter',
    });
    expect(accessCalls).toEqual([]);
    expect(getDualForecastMock).not.toHaveBeenCalled();
  });

  it.each(['/api/funds/12.5/dual-forecast', '/api/funds/12abc/dual-forecast'])(
    'rejects non-integer fund id %s before fund access checks',
    async (path) => {
      const response = await request(makeApp()).get(path).expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid parameter',
      });
      expect(accessCalls).toEqual([]);
      expect(getDualForecastMock).not.toHaveBeenCalled();
    }
  );

  it('does not call the aggregator when fund access is denied', async () => {
    accessMode.value = 'deny';

    const response = await request(makeApp()).get('/api/funds/12/dual-forecast').expect(403);

    expect(response.body).toEqual({ error: 'forbidden' });
    expect(getDualForecastMock).not.toHaveBeenCalled();
  });

  it('returns 500 CONTRACT_VIOLATION when the aggregator emits a contract-invalid payload', async () => {
    getDualForecastMock.mockResolvedValue({ ...dualForecastPayload(), fundName: 123 });

    const response = await request(makeApp()).get('/api/funds/12/dual-forecast').expect(500);

    expect(response.body).toMatchObject({
      error: 'CONTRACT_VIOLATION',
      message: 'Dual forecast response failed contract validation',
    });
  });

  it('maps missing fund errors to 404', async () => {
    getDualForecastMock.mockRejectedValue({
      code: 'INSUFFICIENT_DATA',
      message: 'Fund 99 not found',
      component: 'aggregator',
      timestamp: '2026-04-01T00:00:00.000Z',
    });

    const response = await request(makeApp()).get('/api/funds/99/dual-forecast').expect(404);

    expect(response.body).toMatchObject({
      error: 'INSUFFICIENT_DATA',
      message: 'Fund 99 not found',
      component: 'aggregator',
    });
  });
});
