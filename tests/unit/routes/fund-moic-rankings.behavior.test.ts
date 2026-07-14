import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FundMoicRankingsResponseV2Schema } from '../../../shared/contracts/fund-moic-v2.contract';
import type { FundMoicFactsBasisV1 } from '../../../shared/contracts/fund-moic-v1.contract';
import type { FundMoicRankingSources } from '../../../server/services/fund-moic-ranking-service';
import type {
  FundCalculationModePreview,
  MoicActionabilityResult,
} from '../../../server/services/fund-calculation-mode-service';

const authState = vi.hoisted(() => ({
  user: null as null | { id: number | string; sub?: string; role: string; fundIds: number[] },
}));

const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

const svc = vi.hoisted(() => ({
  getFundMoicRankingSources: vi.fn(),
  getLatestCompletedMoicReconciliation: vi.fn(),
  resolveFundCalculationMode: vi.fn(),
  resolveMoicActionability: vi.fn(),
  buildRoundsToModelEvidence: vi.fn(),
  buildFundCompanyActualsFacts: vi.fn(),
}));

vi.mock('../../../server/services/fund-moic-ranking-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-moic-ranking-service')>();
  return { ...actual, getFundMoicRankingSources: svc.getFundMoicRankingSources };
});

vi.mock('../../../server/services/fund-moic-reconciliation-service', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../server/services/fund-moic-reconciliation-service')
    >();
  return {
    ...actual,
    getLatestCompletedMoicReconciliation: svc.getLatestCompletedMoicReconciliation,
  };
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

vi.mock(
  '../../../server/services/fund-actuals/fund-company-actuals-facts-service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../server/services/fund-actuals/fund-company-actuals-facts-service')
      >();
    return {
      ...actual,
      buildFundCompanyActualsFacts: svc.buildFundCompanyActualsFacts,
    };
  }
);

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

vi.mock('../../../server/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/logger')>();
  const mockedLogger = Object.create(actual.logger) as typeof actual.logger;
  mockedLogger.info = log.info;
  mockedLogger.warn = log.warn;
  return {
    ...actual,
    logger: mockedLogger,
  };
});

import fundMoicRouter from '../../../server/routes/fund-moic';

const generatedAt = '2026-06-24T00:00:00.000Z';
const USER = { id: 101, role: 'admin', fundIds: [1] };
const FACTS_INPUT_HASH = 'f'.repeat(64);

function factsBasis(overrides: Partial<FundMoicFactsBasisV1> = {}): FundMoicFactsBasisV1 {
  return {
    rankability: 'actionable' as const,
    reasons: ['planning_fmv_active' as const],
    observedInitialInvestment: '500000',
    observedFollowOnInvestment: '125000',
    observedTotalInvestment: '625000',
    valuationAnchor: {
      kind: 'planning_fmv' as const,
      value: '1500000',
      asOfDate: '2026-07-01',
    },
    planningFmvStatus: 'active' as const,
    currencyStatus: 'base_currency' as const,
    factsInputHash: FACTS_INPUT_HASH,
    warnings: [],
    ...overrides,
  };
}

function actualsFactsResponse() {
  return {
    fundId: 1,
    asOfDate: '2026-07-13',
    inputHash: FACTS_INPUT_HASH,
    generatedAt: '2026-07-13T00:00:00.000Z',
    facts: [
      {
        companyId: 1,
        provenance: { trustState: 'LIVE' as const },
      },
    ],
  };
}

function rankingItem(investmentId: string, value: number, rank = 1) {
  return {
    rank,
    investmentId,
    investmentName: investmentId,
    reservesMoic: { value, description: 'desc', formula: 'formula' },
  };
}

function sourceBundle(overrides: Partial<FundMoicRankingSources> = {}): FundMoicRankingSources {
  return {
    legacy: {
      fundId: 1,
      provenance: {
        source: 'portfolio_companies',
        calculation: 'reserves_moic_rankings',
        metricBasis: 'planned_reserves',
        sourceRecordCount: 1,
      },
      generatedAt,
      rankings: [rankingItem('legacy-output-a', 1.2)],
    },
    candidate: {
      fundId: 1,
      provenance: {
        source: 'portfolio_companies',
        calculation: 'reserves_moic_rankings',
        metricBasis: 'planned_reserves',
        sourceRecordCount: 1,
      },
      generatedAt,
      rankings: [rankingItem('candidate-output-a', 2.4)],
    },
    moicInputSummary: {
      sourceVersion: 'moic-round-fmv-facts-v2',
      explicitExitProbabilityCount: 1,
      defaultedExitProbabilityCount: 0,
      activationBlockingDefaultedExitProbabilityCount: 0,
      explicitReserveExitMultipleCount: 1,
      defaultedReserveExitMultipleCount: 0,
      activationBlockingDefaultedReserveExitMultipleCount: 0,
    },
    moicSourceInputHash: 'moic-source-input-a',
    factsSource: { status: 'available' as const, response: actualsFactsResponse() },
    ...overrides,
  };
}

