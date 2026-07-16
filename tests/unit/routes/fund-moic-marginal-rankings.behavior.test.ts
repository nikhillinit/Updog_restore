import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarginalReserveMoicInputV1 } from '../../../shared/contracts/marginal-reserve-moic-v1.contract';
import { MarginalReserveRankingsResponseV1Schema } from '../../../shared/contracts/marginal-reserve-moic-v1.contract';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const authState = vi.hoisted(() => ({
  user: null as null | { id: number; role: string; fundIds: number[] },
}));
const featureState = vi.hoisted(() => ({ enabled: false }));
const inputService = vi.hoisted(() => ({ build: vi.fn() }));

vi.mock('../../../server/config/features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/config/features')>();
  const features = { ...actual.FEATURES };
  Object.defineProperty(features, 'marginalReserveMoic', {
    enumerable: true,
    get: () => featureState.enabled,
  });
  return { ...actual, FEATURES: features };
});

vi.mock('../../../server/services/moic/marginal-reserve-moic-input-service', () => ({
  buildMarginalReserveMoicInputs: inputService.build,
}));

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return {
    ...actual,
    requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
      if (!authState.user) return res.sendStatus(401);
      (req as Request & { user: unknown }).user = { ...authState.user };
      next();
    },
  };
});

import fundMoicRouter from '../../../server/routes/fund-moic';

function marginalInput(params: {
  companyId: number;
  exitValuation: string;
  readiness?: MarginalReserveMoicInputV1['readiness'];
}): MarginalReserveMoicInputV1 {
  return {
    contractVersion: 'marginal-reserve-moic-input-v1',
    fundId: 1,
    companyId: params.companyId,
    baseCurrency: 'USD',
    asOfDate: '2026-07-12',
    currentOwnership: '0',
    stages: [
      {
        stage: 'series_a',
        preMoneyValuation: '8000000',
        roundSize: '2000000',
        monthsFromPriorStage: 12,
        graduationProbability: '0',
        exitProbability: '1',
        exitValuation: params.exitValuation,
        withDecision: { participate: true, checkAmount: '1000000' },
        withoutDecision: { participate: false, checkAmount: '0' },
      },
    ],
    factsInputHash: HASH_A,
    assumptionsHash: HASH_B,
    engineVersion: 'marginal-reserve-moic-v1',
    readiness: params.readiness ?? { status: 'actionable', reasons: [] },
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', fundMoicRouter);
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) =>
    res.status(500).json({ error: 'internal_error' })
  );
  return app;
}

function getRankings(path = '/api/funds/1/moic/marginal-rankings?asOfDate=2026-07-12') {
  return request(buildApp()).get(path);
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 101, role: 'admin', fundIds: [1] };
  featureState.enabled = true;
  inputService.build.mockResolvedValue({
    ready: [
      marginalInput({
        companyId: 2,
        exitValuation: '30000000',
        readiness: { status: 'indicative', reasons: ['STALE_ASSUMPTION'] },
      }),
      marginalInput({ companyId: 1, exitValuation: '50000000' }),
      marginalInput({ companyId: 4, exitValuation: '20000000' }),
    ],
    unavailable: [{ companyId: 3, reasons: ['MISSING_CURRENT_OWNERSHIP'] }],
    factsInputHash: HASH_A,
    assumptionsHash: HASH_B,
  });
});

describe('marginal reserve MOIC shadow route', () => {
  it('returns 404 without reading inputs when the server flag is off', async () => {
    featureState.enabled = false;

    const response = await getRankings();

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
    expect(inputService.build).not.toHaveBeenCalled();
  });

  it('returns strict results sorted by status then descending marginal MOIC', async () => {
    const response = await getRankings();

    expect(response.status).toBe(200);
    const parsed = MarginalReserveRankingsResponseV1Schema.parse(response.body);
    expect(parsed).toMatchObject({ mode: 'shadow', actionability: 'non_actionable_shadow' });
    expect(parsed.rankings.map((ranking) => [ranking.companyId, ranking.status])).toEqual([
      [1, 'actionable'],
      [4, 'actionable'],
      [2, 'indicative'],
    ]);
    expect(parsed.unavailable).toEqual([{ companyId: 3, reasons: ['MISSING_CURRENT_OWNERSHIP'] }]);
    expect(parsed.rankings[0]?.result).not.toHaveProperty('companyId');
    expect(inputService.build).toHaveBeenCalledWith({ fundId: 1, asOfDate: '2026-07-12' });
  });

  it('requires authentication before any source read', async () => {
    authState.user = null;

    const response = await getRankings();

    expect(response.status).toBe(401);
    expect(inputService.build).not.toHaveBeenCalled();
  });

  it('allows a team member to read another fund rankings (universal read)', async () => {
    authState.user = { id: 101, role: 'analyst', fundIds: [2] };

    const response = await getRankings();

    // Universal read: a team member (non-LP) may read any fund on safe methods.
    expect(response.status).not.toBe(403);
  });

  it('rejects a non-numeric fund ID with the sibling guard status', async () => {
    const response = await getRankings(
      '/api/funds/not-a-number/moic/marginal-rankings?asOfDate=2026-07-12'
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Bad Request', message: 'Invalid fund ID' });
    expect(inputService.build).not.toHaveBeenCalled();
  });

  it.each([
    '/api/funds/1/moic/marginal-rankings',
    '/api/funds/1/moic/marginal-rankings?asOfDate=07-12-2026',
  ])('rejects a missing or invalid asOfDate: %s', async (path) => {
    const response = await getRankings(path);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'invalid_as_of_date',
      message: 'asOfDate must be provided as YYYY-MM-DD',
    });
    expect(inputService.build).not.toHaveBeenCalled();
  });
});
