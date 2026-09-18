import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  enqueueSimulationMock,
  getJobStatusMock,
  isQueueInitializedMock,
  runSimulationMock,
  runBatchSimulationsMock,
  runMultiEnvironmentSimulationMock,
  getStageValidationModeMock,
  parseStageDistributionMock,
  enforceProvidedFundScopeMock,
  subscribeToJobMock,
} = vi.hoisted(() => ({
  enqueueSimulationMock: vi.fn(),
  getJobStatusMock: vi.fn(),
  isQueueInitializedMock: vi.fn(() => false),
  runSimulationMock: vi.fn(),
  runBatchSimulationsMock: vi.fn(),
  runMultiEnvironmentSimulationMock: vi.fn(),
  getStageValidationModeMock: vi.fn(),
  parseStageDistributionMock: vi.fn(),
  enforceProvidedFundScopeMock: vi.fn(),
  subscribeToJobMock: vi.fn(() => () => undefined),
}));

vi.mock('../../../server/services/monte-carlo-service-unified', () => ({
  unifiedMonteCarloService: {
    runSimulation: runSimulationMock,
    runBatchSimulations: runBatchSimulationsMock,
    runMultiEnvironmentSimulation: runMultiEnvironmentSimulationMock,
    healthCheck: vi.fn(),
    getPerformanceStats: vi.fn(),
    getOptimizationRecommendations: vi.fn(),
  },
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: enforceProvidedFundScopeMock,
}));

vi.mock('../../../server/queues/simulation-queue', () => ({
  enqueueSimulation: enqueueSimulationMock,
  getJobStatus: getJobStatusMock,
  isQueueInitialized: isQueueInitializedMock,
  subscribeToJob: subscribeToJobMock,
}));

vi.mock('../../../server/metrics', () => ({
  recordHttpMetrics: vi.fn(),
}));

vi.mock('../../../server/lib/stage-validation-mode', () => ({
  getStageValidationMode: getStageValidationModeMock,
}));

vi.mock('../../../shared/schemas/parse-stage-distribution', async () => {
  const actual = await vi.importActual<
    typeof import('../../../shared/schemas/parse-stage-distribution')
  >('../../../shared/schemas/parse-stage-distribution');

  return {
    ...actual,
    parseStageDistribution: parseStageDistributionMock,
  };
});

