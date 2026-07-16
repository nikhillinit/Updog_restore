/**
 * Backtesting API Integration Tests
 *
 * Deterministic contract coverage for the live `/api/backtesting/*` route
 * family. Auth, validation, and HTTP wiring stay real; the backtesting service
 * and async queue boundary are mocked for deterministic outcomes.
 *
 * @group integration
 * @group backtesting
 */

process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  BacktestAsyncRunResponseSchema,
  BacktestJobStatusResponseSchema,
  BacktestResultSchema,
} from '@shared/validation/backtesting-schemas';
import type {
  BacktestConfig,
  BacktestJobStatusResponse,
  BacktestResult,
  HistoricalScenarioName,
  ScenarioCompareResponse,
} from '@shared/types/backtesting';
import { makeJwt } from '../utils/integrationAuth';

const {
  mockRunBacktest,
  mockGetBacktestHistory,
  mockGetBacktestById,
  mockCompareScenariosDetailed,
  mockGetAvailableScenariosList,
  mockEnqueueBacktestJob,
  mockGetBacktestJobStatus,
  mockSubscribeToBacktestJob,
  mockIsBacktestingQueueInitialized,
} = vi.hoisted(() => ({
  mockRunBacktest: vi.fn(),
  mockGetBacktestHistory: vi.fn(),
  mockGetBacktestById: vi.fn(),
  mockCompareScenariosDetailed: vi.fn(),
  mockGetAvailableScenariosList: vi.fn(),
  mockEnqueueBacktestJob: vi.fn(),
  mockGetBacktestJobStatus: vi.fn(),
  mockSubscribeToBacktestJob: vi.fn(),
  mockIsBacktestingQueueInitialized: vi.fn(),
}));

vi.mock('../../server/services/backtesting-service', () => ({
  backtestingService: {
    runBacktest: mockRunBacktest,
    getBacktestHistory: mockGetBacktestHistory,
    getBacktestById: mockGetBacktestById,
    compareScenariosDetailed: mockCompareScenariosDetailed,
    getAvailableScenariosList: mockGetAvailableScenariosList,
  },
}));

vi.mock('../../server/queues/backtesting-queue', () => ({
  enqueueBacktestJob: mockEnqueueBacktestJob,
  getBacktestJobStatus: mockGetBacktestJobStatus,
  subscribeToBacktestJob: mockSubscribeToBacktestJob,
  isBacktestingQueueInitialized: mockIsBacktestingQueueInitialized,
  isBacktestingTerminalStatus: (status: string) =>
    ['completed', 'failed', 'timed_out', 'cancelled'].includes(status),
}));

let app: express.Express;
let authToken: string;

type RouteJobSnapshot = BacktestJobStatusResponse & {
  requesterUserId?: string;
};

type SubscriptionCallbacks = {
  onStatus?: (snapshot: RouteJobSnapshot) => void;
  onComplete?: (snapshot: RouteJobSnapshot) => void;
};

const validBacktestConfig: BacktestConfig = {
  fundId: 1,
  startDate: '2020-01-01',
  endDate: '2023-12-31',
  simulationRuns: 1000,
  comparisonMetrics: ['irr', 'tvpi'],
  includeHistoricalScenarios: true,
  historicalScenarios: ['financial_crisis_2008', 'covid_2020'],
};

function makeBacktestResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    backtestId: '550e8400-e29b-41d4-a716-446655440000',
    config: validBacktestConfig,
    executionTimeMs: 1450,
    timestamp: '2026-04-03T12:00:00.000Z',
    simulationSummary: {
      runs: 1000,
      metrics: {
        irr: {
          mean: 0.18,
          median: 0.17,
          p5: 0.06,
          p25: 0.12,
          p75: 0.22,
          p95: 0.31,
          min: -0.04,
          max: 0.39,
          standardDeviation: 0.07,
        },
        tvpi: {
          mean: 2.2,
          median: 2.1,
          p5: 1.2,
          p25: 1.8,
          p75: 2.6,
          p95: 3.1,
          min: 0.8,
          max: 3.8,
          standardDeviation: 0.45,
        },
      },
      engineUsed: 'streaming',
      executionTimeMs: 1450,
    },
    actualPerformance: {
      asOfDate: '2023-12-31',
      irr: 0.16,
      tvpi: 2.0,
      dpi: 0.9,
      multiple: 2.1,
      deployedCapital: 50000000,
      distributedCapital: 18000000,
      residualValue: 62000000,
      dataSource: 'baseline',
      dataFreshness: 'fresh',
    },
    validationMetrics: {
      meanAbsoluteError: {
        irr: 0.02,
        tvpi: 0.2,
      },
      rootMeanSquareError: {
        irr: 0.02,
        tvpi: 0.2,
      },
      percentileHitRates: {
        p50: { irr: true, tvpi: true },
        p90: { irr: true, tvpi: true },
        p100: { irr: true, tvpi: true },
      },
      modelQualityScore: 88,
      calibrationStatus: 'well-calibrated',
      incalculableMetrics: [],
    },
    dataQuality: {
      hasBaseline: true,
      baselineAgeInDays: 14,
      varianceHistoryCount: 6,
      snapshotAvailable: true,
      isStale: false,
      warnings: [],
      overallQuality: 'good',
    },
    scenarioComparisons: [
      {
        scenario: 'financial_crisis_2008',
        simulatedPerformance: {
          mean: 0.11,
          median: 0.1,
          p5: -0.12,
          p25: 0.02,
          p75: 0.19,
          p95: 0.28,
          min: -0.2,
          max: 0.34,
          standardDeviation: 0.09,
        },
        description: 'Financial crisis drawdown replay',
        keyInsights: ['Higher write-off risk', 'Longer hold periods'],
        marketParameters: {
          exitMultiplierMean: 1.2,
          exitMultiplierVolatility: 0.8,
          failureRate: 0.45,
          followOnProbability: 0.3,
          holdPeriodYears: 7,
        },
      },
    ],
    scenarioComparisonSummary: {
      requestedScenarios: 2,
      scenariosCompared: 1,
      failedScenarios: ['covid_2020'],
    },
    recommendations: [
      'Scenario comparison incomplete: 1 of 2 requested scenarios succeeded. Failed: covid_2020',
    ],
    ...overrides,
  };
}

function makeCompletedJobStatus(overrides: Partial<RouteJobSnapshot> = {}): RouteJobSnapshot {
  return {
    jobId: 'job-123',
    fundId: 1,
    status: 'completed',
    stage: 'persisting',
    progressPercent: 100,
    updatedAt: '2026-04-03T12:05:00.000Z',
    correlationId: 'corr-async-123',
    resultRef: { backtestId: '550e8400-e29b-41d4-a716-446655440000' },
    message: 'Backtest complete',
    links: {
      self: '/api/backtesting/jobs/job-123',
      poll: '/api/backtesting/jobs/job-123',
    },
    ...overrides,
  };
}

function makeQueuedJobStatus(overrides: Partial<RouteJobSnapshot> = {}): RouteJobSnapshot {
  return {
    jobId: 'job-123',
    fundId: 1,
    status: 'queued',
    stage: 'queued',
    progressPercent: 0,
    updatedAt: '2026-04-03T12:01:00.000Z',
    correlationId: 'corr-async-123',
    message: 'Queued',
    links: {
      self: '/api/backtesting/jobs/job-123',
      poll: '/api/backtesting/jobs/job-123',
      stream: '/api/backtesting/jobs/job-123/stream',
    },
    ...overrides,
  };
}

function makeCompareResponse(): ScenarioCompareResponse {
  return {
    correlationId: 'corr-compare-123',
    fundId: 1,
    comparisons: [
      {
        scenario: 'financial_crisis_2008',
        simulatedPerformance: {
          mean: 0.1,
          median: 0.09,
          p5: -0.1,
          p25: 0.01,
          p75: 0.18,
          p95: 0.26,
          min: -0.18,
          max: 0.32,
          standardDeviation: 0.08,
        },
        description: 'Stress-case replay',
        keyInsights: ['Downside widened'],
        marketParameters: {
          exitMultiplierMean: 1.2,
          exitMultiplierVolatility: 0.8,
          failureRate: 0.45,
          followOnProbability: 0.3,
          holdPeriodYears: 7,
        },
      },
    ],
    summary: {
      requestedScenarios: 2,
      scenariosCompared: 1,
      failedScenarios: ['covid_2020'],
      timestamp: '2026-04-03T12:00:00.000Z',
    },
  };
}

const authPost = (path: string, token = authToken) =>
  request(app).post(path).set('Authorization', `Bearer ${token}`);

