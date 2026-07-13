import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MoicActionabilityResult } from '../../../server/services/fund-calculation-mode-service';

// Mock only resolveMoicActionability; keep the real toH9SnapshotColumns (pure mapper under test).
const { buildFactsReserveCandidates, isFlagEnabled, modeFindFirst, resolveMoicActionability } =
  vi.hoisted(() => ({
    buildFactsReserveCandidates: vi.fn(),
    isFlagEnabled: vi.fn(),
    modeFindFirst: vi.fn(),
    resolveMoicActionability: vi.fn(),
  }));

vi.mock('../../../server/services/fund-calculation-mode-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-calculation-mode-service')>();
  return {
    ...actual,
    resolveMoicActionability,
  };
});

// Capture the values handed to db.insert(...).values(...).
const captured: { values?: Record<string, unknown> } = {};

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      fundConfigs: { findFirst: vi.fn(async () => ({ version: 3, isPublished: true })) },
      funds: { findFirst: vi.fn(async () => ({ id: 7, size: '100000000' })) },
      fundCalculationModes: { findFirst: modeFindFirst },
    },
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        captured.values = values;
        return {
          returning: vi.fn(async () => [
            { id: 101, createdAt: new Date('2026-06-25T00:00:00.000Z'), calcVersion: '1.0.0' },
          ]),
        };
      }),
    })),
  },
}));

vi.mock('../../../server/services/reserve-input-builder', () => ({
  buildReservePortfolioInputWithProvenance: vi.fn(async () => ({
    portfolio: [],
    provenancePortfolio: [],
    reserveInputTrustSummary: {
      trustedForActivation: false,
      defaultedInputCount: 2,
      unavailableInputCount: 0,
      defaultedFields: ['ownership', 'stage'],
      unavailableFields: [],
    },
  })),
}));

vi.mock('../../../server/services/reserves/facts-reserve-input-adapter', () => ({
  buildFactsReserveCandidates,
}));

vi.mock('@shared/flags/getFlag', () => ({ isFlagEnabled }));

vi.mock('@shared/core/reserves/ReserveEngine', () => ({
  generateReserveSummary: vi.fn(() => ({ ok: true })),
}));

vi.mock('../../../server/services/calc-run-tracking', () => ({
  markCalcRunCompletedIfReady: vi.fn(async () => undefined),
}));

import { runReserveCalculation } from '../../../server/services/reserve-calculation-service';
import { toH9SnapshotColumns } from '../../../server/services/fund-calculation-mode-service';

function actionabilityResult(status: 'actionable' | 'non_actionable'): MoicActionabilityResult {
  return {
    sourceFingerprintMatches: status === 'actionable',
    actionability: status,
    actionabilityStatus: status,
    sourceFingerprint: {
      moicSourceInputHash: 'moic-src-hash',
      roundEvidenceInputHash: 'round-evidence-hash',
      roundEvidenceAssumptionsHash: 'assumptions-hash',
      fingerprintHash: 'fingerprint-hash',
      policyVersion: 'h9-policy-v1',
    },
    acceptedReconciliationRunId: status === 'actionable' ? 42 : null,
  } as MoicActionabilityResult;
}

describe('toH9SnapshotColumns', () => {
  it('maps an actionable resolver result to all six stamp columns', () => {
    const cols = toH9SnapshotColumns(actionabilityResult('actionable'));
    expect(cols).toEqual({
      h9MoicSourceInputHash: 'moic-src-hash',
      h9RoundEvidenceInputHash: 'round-evidence-hash',
      h9RoundEvidenceAssumptionsHash: 'assumptions-hash',
      h9FingerprintHash: 'fingerprint-hash',
      h9PolicyVersion: 'h9-policy-v1',
      h9ActionabilityStatus: 'actionable',
    });
  });

  it('stamps the full fingerprint even when non-actionable (satisfies the actionable-requires-non-null CHECK and feeds PR3 drift detection)', () => {
    const cols = toH9SnapshotColumns(actionabilityResult('non_actionable'));
    expect(cols.h9ActionabilityStatus).toBe('non_actionable');
    expect(cols.h9FingerprintHash).toBe('fingerprint-hash');
    expect(cols.h9MoicSourceInputHash).toBe('moic-src-hash');
  });
});

