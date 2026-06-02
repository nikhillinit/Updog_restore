import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceState = vi.hoisted(() => ({
  runBacktest: vi.fn(),
  getBacktestHistory: vi.fn(),
  getBacktestById: vi.fn(),
  compareScenariosDetailed: vi.fn(),
  getAvailableScenariosList: vi.fn(),
}));

const queueState = vi.hoisted(() => ({
  isBacktestingQueueInitialized: vi.fn(),
  getBacktestJobStatus: vi.fn(),
  enqueueBacktestJob: vi.fn(),
  subscribeToBacktestJob: vi.fn(),
  isBacktestingTerminalStatus: vi.fn(),
}));

// Inject req.user from test headers but keep requireFundAccess + the jwt-internal
// hasFundAccess REAL, so /fund/:fundId/history exercises the genuine middleware guard
// and the inline route guards run their real logic.
vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    requireAuth: () => (req: Request, _res: Response, next: NextFunction) => {
      const raw = req.header('x-test-fundids');
      const userId = req.header('x-test-userid') || undefined;
      if (raw !== undefined) {
        (req as Request & { user?: unknown }).user = {
          id: userId,
          sub: userId,
          fundIds: raw === '' ? [] : raw.split(',').map((value) => Number(value.trim())),
        };
      }
      next();
    },
  };
});

vi.mock('../../../server/services/backtesting-service', () => ({
  backtestingService: serviceState,
}));

vi.mock('../../../server/queues/backtesting-queue', () => ({
  isBacktestingQueueInitialized: queueState.isBacktestingQueueInitialized,
  getBacktestJobStatus: queueState.getBacktestJobStatus,
  enqueueBacktestJob: queueState.enqueueBacktestJob,
  subscribeToBacktestJob: queueState.subscribeToBacktestJob,
  isBacktestingTerminalStatus: queueState.isBacktestingTerminalStatus,
}));

import backtestingRouter from '../../../server/routes/backtesting';

const VALID_CONFIG = { fundId: 2, startDate: '2020-01-01', endDate: '2021-01-01' };
const RESULT_ID = '11111111-1111-1111-1111-111111111111';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/backtesting', backtestingRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function identity(fundIds: string, userId: string) {
  return { 'x-test-fundids': fundIds, 'x-test-userid': userId };
}

function jobSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'job-1',
    fundId: 1,
    status: 'completed',
    stage: 'persisting',
    progressPercent: 100,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function resetState() {
  serviceState.runBacktest.mockReset().mockResolvedValue({ backtestId: RESULT_ID });
  serviceState.getBacktestHistory.mockReset().mockResolvedValue([]);
  serviceState.getBacktestById.mockReset().mockResolvedValue(null);
  serviceState.compareScenariosDetailed
    .mockReset()
    .mockResolvedValue({ comparisons: [], failedScenarios: [] });
  serviceState.getAvailableScenariosList
    .mockReset()
    .mockReturnValue(['financial_crisis_2008', 'covid_2020']);
  queueState.isBacktestingQueueInitialized.mockReset().mockReturnValue(true);
  queueState.getBacktestJobStatus.mockReset();
  queueState.enqueueBacktestJob
    .mockReset()
    .mockResolvedValue({ jobId: 'job-1', estimatedWaitMs: 0, deduplicated: false });
  queueState.subscribeToBacktestJob.mockReset().mockReturnValue(() => {});
  queueState.isBacktestingTerminalStatus.mockReset().mockReturnValue(true);
}

