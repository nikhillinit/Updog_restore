import { readFile } from 'node:fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MoicActionabilityResult } from '../../../server/services/fund-calculation-mode-service';
import type { H9ActionabilityStatus } from '../../../shared/contracts/h9-actionability.contract';
import type { ReserveSummary } from '../../../shared/types';

const {
  buildFactsReserveCandidates,
  buildRankedReserveAllocation,
  buildRankedShadowTelemetry,
  buildReserveEnvelope,
  buildReservePortfolioInputWithProvenance,
  emitRankedShadowTelemetry,
  enabledFlags,
  eventOrder,
  generateReserveSummary,
  getFundMoicRankingSources,
  isFlagEnabled,
  loggerInfo,
  loggerWarn,
  markCalcRunCompletedIfReady,
  modeFindFirst,
  persistedSnapshots,
  resolveMoicActionability,
  resolveRankedReserveCalculationMode,
  toReserveSummary,
} = vi.hoisted(() => ({
  buildFactsReserveCandidates: vi.fn(),
  buildRankedReserveAllocation: vi.fn(),
  buildRankedShadowTelemetry: vi.fn(),
  buildReserveEnvelope: vi.fn(),
  buildReservePortfolioInputWithProvenance: vi.fn(),
  emitRankedShadowTelemetry: vi.fn(),
  enabledFlags: new Set<string>(),
  eventOrder: [] as string[],
  generateReserveSummary: vi.fn(),
  getFundMoicRankingSources: vi.fn(),
  isFlagEnabled: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  markCalcRunCompletedIfReady: vi.fn(async () => undefined),
  modeFindFirst: vi.fn(),
  persistedSnapshots: [] as Record<string, unknown>[],
  resolveMoicActionability: vi.fn(),
  resolveRankedReserveCalculationMode: vi.fn(),
  toReserveSummary: vi.fn(),
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
              createdAt: new Date('2026-07-19T00:00:00.000Z'),
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

vi.mock('../../../server/services/fund-moic-ranking-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-moic-ranking-service')>();
  return { ...actual, getFundMoicRankingSources };
});

vi.mock('../../../server/services/reserve-input-builder', () => ({
  buildReservePortfolioInputWithProvenance,
}));

vi.mock('../../../server/services/reserves/facts-reserve-input-adapter', () => ({
  buildFactsReserveCandidates,
}));

vi.mock('../../../server/services/ranked-reserve-calc-mode-resolver', () => ({
  resolveRankedReserveCalculationMode,
}));

vi.mock('../../../server/services/reserves/ranked-reserve-orchestrator', () => ({
  buildRankedReserveAllocation,
  buildRankedShadowTelemetry,
  toReserveSummary,
}));

vi.mock('../../../server/services/reserves/reserve-envelope-service', () => ({
  buildReserveEnvelope,
}));

vi.mock('../../../server/services/reserves/ranked-reserve-shadow-telemetry', () => ({
  emitRankedShadowTelemetry,
}));

vi.mock('@shared/core/reserves/ReserveEngine', () => ({ generateReserveSummary }));

vi.mock('@shared/flags/getFlag', () => ({ isFlagEnabled }));

vi.mock('../../../server/lib/logger', () => ({
  logger: {
    info: loggerInfo,
    warn: loggerWarn,
    child: vi.fn(() => ({ info: loggerInfo, warn: loggerWarn, error: vi.fn() })),
  },
}));

vi.mock('../../../server/services/calc-run-tracking', () => ({
  markCalcRunCompletedIfReady,
}));

import { runReserveCalculation } from '../../../server/services/reserve-calculation-service';

const LEGACY_PORTFOLIO = [
  { id: 11, invested: 100, ownership: 0.15, stage: 'Seed' as const, sector: 'SaaS' },
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
  generatedAt: new Date('2026-07-19T00:00:00.000Z'),
};
const FACTS_RESERVES: ReserveSummary = {
  fundId: 7,
  totalAllocation: 125,
  avgConfidence: 0.6,
  highConfidenceCount: 1,
  allocations: [{ allocation: 125, confidence: 0.6, rationale: 'facts' }],
  generatedAt: new Date('2026-07-19T00:00:00.000Z'),
};
const RANKED_RESERVES: ReserveSummary = {
  fundId: 7,
  totalAllocation: 250,
  avgConfidence: 0.7,
  highConfidenceCount: 2,
  allocations: [
    { allocation: 150, confidence: 0.7, rationale: 'ranked first' },
    { allocation: 100, confidence: 0.7, rationale: 'ranked second' },
  ],
  generatedAt: new Date('2026-07-19T00:00:00.000Z'),
};
const ENVELOPE_INPUT_HASH = 'e'.repeat(64);
const FACTS_INPUT_HASH = 'f'.repeat(64);
const ASSUMPTIONS_HASH = 'a'.repeat(64);
const COMPOSED = {
  allocations: [
    {
      companyId: 11,
      id: '11',
      name: 'First',
      stage: 'seed' as const,
      allocated: 150,
      rank: 1,
      marginalMoic: '3.5',
    },
    {
      companyId: 12,
      id: '12',
      name: 'Second',
      stage: 'series_a' as const,
      allocated: 100,
      rank: 2,
      marginalMoic: '2.5',
    },
  ],
  totalAllocated: 250,
  remaining: 0,
  conservationOk: true,
  excluded: [{ companyId: 13, reason: 'indicative' as const }],
  neutralPolicies: [],
  disclosedDefaults: [],
  failSafe: false,
  failSafeReason: null,
  envelopeInputHash: ENVELOPE_INPUT_HASH,
  factsInputHash: FACTS_INPUT_HASH,
  assumptionsHash: ASSUMPTIONS_HASH,
};
const ENVELOPE = {
  contractVersion: 'reserve-envelope-v1' as const,
  fundId: 7,
  asOfDate: '2026-07-19',
  baseCurrency: 'USD',
  availableReservesCents: 25000,
  components: {},
  trustedForActivation: true,
  blocked: false,
  blockReason: null,
  inputHash: ENVELOPE_INPUT_HASH,
};
const RANKED_TELEMETRY = {
  totalAllocationDeltaCents: 15000,
  rankAgreement: true,
  excludedCountsByReason: { unavailable: 0, indicative: 1 },
  envelopeInputHash: ENVELOPE_INPUT_HASH,
  factsInputHash: FACTS_INPUT_HASH,
  assumptionsHash: ASSUMPTIONS_HASH,
};
const FACTS_SOURCE = {
  status: 'available' as const,
  response: {
    fundId: 7,
    asOfDate: '2026-07-19',
    facts: [],
    inputHash: FACTS_INPUT_HASH,
    generatedAt: '2026-07-19T00:00:00.000Z',
  },
};
const MOIC_SOURCES = { factsSource: FACTS_SOURCE };
const FACTS_COMPANY = {
  id: 11,
  invested: 125,
  ownership: 0.2,
  stage: 'Series A' as const,
  sector: 'SaaS',
  provenance: {
    invested: { status: 'observed' as const, source: 'facts.invested', reason: null },
    ownership: { status: 'observed' as const, source: 'facts.ownership', reason: null },
    stage: { status: 'observed' as const, source: 'facts.stage', reason: null },
    sector: { status: 'observed' as const, source: 'companies.sector', reason: null },
  },
};

function actionabilityResult(
  actionability: H9ActionabilityStatus = 'actionable'
): MoicActionabilityResult {
  return {
    sourceFingerprintMatches: actionability === 'actionable',
    actionability,
    actionabilityStatus: actionability,
    sourceFingerprint: {
      moicSourceInputHash: 'moic-src-hash',
      roundEvidenceInputHash: 'round-evidence-hash',
      roundEvidenceAssumptionsHash: 'assumptions-hash',
      fingerprintHash: 'fingerprint-hash',
      policyVersion: 'h9-policy-v1',
    },
    acceptedReconciliationRunId: actionability === 'actionable' ? '42' : null,
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

function enableRankedMode(mode: 'shadow' | 'on'): void {
  enabledFlags.add('enable_ranked_reserve_allocation');
  resolveRankedReserveCalculationMode.mockResolvedValue(mode);
}

function enableFactsShadow(): void {
  enabledFlags.add('enable_facts_sourced_reserve_inputs');
  modeFindFirst.mockResolvedValue({ configuredMode: 'shadow', killSwitchActive: false });
}

describe('runReserveCalculation ranked-reserve seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enabledFlags.clear();
    eventOrder.length = 0;
    persistedSnapshots.length = 0;
    isFlagEnabled.mockImplementation((key: string) => enabledFlags.has(key));
    modeFindFirst.mockResolvedValue(undefined);
    resolveRankedReserveCalculationMode.mockResolvedValue('off');
    buildReservePortfolioInputWithProvenance.mockResolvedValue({
      portfolio: LEGACY_PORTFOLIO,
      reserveInputTrustSummary: LEGACY_TRUST_SUMMARY,
    });
    generateReserveSummary.mockReturnValue(LEGACY_RESERVES);
    resolveMoicActionability.mockResolvedValue(actionabilityResult());
    buildRankedReserveAllocation.mockResolvedValue(COMPOSED);
    buildRankedShadowTelemetry.mockReturnValue(RANKED_TELEMETRY);
    emitRankedShadowTelemetry.mockImplementation(() => eventOrder.push('shadow'));
    buildReserveEnvelope.mockResolvedValue(ENVELOPE);
    toReserveSummary.mockReturnValue(RANKED_RESERVES);
    getFundMoicRankingSources.mockResolvedValue(MOIC_SOURCES);
    buildFactsReserveCandidates.mockResolvedValue({
      candidates: [
        {
          status: 'eligible',
          companyId: 11,
          input: FACTS_COMPANY,
          factsInputHash: FACTS_INPUT_HASH,
        },
      ],
      factsInputHash: FACTS_INPUT_HASH,
      trustSummary: {
        trustedForActivation: true,
        defaultedInputCount: 0,
        unavailableInputCount: 0,
        defaultedFields: [],
        unavailableFields: [],
      },
    });
  });

  it('does not read ranked mode state when the ranked flag is off', async () => {
    await runReserveCalculation({ fundId: 7, correlationId: 'corr-flag-off' });

    expect(resolveRankedReserveCalculationMode).not.toHaveBeenCalled();
    expect(buildRankedReserveAllocation).not.toHaveBeenCalled();
  });

  it('keeps the shadow snapshot byte-identical to the flag-off snapshot', async () => {
    await runReserveCalculation({ fundId: 7, correlationId: 'corr-parity' });
    enableRankedMode('shadow');
    await runReserveCalculation({ fundId: 7, correlationId: 'corr-parity' });

    expect(persistedSnapshots).toHaveLength(2);
    expect(withoutPersistenceTiming(persistedSnapshots[1] ?? {})).toEqual(
      withoutPersistenceTiming(persistedSnapshots[0] ?? {})
    );
    expect(persistedSnapshots[1]?.payload).toEqual(LEGACY_RESERVES);
    expect(persistedSnapshots[1]?.metadata).not.toHaveProperty('rankedBasis');
  });

  it('emits ranked shadow telemetry only after persistence and calc-run completion', async () => {
    enableRankedMode('shadow');

    await runReserveCalculation({
      fundId: 7,
      correlationId: 'corr-shadow-order',
      runId: 91,
    });

    expect(eventOrder).toEqual(['persist', 'shadow']);
    expect(markCalcRunCompletedIfReady).toHaveBeenCalledWith(91);
    expect(markCalcRunCompletedIfReady.mock.invocationCallOrder[0]).toBeLessThan(
      emitRankedShadowTelemetry.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it('keeps both shadow lanes authoritative on legacy and preserves a non-zero facts delta', async () => {
    enableFactsShadow();
    enableRankedMode('shadow');
    generateReserveSummary.mockImplementation((_fundId, portfolio) =>
      portfolio[0]?.invested === FACTS_COMPANY.invested ? FACTS_RESERVES : LEGACY_RESERVES
    );

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-both-shadow' });

    expect(persistedSnapshots[0]?.payload).toEqual(LEGACY_RESERVES);
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ summaryValueDeltaPct: 0.25 }),
      'reserve facts inputs shadow comparison generated'
    );
    expect(loggerInfo.mock.calls[0]?.[0]).not.toMatchObject({ summaryValueDeltaPct: 0 });
  });

  it('pins facts-shadow comparison to legacy while ranked on writes authority', async () => {
    enableFactsShadow();
    enableRankedMode('on');
    generateReserveSummary.mockImplementation((_fundId, portfolio) =>
      portfolio[0]?.invested === FACTS_COMPANY.invested ? FACTS_RESERVES : LEGACY_RESERVES
    );
    toReserveSummary.mockReturnValue(FACTS_RESERVES);

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-overlap-on' });

    expect(persistedSnapshots[0]?.payload).toEqual(FACTS_RESERVES);
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ summaryValueDeltaPct: 0.25 }),
      'reserve facts inputs shadow comparison generated'
    );
    expect(loggerInfo.mock.calls[0]?.[0]).not.toMatchObject({ summaryValueDeltaPct: 0 });
  });

  it('writes the ranked payload and aggregate rankedBasis only when the on gate passes', async () => {
    enableRankedMode('on');

    const result = await runReserveCalculation({ fundId: 7, correlationId: 'corr-on' });

    expect(result.reserves).toEqual(RANKED_RESERVES);
    expect(persistedSnapshots[0]).toMatchObject({
      payload: RANKED_RESERVES,
      metadata: {
        rankedBasis: {
          mode: 'on',
          candidateCount: 2,
          excludedCount: 1,
          envelopeInputHash: ENVELOPE_INPUT_HASH,
          factsInputHash: FACTS_INPUT_HASH,
          assumptionsHash: ASSUMPTIONS_HASH,
        },
      },
    });
    expect(buildReserveEnvelope).toHaveBeenCalledWith({
      fundId: 7,
      asOfDate: expect.any(String),
    });
    expect(JSON.stringify(persistedSnapshots[0]?.metadata)).not.toMatch(/marginal/i);
  });

  it('keeps legacy authority when composed fail-safe is true', async () => {
    enableRankedMode('on');
    buildRankedReserveAllocation.mockResolvedValue({
      ...COMPOSED,
      allocations: [],
      failSafe: true,
      failSafeReason: 'engine_error',
    });

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-failsafe' });

    expect(persistedSnapshots[0]?.payload).toEqual(LEGACY_RESERVES);
    expect(persistedSnapshots[0]?.metadata).not.toHaveProperty('rankedBasis');
    expect(buildReserveEnvelope).not.toHaveBeenCalled();
  });

  it('keeps legacy authority for the third H9 status quarantined', async () => {
    enableRankedMode('on');
    resolveMoicActionability.mockResolvedValue(actionabilityResult('quarantined'));

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-quarantined' });

    expect(persistedSnapshots[0]?.payload).toEqual(LEGACY_RESERVES);
    expect(persistedSnapshots[0]?.metadata).not.toHaveProperty('rankedBasis');
    expect(buildReserveEnvelope).not.toHaveBeenCalled();
  });

  it('keeps legacy authority when H9 is non_actionable', async () => {
    enableRankedMode('on');
    resolveMoicActionability.mockResolvedValue(actionabilityResult('non_actionable'));

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-non-actionable' });

    expect(persistedSnapshots[0]?.payload).toEqual(LEGACY_RESERVES);
    expect(persistedSnapshots[0]?.metadata).not.toHaveProperty('rankedBasis');
    expect(buildReserveEnvelope).not.toHaveBeenCalled();
  });

  it('falls back to legacy and completes the run when the ranked path throws', async () => {
    enableRankedMode('on');
    buildRankedReserveAllocation.mockRejectedValue(new Error('ranked unavailable'));

    await expect(
      runReserveCalculation({ fundId: 7, correlationId: 'corr-ranked-throws' })
    ).resolves.toMatchObject({ reserves: LEGACY_RESERVES });
    expect(persistedSnapshots[0]?.payload).toEqual(LEGACY_RESERVES);
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('falls back to legacy when the mapper envelope hash diverges', async () => {
    enableRankedMode('on');
    buildReserveEnvelope.mockResolvedValue({ ...ENVELOPE, inputHash: 'd'.repeat(64) });

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-hash-divergence' });

    expect(persistedSnapshots[0]?.payload).toEqual(LEGACY_RESERVES);
    expect(persistedSnapshots[0]?.metadata).not.toHaveProperty('rankedBasis');
    expect(toReserveSummary).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(
      { fundId: 7, mode: 'on' },
      'ranked reserve input hash diverged; using legacy reserves'
    );
  });

  it.each([
    ['worker', 'corr-worker', 91, 31, 4],
    ['inline', 'corr-inline', 92, 32, 5],
  ])(
    'accepts the %s caller input shape',
    async (_caller, correlationId, runId, configId, configVersion) => {
      await runReserveCalculation({ fundId: 7, correlationId, runId, configId, configVersion });

      expect(persistedSnapshots[0]).toMatchObject({
        correlationId,
        runId,
        configId,
        configVersion,
      });
      expect(markCalcRunCompletedIfReady).toHaveBeenCalledWith(runId);
    }
  );

  it('keeps the worker and inline dispatch surfaces wired to the authoritative seam', async () => {
    const [workerSource, persistenceSource] = await Promise.all([
      readFile('workers/reserve-worker.ts', 'utf8'),
      readFile('server/services/fund-persistence-service.ts', 'utf8'),
    ]);

    expect(workerSource).toContain(
      "import { runReserveCalculation } from '../server/services/reserve-calculation-service'"
    );
    expect(workerSource).toContain('const result = await runReserveCalculation({');
    expect(persistenceSource).toContain(
      "import { runReserveCalculation } from './reserve-calculation-service'"
    );
    expect(persistenceSource).toMatch(
      /inlineExecutionByEngine[\s\S]*reserve: runReserveCalculation/
    );
  });
});
