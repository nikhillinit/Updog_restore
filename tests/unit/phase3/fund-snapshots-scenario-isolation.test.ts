/**
 * ADR-022: Fund snapshot scenario isolation proof.
 *
 * Behavioral verification that the fund-results-read-service correctly
 * filters authoritative snapshot reads to scenarioSetId IS NULL.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../../setup/test-infrastructure';
import { db } from '../../../server/db';
import { fundStateReadService } from '../../../server/services/fund-state-read-service';
import { fundResultsReadService } from '../../../server/services/fund-results-read-service';

const scenarioCalculationServiceMocks = vi.hoisted(() => ({
  getAllScenarioResultsForFund: vi.fn(),
  worstScenarioStaleness: vi.fn((states: string[]) => {
    if (states.includes('STALE_CONFIG')) {
      return 'STALE_CONFIG';
    }
    if (states.includes('STALE_PUBLISH')) {
      return 'STALE_PUBLISH';
    }
    return 'CURRENT';
  }),
}));

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

vi.mock('../../../server/services/fund-scenario-calculation-service', () => ({
  getAllScenarioResultsForFund: scenarioCalculationServiceMocks.getAllScenarioResultsForFund,
  worstScenarioStaleness: scenarioCalculationServiceMocks.worstScenarioStaleness,
}));

vi.mock('@shared/flags/getFlag', () => ({
  isFlagEnabled: vi.fn().mockReturnValue(true),
}));

const mockDb = vi.mocked(db);
const mockFundState = vi.mocked(fundStateReadService);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const authoritativeReaderFilter = 'isNull(fundSnapshots.scenarioSetId)';
const authoritativeWriterClassification =
  'ADR-022: authoritative-only writer. scenario_set_id intentionally omitted (defaults to NULL).';
const authoritativeReadContracts = [
  ['server/routes/fund-config.ts', 1],
  ['server/services/calc-run-tracking.ts', 1],
  ['server/services/fund-persistence-service.ts', 1],
  ['server/services/fund-results-comparison-service.ts', 2],
  ['server/services/fund-results-read-service.ts', 5],
  ['server/services/fund-state-read-service.ts', 1],
  ['server/services/time-travel-analytics.ts', 3],
  ['server/services/variance-tracking/baseline-service.ts', 4],
  ['server/services/variance-tracking/calculation-service.ts', 2],
  ['workers/report-worker.ts', 1],
] as const;
const authoritativeWriterContracts = [
  'server/services/economics-calculation-service.ts',
  'server/services/monte-carlo-simulation.ts',
  'server/services/pacing-calculation-service.ts',
  'server/services/reserve-calculation-service.ts',
  'server/services/reserve-optimization-calculator.ts',
] as const;

async function readRepoFile(relativePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function countOccurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

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

    scenarioCalculationServiceMocks.getAllScenarioResultsForFund.mockResolvedValue({
      kind: 'none_exist',
    });
    scenarioCalculationServiceMocks.worstScenarioStaleness.mockImplementation(
      (states: string[]) => {
        if (states.includes('STALE_CONFIG')) {
          return 'STALE_CONFIG';
        }
        if (states.includes('STALE_PUBLISH')) {
          return 'STALE_PUBLISH';
        }
        return 'CURRENT';
      }
    );

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

  it('reports no scenario sets when no scenario sets exist', async () => {
    mockDb.query.fundSnapshots.findFirst.mockResolvedValue(null as never);

    const result = await fundResultsReadService.getResults(1);

    expect(result?.sections.scenarios).toMatchObject({
      status: 'unavailable',
      reason: 'No scenario sets exist for this fund',
      reasonCode: 'SCENARIOS_NONE_EXIST',
    });
    expect(scenarioCalculationServiceMocks.getAllScenarioResultsForFund).toHaveBeenCalledWith(1);
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

  it('migration creates authoritative and scenario isolation indexes', async () => {
    const migration = await readRepoFile('server/db/migrations/0012_scenario_set_id.sql');

    expect(migration.includes('ADD COLUMN IF NOT EXISTS scenario_set_id UUID NULL')).toBe(true);
    expect(migration.includes('idx_fund_snapshots_authoritative')).toBe(true);
    expect(migration.includes('WHERE scenario_set_id IS NULL')).toBe(true);
    expect(migration.includes('idx_fund_snapshots_scenario_set')).toBe(true);
    expect(migration.includes('WHERE scenario_set_id IS NOT NULL')).toBe(true);
  });

  it('source-level contract keeps every authoritative reader scenario-isolated', async () => {
    for (const [relativePath, expectedCount] of authoritativeReadContracts) {
      const source = await readRepoFile(relativePath);
      expect(countOccurrences(source, authoritativeReaderFilter), relativePath).toBe(expectedCount);
    }
  });

  it('source-level contract keeps authoritative writers null-classified', async () => {
    for (const relativePath of authoritativeWriterContracts) {
      const source = await readRepoFile(relativePath);
      expect(source.includes(authoritativeWriterClassification), relativePath).toBe(true);
    }
  });
});