vi.mock('../../../server/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import monteCarloRouter from '../../../server/routes/monte-carlo';

const distribution = {
  scenarios: [1],
  percentiles: {
    p5: 1,
    p25: 1,
    p50: 1,
    p75: 1,
    p95: 1,
  },
  statistics: {
    mean: 1,
    standardDeviation: 0,
    min: 1,
    max: 1,
  },
  confidenceIntervals: {
    ci68: [1, 1] as [number, number],
    ci95: [1, 1] as [number, number],
  },
};

function createSimulationResult() {
  return {
    simulationId: 'sim-1',
    config: {
      fundId: 1,
      runs: 10000,
      timeHorizonYears: 8,
    },
    executionTimeMs: 123,
    irr: distribution,
    multiple: distribution,
    dpi: distribution,
    tvpi: distribution,
    totalValue: distribution,
    riskMetrics: {},
    reserveOptimization: {},
    scenarios: {},
    insights: {},
    performance: {
      engineUsed: 'traditional' as const,
      executionTimeMs: 123,
      memoryUsageMB: 16,
      scenariosPerSecond: 1000,
      connectionPoolStats: null,
      fallbackTriggered: false,
      selectionReason: 'test',
    },
  };
}

let testClientSequence = 0;

function isolateRateLimitClient(app: express.Express): void {
  testClientSequence += 1;
  app.set('trust proxy', 1);
  app.use((req, _res, next) => {
    req.headers['x-forwarded-for'] = `203.0.113.${testClientSequence}`;
    next();
  });
}

const jobContext = {
  userId: 'subject-42',
  orgId: '',
  fundId: '7',
  email: 'partner@example.com',
  role: 'partner',
};

function createJobAccessApp(context = jobContext): express.Express {
  const jobApp = express();
  isolateRateLimitClient(jobApp);
  jobApp.use((req, _res, next) => {
    req.context = context;
    next();
  });
  jobApp.use(monteCarloRouter);
  return jobApp;
}

describe('Monte Carlo routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    isolateRateLimitClient(app);
    app.use(express.json());
    app.use(monteCarloRouter);

    vi.clearAllMocks();

    getStageValidationModeMock.mockResolvedValue('warn');
    parseStageDistributionMock.mockReturnValue({
      normalized: {
        pre_seed: 0,
        seed: 0.4,
        series_a: 0.6,
        series_b: 0,
        series_c: 0,
        growth: 0,
        late_stage: 0,
      },
      invalidInputs: [],
      suggestions: {},
      sum: 1,
      isValid: true,
      errors: [],
    });
    runSimulationMock.mockResolvedValue(createSimulationResult());
    enqueueSimulationMock.mockResolvedValue({ jobId: 'job-1', estimatedWaitMs: 5000 });
    getJobStatusMock.mockResolvedValue({ status: 'unknown' });
    isQueueInitializedMock.mockReturnValue(false);
    enforceProvidedFundScopeMock.mockResolvedValue(true);
    runBatchSimulationsMock.mockResolvedValue([createSimulationResult()]);
    runMultiEnvironmentSimulationMock.mockResolvedValue({ bull: createSimulationResult() });
  });

  it('validates stageDistribution as a percentage record before calling the service', async () => {
    const response = await request(app)
      .post('/simulate')
      .send({
        fundId: 1,
        stageDistribution: [
          { stage: 'seed', weight: 0.4 },
          { stage: 'series a', weight: 0.6 },
        ],
      })
      .expect(200);

    expect(response.body.correlationId).toBeDefined();
    expect(parseStageDistributionMock).toHaveBeenCalledWith({
      seed: 40,
      'series a': 60,
    });
    expect(runSimulationMock).toHaveBeenCalledTimes(1);

    const serviceConfig = runSimulationMock.mock.calls[0]?.[0];
    expect(serviceConfig).toEqual(
      expect.objectContaining({
        fundId: 1,
        runs: 10000,
        timeHorizonYears: 8,
      })
    );
    expect(serviceConfig).not.toHaveProperty('stageDistribution');
  });

  it('passes numeric authenticated user id as createdBy for synchronous simulations', async () => {
    const authenticatedApp = express();
    isolateRateLimitClient(authenticatedApp);
    authenticatedApp.use(express.json());
    authenticatedApp.use((req, _res, next) => {
      req.user = { id: '42' } as never;
      req.context = {
        userId: 'subject-42',
        orgId: '',
        email: 'partner@example.com',
        role: 'partner',
      };
      next();
    });
    authenticatedApp.use(monteCarloRouter);

    await request(authenticatedApp)
      .post('/simulate')
      .send({
        fundId: 1,
      })
      .expect(200);

    expect(runSimulationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 1,
        createdBy: 42,
      }),
      expect.objectContaining({
        userId: 'subject-42',
      })
    );
  });

  it('executes async simulation synchronously without claiming queued work when its queue is unavailable', async () => {
    isQueueInitializedMock.mockReturnValue(false);

    const response = await request(app).post('/simulate/async').send({ fundId: 1 }).expect(200);

    expect(response.body.mode).toBe('sync_fallback');
    expect(response.body.metadata).toEqual(expect.objectContaining({ fallbackTriggered: true }));
    expect(enqueueSimulationMock).not.toHaveBeenCalled();
    expect(runSimulationMock).toHaveBeenCalledTimes(1);
  });

  it('queues numeric authenticated user id for asynchronous simulations', async () => {
    isQueueInitializedMock.mockReturnValue(true);
    const authenticatedApp = express();
    isolateRateLimitClient(authenticatedApp);
    authenticatedApp.use(express.json());
    authenticatedApp.use((req, _res, next) => {
      req.user = { id: '42' } as never;
      req.context = {
        userId: 'subject-42',
        orgId: '',
        email: 'partner@example.com',
        role: 'partner',
      };
      next();
    });
    authenticatedApp.use(monteCarloRouter);

    await request(authenticatedApp)
      .post('/simulate/async')
      .send({
        fundId: 1,
      })
      .expect(202);

    expect(enqueueSimulationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 1,
        userId: 42,
        context: {
          userId: 'subject-42',
          orgId: '',
          fundId: '1',
          email: 'partner@example.com',
          role: 'partner',
        },
      })
    );
    expect(enqueueSimulationMock.mock.calls[0]?.[0]).not.toHaveProperty('token');
    expect(enqueueSimulationMock.mock.calls[0]?.[0]).not.toHaveProperty('authorization');
  });

  it('rejects async queueing without validated tenant context', async () => {
    isQueueInitializedMock.mockReturnValue(true);

    const response = await request(app).post('/simulate/async').send({ fundId: 1 }).expect(403);

    expect(response.body.error).toBe('MISSING_TENANT_CONTEXT');
    expect(enqueueSimulationMock).not.toHaveBeenCalled();
  });

  it('allows the owning user and fund to poll and stream a job', async () => {
    isQueueInitializedMock.mockReturnValue(true);
    getJobStatusMock.mockResolvedValue({ status: 'waiting', progress: 0 });
    subscribeToJobMock.mockImplementation((_jobId, callbacks) => {
      callbacks.onComplete?.({ jobId: 'job-1', result: { success: true } });
      return () => undefined;
    });
    const jobApp = createJobAccessApp();

    await request(jobApp).get('/jobs/job-1').expect(200);
    const streamResponse = await request(jobApp).get('/jobs/job-1/stream').expect(200);

    expect(getJobStatusMock).toHaveBeenCalledWith('job-1', jobContext);
    expect(subscribeToJobMock).toHaveBeenCalledWith('job-1', expect.any(Object));
    expect(streamResponse.headers['content-type']).toContain('text/event-stream');
  });

  it.each([
    ['cross-user', { ...jobContext, userId: 'subject-99' }],
    ['cross-fund', { ...jobContext, fundId: '8' }],
  ])('returns scoped not-found for %s poll and SSE access', async (_name, callerContext) => {
    isQueueInitializedMock.mockReturnValue(true);
    getJobStatusMock.mockImplementation(async (_jobId, context) =>
      context.userId === jobContext.userId && context.fundId === jobContext.fundId
        ? { status: 'waiting', progress: 0 }
        : { status: 'unknown' }
    );
    const jobApp = createJobAccessApp(callerContext);

    const pollResponse = await request(jobApp).get('/jobs/job-1').expect(404);
    const streamResponse = await request(jobApp).get('/jobs/job-1/stream').expect(404);

    expect(pollResponse.body.error).toBe('JOB_NOT_FOUND');
    expect(streamResponse.body.error).toBe('JOB_NOT_FOUND');
    expect(streamResponse.headers['content-type']).not.toContain('text/event-stream');
    expect(subscribeToJobMock).not.toHaveBeenCalled();
  });

  it('returns scoped not-found when a legacy contextless job is requested', async () => {
    isQueueInitializedMock.mockReturnValue(true);
    getJobStatusMock.mockResolvedValue({ status: 'unknown' });
    const jobApp = createJobAccessApp();

    await request(jobApp).get('/jobs/legacy-job').expect(404);
    await request(jobApp).get('/jobs/legacy-job/stream').expect(404);

    expect(subscribeToJobMock).not.toHaveBeenCalled();
  });

  it('rejects invalid stage distributions in enforce mode', async () => {
    getStageValidationModeMock.mockResolvedValue('enforce');
    parseStageDistributionMock.mockReturnValue({
      normalized: {
        pre_seed: 0,
        seed: 0,
        series_a: 0,
        series_b: 0,
        series_c: 0,
        growth: 0,
        late_stage: 0,
      },
      invalidInputs: ['unknown-stage'],
      suggestions: {
        'unknown-stage': ['seed'],
      },
      sum: 1,
      isValid: false,
      errors: ['Unknown stage names: unknown-stage. Please use standard stage names.'],
    });

    const response = await request(app)
      .post('/simulate')
      .send({
        fundId: 1,
        stageDistribution: [{ stage: 'unknown-stage', weight: 1 }],
      })
      .expect(400);

    expect(response.body.error).toBe('INVALID_STAGE_DISTRIBUTION');
    expect(response.headers['x-stage-warning']).toContain('unknown-stage');
    expect(runSimulationMock).not.toHaveBeenCalled();
  });

  it('enforces fund scope with the body fundId on POST /simulate before reading', async () => {
    await request(app).post('/simulate').send({ fundId: 7 }).expect(200);

    expect(enforceProvidedFundScopeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(runSimulationMock).toHaveBeenCalledTimes(1);
  });

  it('denies POST /simulate for an out-of-scope fund before running the simulation', async () => {
    enforceProvidedFundScopeMock.mockImplementationOnce(async (_req, res) => {
      res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
      return false;
    });

    const response = await request(app).post('/simulate').send({ fundId: 2 }).expect(403);

    expect(response.body).toMatchObject({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
    expect(enforceProvidedFundScopeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(runSimulationMock).not.toHaveBeenCalled();
  });

  it('denies POST /simulate/async for an out-of-scope fund before queueing', async () => {
    isQueueInitializedMock.mockReturnValue(true);
    enforceProvidedFundScopeMock.mockImplementationOnce(async (_req, res) => {
      res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
      return false;
    });

    await request(app).post('/simulate/async').send({ fundId: 2 }).expect(403);

    expect(enforceProvidedFundScopeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(enqueueSimulationMock).not.toHaveBeenCalled();
    expect(runSimulationMock).not.toHaveBeenCalled();
  });

  it('denies POST /batch on the first out-of-scope config in a mixed-fund batch', async () => {
    enforceProvidedFundScopeMock
      .mockImplementationOnce(async () => true)
      .mockImplementationOnce(async (_req, res) => {
        res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
        return false;
      });

    await request(app)
      .post('/batch')
      .send({ simulations: [{ fundId: 1 }, { fundId: 2 }] })
      .expect(403);

    expect(enforceProvidedFundScopeMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      1
    );
    expect(enforceProvidedFundScopeMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      2
    );
    expect(runBatchSimulationsMock).not.toHaveBeenCalled();
  });

  it('denies POST /multi-environment for an out-of-scope fund before running', async () => {
    enforceProvidedFundScopeMock.mockImplementationOnce(async (_req, res) => {
      res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
      return false;
    });

    await request(app)
      .post('/multi-environment')
      .send({
        baseConfig: { fundId: 2 },
        environments: [
          {
            scenario: 'bull',
            exitMultipliers: { mean: 1, volatility: 1 },
            failureRate: 0.1,
            followOnProbability: 0.1,
          },
        ],
      })
      .expect(403);

    expect(enforceProvidedFundScopeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2
    );
    expect(runMultiEnvironmentSimulationMock).not.toHaveBeenCalled();
  });

  it('denies GET /funds/:fundId/simulate for an out-of-scope fund before reading', async () => {
    enforceProvidedFundScopeMock.mockImplementationOnce(async (_req, res) => {
      res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
      return false;
    });

    await request(app).get('/funds/2/simulate?runs=1000').expect(403);

    expect(enforceProvidedFundScopeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2,
      { forWrite: true }
    );
    expect(runSimulationMock).not.toHaveBeenCalled();
  });
});
