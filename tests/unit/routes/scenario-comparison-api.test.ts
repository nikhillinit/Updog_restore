import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { qMock, compareScenariosMock, getComparisonMock } = vi.hoisted(() => ({
  qMock: vi.fn(),
  compareScenariosMock: vi.fn(),
  getComparisonMock: vi.fn(),
}));

vi.mock('../../../server/db/index.js', () => ({
  q: qMock,
}));

vi.mock('../../../server/services/comparison-service.js', () => ({
  ComparisonService: class ComparisonService {
    constructor(_redis: unknown) {}

    compareScenarios = compareScenariosMock;
    getComparison = getComparisonMock;
  },
}));

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    get: vi.fn(),
    setEx: vi.fn(),
  })),
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import scenarioComparisonRouter from '../../../server/routes/scenario-comparison';

const baseScenarioId = '00000000-0000-0000-0000-000000000101';
const comparisonScenarioId = '00000000-0000-0000-0000-000000000102';
const comparisonId = '00000000-0000-0000-0000-000000000201';

describe('Scenario comparison routes', () => {
  let app: express.Express;
  let originalFlag: string | undefined;
  let originalRedisUrl: string | undefined;

  beforeEach(() => {
    originalFlag = process.env.ENABLE_SCENARIO_COMPARISON;
    originalRedisUrl = process.env.REDIS_URL;

    process.env.REDIS_URL = 'memory://';

    app = express();
    app.use(express.json());
    app.use(scenarioComparisonRouter);

    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.ENABLE_SCENARIO_COMPARISON;
    } else {
      process.env.ENABLE_SCENARIO_COMPARISON = originalFlag;
    }

    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it('returns not implemented while the feature flag is disabled', async () => {
    delete process.env.ENABLE_SCENARIO_COMPARISON;

    const response = await request(app).post('/api/portfolio/comparisons').send({}).expect(501);

    expect(response.body).toEqual({
      success: false,
      error: 'NOT_IMPLEMENTED',
      message:
        'Scenario comparison feature is not enabled. Set ENABLE_SCENARIO_COMPARISON=true to enable.',
    });
    expect(qMock).not.toHaveBeenCalled();
    expect(compareScenariosMock).not.toHaveBeenCalled();
  });

  it('rejects invalid create requests before touching storage', async () => {
    process.env.ENABLE_SCENARIO_COMPARISON = 'true';

    const response = await request(app)
      .post('/api/portfolio/comparisons')
      .send({
        fundId: 1,
        baseScenarioId,
        comparisonScenarioIds: [comparisonScenarioId],
        comparisonMetrics: ['moic'],
        extraField: 'not-allowed',
      })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Invalid request',
      })
    );
    expect(qMock).not.toHaveBeenCalled();
    expect(compareScenariosMock).not.toHaveBeenCalled();
  });

  it('returns missing-scenario errors before calling the comparison service', async () => {
    process.env.ENABLE_SCENARIO_COMPARISON = 'true';

    qMock.mockImplementation(async (query: string) => {
      if (query.includes('FROM scenarios')) {
        return [{ id: baseScenarioId, name: 'Base Case' }];
      }

      return [];
    });

    const response = await request(app)
      .post('/api/portfolio/comparisons')
      .send({
        fundId: 1,
        baseScenarioId,
        comparisonScenarioIds: [comparisonScenarioId],
        comparisonMetrics: ['moic'],
      })
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: `Scenarios not found: ${comparisonScenarioId}`,
    });
    expect(compareScenariosMock).not.toHaveBeenCalled();
  });

  it('returns successful comparison responses for valid requests', async () => {
    process.env.ENABLE_SCENARIO_COMPARISON = 'true';

    qMock.mockImplementation(async (query: string) => {
      if (query.includes('FROM scenarios')) {
        return [
          { id: baseScenarioId, name: 'Base Case' },
          { id: comparisonScenarioId, name: 'Upside Case' },
        ];
      }

      return [
        {
          scenario_id: baseScenarioId,
          probability: '0.6',
          investment: '1000000',
          follow_ons: '500000',
          exit_proceeds: '2500000',
          exit_valuation: '4000000',
          months_to_exit: 48,
        },
        {
          scenario_id: comparisonScenarioId,
          probability: '0.4',
          investment: '1200000',
          follow_ons: '300000',
          exit_proceeds: '3200000',
          exit_valuation: '5500000',
          months_to_exit: 42,
        },
      ];
    });

    const comparisonResponse = {
      id: comparisonId,
      status: 'ready' as const,
      scenarios: [],
      deltaMetrics: [],
      comparisonMetrics: ['moic', 'exit_proceeds'],
      createdAt: '2026-03-24T00:00:00.000Z',
      expiresAt: '2026-03-24T00:05:00.000Z',
    };
    compareScenariosMock.mockResolvedValue(comparisonResponse);

    const response = await request(app)
      .post('/api/portfolio/comparisons')
      .send({
        fundId: 1,
        baseScenarioId,
        comparisonScenarioIds: [comparisonScenarioId],
        comparisonMetrics: ['moic', 'exit_proceeds'],
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: comparisonResponse,
    });
    expect(compareScenariosMock).toHaveBeenCalledWith(
      {
        fundId: 1,
        baseScenarioId,
        comparisonScenarioIds: [comparisonScenarioId],
        comparisonMetrics: ['moic', 'exit_proceeds'],
      },
      [
        {
          id: baseScenarioId,
          name: 'Base Case',
          scenario_type: 'deal_level',
          cases: [
            {
              probability: 0.6,
              investment: 1000000,
              follow_ons: 500000,
              exit_proceeds: 2500000,
              exit_valuation: 4000000,
              months_to_exit: 48,
            },
          ],
        },
        {
          id: comparisonScenarioId,
          name: 'Upside Case',
          scenario_type: 'deal_level',
          cases: [
            {
              probability: 0.4,
              investment: 1200000,
              follow_ons: 300000,
              exit_proceeds: 3200000,
              exit_valuation: 5500000,
              months_to_exit: 42,
            },
          ],
        },
      ]
    );
  });

  it('validates lookup ids before calling the comparison service', async () => {
    process.env.ENABLE_SCENARIO_COMPARISON = 'true';

    const response = await request(app).get('/api/portfolio/comparisons/not-a-uuid').expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Invalid request',
      })
    );
    expect(getComparisonMock).not.toHaveBeenCalled();
  });

  it('returns cached comparisons on lookup success', async () => {
    process.env.ENABLE_SCENARIO_COMPARISON = 'true';

    const cachedComparison = {
      id: comparisonId,
      status: 'ready' as const,
      scenarios: [],
      deltaMetrics: [],
      comparisonMetrics: ['moic'],
      createdAt: '2026-03-24T00:00:00.000Z',
      expiresAt: '2026-03-24T00:05:00.000Z',
    };
    getComparisonMock.mockResolvedValue(cachedComparison);

    const response = await request(app)
      .get(`/api/portfolio/comparisons/${comparisonId}`)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: cachedComparison,
    });
    expect(getComparisonMock).toHaveBeenCalledWith(comparisonId);
  });
});
