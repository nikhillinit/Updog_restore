import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { processMetricMock, executeMock } = vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.ENABLE_RUM_V2 = '1';

  return {
    processMetricMock: vi.fn(),
    executeMock: vi.fn(),
  };
});

vi.mock('../../../server/routes/metrics-rum-v2.js', () => ({
  rumCircuitBreaker: {
    execute: executeMock,
  },
  rumV2Enhancement: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.rumV2 = {
      processMetric: processMetricMock,
      getMetrics: vi.fn(async () => ''),
    };
    next();
  },
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { metricsRumRouter } from '../../../server/routes/metrics-rum';

describe('RUM metrics routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(metricsRumRouter);
    app.use('/api', metricsRumRouter);

    vi.clearAllMocks();
    executeMock.mockImplementation(async (fn: () => Promise<boolean>) => fn());
    processMetricMock.mockReturnValue(true);
  });

  it('rejects invalid metric payloads', async () => {
    const response = await request(app).post('/metrics/rum').send({ name: 'LCP' }).expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'Invalid metric data',
      })
    );
    expect(processMetricMock).not.toHaveBeenCalled();
  });

  it('sanitizes metric paths before forwarding to the v2 processor', async () => {
    await request(app)
      .post('/metrics/rum')
      .send({
        name: 'LCP',
        value: 1250,
        pathname: '/funds/550e8400-e29b-41d4-a716-446655440000?tab=overview',
        userEmail: 'hidden@example.com',
      })
      .expect(204);

    expect(processMetricMock).toHaveBeenCalledWith(
      'LCP',
      1250,
      expect.objectContaining({
        pathname: '/funds/:id',
        timestamp: expect.any(Number),
      })
    );
  });

  it('accepts the api-prefixed alias used by browser telemetry on Vercel', async () => {
    await request(app)
      .post('/api/metrics/rum')
      .send({
        name: 'INP',
        value: 180,
        pathname: '/fund-setup',
      })
      .expect(204);

    expect(processMetricMock).toHaveBeenCalledWith(
      'INP',
      180,
      expect.objectContaining({
        pathname: '/fund-setup',
      })
    );
  });
});