describe('backtesting route fund-scope contracts', () => {
  beforeEach(() => resetState());

  // --- POST /run (inline hasFundAccess; guard before service) ---
  it('POST /run denies a cross-fund config before the service', async () => {
    const res = await request(makeApp())
      .post('/api/backtesting/run')
      .set(identity('1', 'alice'))
      .send(VALID_CONFIG);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'FORBIDDEN' });
    expect(serviceState.runBacktest).not.toHaveBeenCalled();
  });

  it('POST /run runs the backtest for an in-scope fund', async () => {
    const res = await request(makeApp())
      .post('/api/backtesting/run')
      .set(identity('1', 'alice'))
      .send({ ...VALID_CONFIG, fundId: 1 });
    expect(res.status).toBe(200);
    expect(serviceState.runBacktest).toHaveBeenCalledTimes(1);
  });

  // --- POST /run/async (inline hasFundAccess; guard before enqueue) ---
  it('POST /run/async denies a cross-fund config before the enqueue', async () => {
    const res = await request(makeApp())
      .post('/api/backtesting/run/async')
      .set(identity('1', 'alice'))
      .send(VALID_CONFIG);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'FORBIDDEN' });
    expect(queueState.enqueueBacktestJob).not.toHaveBeenCalled();
  });

  // --- GET /jobs/:jobId (canAccessJob; fetch-before-check, 404 unknown / 403 forbidden) ---
  it('GET /jobs/:jobId returns 404 for an unknown job', async () => {
    queueState.getBacktestJobStatus.mockResolvedValueOnce(
      jobSnapshot({
        jobId: 'job-x',
        fundId: 0,
        status: 'unknown',
        stage: 'queued',
        progressPercent: 0,
      })
    );
    const res = await request(makeApp())
      .get('/api/backtesting/jobs/job-x')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'JOB_NOT_FOUND' });
  });

  it('GET /jobs/:jobId forbids a job owned by another fund', async () => {
    queueState.getBacktestJobStatus.mockResolvedValueOnce(
      jobSnapshot({ fundId: 2, requesterUserId: 'alice' })
    );
    const res = await request(makeApp())
      .get('/api/backtesting/jobs/job-1')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('GET /jobs/:jobId binds a scoped caller to jobs they requested', async () => {
    queueState.getBacktestJobStatus.mockResolvedValueOnce(
      jobSnapshot({ fundId: 1, requesterUserId: 'bob' })
    );
    const res = await request(makeApp())
      .get('/api/backtesting/jobs/job-1')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(403);
  });

  it('GET /jobs/:jobId allows the requesting user their own job', async () => {
    queueState.getBacktestJobStatus.mockResolvedValueOnce(
      jobSnapshot({ fundId: 1, requesterUserId: 'alice' })
    );
    const res = await request(makeApp())
      .get('/api/backtesting/jobs/job-1')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(200);
  });

  it('GET /jobs/:jobId lets an unrestricted caller inspect any in-scope job', async () => {
    queueState.getBacktestJobStatus.mockResolvedValueOnce(
      jobSnapshot({ fundId: 1, requesterUserId: 'bob' })
    );
    const res = await request(makeApp())
      .get('/api/backtesting/jobs/job-1')
      .set(identity('', 'admin'));
    expect(res.status).toBe(200);
  });

  it('GET /jobs/:jobId allows a job without a recorded requester', async () => {
    queueState.getBacktestJobStatus.mockResolvedValueOnce(jobSnapshot({ fundId: 1 }));
    const res = await request(makeApp())
      .get('/api/backtesting/jobs/job-1')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(200);
  });

  // --- GET /jobs/:jobId/stream (canAccessJob; deny paths only — allow path streams/hangs) ---
  it('GET /jobs/:jobId/stream returns 404 for an unknown job', async () => {
    queueState.getBacktestJobStatus.mockResolvedValueOnce(
      jobSnapshot({ jobId: 'job-x', fundId: 0, status: 'unknown' })
    );
    const res = await request(makeApp())
      .get('/api/backtesting/jobs/job-x/stream')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(404);
  });

  it('GET /jobs/:jobId/stream forbids a cross-fund job before streaming', async () => {
    queueState.getBacktestJobStatus.mockResolvedValueOnce(
      jobSnapshot({ fundId: 2, requesterUserId: 'alice' })
    );
    const res = await request(makeApp())
      .get('/api/backtesting/jobs/job-1/stream')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(403);
    expect(queueState.subscribeToBacktestJob).not.toHaveBeenCalled();
  });

  // --- GET /fund/:fundId/history (requireFundAccess; guard before service) ---
  it('GET /fund/:fundId/history denies a cross-fund read before the service', async () => {
    const res = await request(makeApp())
      .get('/api/backtesting/fund/2/history')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(403);
    expect(serviceState.getBacktestHistory).not.toHaveBeenCalled();
  });

  it('GET /fund/:fundId/history reads in-scope history', async () => {
    const res = await request(makeApp())
      .get('/api/backtesting/fund/1/history')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(200);
    expect(serviceState.getBacktestHistory).toHaveBeenCalledWith(1, expect.anything());
  });

  it('GET /fund/:fundId/history rejects an invalid fundId before the service', async () => {
    const res = await request(makeApp())
      .get('/api/backtesting/fund/0/history')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(400);
    expect(serviceState.getBacktestHistory).not.toHaveBeenCalled();
  });

  // --- GET /result/:backtestId (inline hasFundAccess; fetch-before-check) ---
  it('GET /result/:backtestId returns 404 when the backtest is absent', async () => {
    serviceState.getBacktestById.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .get(`/api/backtesting/result/${RESULT_ID}`)
      .set(identity('1', 'alice'));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'BACKTEST_NOT_FOUND' });
  });

  it('GET /result/:backtestId forbids a cross-fund result', async () => {
    serviceState.getBacktestById.mockResolvedValueOnce({ config: { fundId: 2 } });
    const res = await request(makeApp())
      .get(`/api/backtesting/result/${RESULT_ID}`)
      .set(identity('1', 'alice'));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('GET /result/:backtestId rejects a malformed id before the service', async () => {
    const res = await request(makeApp())
      .get('/api/backtesting/result/not-a-uuid')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(400);
    expect(serviceState.getBacktestById).not.toHaveBeenCalled();
  });

  it('GET /result/:backtestId returns an in-scope result', async () => {
    serviceState.getBacktestById.mockResolvedValueOnce({ config: { fundId: 1 } });
    const res = await request(makeApp())
      .get(`/api/backtesting/result/${RESULT_ID}`)
      .set(identity('1', 'alice'));
    expect(res.status).toBe(200);
  });

  // --- POST /compare-scenarios (inline hasFundAccess; guard before service) ---
  it('POST /compare-scenarios denies a cross-fund request before the service', async () => {
    const res = await request(makeApp())
      .post('/api/backtesting/compare-scenarios')
      .set(identity('1', 'alice'))
      .send({ fundId: 2, scenarios: ['covid_2020'] });
    expect(res.status).toBe(403);
    expect(serviceState.compareScenariosDetailed).not.toHaveBeenCalled();
  });

  // --- GET /scenarios (not-fund-scoped) ---
  it('GET /scenarios returns the catalog for any authenticated caller', async () => {
    const res = await request(makeApp())
      .get('/api/backtesting/scenarios')
      .set(identity('1', 'alice'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scenarios: expect.any(Array) });
    expect(serviceState.getAvailableScenariosList).toHaveBeenCalled();
  });
});
