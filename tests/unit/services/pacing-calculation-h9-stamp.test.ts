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

// Capture every db.insert(...).values(...) payload and every onConflictDoUpdate(...) config.
// runPacingCalculation writes two authoritative tables: pacing_history (upsert loop, no
// .returning()) and fund_snapshots type PACING (.returning()). The mocked .values() must
// expose BOTH chains or the pacing_history insert throws and RED errors instead of failing
// on the h9 assertion.
const capturedValues: Array<Record<string, unknown>> = [];
const capturedConflicts: Array<{ set?: Record<string, unknown> }> = [];

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      funds: { findFirst: vi.fn(async () => ({ id: 7, size: '100000000' })) },
    },
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        capturedValues.push(values);
        return {
          onConflictDoUpdate: vi.fn(async (config: { set?: Record<string, unknown> }) => {
            capturedConflicts.push(config);
          }),
          returning: vi.fn(async () => [
            { id: 101, createdAt: new Date('2026-06-25T00:00:00.000Z'), calcVersion: '1.0.0' },
          ]),
        };
      }),
    })),
  },
}));

vi.mock('../../../server/services/pacing-fund-size', () => ({
  resolvePacingFundSize: vi.fn(async () => 100_000_000),
}));

vi.mock('@shared/core/pacing/PacingEngine', () => ({
  generatePacingSummary: vi.fn(() => ({
    deployments: [
      { quarter: 1, deployment: 1_000_000 },
      { quarter: 2, deployment: 2_000_000 },
    ],
    totalQuarters: 2,
    avgQuarterlyDeployment: 1_500_000,
    marketCondition: 'neutral',
  })),
}));

vi.mock('../../../server/services/calc-run-tracking', () => ({
  markCalcRunCompletedIfReady: vi.fn(async () => undefined),
}));

import { runPacingCalculation } from '../../../server/services/pacing-calculation-service';

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

const H9_STAMP = {
  h9MoicSourceInputHash: 'moic-src-hash',
  h9RoundEvidenceInputHash: 'round-evidence-hash',
  h9RoundEvidenceAssumptionsHash: 'assumptions-hash',
  h9FingerprintHash: 'fingerprint-hash',
  h9PolicyVersion: 'h9-policy-v1',
  h9ActionabilityStatus: 'actionable',
};

function pacingHistoryValues(): Array<Record<string, unknown>> {
  return capturedValues.filter((v) => v['quarter'] !== undefined);
}

function pacingSnapshotValues(): Record<string, unknown> | undefined {
  return capturedValues.find((v) => v['type'] === 'PACING');
}

describe('runPacingCalculation H9 stamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedValues.length = 0;
    capturedConflicts.length = 0;
    resolveMoicActionability.mockResolvedValue(actionabilityResult('actionable'));
  });

  it('stamps the resolved H9 fingerprint onto every pacing_history upsert value', async () => {
    await runPacingCalculation({ fundId: 7, correlationId: 'corr-1' });

    const rows = pacingHistoryValues();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject(H9_STAMP);
    }
  });

  it('stamps the H9 fingerprint onto the pacing_history conflict set so re-runs refresh provenance', async () => {
    await runPacingCalculation({ fundId: 7, correlationId: 'corr-2' });

    expect(capturedConflicts).toHaveLength(2);
    for (const conflict of capturedConflicts) {
      expect(conflict.set).toMatchObject(H9_STAMP);
    }
  });

  it('stamps the H9 fingerprint onto the authoritative PACING fund_snapshots insert', async () => {
    await runPacingCalculation({ fundId: 7, correlationId: 'corr-3' });

    expect(pacingSnapshotValues()).toMatchObject({ type: 'PACING', ...H9_STAMP });
  });

  it('resolves actionability exactly once per run with the fund id', async () => {
    await runPacingCalculation({ fundId: 7, correlationId: 'corr-4' });

    expect(resolveMoicActionability).toHaveBeenCalledTimes(1);
    expect(resolveMoicActionability).toHaveBeenCalledWith({ fundId: 7 });
  });

  it('stamps non_actionable status (full fingerprint retained) when the fund is not actionable', async () => {
    resolveMoicActionability.mockResolvedValue(actionabilityResult('non_actionable'));

    await runPacingCalculation({ fundId: 7, correlationId: 'corr-5' });

    const snapshot = pacingSnapshotValues();
    expect(snapshot?.['h9ActionabilityStatus']).toBe('non_actionable');
    expect(snapshot?.['h9FingerprintHash']).toBe('fingerprint-hash');
    expect(pacingHistoryValues()[0]).toMatchObject({ h9ActionabilityStatus: 'non_actionable' });
  });
});
