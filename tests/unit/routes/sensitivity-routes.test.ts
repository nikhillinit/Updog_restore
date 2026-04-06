/**
 * Sensitivity routes -- HTTP-level unit tests.
 *
 * The engine and run service modules are mocked via vi.mock so the test
 * focuses on:
 *   - param + body validation
 *   - service.createPending / markCompleted / markFailed call wiring
 *   - HTTP status mapping (400, 404, 409, 500)
 *   - history list + cursor / kind filter passthrough
 *
 * Pattern modeled after tests/unit/routes/monte-carlo-api.test.ts: build a
 * fresh `express()` app per test, mount the imported router, and drive it
 * with supertest.
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
  range: { min: 0.1, max: 0.4 },
  steps: 4,
  metricId: 'tvpi',
};

const fakeRun = {
  id: 99,
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

const fakeCompletedRun = {
  ...fakeRun,
  status: 'completed' as const,
  completedAt: new Date('2026-04-06T12:00:01.000Z'),
  durationMs: 1000,
  results: { ok: true },
};

const fakeEngineResult = {
  variableId: 'reserve_pool_pct' as const,
  metricId: 'tvpi' as const,
  baselineValue: 1.85,
  datapoints: [
    { variableValue: 0.1, metricValue: 1.8 },
    { variableValue: 0.2, metricValue: 1.85 },
    { variableValue: 0.3, metricValue: 1.9 },
    { variableValue: 0.4, metricValue: 1.95 },
  ],
  summary: { minMetric: 1.8, maxMetric: 1.95, range: 0.15 },
  computedAt: '2026-04-06T12:00:00.500Z',
};

describe('Sensitivity routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', sensitivityRouter);

    vi.clearAllMocks();

    createPendingMock.mockResolvedValue(fakeRun);
    markCompletedMock.mockResolvedValue(fakeCompletedRun);
    markFailedMock.mockResolvedValue({ ...fakeRun, status: 'failed' });
    runOneWaySensitivityMock.mockResolvedValue(fakeEngineResult);
    getHistoryByFundMock.mockResolvedValue([fakeCompletedRun]);
    getByIdMock.mockResolvedValue(fakeCompletedRun);
  });

  // ----- POST /funds/:id/sensitivity/one-way -------------------------------

  it('POST returns 400 on non-integer fundId', async () => {
    const res = await request(app)
      .post('/api/funds/abc/sensitivity/one-way')
      .send(validBody)
      .expect(400);
    expect(res.body.code).toBe('INVALID_FUND_ID');
    expect(createPendingMock).not.toHaveBeenCalled();
  });

  it('POST returns 400 on body missing variableId', async () => {
    const { variableId: _v, ...bad } = validBody;
    const res = await request(app).post('/api/funds/1/sensitivity/one-way').send(bad).expect(400);
    expect(res.body.code).toBe('INVALID_PARAMS');
    expect(createPendingMock).not.toHaveBeenCalled();
  });

  it('POST returns 400 when steps > 50', async () => {
    const res = await request(app)
      .post('/api/funds/1/sensitivity/one-way')
      .send({ ...validBody, steps: 51 })
      .expect(400);
    expect(res.body.code).toBe('INVALID_PARAMS');
  });

  it('POST returns 200 with run + result on engine success', async () => {
    const res = await request(app)
      .post('/api/funds/1/sensitivity/one-way')
      .send(validBody)
      .expect(200);

    expect(res.body.run).toBeDefined();
    expect(res.body.result).toEqual(fakeEngineResult);

    expect(createPendingMock).toHaveBeenCalledTimes(1);
    const createCall = createPendingMock.mock.calls[0]!;
    expect(createCall[0]).toBe(1);
    expect(createCall[1]).toBe('one_way');

    expect(markCompletedMock).toHaveBeenCalledTimes(1);
    const completedCall = markCompletedMock.mock.calls[0]!;
    expect(completedCall[0]).toBe(fakeRun.id);
    expect(completedCall[1]).toEqual(fakeEngineResult);
    expect(typeof completedCall[2]).toBe('number');

    expect(markFailedMock).not.toHaveBeenCalled();
  });

  it('POST returns 409 with NO_PUBLISHED_CONFIG when engine raises that code', async () => {
    const { SensitivityEngineError } =
      await import('../../../server/services/one-way-sensitivity-engine');
    runOneWaySensitivityMock.mockRejectedValueOnce(
      new SensitivityEngineError('NO_PUBLISHED_CONFIG', 'no published config')
    );

    const res = await request(app)
      .post('/api/funds/1/sensitivity/one-way')
      .send(validBody)
      .expect(409);

    expect(res.body.code).toBe('NO_PUBLISHED_CONFIG');
    expect(markFailedMock).toHaveBeenCalledTimes(1);
    expect(markFailedMock.mock.calls[0]![1]).toBe('NO_PUBLISHED_CONFIG');
    expect(markCompletedMock).not.toHaveBeenCalled();
  });

  it('POST returns 500 with ENGINE_FAILURE on a generic engine error', async () => {
    runOneWaySensitivityMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app)
      .post('/api/funds/1/sensitivity/one-way')
      .send(validBody)
      .expect(500);

    expect(res.body.code).toBe('ENGINE_FAILURE');
    expect(markFailedMock).toHaveBeenCalledTimes(1);
    expect(markFailedMock.mock.calls[0]![1]).toBe('ENGINE_FAILURE');
  });

  // ----- GET /funds/:id/sensitivity/runs -----------------------------------

  it('GET /runs returns the history list from the service', async () => {
    const res = await request(app).get('/api/funds/1/sensitivity/runs').expect(200);
    expect(res.body.runs).toHaveLength(1);
    expect(getHistoryByFundMock).toHaveBeenCalledTimes(1);
    expect(getHistoryByFundMock.mock.calls[0]![0]).toBe(1);
  });

  it('GET /runs?kind=one_way passes the kind filter to the service', async () => {
    await request(app).get('/api/funds/1/sensitivity/runs?kind=one_way').expect(200);
    const opts = getHistoryByFundMock.mock.calls[0]![1] as { kind?: string };
    expect(opts.kind).toBe('one_way');
  });

  it('GET /runs?kind=invalid returns 400', async () => {
    const res = await request(app).get('/api/funds/1/sensitivity/runs?kind=invalid').expect(400);
    expect(res.body.code).toBe('INVALID_KIND');
    expect(getHistoryByFundMock).not.toHaveBeenCalled();
  });

  // ----- GET /funds/:id/sensitivity/runs/:runId ----------------------------

  it('GET /runs/:runId returns 404 when service returns null', async () => {
    getByIdMock.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/funds/1/sensitivity/runs/77').expect(404);
    expect(res.body.code).toBe('RUN_NOT_FOUND');
    expect(getByIdMock).toHaveBeenCalledWith(1, 77);
  });

  it('GET /runs/:runId returns 200 with the run when service returns it', async () => {
    const res = await request(app).get('/api/funds/1/sensitivity/runs/99').expect(200);
    expect(res.body.run).toBeDefined();
    expect(getByIdMock).toHaveBeenCalledWith(1, 99);
  });
});