function modePreview(
  overrides: Partial<FundCalculationModePreview> = {}
): FundCalculationModePreview {
  return {
    calculationKey: 'fund_moic_rankings_exit_probability',
    configuredMode: 'off',
    effectiveMode: 'off',
    killSwitchActive: false,
    shadowStartedAt: null,
    eligibleAt: null,
    residencyDaysRequired: 7,
    residencyStatus: 'not_applicable',
    currentSourceMatchesAccepted: false,
    unreconciledEditsPresent: false,
    blockers: [],
    version: 0,
    ...overrides,
  };
}

function actionability(overrides: Partial<MoicActionabilityResult> = {}): MoicActionabilityResult {
  const status = overrides.actionability ?? 'non_actionable';
  return {
    sourceFingerprintMatches: false,
    actionability: status,
    actionabilityStatus: status,
    acceptedReconciliationRunId: null,
    sourceFingerprint: {
      moicSourceInputHash: 'moic-source-input-a',
      roundEvidenceInputHash: 'round-evidence-input-a',
      roundEvidenceAssumptionsHash: 'round-evidence-assumptions-a',
      fingerprintHash: 'fingerprint-a',
      policyVersion: 'h9-policy-v1',
    },
    ...overrides,
  };
}

function roundsEvidence(warningCodes: string[] = []) {
  return {
    coverage: {
      activeRoundCount: 2,
      activeOverrideCount: 1,
      warningsByCode: Object.fromEntries(warningCodes.map((code) => [code, 1])),
    },
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

function getRankings(path = '/api/funds/1/moic/rankings?contract=v2') {
  return request(buildApp()).get(path);
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = USER;
  svc.getFundMoicRankingSources.mockResolvedValue(sourceBundle());
  svc.getLatestCompletedMoicReconciliation.mockResolvedValue(null);
  svc.resolveFundCalculationMode.mockResolvedValue(modePreview());
  svc.resolveMoicActionability.mockResolvedValue(actionability());
  svc.buildRoundsToModelEvidence.mockResolvedValue(roundsEvidence());
  svc.buildFundCompanyActualsFacts.mockResolvedValue(actualsFactsResponse());
});

describe('fund MOIC rankings route - behavioral state machine', () => {
  it('returns a schema-valid V2 legacy response for contract=v2 by default', async () => {
    const res = await getRankings();

    expect(res.status).toBe(200);
    const parsed = FundMoicRankingsResponseV2Schema.parse(res.body);
    expect(parsed.provenance.mode).toBe('legacy');
    expect(parsed.rankings[0]?.investmentId).toBe('legacy-output-a');
  });

  it('attaches available facts basis without changing ranking values or order', async () => {
    const before = sourceBundle();
    const after = sourceBundle({
      factsBasisByInvestmentId: new Map([
        ['legacy-output-a', factsBasis()],
        ['candidate-output-a', factsBasis()],
      ]),
    });
    svc.getFundMoicRankingSources.mockResolvedValue(after);

    const res = await getRankings();

    expect(res.status).toBe(200);
    const parsed = FundMoicRankingsResponseV2Schema.parse(res.body);
    expect(parsed.rankings.map(({ factsBasis: _factsBasis, ...ranking }) => ranking)).toEqual(
      before.legacy.rankings
    );
    expect(parsed.rankings.some((ranking) => ranking.factsBasis !== null)).toBe(true);
    expect(svc.buildFundCompanyActualsFacts).not.toHaveBeenCalled();
    expect(svc.getFundMoicRankingSources).toHaveBeenCalledWith(1);
  });

  it.each([
    {
      mode: 'off' as const,
      actionability: 'non_actionable' as const,
      expectedSource: 'legacy' as const,
    },
    {
      mode: 'shadow' as const,
      actionability: 'non_actionable' as const,
      expectedSource: 'legacy' as const,
    },
    {
      mode: 'on' as const,
      actionability: 'actionable' as const,
      expectedSource: 'candidate' as const,
    },
  ])(
    'keeps $mode mode ranking values identical while adding disclosure',
    async ({ mode, actionability: actionabilityStatus, expectedSource }) => {
      const before = sourceBundle();
      svc.getFundMoicRankingSources.mockResolvedValue(
        sourceBundle({
          factsBasisByInvestmentId: new Map([
            ['legacy-output-a', factsBasis()],
            [
              'candidate-output-a',
              factsBasis({ rankability: 'indicative', reasons: ['planning_fmv_stale'] }),
            ],
          ]),
          candidateFactsBasisByInvestmentId: new Map([['candidate-output-a', factsBasis()]]),
        })
      );
      svc.resolveFundCalculationMode.mockResolvedValue(
        modePreview({ configuredMode: mode, effectiveMode: mode })
      );
      svc.resolveMoicActionability.mockResolvedValue(
        actionability({
          actionability: actionabilityStatus,
          actionabilityStatus,
          sourceFingerprintMatches: actionabilityStatus === 'actionable',
        })
      );

      const res = await getRankings();

      expect(res.status).toBe(200);
      const parsed = FundMoicRankingsResponseV2Schema.parse(res.body);
      expect(parsed.rankings.map(({ factsBasis: _factsBasis, ...ranking }) => ranking)).toEqual(
        before[expectedSource].rankings
      );
      expect(parsed.rankings.some((ranking) => ranking.factsBasis !== null)).toBe(true);
      expect(parsed.rankings[0]?.factsBasis?.rankability).toBe('actionable');
    }
  );

  it('keeps HTTP behavior unchanged and returns null bases when the facts load fails', async () => {
    svc.getFundMoicRankingSources.mockResolvedValue(
      Object.assign(sourceBundle(), { factsSource: { status: 'absent' as const } })
    );
    svc.buildFundCompanyActualsFacts.mockRejectedValueOnce(new Error('facts backend down'));

    const res = await getRankings();

    expect(res.status).toBe(200);
    const parsed = FundMoicRankingsResponseV2Schema.parse(res.body);
    expect(parsed.actualsProvenanceSummary).toMatchObject({
      factsStatus: 'failed',
      factsInputHash: null,
      warnings: ['actuals_facts_failed'],
    });
    expect(parsed.rankings.every((ranking) => ranking.factsBasis === null)).toBe(true);
    expect(svc.buildFundCompanyActualsFacts).not.toHaveBeenCalled();
  });

  it('never serves the candidate when the facts load fails, even if mode state is otherwise on', async () => {
    svc.getFundMoicRankingSources.mockResolvedValue(
      Object.assign(sourceBundle(), { factsSource: { status: 'absent' as const } })
    );
    svc.buildFundCompanyActualsFacts.mockRejectedValueOnce(new Error('facts backend down'));
    svc.resolveFundCalculationMode.mockResolvedValue(
      modePreview({ configuredMode: 'on', effectiveMode: 'on' })
    );
    svc.resolveMoicActionability.mockResolvedValue(
      actionability({
        sourceFingerprintMatches: true,
        actionability: 'actionable',
        actionabilityStatus: 'actionable',
      })
    );

    const res = await getRankings();

    expect(res.status).toBe(200);
    const parsed = FundMoicRankingsResponseV2Schema.parse(res.body);
    expect(parsed.provenance.mode).toBe('legacy');
    expect(parsed.rankings[0]?.investmentId).toBe('legacy-output-a');
    expect(svc.getFundMoicRankingSources).toHaveBeenCalledWith(1);
  });

  it.each(['shadow', 'on'] as const)(
    'emits one privacy-bounded facts-basis comparison when effective mode is %s',
    async (mode) => {
      const base = sourceBundle();
      const legacyRankings = [1, 2, 3, 4, 5, 6].map((companyId) =>
        rankingItem(String(companyId), companyId, companyId)
      );
      const candidateRankings = legacyRankings.map((ranking) => ({
        ...ranking,
        reservesMoic: { ...ranking.reservesMoic, value: (ranking.reservesMoic.value ?? 0) + 10 },
      }));
      svc.getFundMoicRankingSources.mockResolvedValue(
        sourceBundle({
          legacy: {
            ...base.legacy,
            provenance: { ...base.legacy.provenance, sourceRecordCount: 6 },
            rankings: legacyRankings,
          },
          candidate: {
            ...base.candidate,
            provenance: { ...base.candidate.provenance, sourceRecordCount: 6 },
            rankings: candidateRankings,
          },
          moicInputSummary: {
            ...base.moicInputSummary,
            defaultedExitProbabilityCount: 2,
            defaultedReserveExitMultipleCount: 1,
          },
          factsBasisByInvestmentId: new Map([
            ['1', factsBasis({ rankability: 'indicative', reasons: ['planning_fmv_stale'] })],
            ['2', factsBasis()],
            [
              '3',
              factsBasis({
                rankability: 'not_actionable',
                reasons: ['currency_blocked'],
                currencyStatus: 'mismatch_blocked',
                valuationAnchor: { kind: 'none', value: null, asOfDate: null },
              }),
            ],
            ['4', factsBasis()],
            ['5', factsBasis({ rankability: 'indicative', reasons: ['planning_fmv_stale'] })],
            ['6', factsBasis()],
          ]),
        })
      );
      svc.resolveFundCalculationMode.mockResolvedValue(
        modePreview({ configuredMode: mode, effectiveMode: mode })
      );
      svc.resolveMoicActionability.mockResolvedValue(
        actionability({
          actionability: mode === 'on' ? 'actionable' : 'non_actionable',
          actionabilityStatus: mode === 'on' ? 'actionable' : 'non_actionable',
          sourceFingerprintMatches: mode === 'on',
        })
      );

      const res = await getRankings();

      expect(res.status).toBe(200);
      expect(log.info).toHaveBeenCalledTimes(1);
      const [bindings, message] = log.info.mock.calls[0] ?? [];
      expect(Object.keys(bindings ?? {}).sort()).toEqual(
        [
          'actionableCount',
          'companyCount',
          'currencyBlockedCount',
          'defaultedExitProbabilityCount',
          'defaultedReserveExitMultipleCount',
          'durationMs',
          'factsEligibleTopCompanyId',
          'factsInputHash',
          'fundId',
          'indicativeCount',
          'legacyTopCompanyId',
          'notActionableCount',
          'topNOverlap',
        ].sort()
      );
      expect(bindings).toMatchObject({
        fundId: 1,
        factsInputHash: 'ffffffffffff',
        companyCount: 6,
        actionableCount: 3,
        indicativeCount: 2,
        notActionableCount: 1,
        legacyTopCompanyId: 1,
        factsEligibleTopCompanyId: 2,
        topNOverlap: 2,
        defaultedExitProbabilityCount: 2,
        defaultedReserveExitMultipleCount: 1,
        currencyBlockedCount: 1,
        durationMs: expect.any(Number),
      });
      expect(bindings?.durationMs).toBeGreaterThanOrEqual(0);
      expect(message).toBe('fund-moic facts-basis shadow comparison generated');
      expect(JSON.stringify(bindings)).not.toMatch(
        /legacy-output|candidate-output|Acme|observed|valuationAnchor|reservesMoic/
      );
    }
  );

  it('emits no facts-basis comparison when effective mode is off', async () => {
    const res = await getRankings();

    expect(res.status).toBe(200);
    expect(log.info).not.toHaveBeenCalled();
  });

  it('emits an unavailable comparison without leaking values when shadow facts fail', async () => {
    svc.getFundMoicRankingSources.mockResolvedValue(
      Object.assign(sourceBundle(), { factsSource: { status: 'absent' as const } })
    );
    svc.buildFundCompanyActualsFacts.mockRejectedValueOnce(new Error('facts backend down'));
    svc.resolveFundCalculationMode.mockResolvedValue(
      modePreview({ configuredMode: 'shadow', effectiveMode: 'shadow' })
    );

    const res = await getRankings();

    expect(res.status).toBe(200);
    expect(log.info).toHaveBeenCalledWith(
      {
        fundId: 1,
        factsInputHash: null,
        companyCount: 1,
        actionableCount: 0,
        indicativeCount: 0,
        notActionableCount: 0,
        legacyTopCompanyId: null,
        factsEligibleTopCompanyId: null,
        topNOverlap: 0,
        defaultedExitProbabilityCount: 0,
        defaultedReserveExitMultipleCount: 0,
        currencyBlockedCount: 0,
        durationMs: expect.any(Number),
      },
      'fund-moic facts-basis shadow comparison generated'
    );
  });

  it('keeps the response successful when facts-basis telemetry logging throws', async () => {
    svc.resolveFundCalculationMode.mockResolvedValue(
      modePreview({ configuredMode: 'shadow', effectiveMode: 'shadow' })
    );
    log.info.mockImplementationOnce(() => {
      throw new Error('logger unavailable');
    });

    const res = await getRankings();

    expect(res.status).toBe(200);
    expect(log.info).toHaveBeenCalledTimes(1);
  });

  it('returns candidate rankings when mode is on and actionability is actionable', async () => {
    svc.resolveFundCalculationMode.mockResolvedValue(
      modePreview({ configuredMode: 'on', effectiveMode: 'on' })
    );
    svc.resolveMoicActionability.mockResolvedValue(
      actionability({
        sourceFingerprintMatches: true,
        actionability: 'actionable',
        actionabilityStatus: 'actionable',
      })
    );

    const res = await getRankings();

    expect(res.status).toBe(200);
    const parsed = FundMoicRankingsResponseV2Schema.parse(res.body);
    expect(parsed.provenance.mode).toBe('candidate');
    expect(parsed.rankings[0]?.investmentId).toBe('candidate-output-a');
  });

  it('keeps legacy rankings and surfaces blocker state when the kill switch is active', async () => {
    svc.resolveFundCalculationMode.mockResolvedValue(
      modePreview({
        configuredMode: 'on',
        effectiveMode: 'off',
        killSwitchActive: true,
        blockers: ['kill_switch_active'],
      })
    );

    const res = await getRankings();

    expect(res.status).toBe(200);
    const parsed = FundMoicRankingsResponseV2Schema.parse(res.body);
    expect(parsed.provenance.mode).toBe('legacy');
    expect(parsed.modePreview.killSwitchActive).toBe(true);
    expect(parsed.modePreview.blockers).toContain('kill_switch_active');
    expect(parsed.rankings[0]?.investmentId).toBe('legacy-output-a');
  });

  it('propagates stale materiality when the latest reconciliation fingerprint no longer matches', async () => {
    svc.getLatestCompletedMoicReconciliation.mockResolvedValue({
      runId: '55',
      createdAt: generatedAt,
      candidateInputHash: 'moic-source-input-a',
      evidenceInputHash: 'old-round-evidence',
      candidateMaterial: true,
    });
    svc.resolveMoicActionability.mockResolvedValue(
      actionability({ sourceFingerprintMatches: false })
    );

    const res = await getRankings();

    expect(res.status).toBe(200);
    const parsed = FundMoicRankingsResponseV2Schema.parse(res.body);
    expect(parsed.materiality.status).toBe('stale');
    expect(parsed.latestReconciliation).toMatchObject({
      currentInputMatches: true,
      sourceFingerprintMatches: false,
    });
  });

  it('propagates round evidence warning codes verbatim', async () => {
    svc.buildRoundsToModelEvidence.mockResolvedValue(
      roundsEvidence(['ROUND_MODEL_OVERRIDE_APPLIED', 'UNKNOWN_WARNING'])
    );

    const res = await getRankings();

    expect(res.status).toBe(200);
    const parsed = FundMoicRankingsResponseV2Schema.parse(res.body);
    expect(parsed.roundEvidenceSummary.warningCodes).toEqual([
      'ROUND_MODEL_OVERRIDE_APPLIED',
      'UNKNOWN_WARNING',
    ]);
  });

  it('rejects unsupported contracts', async () => {
    const res = await getRankings('/api/funds/1/moic/rankings?contract=v3');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_contract' });
  });

  it('serves unchanged legacy V1 output when mode is on but facts are unavailable', async () => {
    const sources = Object.assign(sourceBundle(), {
      factsSource: { status: 'absent' as const },
    });
    svc.getFundMoicRankingSources.mockResolvedValue(sources);
    svc.resolveFundCalculationMode.mockResolvedValue(
      modePreview({ configuredMode: 'on', effectiveMode: 'on' })
    );
    svc.resolveMoicActionability.mockResolvedValue(
      actionability({ actionability: 'non_actionable', actionabilityStatus: 'non_actionable' })
    );

    const res = await getRankings('/api/funds/1/moic/rankings');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...sources.legacy,
      rankings: sources.legacy.rankings.map((ranking) => ({ ...ranking, factsBasis: null })),
    });
    expect(res.body).not.toHaveProperty('modePreview');
    expect(res.body).not.toHaveProperty('materiality');
    expect(res.body).not.toHaveProperty('latestReconciliation');
    expect(res.body).not.toHaveProperty('roundEvidenceSummary');
    expect(res.body.rankings[0]?.factsBasis).toBeNull();
    expect(svc.getFundMoicRankingSources).toHaveBeenCalledWith(1);
    expect(svc.resolveMoicActionability).toHaveBeenCalledWith({ fundId: 1, sources });
    expect(svc.buildFundCompanyActualsFacts).not.toHaveBeenCalled();
  });
});
