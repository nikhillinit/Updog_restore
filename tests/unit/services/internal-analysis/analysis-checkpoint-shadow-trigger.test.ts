import { beforeEach, describe, expect, it, vi } from 'vitest';

const factsService = vi.hoisted(() => ({
  buildFinancialFactsSnapshot: vi.fn(),
}));
const forecastService = vi.hoisted(() => ({
  resolveCurrentForecastPlanVersionId: vi.fn(),
  runCurrentForecastV2WithReceipt: vi.fn(),
}));
const shadowTrigger = vi.hoisted(() => ({
  triggerCurrentForecastShadow: vi.fn(),
}));

vi.mock('../../../../server/db', () => ({ db: {} }));
vi.mock('../../../../server/services/financial-facts-snapshot-service', () => factsService);
vi.mock('../../../../server/services/current-forecast-v2-service', () => forecastService);
vi.mock('../../../../server/services/current-forecast-shadow-trigger', () => shadowTrigger);

import { createAnalysisCheckpointPorts } from '../../../../server/services/internal-analysis/analysis-checkpoint-service';

const committedSnapshot = {
  snapshotInputHash: 'b'.repeat(64),
  knowledgeCutoff: '2026-07-22T02:00:00.000Z',
};
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

function rebuildInput() {
  return {
    fundId: 7,
    asOfDate: '2026-07-21',
    actorId: null,
    idempotencyKey: 'facts-checkpoint-shadow',
  };
}

describe('analysis checkpoint current-forecast shadow importer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    factsService.buildFinancialFactsSnapshot.mockResolvedValue(committedSnapshot);
    forecastService.resolveCurrentForecastPlanVersionId.mockResolvedValue(21);
    forecastService.runCurrentForecastV2WithReceipt.mockResolvedValue(receipt);
    shadowTrigger.triggerCurrentForecastShadow.mockResolvedValue(undefined);
  });

  it('passes the checkpoint receipt to the shadow trigger after basis rebuild', async () => {
    const result = await createAnalysisCheckpointPorts(database() as never).rebuildBasis(
      rebuildInput()
    );

    expect(result).toMatchObject({ financialFactsSnapshotId: 31, forecastFundSnapshotId: 901 });
    expect(shadowTrigger.triggerCurrentForecastShadow).toHaveBeenCalledWith({
      fundId: 7,
      financialFactsSnapshotId: 31,
      clock: committedSnapshot.knowledgeCutoff,
      receipt,
      database: expect.any(Object),
    });
  });

  it('records forecast rebuild failure without failing facts basis creation', async () => {
    const error = new Error('forecast unavailable');
    forecastService.runCurrentForecastV2WithReceipt.mockRejectedValueOnce(error);

    const result = await createAnalysisCheckpointPorts(database() as never).rebuildBasis(
      rebuildInput()
    );

    expect(result.forecastFundSnapshotId).toBeNull();
    expect(shadowTrigger.triggerCurrentForecastShadow).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: 7,
        financialFactsSnapshotId: 31,
        error,
        currentPlanVersionId: 21,
      })
    );
  });

  it('uses plan=none sentinel when checkpoint has no current plan', async () => {
    forecastService.resolveCurrentForecastPlanVersionId.mockResolvedValueOnce(null);
    forecastService.runCurrentForecastV2WithReceipt.mockRejectedValueOnce(
      new Error('no current plan')
    );

    await createAnalysisCheckpointPorts(database() as never).rebuildBasis(rebuildInput());

    expect(shadowTrigger.triggerCurrentForecastShadow).toHaveBeenCalledWith(
      expect.objectContaining({ currentPlanVersionId: 0 })
    );
  });

  it('leaves plan identity unknown when checkpoint lookup fails', async () => {
    forecastService.resolveCurrentForecastPlanVersionId.mockRejectedValueOnce(
      new Error('plan lookup unavailable')
    );
    forecastService.runCurrentForecastV2WithReceipt.mockRejectedValueOnce(
      new Error('forecast unavailable')
    );

    await createAnalysisCheckpointPorts(database() as never).rebuildBasis(rebuildInput());

    expect(shadowTrigger.triggerCurrentForecastShadow).toHaveBeenCalledWith(
      expect.not.objectContaining({ currentPlanVersionId: expect.anything() })
    );
  });

  it('keeps checkpoint basis creation successful when shadow recording rejects', async () => {
    shadowTrigger.triggerCurrentForecastShadow.mockRejectedValueOnce(
      new Error('shadow ledger unavailable')
    );

    await expect(
      createAnalysisCheckpointPorts(database() as never).rebuildBasis(rebuildInput())
    ).resolves.toMatchObject({ forecastFundSnapshotId: 901 });
  });
});
