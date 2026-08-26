import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Share, ShareSnapshotRecord } from '../../../shared/schema/shares';

const routeMocks = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type State = {
    shares: Row[];
    shareAnalytics: Row[];
    selectSharesQueue: Row[][];
    transactionCalls: number;
  };

  const state: State = {
    shares: [],
    shareAnalytics: [],
    selectSharesQueue: [],
    transactionCalls: 0,
  };
  let activeState = state;

  function cloneRows(rows: Row[]): Row[] {
    return rows.map((row) => ({ ...row }));
  }

  function reset() {
    state.shares = [];
    state.shareAnalytics = [];
    state.selectSharesQueue = [];
    state.transactionCalls = 0;
    activeState = state;
  }

  function getTableName(table: unknown): string {
    if (typeof table === 'string') return table;
    if (!table || typeof table !== 'object') return 'unknown';

    const symbolName = (table as Record<symbol, unknown>)[Symbol.for('drizzle:Name')];
    if (typeof symbolName === 'string') return symbolName;

    const candidate = table as { name?: unknown; _?: { name?: unknown; tableName?: unknown } };
    if (typeof candidate._?.name === 'string') return candidate._.name;
    if (typeof candidate._?.tableName === 'string') return candidate._.tableName;
    if (typeof candidate.name === 'string') return candidate.name;
    return 'unknown';
  }

  function rowsForTable(table: string): Row[] {
    if (table === 'shares') {
      return state.selectSharesQueue.shift() ?? activeState.shares;
    }
    if (table === 'share_analytics') return activeState.shareAnalytics;
    return [];
  }

  function select() {
    let selectedTable = 'unknown';
    let limitValue: number | undefined;

    const execute = async () => {
      const rows = rowsForTable(selectedTable);
      return limitValue === undefined ? rows : rows.slice(0, limitValue);
    };

    const builder = {
      from(table: unknown) {
        selectedTable = getTableName(table);
        return builder;
      },
      where() {
        return builder;
      },
      orderBy() {
        return builder;
      },
      limit(value: number) {
        limitValue = value;
        return builder;
      },
      then(onFulfilled: (value: Row[]) => unknown, onRejected?: (reason: unknown) => unknown) {
        return execute().then(onFulfilled, onRejected);
      },
      catch(onRejected: (reason: unknown) => unknown) {
        return execute().catch(onRejected);
      },
    };

    return builder;
  }

  function insert(table: unknown) {
    const tableName = getTableName(table);
    return {
      values(value: Row | Row[]) {
        const rows = Array.isArray(value) ? value : [value];
        const target =
          tableName === 'share_analytics' ? activeState.shareAnalytics : activeState.shares;
        target.push(...rows.map((row) => ({ ...row })));

        const execute = async () => rows;
        return {
          returning: execute,
          then(onFulfilled: (value: Row[]) => unknown, onRejected?: (reason: unknown) => unknown) {
            return execute().then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  function update(table: unknown) {
    const tableName = getTableName(table);
    return {
      set(updateValue: Row) {
        return {
          where() {
            const execute = async () => {
              if (tableName !== 'shares' || activeState.shares.length === 0) return [];
              const updated = { ...activeState.shares[0], ...updateValue };
              activeState.shares[0] = updated;
              return [updated];
            };

            return {
              returning: execute,
              then(
                onFulfilled: (value: Row[]) => unknown,
                onRejected?: (reason: unknown) => unknown
              ) {
                return execute().then(onFulfilled, onRejected);
              },
            };
          },
        };
      },
    };
  }

  const db = {
    select,
    insert,
    update,
    transaction: vi.fn(async <T>(callback: (tx: typeof db) => Promise<T>): Promise<T> => {
      state.transactionCalls += 1;
      const previous = activeState;
      const draft: State = {
        shares: cloneRows(state.shares),
        shareAnalytics: cloneRows(state.shareAnalytics),
        selectSharesQueue: state.selectSharesQueue,
        transactionCalls: state.transactionCalls,
      };
      activeState = draft;

      try {
        const result = await callback(db);
        // eslint-disable-next-line require-atomic-updates -- test transaction mock commits only after callback success
        state.shares = draft.shares;
        // eslint-disable-next-line require-atomic-updates -- test transaction mock commits only after callback success
        state.shareAnalytics = draft.shareAnalytics;
        return result;
      } finally {
        // eslint-disable-next-line require-atomic-updates -- restores the single active test transaction context
        activeState = previous;
      }
    }),
  };

  return {
    db,
    state,
    reset,
    createShareSnapshot: vi.fn(),
    getLatestShareSnapshot: vi.fn(),
    markShareSnapshotsRevoked: vi.fn(),
  };
});

vi.mock('../../../server/db', () => ({
  db: routeMocks.db,
  pool: null,
}));

vi.mock('../../../server/services/share-snapshot-service', () => ({
  createShareSnapshot: routeMocks.createShareSnapshot,
  getLatestShareSnapshot: routeMocks.getLatestShareSnapshot,
  markShareSnapshotsRevoked: routeMocks.markShareSnapshotsRevoked,
}));

function makeShare(overrides: Partial<Share> = {}): Share {
  const now = new Date('2026-04-27T12:00:00.000Z');
  return {
    id: 'share-1',
    fundId: '1',
    createdBy: 'user-1',
    accessLevel: 'view_only',
    requirePasskey: false,
    passkeyHash: null,
    expiresAt: null,
    hiddenMetrics: [],
    customTitle: null,
    customMessage: null,
    viewCount: 0,
    lastViewedAt: null,
    isActive: true,
    version: 1,
    idempotencyKey: null,
    idempotencyRequestHash: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ShareSnapshotRecord> = {}): ShareSnapshotRecord {
  const now = new Date('2026-04-27T12:00:00.000Z');
  return {
    id: 'snapshot-1',
    shareId: 'share-1',
    fundIdInternal: '1',
    payloadVersion: 'public-share-snapshot.v1',
    asOfDate: now,
    sourceCalculationRunIds: [],
    hiddenMetricPolicy: { requested: [], applied: [] },
    generatedBy: 'user-1',
    generatedAt: now,
    expiresAt: null,
    revokedAt: null,
    payloadHash: 'hash-1',
    payload: {
      payloadVersion: 'public-share-snapshot.v1',
      snapshotId: 'snapshot-1',
      shareId: 'share-1',
      title: 'Investor snapshot',
      message: null,
      asOfDate: now.toISOString(),
      generatedAt: now.toISOString(),
      metrics: [],
      portfolioCompanies: [],
      hiddenMetricPolicy: { requested: [], applied: [] },
      sourceCalculationRunIds: [],
    },
    ...overrides,
  };
}

async function makeApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use((req, _res, next) => {
    req.context = {
      userId: 'user-1',
      email: 'user@example.com',
      role: 'admin',
      orgId: 'org-1',
    };
    next();
  });

  const { sharesRouter, publicSharesRouter } = await import('../../../server/routes/shares');
  app.use('/api/shares', sharesRouter);
  app.use('/api/public/shares', publicSharesRouter);
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'error' });
    }
  );
  return app;
}