const authGet = (path: string, token = authToken) =>
  request(app).get(path).set('Authorization', `Bearer ${token}`);

function expectValidBacktestResult(result: unknown): void {
  const parsed = BacktestResultSchema.safeParse(result);
  expect(parsed.success).toBe(true);
}

beforeAll(async () => {
  authToken = makeJwt({
    userId: 'regular-user',
    email: 'regular@example.com',
    role: 'analyst',
    fundIds: [1, 2, 3],
  });
  const backtestingRouter = (await import('../../server/routes/backtesting')).default;

  app = express();
  app.set('trust proxy', false);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/backtesting', backtestingRouter);
});

beforeEach(() => {
  const result = makeBacktestResult();
  const compareResponse = makeCompareResponse();

  vi.clearAllMocks();

  mockRunBacktest.mockResolvedValue(result);
  mockGetBacktestHistory.mockResolvedValue([result]);
  mockGetBacktestById.mockResolvedValue(result);
  mockCompareScenariosDetailed.mockResolvedValue({
    comparisons: compareResponse.comparisons,
    failedScenarios: compareResponse.summary.failedScenarios as HistoricalScenarioName[],
  });
  mockGetAvailableScenariosList.mockReturnValue([
    'financial_crisis_2008',
    'covid_2020',
    'bull_market_2021',
  ]);

  mockIsBacktestingQueueInitialized.mockReturnValue(true);
  mockEnqueueBacktestJob.mockResolvedValue({
    jobId: 'job-123',
    estimatedWaitMs: 60000,
    deduplicated: false,
  });
  mockGetBacktestJobStatus.mockResolvedValue(makeCompletedJobStatus());
  mockSubscribeToBacktestJob.mockImplementation(
    (_jobId: string, callbacks: SubscriptionCallbacks) => {
      callbacks.onStatus?.(makeQueuedJobStatus({ progressPercent: 40, stage: 'simulating' }));
      callbacks.onComplete?.(makeCompletedJobStatus());
      return vi.fn();
    }
  );
});

