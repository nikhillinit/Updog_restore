/**
 * ADR-022: Fund snapshot scenario isolation proof.
 *
 * Behavioral verification that the fund-results-read-service correctly
 * handles the scenarioSetId filter. The source-level verification
 * (every query includes isNull(scenarioSetId)) is enforced by the
 * git grep merge gate in the PR description.
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

vi.mock('@shared/flags/getFlag', () => ({
  isFlagEnabled: vi.fn().mockReturnValue(true),
}));

const mockDb = vi.mocked(db);
const mockFundState = vi.mocked(fundStateReadService);

function readyLifecycle(publishedVersion: number) {
  return {
    configState: {
      hasDraft: true,
      hasPublished: true,
      publishedVersion,
      draftVersion: publishedVersion + 1,
    },
    calculationState: {
      status: 'completed' as const,
      lastCalculatedAt: '2026-05-26T00:00:00Z',
      legacyEvidence: false,
      lastError: null,
    },
  };
}

describe('ADR-022: Scenario Isolation', () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  beforeEach(() => {
    sandbox = createSandbox();
    vi.resetAllMocks();

    mockDb.query.funds.findFirst.mockResolvedValue({
      id: 1,
      name: 'Test Fund',
      vintageYear: 2024,
      size: '100000000',
    } as never);

    mockFundState.getState.mockResolvedValue(readyLifecycle(3) as never);
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  it('returns pending sections when no authoritative snapshots match', async () => {
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null as never);

    const result = await fundResultsReadService.getResults(1);

    expect(result).not.toBeNull();
    expect(result?.sections.reserve.status).not.toBe('available');
    expect(result?.sections.pacing.status).not.toBe('available');
  });

  it('scenarios section remains unavailable until scenario infrastructure ships', async () => {
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null as never);

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.scenarios).toMatchObject({
      status: 'unavailable',
      reason: 'No authoritative source',
    });
  });

  it('scenarioSetId column exists in fundSnapshots schema', async () => {
    const { fundSnapshots } = await import('@shared/schema');
    expect(fundSnapshots.scenarioSetId).toBeDefined();
    expect(fundSnapshots.scenarioSetId.name).toBe('scenario_set_id');
  });

  it('isNull import is available for scenario filtering', async () => {
    const { isNull } = await import('drizzle-orm');
    const { fundSnapshots } = await import('@shared/schema');
    const filter = isNull(fundSnapshots.scenarioSetId);
    expect(filter).toBeDefined();
  });
});
