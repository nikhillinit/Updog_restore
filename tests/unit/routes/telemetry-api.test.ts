import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  registerMetricsMock,
  breakerGetAllMock,
  breakerIsHealthyMock,
  breakerGetDegradedMock,
  cspViolationsIncMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  registerMetricsMock: vi.fn(),
  breakerGetAllMock: vi.fn(),
  breakerIsHealthyMock: vi.fn(),
  breakerGetDegradedMock: vi.fn(),
  cspViolationsIncMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('prom-client', () => ({
  default: (() => {
    class MockMetric {
      labels = vi.fn(() => this);
      set = vi.fn();
      inc = vi.fn();
      observe = vi.fn();
    }

    return {
      Gauge: MockMetric,
      Counter: MockMetric,
      Histogram: MockMetric,
      collectDefaultMetrics: vi.fn(),
      register: {
        contentType: 'text/plain; version=0.0.4; charset=utf-8',
        metrics: registerMetricsMock,
      },
    };
  })(),
}));

vi.mock('../../../server/infra/circuit-breaker/breaker-registry', () => ({
  breakerRegistry: {
    getAll: breakerGetAllMock,
    isHealthy: breakerIsHealthyMock,
    getDegraded: breakerGetDegradedMock,
  },
}));

vi.mock('../../../server/telemetry', () => ({
  cspMetrics: {
    violations: {
      inc: cspViolationsIncMock,
    },
  },
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: loggerWarnMock,
    error: loggerErrorMock,
  },
}));

import { metricsRouter } from '../../../server/routes/metrics';
import { cspReportRoute } from '../../../server/routes/public/csp-report';

describe('Telemetry routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(metricsRouter);
    app.use(cspReportRoute);

    vi.clearAllMocks();

    registerMetricsMock.mockResolvedValue('updog_test_metric 1');
    breakerGetAllMock.mockReturnValue({
      postgres: {
        state: 'CLOSED',
        stats: {
          requestCount: 7,
          failureCount: 2,
        },
      },
      malformed: {
        status: 'ignored',
      },
    });
    breakerIsHealthyMock.mockReturnValue(true);
    breakerGetDegradedMock.mockReturnValue(['cache']);
  });

  it('serves metrics with typed breaker snapshots', async () => {
    const response = await request(app).get('/metrics').expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('updog_test_metric 1');
    expect(registerMetricsMock).toHaveBeenCalledTimes(1);
    expect(breakerGetAllMock).toHaveBeenCalledTimes(1);
  });

  it('returns health metadata from the breaker registry', async () => {
    const response = await request(app).get('/metrics/health').expect(200);

    expect(response.body).toEqual({
      healthy: true,
      degraded: ['cache'],
      timestamp: expect.any(String),
    });
  });

  it('accepts CSP reports and logs a summarized payload', async () => {
    await request(app)
      .post('/csp-violations')
      .send({
        'csp-report': {
          'document-uri': 'https://example.com/app',
          'violated-directive': 'script-src-elem',
          disposition: 'enforce',
          'blocked-uri': 'https://evil.example/script.js',
        },
      })
      .expect(204);

    expect(cspViolationsIncMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      {
        violation: {
          reportType: 'csp-report',
          documentUri: 'https://example.com/app',
          violatedDirective: 'script-src-elem',
          disposition: 'enforce',
          blockedUri: 'https://evil.example/script.js',
        },
      },
      '[CSP] violation'
    );
  });
});
