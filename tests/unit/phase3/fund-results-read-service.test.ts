/**
 * Batch 3A2: Unit tests for FundResultsReadService
 *
 * Covers lifecycle-aware section status defaults, strict legacy fallback, and
 * timestamp fallback behavior. Unlike the route contract tests, these exercise
 * the actual service implementation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import { createSandbox } from '../../setup/test-infrastructure';
import { db } from '../../../server/db';
import { fundStateReadService } from '../../../server/services/fund-state-read-service';
import { fundResultsReadService } from '../../../server/services/fund-results-read-service';

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      funds: {
        findFirst: vi.fn(),
      },
      fundConfigs: {
        findFirst: vi.fn(),
      },
      fundSnapshots: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('../../../server/services/fund-state-read-service', () => ({
  fundStateReadService: {
    getState: vi.fn(),
  },
}));

const mockDb = db as any;
const mockFundStateReadService = fundStateReadService as any;

describe('FundResultsReadService', () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  beforeEach(() => {
    sandbox = createSandbox();
    vi.resetAllMocks();

    mockDb.query.funds.findFirst.mockResolvedValue({
      id: 1,
      name: 'Test Fund',
      vintageYear: 2024,
      size: '100000000',
    });
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(null);
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  it('does not use legacy fallback unless lifecycle derivation proved legacy evidence', async () => {
    mockFundStateReadService.getState.mockResolvedValue(
      lifecycle({
        calculationState: {
          status: 'calculating',
          configVersion: 2,
          dispatchState: 'dispatched',
          lastError: null,
          legacyEvidence: false,
          availableSnapshotTypes: [],
        },
        configState: {
          publishedVersion: 2,
          hasPublished: true,
        },
      })
    );

    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);

    const result = await fundResultsReadService.getResults(1);

    expect(result?.status).toBe('calculating');
    expect(result?.sections.reserve).toEqual({
      status: 'pending',
      reason: 'Calculations are still in progress',
    });
    expect(result?.sections.pacing).toEqual({
      status: 'pending',
      reason: 'Calculations are still in progress',
    });
    expect(mockDb.query.fundSnapshots.findFirst).toHaveBeenCalledTimes(4);
  });

  it('uses unattributed legacy snapshots when lifecycle derivation marks legacy evidence', async () => {
    mockFundStateReadService.getState.mockResolvedValue(
      lifecycle({
        calculationState: {
          status: 'ready',
          configVersion: 2,
          dispatchState: 'dispatched',
          lastError: null,
          legacyEvidence: true,
          availableSnapshotTypes: ['RESERVE', 'PACING'],
        },
        configState: {
          publishedVersion: 2,
          hasPublished: true,
        },
      })
    );

    mockDb.query.fundSnapshots.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(reserveSnapshot({ configVersion: null }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pacingSnapshot({ configVersion: null }));

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.reserve.status).toBe('available');
    expect(result?.sections.pacing.status).toBe('available');
    if (result?.sections.reserve.status === 'available') {
      expect(result.sections.reserve.legacyEvidence).toBe(true);
    }
    if (result?.sections.pacing.status === 'available') {
      expect(result.sections.pacing.legacyEvidence).toBe(true);
    }
    expect(mockDb.query.fundSnapshots.findFirst).toHaveBeenCalledTimes(6);
  });

  it('marks missing sections as failed when lifecycle status is failed', async () => {
    mockFundStateReadService.getState.mockResolvedValue(
      lifecycle({
        calculationState: {
          status: 'failed',
          configVersion: 2,
          dispatchState: 'failed',
          lastError: 'Worker crashed',
          legacyEvidence: false,
          availableSnapshotTypes: [],
        },
        configState: {
          publishedVersion: 2,
          hasPublished: true,
        },
      })
    );

    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);

    const result = await fundResultsReadService.getResults(1);

    expect(result?.status).toBe('failed');
    expect(result?.sections.reserve).toEqual({
      status: 'failed',
      reason: 'Worker crashed',
    });
    expect(result?.sections.pacing).toEqual({
      status: 'failed',
      reason: 'Worker crashed',
    });
  });

  it('falls back to createdAt when snapshotTime is null', async () => {
    const createdAt = new Date('2026-03-20T12:30:00.000Z');

    mockFundStateReadService.getState.mockResolvedValue(
      lifecycle({
        calculationState: {
          status: 'ready',
          configVersion: 3,
          dispatchState: 'dispatched',
          lastError: null,
          legacyEvidence: false,
          availableSnapshotTypes: ['RESERVE', 'PACING'],
        },
        configState: {
          publishedVersion: 3,
          hasPublished: true,
        },
      })
    );

    mockDb.query.fundSnapshots.findFirst
      .mockResolvedValueOnce(reserveSnapshot({ snapshotTime: null, createdAt, configVersion: 3 }))
      .mockResolvedValueOnce(pacingSnapshot({ createdAt, configVersion: 3 }));

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.reserve.status).toBe('available');
    if (result?.sections.reserve.status === 'available') {
      expect(result.sections.reserve.calculatedAt).toBe(createdAt.toISOString());
    }
  });

  it('returns waterfall setup from published config when config is valid', async () => {
    mockFundStateReadService.getState.mockResolvedValue(
      lifecycle({
        calculationState: {
          status: 'ready',
          configVersion: 3,
          dispatchState: 'dispatched',
          lastError: null,
          legacyEvidence: false,
          availableSnapshotTypes: ['RESERVE', 'PACING'],
        },
        configState: {
          publishedVersion: 3,
          hasPublished: true,
        },
      })
    );

    mockDb.query.fundSnapshots.findFirst
      .mockResolvedValueOnce(reserveSnapshot({ configVersion: 3 }))
      .mockResolvedValueOnce(pacingSnapshot({ configVersion: 3 }));
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(
      publishedConfigRow({
        version: 3,
        config: {
          fundName: 'Test Fund',
          waterfallType: 'american',
          waterfallTiers: [
            {
              id: 'tier-1',
              name: 'Tier 1',
              preferredReturn: 0.08,
              gpSplit: 20,
              lpSplit: 80,
              condition: 'irr',
              conditionValue: 0.08,
            },
          ],
          recyclingEnabled: true,
          recyclingType: 'both',
          recyclingCap: 25,
          recyclingPeriod: 24,
          exitRecyclingRate: 0.5,
          mgmtFeeRecyclingRate: 0.25,
          allowFutureRecycling: false,
        },
      })
    );

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.waterfall.status).toBe('available');
    if (result?.sections.waterfall.status === 'available') {
      expect(result.sections.waterfall.source).toBe('fund_config');
      expect(result.sections.waterfall.configVersion).toBe(3);
      expect(result.sections.waterfall.payload.tierCount).toBe(1);
      expect(result.sections.waterfall.payload.tiers[0]).toMatchObject({
        name: 'Tier 1',
        gpSplit: 20,
        lpSplit: 80,
        condition: 'irr',
        conditionValue: 0.08,
      });
      expect(result.sections.waterfall.payload.recyclingType).toBe('both');
    }
  });

  it('fails only the waterfall section when published config is invalid', async () => {
    mockFundStateReadService.getState.mockResolvedValue(
      lifecycle({
        calculationState: {
          status: 'ready',
          configVersion: 4,
          dispatchState: 'dispatched',
          lastError: null,
          legacyEvidence: false,
          availableSnapshotTypes: ['RESERVE', 'PACING'],
        },
        configState: {
          publishedVersion: 4,
          hasPublished: true,
        },
      })
    );

    mockDb.query.fundSnapshots.findFirst
      .mockResolvedValueOnce(reserveSnapshot({ configVersion: 4 }))
      .mockResolvedValueOnce(pacingSnapshot({ configVersion: 4 }));
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(
      publishedConfigRow({
        version: 4,
        rawConfig: { waterfallType: 'american' },
      })
    );

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.reserve.status).toBe('available');
    expect(result?.sections.pacing.status).toBe('available');
    expect(result?.sections.waterfall).toEqual({
      status: 'failed',
      reason: 'Published config is invalid',
      reasonCode: 'INVALID_PUBLISHED_CONFIG',
    });
  });

  it('scorecard is unavailable when lifecycle is ready but no snapshot-backed facts exist', async () => {
    mockFundStateReadService.getState.mockResolvedValue(lifecycle());
    mockDb.query.fundSnapshots.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.scorecard.status).toBe('unavailable');
    expect(result?.sections.scorecard).toEqual({
      status: 'unavailable',
      reason: 'No calculation results available',
    });
  });

  it('scorecard includes snapshot facts when reserve and pacing are available', async () => {
    mockFundStateReadService.getState.mockResolvedValue(lifecycle());
    mockDb.query.fundSnapshots.findFirst
      .mockResolvedValueOnce(reserveSnapshot())
      .mockResolvedValueOnce(pacingSnapshot());

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.scorecard.status).toBe('available');
    if (result?.sections.scorecard.status === 'available') {
      expect(result.sections.scorecard.payload.reserveRatio).toEqual({
        value: 0.4,
        source: 'fund_snapshots',
      });
      expect(result.sections.scorecard.payload.avgConfidence).toEqual({
        value: 0.85,
        source: 'fund_snapshots',
      });
      expect(result.sections.scorecard.payload.yearsToFullDeploy).toEqual({
        value: 5,
        source: 'fund_snapshots',
      });
      expect(result.sections.scorecard.payload.lastCalculatedAt).toEqual({
        value: '2026-03-20T12:30:00.000Z',
        source: 'fund_state',
      });
    }
  });

  it('scenarios section returns unavailable with reasonCode', async () => {
    mockFundStateReadService.getState.mockResolvedValue(lifecycle());
    mockDb.query.fundSnapshots.findFirst
      .mockResolvedValueOnce(reserveSnapshot())
      .mockResolvedValueOnce(pacingSnapshot());

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.scenarios).toEqual({
      status: 'unavailable',
      reason: 'No authoritative source',
      reasonCode: 'NO_AUTHORITATIVE_SOURCE',
    });
  });

  // -- State matrix driven tests (plan lines 354-363) --

  it('state matrix: no published config -> waterfall unavailable with NO_PUBLISHED_CONFIG', async () => {
    mockFundStateReadService.getState.mockResolvedValue(
      lifecycle({
        configState: {
          publishedVersion: null,
          hasPublished: false,
        },
        calculationState: {
          status: 'not_requested',
          configVersion: null,
          dispatchState: null,
          lastError: null,
          legacyEvidence: false,
          availableSnapshotTypes: [],
        },
      })
    );
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.waterfall).toMatchObject({
      status: 'unavailable',
      reasonCode: 'NO_PUBLISHED_CONFIG',
    });
    expect(result?.sections.scorecard).toEqual({
      status: 'pending',
      reason: 'Calculations not yet requested',
    });
    expect(result?.sections.scenarios.status).toBe('unavailable');
  });

  it('state matrix: ready with snapshots -> full Track A experience', async () => {
    mockFundStateReadService.getState.mockResolvedValue(lifecycle());
    mockDb.query.fundSnapshots.findFirst
      .mockResolvedValueOnce(reserveSnapshot())
      .mockResolvedValueOnce(pacingSnapshot());
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(publishedConfigRow());

    const result = await fundResultsReadService.getResults(1);

    expect(result?.status).toBe('ready');
    expect(result?.sections.reserve.status).toBe('available');
    expect(result?.sections.pacing.status).toBe('available');
    expect(result?.sections.scorecard.status).toBe('available');
    expect(result?.sections.waterfall.status).toBe('available');
    expect(result?.sections.scenarios.status).toBe('unavailable');
  });

  it('state matrix: ready but snapshots missing -> scorecard unavailable, waterfall available', async () => {
    mockFundStateReadService.getState.mockResolvedValue(lifecycle());
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(publishedConfigRow());

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.reserve.status).toBe('unavailable');
    expect(result?.sections.pacing.status).toBe('unavailable');
    expect(result?.sections.scorecard).toEqual({
      status: 'unavailable',
      reason: 'No calculation results available',
    });
    expect(result?.sections.waterfall.status).toBe('available');
  });

  it('state matrix: failed lifecycle with no evidence -> snapshot-backed sections fail', async () => {
    mockFundStateReadService.getState.mockResolvedValue(
      lifecycle({
        calculationState: {
          status: 'failed',
          configVersion: 1,
          dispatchState: 'dispatched',
          lastError: 'Calculation timed out',
          legacyEvidence: false,
          availableSnapshotTypes: [],
        },
      })
    );
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null);
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(publishedConfigRow());

    const result = await fundResultsReadService.getResults(1);

    expect(result?.status).toBe('failed');
    expect(result?.sections.reserve.status).toBe('failed');
    expect(result?.sections.pacing.status).toBe('failed');
    expect(result?.sections.scorecard).toEqual({
      status: 'failed',
      reason: 'Calculation timed out',
    });
    // Waterfall still available from config
    expect(result?.sections.waterfall.status).toBe('available');
  });

  it('marks snapshot-backed sections as stale when only prior-version snapshots exist', async () => {
    mockFundStateReadService.getState.mockResolvedValue(
      lifecycle({
        configState: {
          publishedVersion: 2,
          hasPublished: true,
        },
        calculationState: {
          status: 'not_requested',
          configVersion: null,
          dispatchState: null,
          lastError: null,
          legacyEvidence: false,
          availableSnapshotTypes: [],
        },
      })
    );
    mockDb.query.fundSnapshots.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(reserveSnapshot({ configVersion: 1 }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pacingSnapshot({ configVersion: 1 }));

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.reserve).toEqual({
      status: 'pending',
      reason: 'A newer configuration was published. Request recalculation to update.',
      reasonCode: 'STALE_EVIDENCE',
    });
    expect(result?.sections.pacing).toEqual({
      status: 'pending',
      reason: 'A newer configuration was published. Request recalculation to update.',
      reasonCode: 'STALE_EVIDENCE',
    });
    expect(result?.sections.scorecard).toEqual({
      status: 'pending',
      reason: 'A newer configuration was published. Request recalculation to update.',
      reasonCode: 'STALE_EVIDENCE',
    });
  });

  // -- Mixed-evidence coherence (plan lines 855-857) --

  it('scorecard omits stale legacy facts when reserve is legacy and pacing is current-version', async () => {
    mockFundStateReadService.getState.mockResolvedValue(
      lifecycle({
        calculationState: {
          status: 'ready',
          configVersion: 2,
          dispatchState: 'dispatched',
          lastError: null,
          legacyEvidence: true,
          availableSnapshotTypes: ['RESERVE', 'PACING'],
        },
        configState: {
          publishedVersion: 2,
          hasPublished: true,
        },
      })
    );

    // Reserve: no v2 snapshot, falls back to legacy (configVersion=null)
    // Pacing: has v2 snapshot
    mockDb.query.fundSnapshots.findFirst
      // Reserve tier 1: no exact-version match
      .mockResolvedValueOnce(null)
      // Reserve stale check: no prior-version attributed
      .mockResolvedValueOnce(null)
      // Reserve tier 2: legacy unattributed snapshot found
      .mockResolvedValueOnce(reserveSnapshot({ configVersion: null }))
      // Pacing tier 1: exact-version match found
      .mockResolvedValueOnce(pacingSnapshot({ configVersion: 2 }));

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.scorecard.status).toBe('available');
    if (result?.sections.scorecard.status === 'available') {
      // Pacing facts should be present (current-version evidence)
      expect(result.sections.scorecard.payload.yearsToFullDeploy).toBeDefined();
      // Reserve facts should be omitted (legacy evidence mixed with current)
      expect(result.sections.scorecard.payload.reserveRatio).toBeUndefined();
      expect(result.sections.scorecard.payload.avgConfidence).toBeUndefined();
    }
  });

  // -- engineResults regression (plan line 653-654) --

  it('populated funds.engineResults does not change 3C DTO output', async () => {
    mockDb.query.funds.findFirst.mockResolvedValue({
      id: 1,
      name: 'Test Fund',
      vintageYear: 2024,
      size: '100000000',
      engineResults: { moic: 2.5, irr: 0.15, scenarios: [] },
    });
    mockFundStateReadService.getState.mockResolvedValue(lifecycle());
    mockDb.query.fundSnapshots.findFirst
      .mockResolvedValueOnce(reserveSnapshot())
      .mockResolvedValueOnce(pacingSnapshot());
    mockDb.query.fundConfigs.findFirst.mockResolvedValue(publishedConfigRow());

    const result = await fundResultsReadService.getResults(1);

    // engineResults should NOT appear anywhere in the DTO
    const json = JSON.stringify(result);
    expect(json).not.toContain('moic');
    expect(json).not.toContain('"irr"');
    // Scorecard does not include speculative fields
    if (result?.sections.scorecard.status === 'available') {
      expect(result.sections.scorecard.payload).not.toHaveProperty('expectedMOIC');
      expect(result.sections.scorecard.payload).not.toHaveProperty('netIRR');
    }
  });
});

function lifecycle(overrides: Record<string, unknown> = {}) {
  const base = {
    fundId: 1,
    configState: {
      latestVersion: 1,
      draftVersion: null,
      publishedVersion: 1,
      hasDraft: false,
      hasPublished: true,
      publishedAt: '2026-03-20T12:00:00.000Z',
      draftUpdatedAt: null,
      publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
    },
    calculationState: {
      status: 'ready',
      configVersion: 1,
      runId: 10,
      correlationId: 'test-corr-id',
      dispatchState: 'dispatched',
      availableSnapshotTypes: ['RESERVE', 'PACING'],
      expectedSnapshotTypes: ['RESERVE', 'PACING'],
      lastCalculatedAt: '2026-03-20T12:30:00.000Z',
      lastError: null,
      legacyEvidence: false,
    },
    legacy: { engineResultsPresent: false },
  };

  return {
    ...base,
    ...overrides,
    configState: {
      ...base.configState,
      ...(overrides['configState'] as Record<string, unknown> | undefined),
    },
    calculationState: {
      ...base.calculationState,
      ...(overrides['calculationState'] as Record<string, unknown> | undefined),
    },
  };
}

function reserveSnapshot(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date('2026-03-20T12:30:00.000Z');

  return {
    payload: {
      fundId: 1,
      totalAllocation: 40_000_000,
      avgConfidence: 0.85,
      highConfidenceCount: 2,
      allocations: [
        { allocation: 15_000_000, confidence: 0.9, rationale: 'Follow-on reserve' },
        { allocation: 25_000_000, confidence: 0.8, rationale: 'Series B support' },
      ],
      generatedAt: createdAt,
    },
    snapshotTime: createdAt,
    createdAt,
    configVersion: 1,
    ...overrides,
  };
}

function pacingSnapshot(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date('2026-03-20T12:30:00.000Z');

  return {
    payload: {
      fundSize: 100_000_000,
      totalQuarters: 20,
      avgQuarterlyDeployment: 5_000_000,
      marketCondition: 'neutral',
      deployments: [{ quarter: 1, deployment: 5_000_000, note: 'Q1 deployment' }],
      generatedAt: createdAt,
    },
    snapshotTime: createdAt,
    createdAt,
    configVersion: 1,
    ...overrides,
  };
}

function publishedConfigRow(
  overrides: Record<string, unknown> & {
    config?: Record<string, unknown>;
    rawConfig?: unknown;
  } = {}
) {
  const publishedAt = new Date('2026-03-20T12:00:00.000Z');
  const defaultConfigInput = {
    fundName: 'Test Fund',
    waterfallType: 'american',
    waterfallTiers: [{ id: 'tier-1', name: 'Tier 1', gpSplit: 20, lpSplit: 80 }],
  };
  const { config, rawConfig, ...rest } = overrides;
  const parsedConfig =
    rawConfig ??
    FundDraftWriteV1Schema.parse({
      ...defaultConfigInput,
      ...(config ?? {}),
    });

  return {
    id: 10,
    fundId: 1,
    version: 1,
    config: parsedConfig,
    isDraft: false,
    isPublished: true,
    publishedAt,
    createdAt: publishedAt,
    updatedAt: publishedAt,
    ...rest,
  };
}
