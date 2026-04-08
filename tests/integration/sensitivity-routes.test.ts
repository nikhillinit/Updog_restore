/**
 * Integration test: sensitivity routes end-to-end (one-way / two-way / stress).
 *
 * Phase 4 (M8) success criterion 3 - integration tests cover all three
 * sensitivity routes including at least one error path each.
 *
 * Strategy:
 * - Mounts `server/routes/sensitivity.ts` on a fresh Express app per test
 * - Mocks `sensitivity-run-service` and the three engine modules via vi.mock
 *   so the dynamic `await import('../services/...')` calls inside each
 *   route handler resolve to the mocked module rather than the real engine
 * - Uses supertest to exercise the request -> route -> engine -> response shape
 * - Does NOT spawn a second Express server (REFL-024 cascade-failure
 *   avoidance) and does NOT touch the DB - pure integration of the
 *   route + engine seam
 *
 * Distinct from `tests/unit/routes/sensitivity-routes-error-mapping.test.ts`,
 * which is a table-driven pin of every STATUS_BY_CODE entry against the
 * one-way route only. This file proves the FULL request/response shape
 * for all three POST routes plus the two GET routes.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  createPendingMock,
  markCompletedMock,
  markFailedMock,
  getHistoryByFundMock,
  getByIdMock,
  runOneWaySensitivityMock,
  runTwoWaySensitivityMock,
  runStressTestMock,
} = vi.hoisted(() => ({
  createPendingMock: vi.fn(),
  markCompletedMock: vi.fn(),
  markFailedMock: vi.fn(),
  getHistoryByFundMock: vi.fn(),
  getByIdMock: vi.fn(),
  runOneWaySensitivityMock: vi.fn(),
  runTwoWaySensitivityMock: vi.fn(),
  runStressTestMock: vi.fn(),
}));

vi.mock('../../server/services/sensitivity-run-service', () => ({
  sensitivityRunService: {
    createPending: createPendingMock,
    markCompleted: markCompletedMock,
    markFailed: markFailedMock,
    getHistoryByFund: getHistoryByFundMock,
    getById: getByIdMock,
  },
}));

class FakeSensitivityEngineError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SensitivityEngineError';
    this.code = code;
  }
}

vi.mock('../../server/services/one-way-sensitivity-engine', () => ({
  oneWaySensitivityEngine: {
    runOneWaySensitivity: runOneWaySensitivityMock,
  },
  SensitivityEngineError: FakeSensitivityEngineError,
}));

vi.mock('../../server/services/two-way-sensitivity-engine', () => ({
  twoWaySensitivityEngine: {
    runTwoWaySensitivity: runTwoWaySensitivityMock,
  },
  SensitivityEngineError: FakeSensitivityEngineError,
}));

vi.mock('../../server/services/stress-test-engine', () => ({
  stressTestEngine: {
    runStressTest: runStressTestMock,
  },
  SensitivityEngineError: FakeSensitivityEngineError,
}));

import sensitivityRouter from '../../server/routes/sensitivity';

const oneWayBody = {
  variableId: 'reserve_pool_pct',
  range: { min: 0, max: 0.5 },
  steps: 5,
  metricId: 'tvpi',
};

const twoWayBody = {
  variableXId: 'reserve_pool_pct',
  rangeX: { min: 0, max: 0.5 },
  stepsX: 3,
  variableYId: 'management_fee_rate',
  rangeY: { min: 0, max: 0.05 },
  stepsY: 3,
  metricId: 'tvpi',
};

const stressBody = {
  scenarioIds: ['severe_downside'],
  metricId: 'tvpi',
};

const fakePendingRunBase = {
  id: 42,
  fundId: 1,
  status: 'pending' as const,
  results: null,
  createdBy: 0,
  createdAt: new Date('2026-04-08T12:00:00.000Z'),
  completedAt: null,
  durationMs: null,
  errorCode: null,
  errorMessage: null,
};

const fakeOneWayResult = {
  metricId: 'tvpi',
  variableId: 'reserve_pool_pct',
  points: [
    { value: 0, metric: 1.5 },
    { value: 0.25, metric: 1.8 },
    { value: 0.5, metric: 2.1 },
  ],
};

const fakeTwoWayResult = {
  metricId: 'tvpi',
  variableX: 'reserve_pool_pct',
  variableY: 'graduation_rate',
  grid: [
    [1.5, 1.6, 1.7],
    [1.7, 1.8, 1.9],
    [1.9, 2.0, 2.1],
  ],
};

const fakeStressResult = {
  metricId: 'tvpi',
  scenarioId: 'gfc-2008',
  baseline: 2.0,
  stressed: 1.4,
  delta: -0.6,
};

describe('sensitivity routes integration (one-way / two-way / stress)', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', sensitivityRouter);
    vi.clearAllMocks();

    createPendingMock.mockImplementation(async (fundId, kind, params, _userId) => ({
      ...fakePendingRunBase,
      fundId,
      kind,
      params,
    }));
    markCompletedMock.mockImplementation(async (id, results, durationMs) => ({
      ...fakePendingRunBase,
      id,
      status: 'completed' as const,
      results,
      durationMs,
      completedAt: new Date('2026-04-08T12:00:01.000Z'),
    }));
    markFailedMock.mockImplementation(async (id, code, message, durationMs) => ({
      ...fakePendingRunBase,
      id,
      status: 'failed' as const,
      durationMs,
      errorCode: code,
      errorMessage: message,
      completedAt: new Date('2026-04-08T12:00:01.000Z'),
    }));
  });

  describe('POST /api/funds/:id/sensitivity/one-way', () => {
    it('returns 200 with run + result on the happy path', async () => {
      runOneWaySensitivityMock.mockResolvedValueOnce(fakeOneWayResult);

      const response = await request(app).post('/api/funds/1/sensitivity/one-way').send(oneWayBody);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('run');
      expect(response.body).toHaveProperty('result');
      expect(response.body.run.status).toBe('completed');
      expect(response.body.result).toEqual(fakeOneWayResult);
      expect(createPendingMock).toHaveBeenCalledTimes(1);
      expect(createPendingMock).toHaveBeenCalledWith(
        1,
        'one_way',
        expect.any(Object),
        expect.any(Number)
      );
      expect(markCompletedMock).toHaveBeenCalledTimes(1);
      expect(markFailedMock).not.toHaveBeenCalled();
    });

    it('returns 409 with code NO_PUBLISHED_CONFIG when the engine reports a missing config', async () => {
      runOneWaySensitivityMock.mockRejectedValueOnce(
        new FakeSensitivityEngineError('NO_PUBLISHED_CONFIG', 'fund 1 has no published config')
      );

      const response = await request(app).post('/api/funds/1/sensitivity/one-way').send(oneWayBody);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('NO_PUBLISHED_CONFIG');
      expect(response.body.message).toMatch(/no published config/);
      expect(markFailedMock).toHaveBeenCalledTimes(1);
      expect(markCompletedMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/funds/:id/sensitivity/two-way', () => {
    it('returns 200 with run + result on the happy path', async () => {
      runTwoWaySensitivityMock.mockResolvedValueOnce(fakeTwoWayResult);

      const response = await request(app).post('/api/funds/2/sensitivity/two-way').send(twoWayBody);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('run');
      expect(response.body).toHaveProperty('result');
      expect(response.body.run.status).toBe('completed');
      expect(response.body.result).toEqual(fakeTwoWayResult);
      expect(createPendingMock).toHaveBeenCalledTimes(1);
      expect(createPendingMock).toHaveBeenCalledWith(
        2,
        'two_way',
        expect.any(Object),
        expect.any(Number)
      );
      expect(markCompletedMock).toHaveBeenCalledTimes(1);
      expect(markFailedMock).not.toHaveBeenCalled();
    });

    it('returns 422 with code INVALID_PUBLISHED_CONFIG when the engine cannot process the published config', async () => {
      runTwoWaySensitivityMock.mockRejectedValueOnce(
        new FakeSensitivityEngineError(
          'INVALID_PUBLISHED_CONFIG',
          'published config missing required field: graduationRate'
        )
      );

      const response = await request(app).post('/api/funds/2/sensitivity/two-way').send(twoWayBody);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('INVALID_PUBLISHED_CONFIG');
      expect(response.body.message).toMatch(/missing required field/);
      expect(markFailedMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/funds/:id/sensitivity/stress', () => {
    it('returns 200 with run + result on the happy path', async () => {
      runStressTestMock.mockResolvedValueOnce(fakeStressResult);

      const response = await request(app).post('/api/funds/3/sensitivity/stress').send(stressBody);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('run');
      expect(response.body).toHaveProperty('result');
      expect(response.body.run.status).toBe('completed');
      expect(response.body.result).toEqual(fakeStressResult);
      expect(createPendingMock).toHaveBeenCalledTimes(1);
      expect(createPendingMock).toHaveBeenCalledWith(
        3,
        'stress',
        expect.any(Object),
        expect.any(Number)
      );
      expect(markCompletedMock).toHaveBeenCalledTimes(1);
    });

    it('returns 400 with code UNSUPPORTED_VARIABLE_PATH when the engine reports an unmappable scenario variable', async () => {
      runStressTestMock.mockRejectedValueOnce(
        new FakeSensitivityEngineError(
          'UNSUPPORTED_VARIABLE_PATH',
          'scenario gfc-2008 references unsupported variable: foo.bar'
        )
      );

      const response = await request(app).post('/api/funds/3/sensitivity/stress').send(stressBody);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('UNSUPPORTED_VARIABLE_PATH');
      expect(response.body.message).toMatch(/unsupported variable/);
      expect(markFailedMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/funds/:id/sensitivity/runs', () => {
    it('returns 200 with paginated history when runs exist', async () => {
      const fakeRuns = [
        { ...fakePendingRunBase, id: 100, kind: 'one_way' as const, status: 'completed' as const },
        { ...fakePendingRunBase, id: 101, kind: 'two_way' as const, status: 'completed' as const },
      ];
      getHistoryByFundMock.mockResolvedValueOnce(fakeRuns);

      const response = await request(app)
        .get('/api/funds/1/sensitivity/runs')
        .query({ limit: '20' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('runs');
      expect(Array.isArray(response.body.runs)).toBe(true);
      expect(response.body.runs).toHaveLength(2);
      expect(getHistoryByFundMock).toHaveBeenCalledTimes(1);
      expect(getHistoryByFundMock).toHaveBeenCalledWith(1, expect.objectContaining({ limit: 20 }));
    });
  });

  describe('GET /api/funds/:id/sensitivity/runs/:runId', () => {
    it('returns 404 with code RUN_NOT_FOUND when the run does not belong to the fund', async () => {
      getByIdMock.mockResolvedValueOnce(null);

      const response = await request(app).get('/api/funds/1/sensitivity/runs/9999');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('RUN_NOT_FOUND');
      expect(getByIdMock).toHaveBeenCalledWith(1, 9999);
    });
  });
});
