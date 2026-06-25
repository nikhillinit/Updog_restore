import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MoicActionabilityResult } from '../../../server/services/fund-calculation-mode-service';

// Mock only resolveMoicActionability; keep the real toH9SnapshotColumns (pure mapper under test).
const { resolveMoicActionability } = vi.hoisted(() => ({
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
  buildReservePortfolioInput: vi.fn(async () => []),
}));

vi.mock('@shared/core/reserves/ReserveEngine', () => ({
  generateReserveSummary: vi.fn(() => ({ ok: true })),
}));

vi.mock('../../../server/services/calc-run-tracking', () => ({
  markCalcRunCompletedIfReady: vi.fn(async () => undefined),
}));

import { runReserveCalculation } from '../../../server/services/reserve-calculation-service';
import { toH9SnapshotColumns } from '../../../server/services/fund-calculation-mode-service';

function actionabilityResult(
  status: 'actionable' | 'non_actionable'
): MoicActionabilityResult {
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
  });

  it('stamps non_actionable status when the fund is not actionable', async () => {
    resolveMoicActionability.mockResolvedValue(actionabilityResult('non_actionable'));

    await runReserveCalculation({ fundId: 7, correlationId: 'corr-2' });

    expect(captured.values?.h9ActionabilityStatus).toBe('non_actionable');
  });
});