describe('Backtesting API', () => {
  describe('authentication', () => {
    it('rejects unauthenticated sync requests', async () => {
      const response = await request(app).post('/api/backtesting/run').send(validBacktestConfig);

      expect(response.status).toBe(401);
    });

    it('rejects unauthenticated async requests', async () => {
      const response = await request(app)
        .post('/api/backtesting/run/async')
        .send(validBacktestConfig);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/backtesting/run', () => {
    it('returns 400 for invalid payloads', async () => {
      const response = await authPost('/api/backtesting/run').send({
        ...validBacktestConfig,
        fundId: undefined,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 403 when the caller lacks fund access', async () => {
      const limitedToken = makeJwt({
        userId: 'limited-user',
        email: 'limited@example.com',
        fundIds: [2],
      });

      const response = await authPost('/api/backtesting/run', limitedToken).send(
        validBacktestConfig
      );

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
    });

    it('returns 200 with the backtest result and correlation ID', async () => {
      const response = await authPost('/api/backtesting/run')
        .set('x-correlation-id', 'corr-sync-123')
        .send(validBacktestConfig);

      expect(response.status).toBe(200);
      expect(response.body.correlationId).toBe('corr-sync-123');
      expectValidBacktestResult(response.body.result);
      expect(mockRunBacktest).toHaveBeenCalledWith(
        validBacktestConfig,
        expect.objectContaining({
          correlationId: 'corr-sync-123',
          requesterUserId: 'regular-user',
        })
      );
    });
  });

  describe('GET /api/backtesting/fund/:fundId/history', () => {
    it('returns 400 for invalid fund IDs', async () => {
      const response = await authGet('/api/backtesting/fund/not-a-number/history');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Bad Request');
    });

    it('allows an analyst to read history for another fund', async () => {
      const limitedToken = makeJwt({
        userId: 'limited-user',
        email: 'limited@example.com',
        role: 'analyst',
        fundIds: [2],
      });

      const response = await authGet('/api/backtesting/fund/1/history', limitedToken);

      expect(response.status).toBe(200);
      expect(response.body.fundId).toBe(1);
      expect(response.body.history).toHaveLength(1);
      expect(mockGetBacktestHistory).toHaveBeenCalledWith(1, { limit: 10, offset: 0 });
    });

    it('returns 200 and preserves scenarioComparisonSummary in history rows', async () => {
      const response = await authGet('/api/backtesting/fund/1/history').query({
        limit: 10,
        offset: 0,
      });

      expect(response.status).toBe(200);
      expect(response.body.fundId).toBe(1);
      expect(response.body.pagination).toEqual({
        limit: 10,
        offset: 0,
        count: 1,
        hasMore: false,
      });
      expect(response.body.history).toHaveLength(1);
      expectValidBacktestResult(response.body.history[0]);
      expect(response.body.history[0].scenarioComparisonSummary).toEqual({
        requestedScenarios: 2,
        scenariosCompared: 1,
        failedScenarios: ['covid_2020'],
      });
    });
  });

  describe('GET /api/backtesting/result/:backtestId', () => {
    it('returns 400 for invalid UUIDs', async () => {
      const response = await authGet('/api/backtesting/result/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('INVALID_BACKTEST_ID');
    });

    it('returns 404 when the backtest result does not exist', async () => {
      mockGetBacktestById.mockResolvedValueOnce(null);

      const response = await authGet(
        '/api/backtesting/result/00000000-0000-0000-0000-000000000000'
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('BACKTEST_NOT_FOUND');
    });

    it('returns 200 when a team member reads a backtest from another fund', async () => {
      mockGetBacktestById.mockResolvedValueOnce(
        makeBacktestResult({
          config: { ...validBacktestConfig, fundId: 9 },
        })
      );

      const response = await authGet(
        '/api/backtesting/result/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(200);
      expect(response.body.result.config.fundId).toBe(9);
    });

    it('returns 200 and preserves scenarioComparisonSummary on the detail payload', async () => {
      const response = await authGet(
        '/api/backtesting/result/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(200);
      expectValidBacktestResult(response.body.result);
      expect(response.body.result.scenarioComparisonSummary).toEqual({
        requestedScenarios: 2,
        scenariosCompared: 1,
        failedScenarios: ['covid_2020'],
      });
    });
  });

  describe('POST /api/backtesting/compare-scenarios', () => {
    it('returns 400 for invalid scenario names', async () => {
      const response = await authPost('/api/backtesting/compare-scenarios').send({
        fundId: 1,
        scenarios: ['invalid_name'],
        simulationRuns: 500,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 200 with partial-failure summary details', async () => {
      const response = await authPost('/api/backtesting/compare-scenarios')
        .set('x-correlation-id', 'corr-compare-123')
        .send({
          fundId: 1,
          scenarios: ['financial_crisis_2008', 'covid_2020'],
          simulationRuns: 500,
        });

      expect(response.status).toBe(200);
      expect(response.body.correlationId).toBe('corr-compare-123');
      expect(response.body.fundId).toBe(1);
      expect(response.body.comparisons).toHaveLength(1);
      expect(response.body.summary).toEqual({
        requestedScenarios: 2,
        scenariosCompared: 1,
        failedScenarios: ['covid_2020'],
        timestamp: expect.any(String),
      });
    });
  });

  describe('GET /api/backtesting/scenarios', () => {
    it('returns the live scenario list', async () => {
      const response = await authGet('/api/backtesting/scenarios');

      expect(response.status).toBe(200);
      expect(response.body.scenarios).toEqual([
        'financial_crisis_2008',
        'covid_2020',
        'bull_market_2021',
      ]);
    });
  });

  describe('POST /api/backtesting/run/async', () => {
    it('returns 503 when the queue is unavailable', async () => {
      mockIsBacktestingQueueInitialized.mockReturnValueOnce(false);

      const response = await authPost('/api/backtesting/run/async')
        .set('x-correlation-id', 'corr-queue-503')
        .send(validBacktestConfig);

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('QUEUE_UNAVAILABLE');
      expect(response.body.correlationId).toBe('corr-queue-503');
      expect(mockEnqueueBacktestJob).not.toHaveBeenCalled();
    });

    it('returns 202 with Location and Retry-After for queued jobs', async () => {
      const response = await authPost('/api/backtesting/run/async')
        .set('x-correlation-id', 'corr-async-123')
        .set('idempotency-key', 'idem-123')
        .send(validBacktestConfig);

      expect(response.status).toBe(202);
      expect(response.headers['location']).toBe('/api/backtesting/jobs/job-123');
      expect(response.headers['retry-after']).toBe('2');
      expect(BacktestAsyncRunResponseSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.deduplicated).toBe(false);
      expect(mockEnqueueBacktestJob).toHaveBeenCalledWith({
        config: validBacktestConfig,
        correlationId: 'corr-async-123',
        requesterUserId: 'regular-user',
        idempotencyKey: 'idem-123',
      });
    });

    it('returns deduplicated: true only for the explicit idempotency case', async () => {
      mockEnqueueBacktestJob.mockResolvedValueOnce({
        jobId: 'job-123',
        estimatedWaitMs: 0,
        deduplicated: true,
      });

      const response = await authPost('/api/backtesting/run/async').send(validBacktestConfig);

      expect(response.status).toBe(202);
      expect(response.body.deduplicated).toBe(true);
      expect(response.body.message).toContain('deduplicated');
    });
  });

  describe('GET /api/backtesting/jobs/:jobId', () => {
    it('returns 503 without polling job state when the queue is unavailable', async () => {
      mockIsBacktestingQueueInitialized.mockReturnValueOnce(false);

      const response = await authGet('/api/backtesting/jobs/job-123');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('QUEUE_UNAVAILABLE');
      expect(mockGetBacktestJobStatus).not.toHaveBeenCalled();
    });

    it('returns 404 for unknown jobs', async () => {
      mockGetBacktestJobStatus.mockResolvedValueOnce({
        jobId: 'missing-job',
        fundId: 0,
        status: 'unknown',
        stage: 'queued',
        progressPercent: 0,
        updatedAt: '2026-04-03T12:05:00.000Z',
      });

      const response = await authGet('/api/backtesting/jobs/missing-job');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('JOB_NOT_FOUND');
    });

    it('returns 403 for inaccessible jobs', async () => {
      mockGetBacktestJobStatus.mockResolvedValueOnce(
        makeCompletedJobStatus({ fundId: 9, requesterUserId: 'other-user' })
      );

      const response = await authGet('/api/backtesting/jobs/job-123');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
    });

    it('returns 200 with the completed job contract', async () => {
      const response = await authGet('/api/backtesting/jobs/job-123');

      expect(response.status).toBe(200);
      expect(BacktestJobStatusResponseSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.resultRef).toEqual({
        backtestId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(response.body.links.stream).toBeUndefined();
    });
  });

  describe('GET /api/backtesting/jobs/:jobId/stream', () => {
    it('returns 503 when the queue is unavailable', async () => {
      mockIsBacktestingQueueInitialized.mockReturnValueOnce(false);

      const response = await authGet('/api/backtesting/jobs/job-123/stream');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('QUEUE_UNAVAILABLE');
      expect(mockGetBacktestJobStatus).not.toHaveBeenCalled();
      expect(mockSubscribeToBacktestJob).not.toHaveBeenCalled();
    });

    it('returns 404 for unknown jobs', async () => {
      mockGetBacktestJobStatus.mockResolvedValueOnce({
        jobId: 'missing-job',
        fundId: 0,
        status: 'unknown',
        stage: 'queued',
        progressPercent: 0,
        updatedAt: '2026-04-03T12:05:00.000Z',
      });

      const response = await authGet('/api/backtesting/jobs/missing-job/stream');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('JOB_NOT_FOUND');
    });

    it('returns 403 for inaccessible jobs', async () => {
      mockGetBacktestJobStatus.mockResolvedValueOnce(
        makeQueuedJobStatus({ fundId: 9, requesterUserId: 'other-user' })
      );

      const response = await authGet('/api/backtesting/jobs/job-123/stream');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('FORBIDDEN');
    });

    it('streams deterministic SSE frames for the live route', async () => {
      mockGetBacktestJobStatus.mockResolvedValueOnce(makeQueuedJobStatus());
      mockSubscribeToBacktestJob.mockImplementationOnce(
        (_jobId: string, callbacks: SubscriptionCallbacks) => {
          callbacks.onStatus?.(makeQueuedJobStatus({ progressPercent: 50, stage: 'simulating' }));
          callbacks.onComplete?.(makeCompletedJobStatus());
          return vi.fn();
        }
      );

      const response = await authGet('/api/backtesting/jobs/job-123/stream')
        .buffer(true)
        .parse((res, callback) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => callback(null, body));
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      const body = response.body as string;
      expect(body).toContain('event: connected');
      expect(body).toContain('event: status');
      expect(body).toContain('event: complete');
      expect(body).toContain('"jobId":"job-123"');
      expect(body).toContain('"status":"completed"');
    });
  });
});
