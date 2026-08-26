/**
 * SensitivityRunService -- service-level unit tests.
 *
 * Mocking strategy: we use vi.mock('../../../server/db', ...) with manual
 * insert/select/update/transaction implementations rather than relying on the
 * shared database-mock helper. The shared mock's relational query interface
 * (createQueryInterface) hard-codes a small allowlist of tables and does NOT
 * include sensitivity_runs, so db.query.sensitivityRuns.* would be undefined.
 * The variance-tracking.test.ts file uses the same inline-mock pattern for the
 * same reason; we follow it here for consistency.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

type Row = Record<string, unknown>;

// vi.mock factories are hoisted above all top-level statements, so any state
// they reference must be declared via vi.hoisted(). This block is the single
// source of truth for the in-memory mock store.
const { state, resetState } = vi.hoisted(() => {
  const s = {
    rows: [] as Array<Record<string, unknown>>,
    nextId: 1,
  };
  return {
    state: s,
    resetState: () => {
      s.rows = [];
      s.nextId = 1;
    },
  };
});

vi.mock('../../../server/db', () => {
  // Insert: db.insert(table).values(data).returning()
  const insertMock = vi.fn(() => ({
    values: vi.fn((data: Row) => ({
      returning: vi.fn(async () => {
        const row: Row = {
          id: state.nextId++,
          createdAt: new Date(),
          completedAt: null,
          durationMs: null,
          errorCode: null,
          errorMessage: null,
          results: null,
          ...data,
        };
        state.rows.push(row);
        return [row];
      }),
    })),
  }));

  // Update: db.update(table).set(data).where(cond).returning()
  const updateMock = vi.fn(() => ({
    set: vi.fn((updates: Row) => ({
      where: vi.fn((predicate: (row: Row) => boolean) => ({
        returning: vi.fn(async () => {
          const updated: Row[] = [];
          state.rows = state.rows.map((row) => {
            if (typeof predicate === 'function' && predicate(row)) {
              const next = { ...row, ...updates };
              updated.push(next);
              return next;
            }
            return row;
          });
          return updated;
        }),
      })),
    })),
  }));

  // Select: db.select().from(table).where(cond).orderBy(...).limit(n)
  // Predicate is intentionally a plain function passed by the service via the
  // makeWherePredicate helper -- the production code uses Drizzle eq()/and()
  // which is opaque to this mock, so we exercise the service through a
  // module-level helper. See the docs in sensitivity-run-service.ts.
  const makeSelectChain = () => {
    let predicate: ((row: Row) => boolean) | undefined;
    let sortFn: ((a: Row, b: Row) => number) | undefined;
    let limitN: number | undefined;

    const chain: Record<string, unknown> = {
      from: vi.fn(() => chain),
      where: vi.fn((p: (row: Row) => boolean) => {
        predicate = p;
        return chain;
      }),
      orderBy: vi.fn((s: (a: Row, b: Row) => number) => {
        sortFn = s;
        return chain;
      }),
      limit: vi.fn((n: number) => {
        limitN = n;
        return chain;
      }),
      execute: vi.fn(async () => runQuery()),
      then: vi.fn((onFulfilled: (v: Row[]) => unknown, onRejected?: (r: unknown) => unknown) =>
        Promise.resolve(runQuery()).then(onFulfilled, onRejected)
      ),
    };

    function runQuery(): Row[] {
      let out = state.rows.slice();
      if (predicate) out = out.filter(predicate);
      if (sortFn) out = out.sort(sortFn);
      if (typeof limitN === 'number') out = out.slice(0, limitN);
      return out;
    }

    return chain;
  };

  const selectMock = vi.fn(() => makeSelectChain());

  const transactionMock = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      insert: insertMock,
      update: updateMock,
      select: selectMock,
    };
    return fn(tx);
  });

  return {
    db: {
      insert: insertMock,
      update: updateMock,
      select: selectMock,
      transaction: transactionMock,
      __state: state,
    },
  };
});

// Import AFTER vi.mock so the service binds to the mock.
import {
  SensitivityRunService,
  __setQueryHelpers,
} from '../../../server/services/sensitivity-run-service';

describe('SensitivityRunService', () => {
  let service: SensitivityRunService;

  beforeEach(() => {
    resetState();
    service = new SensitivityRunService();
    // Wire the service's where/orderBy expressions to plain JS predicates that
    // the mock above understands. Production code passes Drizzle SQL fragments;
    // this hook lets the unit test substitute equivalent JS lambdas.
    __setQueryHelpers({
      eqFundAndId: (fundId: number, id: number) => (row: Record<string, unknown>) =>
        row.fundId === fundId && row.id === id,
      eqId: (id: number) => (row: Record<string, unknown>) => row.id === id,
      eqFund: (fundId: number, kind?: string) => (row: Record<string, unknown>) => {
        if (row.fundId !== fundId) return false;
        if (kind && row.kind !== kind) return false;
        return true;
      },
      orderByCreatedDescIdDesc: (a: Record<string, unknown>, b: Record<string, unknown>) => {
        const at = (a.createdAt as Date)?.getTime?.() ?? 0;
        const bt = (b.createdAt as Date)?.getTime?.() ?? 0;
        if (bt !== at) return bt - at;
        return Number(b.id) - Number(a.id);
      },
    });
  });

  describe('createPending', () => {
    it('inserts a row with status="pending" and returns it', async () => {
      const params = { variables: ['mgmt_fee'], range: { min: 0, max: 0.05 } };
      const row = await service.createPending(1, 'one_way', params, 7);

      expect(row.id).toBeDefined();
      expect(row.fundId).toBe(1);
      expect(row.kind).toBe('one_way');
      expect(row.status).toBe('pending');
      expect(row.createdBy).toBe(7);
      expect(row.completedAt).toBeNull();
      expect(row.results).toBeNull();
    });

    it('persists the params JSONB exactly (deep equal on a complex object)', async () => {
      const complexParams = {
        baseline: { tvpi: 1.85, dpi: 0.92, irr: 0.18 },
        variables: [
          { name: 'mgmt_fee', range: [0.015, 0.025], step: 0.0025 },
          { name: 'carry', range: [0.18, 0.22], step: 0.005 },
        ],
        scenarios: ['base', 'upside', 'downside'],
        flags: { includeRecycling: true, monteCarloIterations: null },
      };
      const row = await service.createPending(1, 'two_way', complexParams, 7);
      expect(row.params).toEqual(complexParams);
    });
  });

  describe('markCompleted', () => {
    it('transitions a pending row to completed and stores results + duration', async () => {
      const pending = await service.createPending(1, 'one_way', { foo: 1 }, 7);
      const results = { grid: [{ x: 1, y: 2 }] };
      const completed = await service.markCompleted(pending.id, results, 12_345);

      expect(completed.status).toBe('completed');
      expect(completed.results).toEqual(results);
      expect(completed.durationMs).toBe(12_345);
      expect(completed.completedAt).toBeInstanceOf(Date);
    });

    it('refuses to transition rows that are already completed (throws)', async () => {
      const pending = await service.createPending(1, 'one_way', { foo: 1 }, 7);
      await service.markCompleted(pending.id, { ok: true }, 100);

      await expect(service.markCompleted(pending.id, { ok: true }, 200)).rejects.toThrow(
        /cannot transition/i
      );
    });
  });

  describe('markFailed', () => {
    it('transitions pending -> failed and records errorCode + errorMessage', async () => {
      const pending = await service.createPending(1, 'stress', { foo: 1 }, 7);
      const failed = await service.markFailed(
        pending.id,
        'CALC_TIMEOUT',
        'Worker exceeded 60s budget',
        60_000
      );

      expect(failed.status).toBe('failed');
      expect(failed.errorCode).toBe('CALC_TIMEOUT');
      expect(failed.errorMessage).toBe('Worker exceeded 60s budget');
      expect(failed.durationMs).toBe(60_000);
    });
  });

  describe('getById', () => {
    it('returns null when fundId does not own the row', async () => {
      const row = await service.createPending(1, 'one_way', { foo: 1 }, 7);
      const result = await service.getById(999, row.id);
      expect(result).toBeNull();
    });

    it('returns the row when fundId matches', async () => {
      const row = await service.createPending(1, 'one_way', { foo: 1 }, 7);
      const result = await service.getById(1, row.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(row.id);
    });
  });

  describe('getHistoryByFund', () => {
    it('without kind, returns all kinds ordered by createdAt DESC', async () => {
      // Insert in a controlled order so createdAt monotonically increases.
      const a = await service.createPending(1, 'one_way', { i: 1 }, 7);
      // Force later timestamps so the DESC ordering is unambiguous on fast hardware.
      a.createdAt = new Date(Date.now() - 3000);
      const b = await service.createPending(1, 'two_way', { i: 2 }, 7);
      b.createdAt = new Date(Date.now() - 2000);
      const c = await service.createPending(1, 'stress', { i: 3 }, 7);
      c.createdAt = new Date(Date.now() - 1000);

      const history = await service.getHistoryByFund(1);
      expect(history).toHaveLength(3);
      expect(history.map((r) => r.kind)).toEqual(['stress', 'two_way', 'one_way']);
    });

    it('with kind filter, returns only matching rows', async () => {
      const a = await service.createPending(1, 'one_way', { i: 1 }, 7);
      a.createdAt = new Date(Date.now() - 3000);
      const b = await service.createPending(1, 'two_way', { i: 2 }, 7);
      b.createdAt = new Date(Date.now() - 2000);
      const c = await service.createPending(1, 'one_way', { i: 3 }, 7);
      c.createdAt = new Date(Date.now() - 1000);

      const history = await service.getHistoryByFund(1, { kind: 'one_way' });
      expect(history).toHaveLength(2);
      expect(history.every((r) => r.kind === 'one_way')).toBe(true);
    });
  });
});
