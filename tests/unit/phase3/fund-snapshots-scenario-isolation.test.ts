/**
 * ADR-022: Fund snapshot scenario isolation proof.
 *
 * Behavioral verification that the fund-results-read-service correctly
 * filters authoritative snapshot reads to scenarioSetId IS NULL.
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

function readyLifecycle(publishedVersion: number, legacyEvidence = false) {
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
      legacyEvidence,
      lastError: null,
    },
  };
}

type SnapshotFindFirstArg = Parameters<typeof db.query.fundSnapshots.findFirst>[0];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function collectSqlTokens(value: unknown, seen = new WeakSet<object>()): string[] {
  if (!isRecord(value)) {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  const tokens: string[] = [];
  const chunkValue = value['value'];
  if (Array.isArray(chunkValue)) {
    tokens.push(...chunkValue.filter((token): token is string => typeof token === 'string'));
  }

  const name = value['name'];
  if (typeof name === 'string') {
    tokens.push(name);
  }

  const queryChunks = value['queryChunks'];
  if (Array.isArray(queryChunks)) {
    for (const chunk of queryChunks) {
      tokens.push(...collectSqlTokens(chunk, seen));
    }
  }

  return tokens;
}

function hasScenarioSetIdNullFilter(query: SnapshotFindFirstArg): boolean {
  const where = isRecord(query) ? query['where'] : undefined;
  const tokens = collectSqlTokens(where).map((token) => token.trim().toLowerCase());
  const scenarioSetIdIndex = tokens.indexOf('scenario_set_id');

  return scenarioSetIdIndex >= 0 && tokens.slice(scenarioSetIdIndex + 1).includes('is null');
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

  it('filters every authoritative snapshot query to scenarioSetId null', async () => {
    mockFundState.getState.mockResolvedValue(readyLifecycle(3, true) as never);
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null as never);

    await fundResultsReadService.getResults(1);

    const snapshotQueries = mockDb.query.fundSnapshots.findFirst.mock.calls.map(([query]) => query);
    expect(snapshotQueries).toHaveLength(6);

    const missingScenarioSetFilterCalls = snapshotQueries
      .map((query, index) => (hasScenarioSetIdNullFilter(query) ? null : index + 1))
      .filter((index): index is number => index !== null);

    expect(missingScenarioSetFilterCalls).toEqual([]);
  });

  it('scenarioSetId column exists in fundSnapshots schema', async () => {
    const { fundSnapshots } = await import('@shared/schema');
    expect(fundSnapshots.scenarioSetId).toBeDefined();
    expect(fundSnapshots.scenarioSetId.name).toBe('scenario_set_id');
  });
});
