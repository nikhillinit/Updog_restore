import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MoicActionabilityResult } from '../../../server/services/fund-calculation-mode-service';
import type { ReserveCompanyInputWithProvenance } from '../../../shared/contracts/reserve-input-provenance.contract';
import type { ReserveSummary } from '../../../shared/types';
import { FLAG_DEFAULTS, FLAG_DEFINITIONS } from '../../../shared/generated/flag-defaults';

const {
  buildFactsReserveCandidates,
  buildReservePortfolioInputWithProvenance,
  eventOrder,
  generateReserveSummary,
  isFlagEnabled,
  loggerInfo,
  modeFindFirst,
  persistedSnapshots,
  resolveMoicActionability,
} = vi.hoisted(() => ({
  buildFactsReserveCandidates: vi.fn(),
  buildReservePortfolioInputWithProvenance: vi.fn(),
  eventOrder: [] as string[],
  generateReserveSummary: vi.fn(),
  isFlagEnabled: vi.fn(),
  loggerInfo: vi.fn(),
  modeFindFirst: vi.fn(),
  persistedSnapshots: [] as Record<string, unknown>[],
  resolveMoicActionability: vi.fn(),
}));

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      fundConfigs: { findFirst: vi.fn(async () => ({ version: 3, isPublished: true })) },
      funds: { findFirst: vi.fn(async () => ({ id: 7, size: '100000000' })) },
      fundCalculationModes: { findFirst: modeFindFirst },
    },
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        persistedSnapshots.push(values);
        eventOrder.push('persist');
        return {
          returning: vi.fn(async () => [
            {
              id: 101,
              createdAt: new Date('2026-07-13T00:00:00.000Z'),
              calcVersion: '1.0.0',
            },
          ]),
        };
      }),
    })),
  },
}));

vi.mock('../../../server/services/fund-calculation-mode-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-calculation-mode-service')>();
  return { ...actual, resolveMoicActionability };
});

vi.mock('../../../server/services/reserve-input-builder', () => ({
  buildReservePortfolioInputWithProvenance,
}));

vi.mock('../../../server/services/reserves/facts-reserve-input-adapter', () => ({
  buildFactsReserveCandidates,
}));

vi.mock('@shared/core/reserves/ReserveEngine', () => ({ generateReserveSummary }));

vi.mock('@shared/flags/getFlag', () => ({ isFlagEnabled }));

