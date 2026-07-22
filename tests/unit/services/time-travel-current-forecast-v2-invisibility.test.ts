import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as schema from '@shared/schema';
import { fundConfigs, fundSnapshots } from '@shared/schema';
import type { SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { TimeTravelAnalyticsService } from '../../../server/services/time-travel-analytics';
import { fundStateReadService } from '../../../server/services/fund-state-read-service';

const mockDb = vi.hoisted(() => ({
  query: {
    funds: { findFirst: vi.fn() },
    fundConfigs: { findFirst: vi.fn() },
    calcRuns: { findFirst: vi.fn() },
  },
  select: vi.fn(),
}));

vi.mock('../../../server/db', () => ({ db: mockDb }));

interface SnapshotSeed {
  id: number;
  fundId: number;
  type: string;
  snapshotTime: Date;
  createdAt: Date;
  eventCount: number;
  stateHash: string;
  state: Record<string, unknown> | null;
  configVersion: number | null;
  scenarioSetId: string | null;
}

interface QueryState {
  table?: unknown;
  where?: unknown;
  limit?: number;
}

interface QueryChain extends PromiseLike<unknown[]> {
  from(table: unknown): QueryChain;
  where(clause: unknown): QueryChain;
  orderBy(...clauses: unknown[]): QueryChain;
  limit(value: number): QueryChain;
  offset(value: number): QueryChain;
}

const dialect = new PgDialect();
const snapshotQuerySql: Array<{ sql: string; params: unknown[] }> = [];

const reserveSnapshot: SnapshotSeed = {
  id: 101,
  fundId: 1,
  type: 'RESERVE',
  snapshotTime: new Date('2026-07-20T12:00:00.000Z'),
  createdAt: new Date('2026-07-20T12:00:00.000Z'),
  eventCount: 7,
  stateHash: 'reserve-state-hash',
  state: {
    totalValue: 1_500_000,
    deployedCapital: 1_000_000,
    portfolioCount: 2,
    companies: [],
    sectorBreakdown: {},
    stageBreakdown: {},
  },
  configVersion: 3,
  scenarioSetId: null,
};

const currentForecastSnapshot: SnapshotSeed = {
  id: 102,
  fundId: 1,
  type: 'CURRENT_FORECAST_V2',
  snapshotTime: new Date('2026-07-21T12:00:00.000Z'),
  createdAt: new Date('2026-07-21T12:00:00.000Z'),
  eventCount: 0,
  stateHash: 'current-forecast-payload-hash',
  state: null,
  configVersion: 3,
  scenarioSetId: null,
};

let seededSnapshots: SnapshotSeed[] = [];

function executeQuery(state: QueryState): unknown[] {
  if (state.table === fundConfigs) {
    return [{ maxVersion: 3 }];
  }

  if (state.table !== fundSnapshots) {
    return [];
  }

  let rows = [...seededSnapshots];
  if (state.where) {
    const rendered = dialect.sqlToQuery(state.where as SQL<unknown>);
    snapshotQuerySql.push(rendered);

    if (rendered.sql.includes('"fund_snapshots"."type" not in')) {
      const excludedTypes = new Set(
        rendered.params.filter((param): param is string => typeof param === 'string')
      );
      rows = rows.filter((row) => !excludedTypes.has(row.type));
    }
  }

  rows.sort((left, right) => right.snapshotTime.getTime() - left.snapshotTime.getTime());
  return state.limit === undefined ? rows : rows.slice(0, state.limit);
}

function createQueryChain(): QueryChain {
  const state: QueryState = {};
  const chain: QueryChain = {
    from(table) {
      state.table = table;
      return chain;
    },
    where(clause) {
      state.where = clause;
      return chain;
    },
    orderBy() {
      return chain;
    },
    limit(value) {
      state.limit = value;
      return chain;
    },
    offset() {
      return chain;
    },
    then(onfulfilled, onrejected) {
      return Promise.resolve(executeQuery(state)).then(onfulfilled, onrejected);
    },
  };
  return chain;
}

function expectCurrentForecastDenylist(queryCount: number): void {
  expect(snapshotQuerySql).toHaveLength(queryCount);
  for (const query of snapshotQuerySql) {
    expect(query.sql).toContain('"fund_snapshots"."type" not in');
    expect(query.params).toContain('CURRENT_FORECAST_V2');
  }
}

describe('CURRENT_FORECAST_V2 snapshot invisibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seededSnapshots = [reserveSnapshot];
    snapshotQuerySql.length = 0;
    mockDb.select.mockImplementation(() => createQueryChain());
  });

  it('does not change timeline reconstruction while the RESERVE snapshot remains readable', async () => {
    const service = new TimeTravelAnalyticsService(
      mockDb as unknown as NodePgDatabase<typeof schema>
    );
    const targetTime = new Date('2026-07-22T12:00:00.000Z');

    const reserveOnly = await service.getStateAtTime(1, targetTime);
    seededSnapshots = [reserveSnapshot, currentForecastSnapshot];
    const withCurrentForecast = await service.getStateAtTime(1, targetTime);

    expect(JSON.stringify(withCurrentForecast)).toBe(JSON.stringify(reserveOnly));
    expect(withCurrentForecast.snapshot.id).toBe(String(reserveSnapshot.id));
    expect(withCurrentForecast.state).toEqual(reserveSnapshot.state);
    expectCurrentForecastDenylist(2);
  });

  it('does not change fund-state read output while the RESERVE type remains available', async () => {
    mockDb.query.funds.findFirst.mockResolvedValue({ id: 1, engineResults: null });
    mockDb.query.fundConfigs.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: 3,
        publishedAt: new Date('2026-07-19T12:00:00.000Z'),
        updatedAt: new Date('2026-07-19T12:00:00.000Z'),
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: 3,
        publishedAt: new Date('2026-07-19T12:00:00.000Z'),
        updatedAt: new Date('2026-07-19T12:00:00.000Z'),
      });
    mockDb.query.calcRuns.findFirst.mockResolvedValue({
      id: 11,
      configVersion: 3,
      correlationId: 'phase-a-regression',
      dispatchState: 'dispatched',
      lastError: null,
    });

    const reserveOnly = await fundStateReadService.getState(1);
    seededSnapshots = [reserveSnapshot, currentForecastSnapshot];
    const withCurrentForecast = await fundStateReadService.getState(1);

    expect(JSON.stringify(withCurrentForecast)).toBe(JSON.stringify(reserveOnly));
    expect(withCurrentForecast?.calculationState.availableSnapshotTypes).toEqual(['RESERVE']);
    expectCurrentForecastDenylist(2);
  });
});
