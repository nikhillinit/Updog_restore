import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { runSimulationMock, getStageValidationModeMock, parseStageDistributionMock } = vi.hoisted(
  () => ({
    runSimulationMock: vi.fn(),
    getStageValidationModeMock: vi.fn(),
    parseStageDistributionMock: vi.fn(),
  })
);

vi.mock('../../../server/services/monte-carlo-service-unified', () => ({
  unifiedMonteCarloService: {
    runSimulation: runSimulationMock,
    runBatchSimulations: vi.fn(),
    runMultiEnvironmentSimulation: vi.fn(),
    healthCheck: vi.fn(),
    getPerformanceStats: vi.fn(),
    getOptimizationRecommendations: vi.fn(),
  },
}));

vi.mock('../../../server/queues/simulation-queue', () => ({
  enqueueSimulation: vi.fn(),
  getJobStatus: vi.fn(),
  isQueueInitialized: vi.fn(() => false),
  subscribeToJob: vi.fn(() => () => undefined),
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

describe('Monte Carlo routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
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
});