describe('share routes error paths', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    routeMocks.reset();
    routeMocks.createShareSnapshot.mockResolvedValue(makeSnapshot());
    routeMocks.getLatestShareSnapshot.mockResolvedValue(makeSnapshot());
    routeMocks.markShareSnapshotsRevoked.mockResolvedValue(undefined);
  });

  it('rejects idempotency-key reuse with a different request fingerprint', async () => {
    const app = await makeApp();
    routeMocks.state.selectSharesQueue.push([
      makeShare({
        idempotencyKey: 'share-create-1',
        idempotencyRequestHash: 'original-request-hash',
      }),
    ]);

    const response = await request(app)
      .post('/api/shares')
      .set('Idempotency-Key', 'share-create-1')
      .send({
        fundId: '1',
        accessLevel: 'view_with_details',
        requirePasskey: false,
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: 'idempotency_key_reused',
    });
    expect(routeMocks.createShareSnapshot).not.toHaveBeenCalled();
  });

  it('rolls back share creation when snapshot creation fails inside the transaction', async () => {
    const app = await makeApp();
    routeMocks.state.selectSharesQueue.push([]);
    routeMocks.createShareSnapshot.mockRejectedValueOnce(new Error('snapshot write failed'));

    const response = await request(app).post('/api/shares').send({
      fundId: '1',
      accessLevel: 'view_only',
      requirePasskey: false,
    });

    expect(response.status).toBe(500);
    expect(routeMocks.state.transactionCalls).toBe(1);
    expect(routeMocks.state.shares).toHaveLength(0);
  });

  it('returns 304 for matching public snapshot ETags', async () => {
    const app = await makeApp();
    routeMocks.state.shares = [makeShare()];
    routeMocks.getLatestShareSnapshot.mockResolvedValueOnce(
      makeSnapshot({ payloadHash: 'hash-304' })
    );

    const response = await request(app)
      .get('/api/public/shares/share-1')
      .set('If-None-Match', '"hash-304"');

    expect(response.status).toBe(304);
    expect(response.headers['etag']).toBe('"hash-304"');
    expect(routeMocks.state.shareAnalytics).toHaveLength(0);
  });

  it('rate-limits repeated public passkey verification attempts per share', async () => {
    const app = await makeApp();
    routeMocks.state.shares = [
      makeShare({
        requirePasskey: true,
        passkeyHash: `${'a'.repeat(32)}:${'b'.repeat(128)}`,
      }),
    ];

    const responses = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await request(app)
          .post('/api/public/shares/share-1/verify')
          .send({ passkey: 'wrong-passkey' })
      );
    }

    expect(responses.slice(0, 5).every((response) => response.status === 401)).toBe(true);
    expect(responses[5]?.status).toBe(429);
  });
});