describe('runReserveCalculation H9 stamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete captured.values;
    isFlagEnabled.mockReturnValue(false);
    modeFindFirst.mockResolvedValue(undefined);
  });

  it('stamps the resolved H9 fingerprint columns onto the authoritative reserve snapshot insert', async () => {
    resolveMoicActionability.mockResolvedValue(actionabilityResult('actionable'));

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-1' });

    expect(resolveMoicActionability).toHaveBeenCalledWith({ fundId: 7 });
    expect(captured.values).toMatchObject({
      type: 'RESERVE',
      h9MoicSourceInputHash: 'moic-src-hash',
      h9RoundEvidenceInputHash: 'round-evidence-hash',
      h9RoundEvidenceAssumptionsHash: 'assumptions-hash',
      h9FingerprintHash: 'fingerprint-hash',
      h9PolicyVersion: 'h9-policy-v1',
      h9ActionabilityStatus: 'actionable',
    });
    expect(captured.values?.metadata).toMatchObject({
      reserveInputTrustSummary: {
        trustedForActivation: false,
        defaultedInputCount: 2,
        defaultedFields: ['ownership', 'stage'],
      },
    });
  });

  it('stamps non_actionable status when the fund is not actionable', async () => {
    resolveMoicActionability.mockResolvedValue(actionabilityResult('non_actionable'));

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-2' });

    expect(captured.values?.h9ActionabilityStatus).toBe('non_actionable');
  });

  it('rechecks engine-fed facts provenance before retaining an actionable H9 stamp', async () => {
    isFlagEnabled.mockReturnValue(true);
    modeFindFirst.mockResolvedValue({ configuredMode: 'on', killSwitchActive: false });
    buildFactsReserveCandidates.mockResolvedValue({
      candidates: [
        {
          status: 'eligible',
          companyId: 11,
          factsInputHash: 'b'.repeat(64),
          input: {
            id: 11,
            invested: 100,
            ownership: 0.2,
            stage: 'Series A',
            sector: 'SaaS',
            provenance: {
              invested: {
                status: 'defaulted',
                source: 'invalid-test-fixture',
                reason: 'must force non-actionable',
              },
              ownership: { status: 'observed', source: 'ownership', reason: null },
              stage: { status: 'observed', source: 'stage', reason: null },
              sector: { status: 'observed', source: 'sector', reason: null },
            },
          },
        },
      ],
      factsInputHash: 'a'.repeat(64),
      trustSummary: {
        trustedForActivation: true,
        defaultedInputCount: 0,
        unavailableInputCount: 0,
        defaultedFields: [],
        unavailableFields: [],
      },
    });
    resolveMoicActionability.mockResolvedValue(actionabilityResult('actionable'));

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-facts-on' });

    expect(captured.values).toMatchObject({
      h9MoicSourceInputHash: 'moic-src-hash',
      h9RoundEvidenceInputHash: 'round-evidence-hash',
      h9RoundEvidenceAssumptionsHash: 'assumptions-hash',
      h9FingerprintHash: 'fingerprint-hash',
      h9PolicyVersion: 'h9-policy-v1',
      h9ActionabilityStatus: 'non_actionable',
      metadata: {
        reserveInputTrustSummary: {
          trustedForActivation: true,
          defaultedInputCount: 0,
          defaultedFields: [],
        },
        factsBasis: {
          factsInputHash: 'a'.repeat(64),
          trustedForActivation: false,
          mode: 'on',
        },
      },
    });
  });

  it('forces non-actionable H9 when on-mode facts evidence has no input hash', async () => {
    isFlagEnabled.mockReturnValue(true);
    modeFindFirst.mockResolvedValue({ configuredMode: 'on', killSwitchActive: false });
    buildFactsReserveCandidates.mockResolvedValue({
      candidates: [
        {
          status: 'excluded',
          companyId: 11,
          reasons: ['facts_unavailable'],
          factsInputHash: null,
        },
      ],
      factsInputHash: null,
      trustSummary: {
        trustedForActivation: true,
        defaultedInputCount: 0,
        unavailableInputCount: 1,
        defaultedFields: [],
        unavailableFields: ['invested'],
      },
    });
    resolveMoicActionability.mockResolvedValue(actionabilityResult('actionable'));

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-facts-unavailable' });

    expect(captured.values).toMatchObject({
      h9FingerprintHash: 'fingerprint-hash',
      h9ActionabilityStatus: 'non_actionable',
      metadata: {
        portfolioCount: 0,
        factsBasis: {
          factsInputHash: null,
          trustedForActivation: false,
          mode: 'on',
        },
      },
    });
  });
});
