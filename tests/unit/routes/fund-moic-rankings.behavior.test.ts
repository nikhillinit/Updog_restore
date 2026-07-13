import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FundMoicRankingsResponseV2Schema } from '../../../shared/contracts/fund-moic-v2.contract';
import type { FundMoicRankingSources } from '../../../server/services/fund-moic-ranking-service';
import type {
  FundCalculationModePreview,
  MoicActionabilityResult,
} from '../../../server/services/fund-calculation-mode-service';

const authState = vi.hoisted(() => ({
  user: null as null | { id: number | string; sub?: string; role: string; fundIds: number[] },
}));

const svc = vi.hoisted(() => ({
  getFundMoicRankingSources: vi.fn(),
  getLatestCompletedMoicReconciliation: vi.fn(),
  resolveFundCalculationMode: vi.fn(),
  resolveMoicActionability: vi.fn(),
  buildRoundsToModelEvidence: vi.fn(),
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

const generatedAt = '2026-06-24T00:00:00.000Z';
const USER = { id: 101, role: 'admin', fundIds: [1] };

function rankingItem(investmentId: string, value: number) {
  return {
    rank: 1,
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
      sourceVersion: 'moic-exit-probability-v1',
      explicitExitProbabilityCount: 1,
      defaultedExitProbabilityCount: 0,
      activationBlockingDefaultedExitProbabilityCount: 0,
      explicitReserveExitMultipleCount: 1,
      defaultedReserveExitMultipleCount: 0,
      activationBlockingDefaultedReserveExitMultipleCount: 0,
    },
    moicSourceInputHash: 'moic-source-input-a',
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
});

describe('fund MOIC rankings route - behavioral state machine', () => {
  it('returns a schema-valid V2 legacy response for contract=v2 by default', async () => {
    const res = await getRankings();

    expect(res.status).toBe(200);
    const parsed = FundMoicRankingsResponseV2Schema.parse(res.body);
    expect(parsed.provenance.mode).toBe('legacy');
    expect(parsed.rankings[0]?.investmentId).toBe('legacy-output-a');
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

  it('returns the unchanged V1 payload when no contract query is provided', async () => {
    const sources = sourceBundle();
    svc.getFundMoicRankingSources.mockResolvedValue(sources);

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
  });
});
