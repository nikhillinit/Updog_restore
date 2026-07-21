import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../../server/errors';
import { requestId } from '../../../server/middleware/requestId';

import type { MarginalReserveMoicInputV1 } from '../../../shared/contracts/marginal-reserve-moic-v1.contract';
import { MarginalReserveRankingsResponseV2Schema } from '../../../shared/contracts/marginal-reserve-moic-v2.contract';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const authState = vi.hoisted(() => ({
  user: null as null | {
    id: number;
    role: string;
    fundIds: number[];
    lpId?: number | null;
  },
}));
const featureState = vi.hoisted(() => ({ enabled: false }));
const svc = vi.hoisted(() => ({
  getFundMoicRankingSources: vi.fn(),
  resolveFundCalculationMode: vi.fn(),
  buildRoundsToModelEvidence: vi.fn(),
  resolveMoicActionability: vi.fn(),
  buildMarginalReserveMoicInputs: vi.fn(),
  emitMarginalReserveMoicShadowComparison: vi.fn(),
}));

vi.mock('../../../server/services/fund-moic-ranking-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-moic-ranking-service')>();
  return { ...actual, getFundMoicRankingSources: svc.getFundMoicRankingSources };
});

vi.mock('../../../server/services/fund-calculation-mode-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-calculation-mode-service')>();
  return {
    ...actual,
    resolveFundCalculationMode: svc.resolveFundCalculationMode,
    resolveMoicActionability: svc.resolveMoicActionability,
  };
});

vi.mock('../../../server/services/rounds-to-model-evidence-service', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../server/services/rounds-to-model-evidence-service')
    >();
  return { ...actual, buildRoundsToModelEvidence: svc.buildRoundsToModelEvidence };
});

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
  buildMarginalReserveMoicInputs: svc.buildMarginalReserveMoicInputs,
}));

vi.mock('../../../server/services/moic/marginal-reserve-moic-shadow-service', () => ({
  emitMarginalReserveMoicShadowComparison: svc.emitMarginalReserveMoicShadowComparison,
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

const PLANNED_RANKINGS = [
  {
    investmentId: '1',
    rank: 1,
    reservesMoic: {
      value: 2,
      description: 'planned-one',
      formula: 'planned-one',
    },
  },
  {
    investmentId: '2',
    rank: 2,
    reservesMoic: {
      value: 1.5,
      description: 'planned-two',
      formula: 'planned-two',
    },
  },
];
const SOURCES = {
  source: 'shared-ranking-sources',
  candidate: { rankings: PLANNED_RANKINGS },
};
const EVIDENCE = { coverage: { activeRoundCount: 1 } };

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
  app.use(requestId());
  app.use(express.json());
  app.use('/api', fundMoicRouter);
  app.use(errorHandler());
  return app;
}

function getRankings(path = '/api/funds/1/moic/marginal-rankings?asOfDate=2026-07-12') {
  return request(buildApp()).get(path);
}

function inputAssembly(
  overrides: {
    ready?: MarginalReserveMoicInputV1[];
    unavailable?: Array<{ companyId: number; reasons: string[] }>;
  } = {}
) {
  return {
    ready: overrides.ready ?? [
      marginalInput({
        companyId: 2,
        exitValuation: '30000000',
        readiness: { status: 'indicative', reasons: ['STALE_ASSUMPTION'] },
      }),
      marginalInput({ companyId: 1, exitValuation: '50000000' }),
      marginalInput({ companyId: 4, exitValuation: '20000000' }),
    ],
    unavailable: overrides.unavailable ?? [
      { companyId: 3, reasons: ['MISSING_CURRENT_OWNERSHIP'] },
    ],
    factsInputHash: HASH_A,
    assumptionsHash: HASH_B,
  };
}

function expectNoRouteReads() {
  expect(svc.getFundMoicRankingSources).toHaveBeenCalledTimes(0);
  expect(svc.resolveFundCalculationMode).toHaveBeenCalledTimes(0);
  expect(svc.buildRoundsToModelEvidence).toHaveBeenCalledTimes(0);
  expect(svc.resolveMoicActionability).toHaveBeenCalledTimes(0);
  expect(svc.buildMarginalReserveMoicInputs).toHaveBeenCalledTimes(0);
  expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 101, role: 'admin', fundIds: [1] };
  featureState.enabled = true;
  svc.getFundMoicRankingSources.mockResolvedValue(SOURCES);
  svc.resolveFundCalculationMode.mockResolvedValue({ effectiveMode: 'on' });
  svc.buildRoundsToModelEvidence.mockResolvedValue(EVIDENCE);
  svc.resolveMoicActionability.mockResolvedValue({ actionability: 'actionable' });
  svc.buildMarginalReserveMoicInputs.mockResolvedValue(inputAssembly());
});

