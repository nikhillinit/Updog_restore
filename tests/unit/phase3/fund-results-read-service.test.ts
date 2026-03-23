/**
 * Batch 3A2: Unit tests for FundResultsReadService
 *
 * Covers lifecycle-aware section status defaults, strict legacy fallback, and
 * timestamp fallback behavior. Unlike the route contract tests, these exercise
 * the actual service implementation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(mockDb.query.fundSnapshots.findFirst).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce(reserveSnapshot({ configVersion: null }))
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
    expect(mockDb.query.fundSnapshots.findFirst).toHaveBeenCalledTimes(4);
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