vi.mock('../../../server/lib/logger', () => ({
  logger: {
    info: loggerInfo,
    child: vi.fn(() => ({ info: loggerInfo, warn: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock('../../../server/services/calc-run-tracking', () => ({
  markCalcRunCompletedIfReady: vi.fn(async () => undefined),
}));

import { runReserveCalculation } from '../../../server/services/reserve-calculation-service';

const LEGACY_COMPANY: ReserveCompanyInputWithProvenance = {
  id: 11,
  invested: 100,
  ownership: 0.15,
  stage: 'Seed',
  sector: 'SaaS',
  provenance: {
    invested: { status: 'observed', source: 'investments.amount', reason: null },
    ownership: { status: 'defaulted', source: 'system_default_ownership', reason: 'legacy' },
    stage: { status: 'observed', source: 'investments.round', reason: null },
    sector: { status: 'observed', source: 'portfolio_companies.sector', reason: null },
  },
};

const LEGACY_PORTFOLIO = [
  {
    id: LEGACY_COMPANY.id,
    invested: LEGACY_COMPANY.invested,
    ownership: LEGACY_COMPANY.ownership,
    stage: LEGACY_COMPANY.stage,
    sector: LEGACY_COMPANY.sector,
  },
];

const LEGACY_TRUST_SUMMARY = {
  trustedForActivation: false,
  defaultedInputCount: 1,
  unavailableInputCount: 0,
  defaultedFields: ['ownership'] as const,
  unavailableFields: [] as const,
};

const LEGACY_RESERVES: ReserveSummary = {
  fundId: 7,
  totalAllocation: 100,
  avgConfidence: 0.5,
  highConfidenceCount: 0,
  allocations: [{ allocation: 100, confidence: 0.5, rationale: 'legacy' }],
  generatedAt: new Date('2026-07-13T00:00:00.000Z'),
};

const FACTS_INPUT_HASH = 'd'.repeat(64);
const FACTS_COMPANY: ReserveCompanyInputWithProvenance = {
  id: 11,
  invested: 125,
  ownership: 0.2,
  stage: 'Series A',
  sector: 'SaaS',
  provenance: {
    invested: {
      status: 'observed',
      source: 'fund_company_actuals_facts.initialInvestmentAmount+followOnInvestmentAmount',
      reason: null,
    },
    ownership: { status: 'observed', source: 'investments.ownership_percentage', reason: null },
    stage: { status: 'approved_assumption', source: 'approved.stage', reason: null },
    sector: { status: 'observed', source: 'portfolio_companies.sector', reason: null },
  },
};
const FACTS_TRUST_SUMMARY = {
  trustedForActivation: true,
  defaultedInputCount: 0,
  unavailableInputCount: 1,
  defaultedFields: [] as const,
  unavailableFields: ['ownership'] as const,
};
const FACTS_RESERVES: ReserveSummary = {
  fundId: 7,
  totalAllocation: 125,
  avgConfidence: 0.6,
  highConfidenceCount: 1,
  allocations: [{ allocation: 125, confidence: 0.6, rationale: 'facts' }],
  generatedAt: new Date('2026-07-13T00:00:00.000Z'),
};

function actionabilityResult(): MoicActionabilityResult {
  return {
    sourceFingerprintMatches: true,
    actionability: 'actionable',
    actionabilityStatus: 'actionable',
    sourceFingerprint: {
      moicSourceInputHash: 'moic-src-hash',
      roundEvidenceInputHash: 'round-evidence-hash',
      roundEvidenceAssumptionsHash: 'assumptions-hash',
      fingerprintHash: 'fingerprint-hash',
      policyVersion: 'h9-policy-v1',
    },
    acceptedReconciliationRunId: '42',
  };
}

function withoutPersistenceTiming(values: Record<string, unknown>): Record<string, unknown> {
  const { snapshotTime: _snapshotTime, metadata, ...snapshot } = values;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Expected reserve snapshot metadata');
  }
  const { engineRuntime: _engineRuntime, ...stableMetadata } = metadata as Record<string, unknown>;
  return { ...snapshot, metadata: stableMetadata };
}

describe('runReserveCalculation facts-sourced inputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventOrder.length = 0;
    persistedSnapshots.length = 0;
    isFlagEnabled.mockReturnValue(false);
    modeFindFirst.mockResolvedValue(undefined);
    buildReservePortfolioInputWithProvenance.mockResolvedValue({
      portfolio: LEGACY_PORTFOLIO,
      provenancePortfolio: [LEGACY_COMPANY],
      reserveInputTrustSummary: LEGACY_TRUST_SUMMARY,
    });
    generateReserveSummary.mockReturnValue(LEGACY_RESERVES);
    resolveMoicActionability.mockResolvedValue(actionabilityResult());
    buildFactsReserveCandidates.mockResolvedValue({
      candidates: [
        {
          status: 'eligible',
          companyId: 11,
          input: FACTS_COMPANY,
          factsInputHash: 'e'.repeat(64),
        },
        {
          status: 'excluded',
          companyId: 12,
          reasons: ['missing_ownership', 'currency_blocked'],
          factsInputHash: 'f'.repeat(64),
        },
      ],
      factsInputHash: FACTS_INPUT_HASH,
      trustSummary: FACTS_TRUST_SUMMARY,
    });
  });

  it('registers the facts-sourced reserve flag as server-only and off in every environment', () => {
    expect(FLAG_DEFAULTS.enable_facts_sourced_reserve_inputs).toBe(false);
    expect(FLAG_DEFINITIONS.enable_facts_sourced_reserve_inputs).toMatchObject({
      default: false,
      owner: 'analytics',
      exposeToClient: false,
      environments: { development: false, staging: false, production: false },
    });
  });

  it('preserves the pre-change return and persistence shape when the flag is off', async () => {
    const result = await runReserveCalculation({ fundId: 7, correlationId: 'corr-parity' });

    expect(result).toEqual({
      fundId: 7,
      snapshotId: 101,
      reserves: LEGACY_RESERVES,
      calculatedAt: new Date('2026-07-13T00:00:00.000Z'),
      version: '1.0.0',
    });
    expect(generateReserveSummary).toHaveBeenCalledOnce();
    expect(generateReserveSummary).toHaveBeenCalledWith(7, LEGACY_PORTFOLIO);
    expect(persistedSnapshots).toHaveLength(1);
    expect(persistedSnapshots[0]?.snapshotTime).toBeInstanceOf(Date);
    expect(withoutPersistenceTiming(persistedSnapshots[0] ?? {})).toEqual({
      fundId: 7,
      type: 'RESERVE',
      payload: LEGACY_RESERVES,
      calcVersion: '1.0.0',
      correlationId: 'corr-parity',
      h9MoicSourceInputHash: 'moic-src-hash',
      h9RoundEvidenceInputHash: 'round-evidence-hash',
      h9RoundEvidenceAssumptionsHash: 'assumptions-hash',
      h9FingerprintHash: 'fingerprint-hash',
      h9PolicyVersion: 'h9-policy-v1',
      h9ActionabilityStatus: 'actionable',
      metadata: {
        portfolioCount: 1,
        reserveInputTrustSummary: LEGACY_TRUST_SUMMARY,
      },
    });
    expect(modeFindFirst).not.toHaveBeenCalled();
    expect(buildFactsReserveCandidates).not.toHaveBeenCalled();
    expect(loggerInfo).not.toHaveBeenCalled();
  });

  it('uses the legacy path when the flag is on but no mode row exists', async () => {
    isFlagEnabled.mockReturnValue(true);

    const result = await runReserveCalculation({ fundId: 7, correlationId: 'corr-no-mode' });

    expect(result.reserves).toEqual(LEGACY_RESERVES);
    expect(modeFindFirst).toHaveBeenCalledOnce();
    expect(buildFactsReserveCandidates).not.toHaveBeenCalled();
    expect(generateReserveSummary).toHaveBeenCalledOnce();
    expect(generateReserveSummary).toHaveBeenCalledWith(7, LEGACY_PORTFOLIO);
  });

  it('emits aggregate shadow telemetry without changing served values, persistence, or H9', async () => {
    isFlagEnabled.mockReturnValue(true);
    modeFindFirst.mockResolvedValue({ configuredMode: 'shadow', killSwitchActive: false });
    buildFactsReserveCandidates.mockImplementation(async () => {
      eventOrder.push('shadow');
      return {
        candidates: [
          {
            status: 'eligible',
            companyId: 11,
            input: FACTS_COMPANY,
            factsInputHash: 'e'.repeat(64),
          },
          {
            status: 'excluded',
            companyId: 12,
            reasons: ['missing_ownership', 'currency_blocked'],
            factsInputHash: 'f'.repeat(64),
          },
        ],
        factsInputHash: FACTS_INPUT_HASH,
        trustSummary: FACTS_TRUST_SUMMARY,
      };
    });
    generateReserveSummary.mockImplementation((_fundId, portfolio) =>
      portfolio[0]?.invested === FACTS_COMPANY.invested ? FACTS_RESERVES : LEGACY_RESERVES
    );

    const result = await runReserveCalculation({ fundId: 7, correlationId: 'corr-shadow' });

    expect(result.reserves).toEqual(LEGACY_RESERVES);
    expect(eventOrder).toEqual(['persist', 'shadow']);
    expect(generateReserveSummary).toHaveBeenNthCalledWith(1, 7, LEGACY_PORTFOLIO);
    expect(generateReserveSummary).toHaveBeenNthCalledWith(2, 7, [FACTS_COMPANY]);
    expect(persistedSnapshots[0]).toMatchObject({
      payload: LEGACY_RESERVES,
      h9MoicSourceInputHash: 'moic-src-hash',
      h9FingerprintHash: 'fingerprint-hash',
      h9ActionabilityStatus: 'actionable',
      metadata: {
        portfolioCount: 1,
        reserveInputTrustSummary: LEGACY_TRUST_SUMMARY,
      },
    });
    expect(persistedSnapshots[0]?.metadata).not.toHaveProperty('factsBasis');
    expect(loggerInfo).toHaveBeenCalledOnce();
    expect(loggerInfo.mock.calls[0]?.[0]).toEqual({
      eventName: 'reserve_facts_inputs_shadow',
      fundId: 7,
      factsInputHash: FACTS_INPUT_HASH.slice(0, 12),
      eligibleCount: 1,
      excludedCountsByReason: { currency_blocked: 1, missing_ownership: 1 },
      legacyCompanyCount: 1,
      summaryValueDeltaPct: 0.25,
      durationMs: expect.any(Number),
      warningCodes: ['CURRENCY_BLOCKED', 'MISSING_OWNERSHIP'],
    });
    const serializedLog = JSON.stringify(loggerInfo.mock.calls);
    expect(serializedLog).not.toContain('Company 11');
    expect(serializedLog).not.toContain('invested');
    expect(serializedLog).not.toContain('totalAllocation');
  });

  it('does not fail a persisted shadow calculation when facts telemetry cannot be logged', async () => {
    isFlagEnabled.mockReturnValue(true);
    modeFindFirst.mockResolvedValue({ configuredMode: 'shadow', killSwitchActive: false });
    buildFactsReserveCandidates.mockRejectedValue(new Error('facts unavailable'));
    loggerInfo.mockImplementation(() => {
      throw new Error('telemetry unavailable');
    });

    await expect(
      runReserveCalculation({ fundId: 7, correlationId: 'corr-shadow-log-failure' })
    ).resolves.toMatchObject({ reserves: LEGACY_RESERVES });
    expect(persistedSnapshots).toHaveLength(1);
  });

  it('returns to byte-identical legacy behavior on the run after the flag is disabled', async () => {
    isFlagEnabled.mockReturnValueOnce(false).mockReturnValueOnce(true).mockReturnValueOnce(false);
    modeFindFirst.mockResolvedValue({ configuredMode: 'on', killSwitchActive: false });
    generateReserveSummary.mockImplementation((_fundId, portfolio) =>
      portfolio[0]?.invested === FACTS_COMPANY.invested ? FACTS_RESERVES : LEGACY_RESERVES
    );

    const baselineLegacyRun = await runReserveCalculation({
      fundId: 7,
      correlationId: 'corr-legacy',
    });
    const factsRun = await runReserveCalculation({ fundId: 7, correlationId: 'corr-on' });
    const legacyRun = await runReserveCalculation({ fundId: 7, correlationId: 'corr-legacy' });

    expect(factsRun.reserves).toEqual(FACTS_RESERVES);
    expect(legacyRun).toEqual(baselineLegacyRun);
    expect(persistedSnapshots).toHaveLength(3);
    expect(withoutPersistenceTiming(persistedSnapshots[2] ?? {})).toEqual(
      withoutPersistenceTiming(persistedSnapshots[0] ?? {})
    );
    expect(modeFindFirst).toHaveBeenCalledOnce();
    expect(buildFactsReserveCandidates).toHaveBeenCalledOnce();
    expect(buildReservePortfolioInputWithProvenance).toHaveBeenCalledTimes(2);
    expect(generateReserveSummary).toHaveBeenLastCalledWith(7, LEGACY_PORTFOLIO);
  });
});
