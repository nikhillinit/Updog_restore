import { beforeEach, describe, expect, it, vi } from 'vitest';

const modeService = vi.hoisted(() => ({
  currentForecastModeReaderForDatabase: vi.fn(() => vi.fn()),
  resolveCurrentForecastModeResolution: vi.fn(),
}));
const forecastService = vi.hoisted(() => ({
  getOrCreateCurrentForecastV2WithReceipt: vi.fn(),
  resolveCurrentForecastPlanVersionId: vi.fn(),
  runCurrentForecastV2: vi.fn(),
}));
const shadowService = vi.hoisted(() => ({
  persistCurrentForecastShadowFailure: vi.fn(),
  persistCurrentForecastShadowReconciliation: vi.fn(),
  runCurrentForecastShadowBase: vi.fn(),
}));

vi.mock('../../../server/db', () => ({ db: {} }));
vi.mock('../../../server/services/current-forecast-calc-mode-resolver', () => modeService);
vi.mock('../../../server/services/current-forecast-v2-service', () => forecastService);
vi.mock('../../../server/services/current-forecast-shadow-service', () => shadowService);

import {
  triggerCurrentForecastShadow,
  triggerCurrentForecastShadowForFacts,
} from '../../../server/services/current-forecast-shadow-trigger';

const receipt = {
  fundSnapshotId: 901,
  result: {
    fundId: 7,
    financialFactsSnapshotId: '31',
    currentPlanVersionId: '21',
    status: 'available',
    inputHash: 'a'.repeat(64),
    resultHash: 'b'.repeat(64),
    assumptionsHash: 'c'.repeat(64),
    methodologyVersion: 'cohort-projection-v2/1.0.0',
  },
};

const factsSnapshot = {
  fundId: 7,
  snapshotInputHash: 'd'.repeat(64),
  knowledgeCutoff: '2026-07-22T02:00:00.000Z',
};

function database() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ id: 31 }]),
        })),
      })),
    })),
  };
}

