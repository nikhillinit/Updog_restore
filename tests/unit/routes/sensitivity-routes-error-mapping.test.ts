/**
 * Sensitivity routes -- engine-error to HTTP-status mapping (table-driven).
 *
 * Pins the STATUS_BY_CODE table in server/routes/sensitivity.ts so that
 * future engine error codes either get an explicit row here or fall through
 * to 500 deliberately. The mock setup mirrors sensitivity-routes.test.ts so
 * the dynamic `await import(...)` inside the route resolves to the mocked
 * module rather than the real engine.
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
} = vi.hoisted(() => ({
  createPendingMock: vi.fn(),
  markCompletedMock: vi.fn(),
  markFailedMock: vi.fn(),
  getHistoryByFundMock: vi.fn(),
  getByIdMock: vi.fn(),
  runOneWaySensitivityMock: vi.fn(),
}));

vi.mock('../../../server/services/sensitivity-run-service', () => ({
  sensitivityRunService: {
    createPending: createPendingMock,
    markCompleted: markCompletedMock,
    markFailed: markFailedMock,
    getHistoryByFund: getHistoryByFundMock,
    getById: getByIdMock,
  },
}));

vi.mock('../../../server/services/one-way-sensitivity-engine', () => {
  class SensitivityEngineError extends Error {
    public readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'SensitivityEngineError';
      this.code = code;
    }
  }
  return {
    oneWaySensitivityEngine: {
      runOneWaySensitivity: runOneWaySensitivityMock,
    },
    SensitivityEngineError,
  };
});

import sensitivityRouter from '../../../server/routes/sensitivity';

const validBody = {
  variableId: 'reserve_pool_pct',
  range: { min: 0, max: 0.5 },
  steps: 5,
  metricId: 'tvpi',
};

const fakePendingRun = {
  id: 42,
  fundId: 1,
  kind: 'one_way' as const,
  status: 'pending' as const,
  params: validBody,
  results: null,
  createdBy: 0,
  createdAt: new Date('2026-04-06T12:00:00.000Z'),
  completedAt: null,
  durationMs: null,
  errorCode: null,
  errorMessage: null,
};

describe('sensitivity routes -- engine error to HTTP status mapping', () => {
  let app: express.Express;

  // [code, expectedStatus, why]
  const STATUS_CASES: ReadonlyArray<readonly [string, number, string]> = [
    ['NO_PUBLISHED_CONFIG', 409, 'regression: resource missing'],
    ['INVALID_PUBLISHED_CONFIG', 422, 'headline change: resource unprocessable'],
    ['UNSUPPORTED_VARIABLE_PATH', 400, 'forward-looking: bad client path'],
    ['METRIC_PATH_NOT_FOUND', 500, 'regression: server bug class'],
    ['METRIC_NOT_NUMBER', 500, 'regression: server bug class'],
    ['ENGINE_FAILURE', 500, 'regression: catch-all'],
    ['TOTALLY_UNKNOWN_NEW_CODE', 500, 'fallback: unknown code defaults to 500'],
  ];

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', sensitivityRouter);

    vi.clearAllMocks();

    createPendingMock.mockResolvedValue(fakePendingRun);
    markFailedMock.mockResolvedValue({ ...fakePendingRun, status: 'failed' });
  });

  for (const [code, expectedStatus, why] of STATUS_CASES) {
    it(`maps ${code} -> ${expectedStatus} (${why})`, async () => {
      const { SensitivityEngineError } =
        await import('../../../server/services/one-way-sensitivity-engine');
      runOneWaySensitivityMock.mockRejectedValueOnce(
        new SensitivityEngineError(code, `simulated ${code}`)
      );

      const response = await request(app).post('/api/funds/1/sensitivity/one-way').send(validBody);

      expect(response.status).toBe(expectedStatus);
      expect(response.body.code).toBe(code);
      expect(typeof response.body.message).toBe('string');
      expect(response.body.message.length).toBeGreaterThan(0);

      // Error path always persists the failed run with the same code.
      expect(markFailedMock).toHaveBeenCalledTimes(1);
      expect(markFailedMock).toHaveBeenCalledWith(
        expect.any(Number),
        code,
        expect.any(String),
        expect.any(Number)
      );
    });
  }
});
