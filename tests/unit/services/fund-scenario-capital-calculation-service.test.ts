import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPITAL_SOURCE_INTERPRETATION_VERSION } from '../../../shared/contracts/capital-planning-v1.contract';
import { sha256CanonicalJson } from '../../../shared/lib/canonical-json';

const {
  transactionMock,
  verifyFundExistsMock,
  fetchRawScenarioSetMock,
  requireScenarioSetFamilyMock,
  fetchCapitalScenarioSetDetailFromRawMock,
  insertScenarioSetEventMock,
  assertCapitalScenarioStoredInputLimitsMock,
  findCompletedScenarioRunMock,
  findLatestScenarioRunMock,
  acquireScenarioCalculationRunWithCreationMock,
  markScenarioCalculationRunRunningMock,
  markScenarioCalculationRunCompletedMock,
  persistCapitalScenarioSnapshotMock,
  prepareCapitalCalculateResponseMock,
  calculateCapitalPlanningV1Mock,
  verifyPinnedCapitalSourceBundleMock,
} = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  verifyFundExistsMock: vi.fn(),
  fetchRawScenarioSetMock: vi.fn(),
  requireScenarioSetFamilyMock: vi.fn(),
  fetchCapitalScenarioSetDetailFromRawMock: vi.fn(),
  insertScenarioSetEventMock: vi.fn(),
  assertCapitalScenarioStoredInputLimitsMock: vi.fn(),
  findCompletedScenarioRunMock: vi.fn(),
  findLatestScenarioRunMock: vi.fn(),
  acquireScenarioCalculationRunWithCreationMock: vi.fn(),
  markScenarioCalculationRunRunningMock: vi.fn(),
  markScenarioCalculationRunCompletedMock: vi.fn(),
  persistCapitalScenarioSnapshotMock: vi.fn(),
  prepareCapitalCalculateResponseMock: vi.fn(),
  calculateCapitalPlanningV1Mock: vi.fn(),
  verifyPinnedCapitalSourceBundleMock: vi.fn(),
}));

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, randomUUID: () => '11111111-1111-4111-8111-111111111111' };
});

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

vi.mock('../../../server/services/fund-scenario-set-service.js', () => ({
  createHttpError: (status: number, message: string, extras?: Record<string, unknown>) =>
    Object.assign(new Error(message), { status, ...extras }),
  verifyFundExists: verifyFundExistsMock,
  fetchRawScenarioSet: fetchRawScenarioSetMock,
  requireScenarioSetFamily: requireScenarioSetFamilyMock,
  fetchCapitalScenarioSetDetailFromRaw: fetchCapitalScenarioSetDetailFromRawMock,
  insertScenarioSetEvent: insertScenarioSetEventMock,
  normalizeActor: (actor: unknown) => actor ?? {},
}));

vi.mock('../../../server/services/fund-scenario-set-create-service.js', () => ({
  assertCapitalScenarioStoredInputLimits: assertCapitalScenarioStoredInputLimitsMock,
}));

vi.mock('../../../server/services/fund-scenario-calculation-run-service.js', () => ({
  acquireScenarioCalculationRunWithCreation: acquireScenarioCalculationRunWithCreationMock,
  findCompletedScenarioRun: findCompletedScenarioRunMock,
  findLatestScenarioRun: findLatestScenarioRunMock,
  markScenarioCalculationRunCompleted: markScenarioCalculationRunCompletedMock,
  markScenarioCalculationRunRunning: markScenarioCalculationRunRunningMock,
}));

vi.mock('../../../server/services/fund-scenario-capital-snapshot-store.js', () => ({
  findReusableCapitalScenarioSnapshot: vi.fn(),
  persistCapitalScenarioSnapshot: persistCapitalScenarioSnapshotMock,
  prepareCapitalCalculateResponse: prepareCapitalCalculateResponseMock,
}));

vi.mock('../../../server/lib/scenarios/scenario-input-hash.js', () => ({
  createCapitalScenarioInputHash: () => 'a'.repeat(64),
}));

