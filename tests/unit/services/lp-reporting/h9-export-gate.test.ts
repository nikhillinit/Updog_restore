import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveForFund } = vi.hoisted(() => ({ resolveForFund: vi.fn() }));
const { inc } = vi.hoisted(() => ({ inc: vi.fn() }));

vi.mock('../../../../server/services/fund-calculation-mode-service', () => ({
  createMoicActionabilityResolver: () => ({ resolveForFund }),
}));
vi.mock('../../../../server/metrics', () => ({
  moicActionabilityBlocksTotal: { inc },
}));

import {
  assertH9ExportActionable,
  assertH9PackageExportable,
  H9ExportBlockedError,
} from '../../../../server/services/lp-reporting/h9-export-gate';

const FP = 'd'.repeat(64);
const POLICY = 'h9-policy-v1';

function storedActionable(overrides: Record<string, unknown> = {}) {
  return {
    h9MoicSourceInputHash: 'a'.repeat(64),
    h9RoundEvidenceInputHash: 'b'.repeat(64),
    h9RoundEvidenceAssumptionsHash: 'c'.repeat(64),
    h9FingerprintHash: FP,
    h9PolicyVersion: POLICY,
    h9ActionabilityStatus: 'actionable',
    ...overrides,
  };
}

function currentResult(overrides: Record<string, unknown> = {}) {
  return {
    actionability: 'actionable',
    sourceFingerprint: { fingerprintHash: FP, policyVersion: POLICY },
    ...overrides,
  };
}

const call = (stored: Record<string, unknown>) =>
  assertH9ExportActionable({
    surface: 'render_model',
    fundId: 7,
    stored: stored as never,
    database: {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  resolveForFund.mockResolvedValue(currentResult());
});

describe('assertH9ExportActionable', () => {
  it('passes when stored is actionable and the fingerprint matches the current resolve', async () => {
    await expect(call(storedActionable())).resolves.toBeUndefined();
    expect(inc).not.toHaveBeenCalled();
  });

  it('blocks H9_METADATA_MISSING for a legacy (null) row and does not resolve', async () => {
    await expect(
      call(storedActionable({ h9ActionabilityStatus: null, h9FingerprintHash: null }))
    ).rejects.toMatchObject({ code: 'H9_METADATA_MISSING' });
    expect(resolveForFund).not.toHaveBeenCalled();
    expect(inc).toHaveBeenCalledWith({
      surface: 'render_model',
      blocker_code: 'h9_metadata_missing',
    });
  });

  it('blocks H9_REVALIDATION_UNAVAILABLE (fail closed) when the resolver throws', async () => {
    resolveForFund.mockRejectedValue(new Error('db blip'));
    await expect(call(storedActionable())).rejects.toMatchObject({
      code: 'H9_REVALIDATION_UNAVAILABLE',
    });
    expect(inc).toHaveBeenCalledWith({
      surface: 'render_model',
      blocker_code: 'h9_revalidation_unavailable',
    });
  });

  it('blocks H9_NOT_ACTIONABLE when the stored status is not actionable', async () => {
    await expect(
      call(storedActionable({ h9ActionabilityStatus: 'non_actionable' }))
    ).rejects.toMatchObject({
      code: 'H9_NOT_ACTIONABLE',
    });
  });

  it('blocks H9_FINGERPRINT_STALE when the stored hash differs from current', async () => {
    resolveForFund.mockResolvedValue(
      currentResult({
        sourceFingerprint: { fingerprintHash: 'e'.repeat(64), policyVersion: POLICY },
      })
    );
    await expect(call(storedActionable())).rejects.toMatchObject({ code: 'H9_FINGERPRINT_STALE' });
  });

  it('blocks H9_FINGERPRINT_STALE when the current resolve is itself non_actionable', async () => {
    resolveForFund.mockResolvedValue(currentResult({ actionability: 'non_actionable' }));
    await expect(call(storedActionable())).rejects.toMatchObject({ code: 'H9_FINGERPRINT_STALE' });
  });

  it('throws an H9ExportBlockedError carrying surface + code', async () => {
    try {
      await call(storedActionable({ h9ActionabilityStatus: 'non_actionable' }));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(H9ExportBlockedError);
      expect((err as H9ExportBlockedError).surface).toBe('render_model');
    }
  });

  it('blocks as a 409 so route handlers map it to a typed 4xx (not 500)', async () => {
    await expect(
      call(storedActionable({ h9ActionabilityStatus: 'non_actionable' }))
    ).rejects.toMatchObject({
      status: 409,
      code: 'H9_NOT_ACTIONABLE',
    });
  });
});

describe('assertH9PackageExportable', () => {
  const emptyDb = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  };

  it('blocks H9_METADATA_MISSING when the package row is absent (fail closed)', async () => {
    await expect(
      assertH9PackageExportable({
        surface: 'stored_json_export',
        fundId: 7,
        metricRunId: 11,
        database: emptyDb as never,
      })
    ).rejects.toMatchObject({ code: 'H9_METADATA_MISSING', status: 409 });
  });
});