describe('current-forecast shadow trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modeService.resolveCurrentForecastModeResolution.mockResolvedValue({
      mode: 'shadow',
      cutoverReferenceId: null,
    });
    forecastService.resolveCurrentForecastPlanVersionId.mockResolvedValue(21);
    forecastService.getOrCreateCurrentForecastV2WithReceipt.mockResolvedValue(receipt);
    forecastService.runCurrentForecastV2.mockResolvedValue(receipt.result);
    shadowService.persistCurrentForecastShadowFailure.mockResolvedValue(undefined);
    shadowService.persistCurrentForecastShadowReconciliation.mockResolvedValue(undefined);
    shadowService.runCurrentForecastShadowBase.mockResolvedValue({
      executed: true,
      reconciliationStatus: 'match',
    });
  });

  it('skips all baseline and replay work when mode is off', async () => {
    modeService.resolveCurrentForecastModeResolution.mockResolvedValueOnce({
      mode: 'off',
      cutoverReferenceId: null,
    });

    await triggerCurrentForecastShadowForFacts({
      fundId: 7,
      snapshot: factsSnapshot as never,
      database: database() as never,
    });

    expect(forecastService.getOrCreateCurrentForecastV2WithReceipt).not.toHaveBeenCalled();
    expect(shadowService.runCurrentForecastShadowBase).not.toHaveBeenCalled();
  });

  it('uses hash-resolved facts basis and get-or-create receipt', async () => {
    const db = database();
    await triggerCurrentForecastShadowForFacts({
      fundId: 7,
      snapshot: factsSnapshot as never,
      database: db as never,
    });

    expect(forecastService.getOrCreateCurrentForecastV2WithReceipt).toHaveBeenCalledWith({
      fundId: 7,
      financialFactsSnapshotId: '31',
      currentPlanVersionId: '21',
      clock: factsSnapshot.knowledgeCutoff,
      database: db,
    });
    expect(shadowService.runCurrentForecastShadowBase).toHaveBeenCalledWith(
      expect.objectContaining({
        base: expect.objectContaining({
          referenceBasis: {
            fundSnapshotId: 901,
            currentPlanVersionId: 21,
            financialFactsSnapshotId: 31,
          },
        }),
      })
    );
  });

  it('reuses checkpoint receipt without baseline lookup', async () => {
    await triggerCurrentForecastShadow({
      fundId: 7,
      financialFactsSnapshotId: 31,
      currentPlanVersionId: 21,
      clock: factsSnapshot.knowledgeCutoff,
      receipt,
      database: database() as never,
    });

    expect(forecastService.getOrCreateCurrentForecastV2WithReceipt).not.toHaveBeenCalled();
    expect(shadowService.runCurrentForecastShadowBase).toHaveBeenCalledTimes(1);
  });

  it('records a failed shadow execution without throwing', async () => {
    shadowService.runCurrentForecastShadowBase.mockRejectedValueOnce(
      new Error('shadow ledger unavailable')
    );

    await expect(
      triggerCurrentForecastShadow({
        fundId: 7,
        financialFactsSnapshotId: 31,
        clock: factsSnapshot.knowledgeCutoff,
        receipt,
        database: database() as never,
      })
    ).resolves.toBeUndefined();
    expect(shadowService.persistCurrentForecastShadowFailure).toHaveBeenCalled();
  });

  it('records timeout before trigger settles', async () => {
    shadowService.runCurrentForecastShadowBase.mockReturnValueOnce(new Promise(() => undefined));

    await expect(
      triggerCurrentForecastShadow({
        fundId: 7,
        financialFactsSnapshotId: 31,
        clock: factsSnapshot.knowledgeCutoff,
        receipt,
        timeoutMs: 1,
        database: database() as never,
      })
    ).resolves.toBeUndefined();
    expect(shadowService.persistCurrentForecastShadowFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'timeout' })
    );
  });

  it('keeps pre-receipt failures distinct across plan changes', async () => {
    const persistedBases: Array<{ name: string; basisDescriptor: string }> = [];
    shadowService.persistCurrentForecastShadowFailure.mockImplementation(
      async (params: { base: { name: string; basisDescriptor: string } }) => {
        persistedBases.push(params.base);
      }
    );
    forecastService.getOrCreateCurrentForecastV2WithReceipt.mockRejectedValue(
      new Error('baseline receipt unavailable')
    );

    for (const planVersionId of [45, 46]) {
      forecastService.resolveCurrentForecastPlanVersionId.mockResolvedValueOnce(planVersionId);
      await triggerCurrentForecastShadowForFacts({
        fundId: 7,
        snapshot: factsSnapshot as never,
        database: database() as never,
      });
    }

    expect(persistedBases).toHaveLength(2);
    expect(persistedBases[0]?.basisDescriptor).toContain('plan=45');
    expect(persistedBases[1]?.basisDescriptor).toContain('plan=46');
    expect(persistedBases[0]?.name).not.toBe(persistedBases[1]?.name);
  });

  it('marks a no-plan pre-receipt failure with plan=none', async () => {
    forecastService.resolveCurrentForecastPlanVersionId.mockResolvedValueOnce(null);
    forecastService.getOrCreateCurrentForecastV2WithReceipt.mockRejectedValueOnce(
      new Error('no current plan')
    );

    await triggerCurrentForecastShadowForFacts({
      fundId: 7,
      snapshot: factsSnapshot as never,
      database: database() as never,
    });

    expect(shadowService.persistCurrentForecastShadowFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        base: expect.objectContaining({
          basisDescriptor: expect.stringContaining('plan=none'),
        }),
      })
    );
  });

  it('settles within the deadline when mode resolution hangs', async () => {
    modeService.resolveCurrentForecastModeResolution.mockReturnValueOnce(
      new Promise(() => undefined)
    );

    await expect(
      triggerCurrentForecastShadow({
        fundId: 7,
        financialFactsSnapshotId: 31,
        clock: factsSnapshot.knowledgeCutoff,
        timeoutMs: 1,
        database: database() as never,
      })
    ).resolves.toBeUndefined();
    expect(shadowService.persistCurrentForecastShadowFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'timeout' })
    );
  });
});
