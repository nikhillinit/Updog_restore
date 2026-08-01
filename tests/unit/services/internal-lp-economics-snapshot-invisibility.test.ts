/**
 * T-A6 (WP-L3 Phase A): `'INTERNAL_LP_ECONOMICS'` enrollment in
 * `NON_TIMELINE_SNAPSHOT_TYPES` plus regression coverage over BOTH fail-open
 * readers (G3): `fund-state-read-service.ts` and `time-travel-analytics.ts`
 * exclude non-timeline types via a `notInArray` denylist, so a type that is
 * not enrolled silently leaks into timeline reconstruction. These fixtures
 * prove the new result-snapshot type is invisible to both readers and that
 * the pre-existing timeline output is byte-identical before and after an
 * INTERNAL_LP_ECONOMICS snapshot exists.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as schema from '@shared/schema';
import { fundConfigs, fundSnapshots } from '@shared/schema';
import { NON_TIMELINE_SNAPSHOT_TYPES } from '@shared/schema/fund';
import type { SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { TimeTravelAnalyticsService } from '../../../server/services/time-travel-analytics';
import { fundStateReadService } from '../../../server/services/fund-state-read-service';
import { AUTHORITATIVE_SNAPSHOT_TYPES } from '../../../shared/contracts/fund-authoritative-calculations.contract';
import { EXPECTED_SNAPSHOT_TYPES } from '../../../shared/contracts/fund-state-read-v1.contract';

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
  id: 201,
  fundId: 1,
  type: 'RESERVE',
  snapshotTime: new Date('2026-07-30T12:00:00.000Z'),
  createdAt: new Date('2026-07-30T12:00:00.000Z'),
  eventCount: 5,
  stateHash: 'reserve-state-hash',
  state: {
    totalValue: 2_000_000,
    deployedCapital: 1_250_000,
    portfolioCount: 3,
    companies: [],
    sectorBreakdown: {},
    stageBreakdown: {},
  },
  configVersion: 4,
  scenarioSetId: null,
};

const internalLpEconomicsSnapshot: SnapshotSeed = {
  id: 202,
  fundId: 1,
  type: 'INTERNAL_LP_ECONOMICS',
  snapshotTime: new Date('2026-07-31T12:00:00.000Z'),
  createdAt: new Date('2026-07-31T12:00:00.000Z'),
  eventCount: 0,
  stateHash: 'internal-lp-economics-payload-hash',
  state: null,
  configVersion: null,
  scenarioSetId: null,
};

let seededSnapshots: SnapshotSeed[] = [];

function executeQuery(state: QueryState): unknown[] {
  if (state.table === fundConfigs) {
    return [{ maxVersion: 4 }];
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

function expectInternalLpEconomicsDenylisted(queryCount: number): void {
  expect(snapshotQuerySql).toHaveLength(queryCount);
  for (const query of snapshotQuerySql) {
    expect(query.sql).toContain('"fund_snapshots"."type" not in');
    expect(query.params).toContain('INTERNAL_LP_ECONOMICS');
  }
}

describe('INTERNAL_LP_ECONOMICS snapshot invisibility (T-A6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seededSnapshots = [reserveSnapshot];
    snapshotQuerySql.length = 0;
    mockDb.select.mockImplementation(() => createQueryChain());
  });

  it('enrolls INTERNAL_LP_ECONOMICS in NON_TIMELINE_SNAPSHOT_TYPES', () => {
    expect(NON_TIMELINE_SNAPSHOT_TYPES).toContain('INTERNAL_LP_ECONOMICS');
    expect(NON_TIMELINE_SNAPSHOT_TYPES).toContain('CURRENT_FORECAST_V2');
    expect(NON_TIMELINE_SNAPSHOT_TYPES).toContain('RESERVE_INTELLIGENCE');
  });

  it('keeps time-travel reconstruction unchanged when an INTERNAL_LP_ECONOMICS row exists', async () => {
    const service = new TimeTravelAnalyticsService(
      mockDb as unknown as NodePgDatabase<typeof schema>
    );
    const targetTime = new Date('2026-08-01T12:00:00.000Z');

    const reserveOnly = await service.getStateAtTime(1, targetTime);
    seededSnapshots = [reserveSnapshot, internalLpEconomicsSnapshot];
    const withEconomicsResult = await service.getStateAtTime(1, targetTime);

    expect(JSON.stringify(withEconomicsResult)).toBe(JSON.stringify(reserveOnly));
    expect(withEconomicsResult.snapshot.id).toBe(String(reserveSnapshot.id));
    expect(withEconomicsResult.state).toEqual(reserveSnapshot.state);
    expectInternalLpEconomicsDenylisted(2);
  });

  it('keeps fund-state read output unchanged when an INTERNAL_LP_ECONOMICS row exists', async () => {
    mockDb.query.funds.findFirst.mockResolvedValue({ id: 1, engineResults: null });
    mockDb.query.fundConfigs.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: 4,
        publishedAt: new Date('2026-07-29T12:00:00.000Z'),
        updatedAt: new Date('2026-07-29T12:00:00.000Z'),
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: 4,
        publishedAt: new Date('2026-07-29T12:00:00.000Z'),
        updatedAt: new Date('2026-07-29T12:00:00.000Z'),
      });
    mockDb.query.calcRuns.findFirst.mockResolvedValue({
      id: 21,
      configVersion: 4,
      correlationId: 'wp-l3-phase-a-regression',
      dispatchState: 'dispatched',
      lastError: null,
    });

    const reserveOnly = await fundStateReadService.getState(1);
    seededSnapshots = [reserveSnapshot, internalLpEconomicsSnapshot];
    const withEconomicsResult = await fundStateReadService.getState(1);

    expect(JSON.stringify(withEconomicsResult)).toBe(JSON.stringify(reserveOnly));
    expect(withEconomicsResult?.calculationState.availableSnapshotTypes).toEqual(['RESERVE']);
    expectInternalLpEconomicsDenylisted(2);
  });

  it('omits INTERNAL_LP_ECONOMICS from timeline snapshot listings', async () => {
    const service = new TimeTravelAnalyticsService(
      mockDb as unknown as NodePgDatabase<typeof schema>
    );
    const reserveOnly = await service.getTimelineEvents(1);
    seededSnapshots = [reserveSnapshot, internalLpEconomicsSnapshot];
    const withEconomicsResult = await service.getTimelineEvents(1);

    expect(JSON.stringify(withEconomicsResult)).toBe(JSON.stringify(reserveOnly));
    expect(withEconomicsResult.snapshots.map((snapshot) => snapshot.id)).toEqual([
      reserveSnapshot.id,
    ]);
    expectInternalLpEconomicsDenylisted(2);
  });

  it('does not promote INTERNAL_LP_ECONOMICS into authoritative readiness types', () => {
    expect(AUTHORITATIVE_SNAPSHOT_TYPES).not.toContain('INTERNAL_LP_ECONOMICS');
    expect(EXPECTED_SNAPSHOT_TYPES).not.toContain('INTERNAL_LP_ECONOMICS');
  });
});