vi.mock('../../../shared/lib/scenarios/scenario-input-envelope', () => ({
  FUND_SCENARIOS_CONTRACT_VERSION: 'fund-scenarios/1.0.0',
  resolveScenarioInputLineage: () => ({
    hashKind: 'scenario-input-hash-v1',
    modelInputsAsOfDate: null,
    comparisonLineageVersion: null,
  }),
}));

vi.mock('../../../shared/lib/capital-planning/capital-planning-v1', () => ({
  calculateCapitalPlanningV1: calculateCapitalPlanningV1Mock,
}));

vi.mock('../../../shared/lib/capital-planning/materialize-from-fund-draft', () => ({
  verifyPinnedCapitalSourceBundle: verifyPinnedCapitalSourceBundleMock,
}));

import { calculateFundScenarioCapitalSet } from '../../../server/services/fund-scenario-capital-calculation-service';

describe('calculateFundScenarioCapitalSet', () => {
  beforeEach(() => {
    const config = { modelInputsAsOfDate: null };
    const sourceBundle = {
      sourceBundleHash: 'b'.repeat(64),
      projection: { rawConfigHash: sha256CanonicalJson(config) },
      modelInputsAsOfDate: null,
    };
    transactionMock.mockImplementation(
      async (callback: (client: { query: ReturnType<typeof vi.fn> }) => unknown) =>
        callback({
          query: vi.fn(async () => ({
            rows: [{ id: 2, version: 3, config }],
          })),
        })
    );
    verifyFundExistsMock.mockResolvedValue(undefined);
    fetchRawScenarioSetMock.mockResolvedValue({
      row: { archived_at: null },
    });
    requireScenarioSetFamilyMock.mockReturnValue(undefined);
    fetchCapitalScenarioSetDetailFromRawMock.mockResolvedValue({
      fundId: 1,
      baselineVariantId: 'baseline-1',
      sourceConfigId: 2,
      sourceConfigVersion: 3,
      sourceBundleHash: sourceBundle.sourceBundleHash,
      interpretationVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
      variants: [
        {
          id: 'variant-1',
          sortOrder: 0,
          name: 'Baseline',
          override: {
            payload: {
              input: { contractVersion: 'capital-planning/1.0.0', allocations: [] },
              sourceBundle,
            },
          },
        },
      ],
    });
    assertCapitalScenarioStoredInputLimitsMock.mockReturnValue(undefined);
    verifyPinnedCapitalSourceBundleMock.mockReturnValue({ ok: true });
    findCompletedScenarioRunMock.mockResolvedValue(null);
    findLatestScenarioRunMock.mockResolvedValue(null);
    acquireScenarioCalculationRunWithCreationMock.mockResolvedValue({
      inserted: true,
      run: {
        id: 'run-1',
        fundId: 1,
        scenarioSetId: 'scenario-set-1',
        sourceConfigId: 2,
        sourceConfigVersion: 3,
        calculationMode: 'sync_capital_plan',
        overrideType: 'capital_plan',
        inputHash: 'a'.repeat(64),
        hashKind: 'scenario-input-hash-v1',
        modelInputsAsOfDate: null,
        comparisonLineageVersion: null,
        jobId: null,
        correlationId: '11111111-1111-4111-8111-111111111111',
        status: 'queued',
      },
    });
    markScenarioCalculationRunRunningMock.mockResolvedValue(1);
    markScenarioCalculationRunCompletedMock.mockResolvedValue(1);
    calculateCapitalPlanningV1Mock.mockReturnValue({ ok: true });
    persistCapitalScenarioSnapshotMock.mockResolvedValue({ snapshotId: 7 });
    prepareCapitalCalculateResponseMock.mockReturnValue({ response: {}, serializedResponse: '{}' });
    insertScenarioSetEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails before durable writes when sync deadline already elapsed', async () => {
    let tick = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => tick++ * 6000);

    await expect(calculateFundScenarioCapitalSet(1, 'scenario-set-1')).rejects.toMatchObject({
      status: 503,
      code: 'scenario_calculation_timeout',
    });

    expect(persistCapitalScenarioSnapshotMock).not.toHaveBeenCalled();
    expect(markScenarioCalculationRunCompletedMock).not.toHaveBeenCalled();
    expect(insertScenarioSetEventMock).not.toHaveBeenCalled();
  });
});
