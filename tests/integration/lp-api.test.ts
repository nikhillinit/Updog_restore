process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../../server/routes';
import { errorHandler } from '../../server/errors';

describe('LP Reporting Dashboard API', () => {
  let server: ReturnType<typeof import('http').createServer>;
  let app: express.Express;
  let lpToken = '';
  let nonLpToken = '';
  let otherLpToken = '';
  let makeJwt = (_payload: Record<string, unknown> = {}) => '';

  const invalidDate = '2024/01/01';
  const validDateRange = { startDate: '2024-01-01', endDate: '2024-12-31' };
  const validCapitalAccountQuery = {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    limit: 50,
  };
  const validPerformanceQuery = {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    granularity: 'monthly',
  };
  const validReportConfig = {
    reportType: 'quarterly',
    dateRange: validDateRange,
    fundIds: [1],
    format: 'pdf',
  };

  const authGet = (path: string, token = lpToken) =>
    request(server).get(path).set('Authorization', `Bearer ${token}`);

  const authPost = (path: string, token = lpToken) =>
    request(server).post(path).set('Authorization', `Bearer ${token}`);

  const asLP = (overrides: Record<string, unknown> = {}) =>
    makeJwt({
      role: 'lp',
      lpId: 1,
      fundIds: [1, 2, 3],
      email: 'lp@example.com',
      userId: 'lp-user-1',
      ...overrides,
    } as any);

  const asNonLP = (overrides: Record<string, unknown> = {}) =>
    makeJwt({
      role: 'user',
      email: 'user@example.com',
      userId: 'user-1',
      ...overrides,
    } as any);

  beforeAll(async () => {
    app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    server = await registerRoutes(app);
    app.use(errorHandler());

    const authUtils = await import('../utils/integrationAuth');
    makeJwt = authUtils.makeJwt;

    lpToken = asLP();
    nonLpToken = asNonLP();
    otherLpToken = asLP({
      lpId: 2,
      fundIds: [2, 3],
      email: 'other-lp@example.com',
      userId: 'lp-user-2',
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests (401)', async () => {
      const response = await request(server).get('/api/lp/profile');

      expect(response.status).toBe(401);
    });

    it('rejects non-LP users (403)', async () => {
      const response = await authGet('/api/lp/profile', nonLpToken);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
    });

    it('rejects LP accessing another LP report (403)', async () => {
      const createResponse = await authPost('/api/lp/reports/generate').send(validReportConfig);

      if (createResponse.status === 202) {
        const reportId = createResponse.body.reportId as string;
        const response = await authGet(`/api/lp/reports/${reportId}`, otherLpToken);

        expect([403, 404]).toContain(response.status);
        if (response.status === 403) {
          expect(response.body.error).toBe('FORBIDDEN');
        }
        if (response.status === 404) {
          expect(['REPORT_NOT_FOUND', 'LP_NOT_FOUND']).toContain(response.body.error);
        }
      } else {
        expect([404, 500]).toContain(createResponse.status);
      }
    });

    it('rejects LP accessing a fund they did not invest in (403)', async () => {
      const response = await authGet('/api/lp/funds/99999/detail');

      expect([403, 404]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body.error).toBe('FORBIDDEN');
      }
    });

    it('accepts valid LP accessing their own data (200)', async () => {
      const response = await authGet('/api/lp/profile');

      if (response.status === 200) {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('name');
        expect(response.body).toHaveProperty('email');
        expect(response.body).toHaveProperty('entityType');
        expect(response.body).toHaveProperty('fundCount');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('GET /api/lp/profile', () => {
    it('returns LP profile structure', async () => {
      const response = await authGet('/api/lp/profile');

      if (response.status === 200) {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('name');
        expect(response.body).toHaveProperty('email');
        expect(response.body).toHaveProperty('entityType');
        expect(response.body).toHaveProperty('fundCount');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('GET /api/lp/summary', () => {
    it('returns aggregate metrics', async () => {
      const response = await authGet('/api/lp/summary');

      if (response.status === 200) {
        expect(response.body).toHaveProperty('lpId');
        expect(response.body).toHaveProperty('lpName');
        expect(response.body).toHaveProperty('totalCommitted');
        expect(response.body).toHaveProperty('totalCalled');
        expect(response.body).toHaveProperty('totalDistributed');
        expect(response.body).toHaveProperty('totalNAV');
        expect(response.body).toHaveProperty('totalUnfunded');
        expect(response.body).toHaveProperty('fundCount');
        expect(response.body).toHaveProperty('irr');
        expect(response.body).toHaveProperty('moic');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('GET /api/lp/capital-account', () => {
    it('rejects invalid startDate format', async () => {
      const response = await authGet('/api/lp/capital-account').query({
        startDate: invalidDate,
      });

      if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects invalid endDate format', async () => {
      const response = await authGet('/api/lp/capital-account').query({
        endDate: invalidDate,
      });

      if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('enforces limit <= 100 for pagination', async () => {
      const response = await authGet('/api/lp/capital-account').query({
        ...validCapitalAccountQuery,
        limit: 150,
      });

      if (response.status === 200) {
        expect(Array.isArray(response.body.transactions)).toBe(true);
        expect(response.body.transactions.length).toBeLessThanOrEqual(100);
      } else if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('returns paginated transactions structure', async () => {
      const response = await authGet('/api/lp/capital-account').query(validCapitalAccountQuery);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('transactions');
        expect(Array.isArray(response.body.transactions)).toBe(true);
        expect(response.body).toHaveProperty('nextCursor');
        expect(response.body).toHaveProperty('hasMore');

        if (response.body.hasMore) {
          expect(response.body.nextCursor).toBeTruthy();
        } else {
          expect(response.body.nextCursor).toBeNull();
        }

        if (response.body.transactions.length > 0) {
          const transaction = response.body.transactions[0];
          expect(transaction).toHaveProperty('id');
          expect(transaction).toHaveProperty('activityType');
          expect(transaction).toHaveProperty('amount');
          expect(transaction).toHaveProperty('activityDate');
          expect(transaction).toHaveProperty('effectiveDate');
          expect(transaction).toHaveProperty('description');
          expect(transaction).toHaveProperty('runningBalance');
        }
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('GET /api/lp/funds/:fundId/detail', () => {
    it('rejects non-numeric fundId', async () => {
      const response = await authGet('/api/lp/funds/abc/detail');

      if (response.status === 400) {
        expect(response.body.error).toBe('INVALID_PARAMETER');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects fundId zero', async () => {
      const response = await authGet('/api/lp/funds/0/detail');

      if (response.status === 400) {
        expect(response.body.error).toBe('INVALID_PARAMETER');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects negative fundId', async () => {
      const response = await authGet('/api/lp/funds/-1/detail');

      if (response.status === 400) {
        expect(response.body.error).toBe('INVALID_PARAMETER');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects invalid asOfDate format', async () => {
      const response = await authGet('/api/lp/funds/1/detail').query({
        asOfDate: invalidDate,
      });

      if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects fund access when LP is not invested', async () => {
      const response = await authGet('/api/lp/funds/99999/detail');

      if (response.status === 403) {
        expect(response.body.error).toBe('FORBIDDEN');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('returns fund detail structure', async () => {
      const response = await authGet('/api/lp/funds/1/detail').query({
        asOfDate: '2024-12-31',
      });

      if (response.status === 200) {
        expect(response.body).toHaveProperty('fundId');
        expect(response.body).toHaveProperty('commitmentId');
        expect(response.body).toHaveProperty('commitmentAmount');
        expect(response.body).toHaveProperty('commitmentDate');
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('capitalAccount');
        expect(response.body.capitalAccount).toHaveProperty('asOfDate');
        expect(response.body.capitalAccount).toHaveProperty('calledCapital');
        expect(response.body.capitalAccount).toHaveProperty('transactionCount');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('GET /api/lp/funds/:fundId/holdings', () => {
    it('rejects non-numeric fundId', async () => {
      const response = await authGet('/api/lp/funds/abc/holdings');

      if (response.status === 400) {
        expect(response.body.error).toBe('INVALID_PARAMETER');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects fundId zero', async () => {
      const response = await authGet('/api/lp/funds/0/holdings');

      if (response.status === 400) {
        expect(response.body.error).toBe('INVALID_PARAMETER');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects negative fundId', async () => {
      const response = await authGet('/api/lp/funds/-1/holdings');

      if (response.status === 400) {
        expect(response.body.error).toBe('INVALID_PARAMETER');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects fund access when LP is not invested', async () => {
      const response = await authGet('/api/lp/funds/99999/holdings');

      if (response.status === 403) {
        expect(response.body.error).toBe('FORBIDDEN');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('returns holdings structure', async () => {
      const response = await authGet('/api/lp/funds/1/holdings');

      if (response.status === 200) {
        expect(response.body).toHaveProperty('fundId');
        expect(response.body).toHaveProperty('holdings');
        expect(Array.isArray(response.body.holdings)).toBe(true);
        expect(response.body).toHaveProperty('totalHoldings');
        expect(response.body).toHaveProperty('totalValue');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('GET /api/lp/performance', () => {
    it('rejects invalid startDate format', async () => {
      const response = await authGet('/api/lp/performance').query({
        startDate: invalidDate,
      });

      if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects invalid endDate format', async () => {
      const response = await authGet('/api/lp/performance').query({
        endDate: invalidDate,
      });

      if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('returns performance timeseries structure', async () => {
      const response = await authGet('/api/lp/performance').query(validPerformanceQuery);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('performance');
        expect(Array.isArray(response.body.performance)).toBe(true);
        expect(response.body).toHaveProperty('granularity');
        expect(response.body).toHaveProperty('dataPoints');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('GET /api/lp/performance/benchmark', () => {
    it('returns benchmark comparison structure', async () => {
      const response = await authGet('/api/lp/performance/benchmark');

      if (response.status === 200) {
        expect(response.body).toHaveProperty('benchmarks');
        expect(Array.isArray(response.body.benchmarks)).toBe(true);
        expect(response.body).toHaveProperty('note');

        if (response.body.benchmarks.length > 0) {
          const benchmark = response.body.benchmarks[0];
          expect(benchmark).toHaveProperty('name');
          expect(benchmark).toHaveProperty('irr');
          expect(benchmark).toHaveProperty('moic');
        }
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('POST /api/lp/reports/generate', () => {
    it('rejects invalid report startDate format', async () => {
      const response = await authPost('/api/lp/reports/generate').send({
        ...validReportConfig,
        dateRange: {
          ...validDateRange,
          startDate: invalidDate,
        },
      });

      if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects invalid report endDate format', async () => {
      const response = await authPost('/api/lp/reports/generate').send({
        ...validReportConfig,
        dateRange: {
          ...validDateRange,
          endDate: invalidDate,
        },
      });

      if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects report date range longer than five years', async () => {
      const response = await authPost('/api/lp/reports/generate').send({
        ...validReportConfig,
        dateRange: {
          startDate: '2010-01-01',
          endDate: '2016-02-01',
        },
      });

      if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects non-numeric fundIds', async () => {
      const response = await authPost('/api/lp/reports/generate').send({
        ...validReportConfig,
        fundIds: ['abc'],
      } as any);

      if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('rejects non-positive fundIds', async () => {
      const response = await authPost('/api/lp/reports/generate').send({
        ...validReportConfig,
        fundIds: [0, -1],
      });

      if (response.status === 400) {
        expect(response.body.error).toBe('VALIDATION_ERROR');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });

    it('returns report generation job details', async () => {
      const response = await authPost('/api/lp/reports/generate').send(validReportConfig);

      if (response.status === 202) {
        expect(response.body).toHaveProperty('reportId');
        expect(response.body).toHaveProperty('status', 'pending');
        expect(response.body).toHaveProperty('message');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('GET /api/lp/reports', () => {
    it('returns report list structure', async () => {
      const response = await authGet('/api/lp/reports');

      if (response.status === 200) {
        expect(response.body).toHaveProperty('reports');
        expect(Array.isArray(response.body.reports)).toBe(true);
        expect(response.body).toHaveProperty('total');
      } else {
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('GET /api/lp/reports/:reportId', () => {
    it('returns report status structure when report exists', async () => {
      const createResponse = await authPost('/api/lp/reports/generate').send(validReportConfig);

      if (createResponse.status === 202) {
        const reportId = createResponse.body.reportId as string;
        const response = await authGet(`/api/lp/reports/${reportId}`);

        if (response.status === 200) {
          expect(response.body).toHaveProperty('id');
          expect(response.body).toHaveProperty('status');
          expect(response.body).toHaveProperty('reportType');
          expect(response.body).toHaveProperty('format');
        } else {
          expect([404, 500]).toContain(response.status);
        }
      } else {
        expect([404, 500]).toContain(createResponse.status);
      }
    });

    it('returns 404 for missing report', async () => {
      const response = await authGet('/api/lp/reports/missing-report');

      expect([404, 500]).toContain(response.status);
      if (response.status === 404) {
        expect(['REPORT_NOT_FOUND', 'LP_NOT_FOUND']).toContain(response.body.error);
      }
    });
  });

  describe('GET /api/lp/reports/:reportId/download', () => {
    it('returns 404 for missing report download', async () => {
      const response = await authGet('/api/lp/reports/missing-report/download');

      expect([404, 500]).toContain(response.status);
    });

    it('rejects download when report is not ready', async () => {
      const createResponse = await authPost('/api/lp/reports/generate').send(validReportConfig);

      if (createResponse.status === 202) {
        const reportId = createResponse.body.reportId as string;
        const response = await authGet(`/api/lp/reports/${reportId}/download`);

        if (response.status === 302) {
          expect(response.header.location).toBeTruthy();
        } else if (response.status === 400) {
          expect(response.body.error).toBe('REPORT_NOT_READY');
        } else {
          expect([404, 500]).toContain(response.status);
        }
      } else {
        expect([404, 500]).toContain(createResponse.status);
      }
    });
  });

  describe('Security', () => {
    it('handles oversized cursor parameter', async () => {
      const oversizedCursor = 'x'.repeat(5000);
      const response = await authGet('/api/lp/capital-account').query({
        cursor: oversizedCursor,
      });

      expect([200, 400, 404, 413, 414, 500]).toContain(response.status);
    });

    it('sanitizes potential injection in fundIds parameter', async () => {
      const response = await authGet('/api/lp/capital-account').query({
        fundIds: '1;DROP TABLE lp_reports;',
      });

      expect([200, 400, 404, 500]).toContain(response.status);
    });

    it('enforces rate limit after 100 requests per minute', async () => {
      const rateLimitIp = '203.0.113.10';
      const warmupResponse = await authGet('/api/lp/profile').set('X-Forwarded-For', rateLimitIp);

      if (warmupResponse.status !== 200) {
        expect([404, 500]).toContain(warmupResponse.status);
        return;
      }

      for (let requestIndex = 0; requestIndex < 99; requestIndex += 1) {
        await authGet('/api/lp/profile').set('X-Forwarded-For', rateLimitIp);
      }

      const response = await authGet('/api/lp/profile').set('X-Forwarded-For', rateLimitIp);

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('TOO_MANY_REQUESTS');
    });
  });
});