describe('marginal reserve MOIC rankings route', () => {
  it('requires authentication before every route service read', async () => {
    authState.user = null;

    const response = await getRankings();

    expect(response.status).toBe(401);
    expectNoRouteReads();
  });

  it.each([
    ['LP-carrying admin', { id: 101, role: 'admin', fundIds: [1], lpId: 1 }],
    ['ordinary LP with fund access', { id: 101, role: 'user', fundIds: [1], lpId: 1 }],
    ['viewer', { id: 101, role: 'viewer', fundIds: [1] }],
    ['operator', { id: 101, role: 'operator', fundIds: [1] }],
    ['service', { id: 101, role: 'service', fundIds: [1] }],
  ])('rejects %s before every route service read', async (_label, user) => {
    authState.user = user;

    const response = await getRankings();

    expect(response.status).toBe(403);
    expectNoRouteReads();
  });

  it.each(['admin', 'partner', 'analyst'])('allows a non-LP %s', async (role) => {
    authState.user = { id: 101, role, fundIds: [1] };

    const response = await getRankings();

    expect(response.status).toBe(200);
    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(0);
  });

  it('preserves analyst universal safe-read access to another fund', async () => {
    authState.user = { id: 101, role: 'analyst', fundIds: [2] };

    const response = await getRankings();

    expect(response.status).toBe(200);
    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(0);
  });

  it('returns 404 without service reads when the server flag is off', async () => {
    featureState.enabled = false;

    const response = await getRankings('/api/funds/1/moic/marginal-rankings?asOfDate=07-12-2026');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
    expectNoRouteReads();
  });

  it.each([
    '/api/funds/1/moic/marginal-rankings',
    '/api/funds/1/moic/marginal-rankings?asOfDate=07-12-2026',
  ])('rejects a missing or invalid asOfDate without service reads: %s', async (path) => {
    const response = await getRankings(path);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'invalid_as_of_date',
      message: 'asOfDate must be provided as YYYY-MM-DD',
    });
    expectNoRouteReads();
  });

  it('returns 404 after source and mode reads when effective mode is off', async () => {
    svc.resolveFundCalculationMode.mockResolvedValue({ effectiveMode: 'off' });

    const response = await getRankings();

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
    expect(svc.getFundMoicRankingSources).toHaveBeenCalledTimes(1);
    expect(svc.resolveFundCalculationMode).toHaveBeenCalledTimes(1);
    expect(svc.resolveFundCalculationMode).toHaveBeenCalledWith({ fundId: 1, sources: SOURCES });
    expect(svc.buildRoundsToModelEvidence).toHaveBeenCalledTimes(0);
    expect(svc.resolveMoicActionability).toHaveBeenCalledTimes(0);
    expect(svc.buildMarginalReserveMoicInputs).toHaveBeenCalledTimes(0);
    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(0);
  });

  it('returns sorted V2 shadow rankings as non-actionable even when H9 is actionable', async () => {
    svc.resolveFundCalculationMode.mockResolvedValue({ effectiveMode: 'shadow' });

    const response = await getRankings();

    expect(response.status).toBe(200);
    const parsed = MarginalReserveRankingsResponseV2Schema.parse(response.body);
    expect(parsed).toMatchObject({ mode: 'shadow', actionability: 'non_actionable' });
    expect(parsed.rankings.map((ranking) => [ranking.companyId, ranking.status])).toEqual([
      [1, 'actionable'],
      [4, 'actionable'],
      [2, 'indicative'],
    ]);
    expect(parsed.unavailable).toEqual([{ companyId: 3, reasons: ['MISSING_CURRENT_OWNERSHIP'] }]);
    expect(parsed.rankings[0]?.result).not.toHaveProperty('companyId');

    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(1);
    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledWith({
      fundId: 1,
      plannedRankings: PLANNED_RANKINGS,
      marginalRankings: parsed.rankings,
      unavailable: parsed.unavailable,
    });

    const [emittedInput] = svc.emitMarginalReserveMoicShadowComparison.mock.calls[0];
    expect(emittedInput.plannedRankings.length).toBeGreaterThan(0);
    for (const planned of emittedInput.plannedRankings) {
      expect(typeof planned.investmentId).toBe('string');
      expect(planned.investmentId.length).toBeGreaterThan(0);
    }
    for (const marginal of emittedInput.marginalRankings) {
      expect(typeof marginal.companyId).toBe('number');
    }
  });

  it.each(['input_only', 'non_actionable', 'quarantined', 'unknown_legacy'] as const)(
    'returns on/non_actionable when H9 resolves %s',
    async (h9Actionability) => {
      svc.resolveMoicActionability.mockResolvedValue({ actionability: h9Actionability });

      const response = await getRankings();

      expect(response.status).toBe(200);
      expect(MarginalReserveRankingsResponseV2Schema.parse(response.body)).toMatchObject({
        mode: 'on',
        actionability: 'non_actionable',
      });
      expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(0);
    }
  );

  it('returns on/actionable and invokes every resolver once in strict sequence', async () => {
    const response = await getRankings();

    expect(response.status).toBe(200);
    expect(MarginalReserveRankingsResponseV2Schema.parse(response.body)).toMatchObject({
      contractVersion: 'marginal-reserve-rankings-v2',
      mode: 'on',
      actionability: 'actionable',
    });
    expect(svc.getFundMoicRankingSources).toHaveBeenCalledTimes(1);
    expect(svc.getFundMoicRankingSources).toHaveBeenCalledWith(1);
    expect(svc.resolveFundCalculationMode).toHaveBeenCalledTimes(1);
    expect(svc.resolveFundCalculationMode).toHaveBeenCalledWith({ fundId: 1, sources: SOURCES });
    expect(svc.resolveFundCalculationMode.mock.calls[0]?.[0]?.sources).toBe(SOURCES);
    expect(svc.buildRoundsToModelEvidence).toHaveBeenCalledTimes(1);
    expect(svc.buildRoundsToModelEvidence).toHaveBeenCalledWith({ fundId: 1 });
    expect(svc.resolveMoicActionability).toHaveBeenCalledTimes(1);
    expect(svc.resolveMoicActionability).toHaveBeenCalledWith({
      fundId: 1,
      sources: SOURCES,
      evidence: EVIDENCE,
    });
    expect(svc.resolveMoicActionability.mock.calls[0]?.[0]?.sources).toBe(SOURCES);
    expect(svc.buildMarginalReserveMoicInputs).toHaveBeenCalledTimes(1);
    expect(svc.buildMarginalReserveMoicInputs).toHaveBeenCalledWith({
      fundId: 1,
      asOfDate: '2026-07-12',
    });
    expect(svc.getFundMoicRankingSources.mock.invocationCallOrder[0]).toBeLessThan(
      svc.resolveFundCalculationMode.mock.invocationCallOrder[0]
    );
    expect(svc.resolveFundCalculationMode.mock.invocationCallOrder[0]).toBeLessThan(
      svc.buildRoundsToModelEvidence.mock.invocationCallOrder[0]
    );
    expect(svc.buildRoundsToModelEvidence.mock.invocationCallOrder[0]).toBeLessThan(
      svc.resolveMoicActionability.mock.invocationCallOrder[0]
    );
    expect(svc.resolveMoicActionability.mock.invocationCallOrder[0]).toBeLessThan(
      svc.buildMarginalReserveMoicInputs.mock.invocationCallOrder[0]
    );
    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(0);
  });

  it('keeps an empty ranking set non-actionable', async () => {
    svc.buildMarginalReserveMoicInputs.mockResolvedValue(inputAssembly({ ready: [] }));

    const response = await getRankings();

    expect(response.status).toBe(200);
    const parsed = MarginalReserveRankingsResponseV2Schema.parse(response.body);
    expect(parsed.rankings).toEqual([]);
    expect(parsed.actionability).toBe('non_actionable');
    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(0);
  });

  it('keeps all-indicative rankings non-actionable', async () => {
    svc.buildMarginalReserveMoicInputs.mockResolvedValue(
      inputAssembly({
        ready: [
          marginalInput({
            companyId: 2,
            exitValuation: '30000000',
            readiness: { status: 'indicative', reasons: ['STALE_ASSUMPTION'] },
          }),
        ],
        unavailable: [],
      })
    );

    const response = await getRankings();

    expect(response.status).toBe(200);
    const parsed = MarginalReserveRankingsResponseV2Schema.parse(response.body);
    expect(parsed.rankings.map((ranking) => ranking.status)).toEqual(['indicative']);
    expect(parsed.actionability).toBe('non_actionable');
    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(0);
  });

  it('preserves sorted all-unavailable date-mismatch assembly as non-actionable', async () => {
    svc.buildMarginalReserveMoicInputs.mockResolvedValue(
      inputAssembly({
        ready: [],
        unavailable: [
          { companyId: 3, reasons: ['CURRENT_STATE_DATE_MISMATCH'] },
          { companyId: 1, reasons: ['CURRENT_STATE_DATE_MISMATCH'] },
        ],
      })
    );

    const response = await getRankings();

    expect(response.status).toBe(200);
    const parsed = MarginalReserveRankingsResponseV2Schema.parse(response.body);
    expect(parsed.rankings).toEqual([]);
    expect(parsed.unavailable.map((item) => item.companyId)).toEqual([1, 3]);
    expect(
      parsed.unavailable.every((item) => item.reasons.includes('CURRENT_STATE_DATE_MISMATCH'))
    ).toBe(true);
    expect(parsed.actionability).toBe('non_actionable');
    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(0);
  });

  it('propagates H9 failures to the existing 500 path without a V2 response', async () => {
    svc.resolveMoicActionability.mockRejectedValue(new Error('H9 unavailable'));

    const response = await getRankings();

    expect(response.status).toBe(500);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
      requestId: response.headers['x-request-id'],
      ts: expect.any(String),
    });
    expect(response.body).not.toHaveProperty('contractVersion');
    expect(response.body).not.toHaveProperty('actionability');
    expect(svc.getFundMoicRankingSources).toHaveBeenCalledTimes(1);
    expect(svc.resolveFundCalculationMode).toHaveBeenCalledTimes(1);
    expect(svc.buildRoundsToModelEvidence).toHaveBeenCalledTimes(1);
    expect(svc.resolveMoicActionability).toHaveBeenCalledTimes(1);
    expect(svc.buildMarginalReserveMoicInputs).toHaveBeenCalledTimes(0);
    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(0);
  });

  it('rejects a non-numeric fund ID with the sibling guard status', async () => {
    const response = await getRankings(
      '/api/funds/not-a-number/moic/marginal-rankings?asOfDate=2026-07-12'
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Bad Request', message: 'Invalid fund ID' });
    expectNoRouteReads();
  });

  it('fails a shadow read closed through the shared error contract when comparison emission throws', async () => {
    svc.resolveFundCalculationMode.mockResolvedValue({ effectiveMode: 'shadow' });
    svc.emitMarginalReserveMoicShadowComparison.mockImplementationOnce(() => {
      throw new Error('shadow comparison unavailable');
    });

    const response = await getRankings();

    expect(response.status).toBe(500);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
      requestId: response.headers['x-request-id'],
      ts: expect.any(String),
    });
    expect(response.body).not.toHaveProperty('contractVersion');
    expect(response.body).not.toHaveProperty('actionability');
    expect(svc.emitMarginalReserveMoicShadowComparison).toHaveBeenCalledTimes(1);
  });
});
