import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Share, ShareSnapshotRecord } from '../../../shared/schema/shares';

type QueryChain = PromiseLike<unknown[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const dbState = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    insertValues: [] as unknown[],
    txInsertResults: [] as unknown[][],
    txUpdateResults: [] as unknown[][],
  };

  function nextSelectResult(): unknown[] {
    return state.selectResults.shift() ?? [];
  }

  function nextTxInsertResult(): unknown[] {
    return state.txInsertResults.shift() ?? [];
  }

  function nextTxUpdateResult(): unknown[] {
    return state.txUpdateResults.shift() ?? [];
  }

  function thenFor(result: unknown[]): QueryChain['then'] {
    return (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected);
  }

  function makeQuery(result: unknown[]): QueryChain {
    const query = {
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve(result)),
      then: thenFor(result),
    } as QueryChain;
    return query;
  }

  const txMock = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(nextTxInsertResult())),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(nextTxUpdateResult())),
        })),
      })),
    })),
  };

  const db = {
    select: vi.fn(() => makeQuery(nextSelectResult())),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((payload: unknown) => {
        state.insertValues.push({ table, payload });
        return Promise.resolve();
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    transaction: vi.fn(async <T>(fn: (tx: typeof txMock) => Promise<T>): Promise<T> => fn(txMock)),
  };

  return { db, state, txMock };
});

const snapshotState = vi.hoisted(() => ({
  createShareSnapshot: vi.fn(),
  getLatestShareSnapshot: vi.fn(),
  markShareSnapshotsRevoked: vi.fn(),
}));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  ipKeyGenerator: (ip: string) => ip,
}));

vi.mock('../../../server/db', () => ({ db: dbState.db }));

vi.mock('../../../server/services/share-snapshot-service', () => ({
  createShareSnapshot: snapshotState.createShareSnapshot,
  getLatestShareSnapshot: snapshotState.getLatestShareSnapshot,
  markShareSnapshotsRevoked: snapshotState.markShareSnapshotsRevoked,
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { isPublicApiPath } from '../../../server/lib/public-api-boundary';
import { publicSharesRouter, sharesRouter } from '../../../server/routes/shares';

type AuthOptions = {
  user?: Express.User;
  context?: Express.Request['context'];
};

const BASE_NOW = new Date('2026-05-31T12:00:00.000Z');

function makeUser(overrides: Partial<Express.User> = {}): Express.User {
  return {
    id: 'u1',
    sub: 'u1',
    email: 'user@example.com',
    role: 'analyst',
    roles: ['analyst'],
    fundIds: [1],
    ip: '127.0.0.1',
    userAgent: 'vitest',
    isAdmin: false,
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<NonNullable<Express.Request['context']>> = {}
): NonNullable<Express.Request['context']> {
  return {
    userId: 'u1',
    orgId: 'org-1',
    email: 'user@example.com',
    role: 'analyst',
    ...overrides,
  };
}

function makeManagementApp(auth: AuthOptions | null = { user: makeUser() }) {
  const app = express();
  app.use(express.json());
  if (auth !== null) {
    app.use((req, _res, next) => {
      if (auth.user) req.user = auth.user;
      if (auth.context) req.context = auth.context;
      next();
    });
  }
  app.use(sharesRouter);
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'error' });
  });
  return app;
}

function makePublicApp() {
  const app = express();
  app.use(express.json());
  app.use(publicSharesRouter);
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'error' });
  });
  return app;
}

function makeShare(overrides: Partial<Share> = {}): Share {
  return {
    id: 'share-1',
    fundId: '2',
    createdBy: 'owner-1',
    accessLevel: 'view_only',
    requirePasskey: false,
    passkeyHash: null,
    expiresAt: null,
    hiddenMetrics: [],
    customTitle: 'Investor snapshot',
    customMessage: 'Quarterly view',
    viewCount: 0,
    lastViewedAt: null,
    isActive: true,
    version: 1,
    idempotencyKey: null,
    idempotencyRequestHash: null,
    createdAt: BASE_NOW,
    updatedAt: BASE_NOW,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ShareSnapshotRecord> = {}): ShareSnapshotRecord {
  const shareId = overrides.shareId ?? 'share-1';
  return {
    id: 'snapshot-1',
    shareId,
    fundIdInternal: '2',
    payloadVersion: 'public-share-snapshot.v1',
    asOfDate: BASE_NOW,
    sourceCalculationRunIds: [],
    hiddenMetricPolicy: { requested: [], applied: [] },
    generatedBy: 'owner-1',
    generatedAt: BASE_NOW,
    expiresAt: null,
    revokedAt: null,
    payloadHash: 'hash-1',
    payload: {
      payloadVersion: 'public-share-snapshot.v1',
      snapshotId: 'snapshot-1',
      shareId,
      title: 'Investor snapshot',
      message: 'Quarterly view',
      asOfDate: BASE_NOW.toISOString(),
      generatedAt: BASE_NOW.toISOString(),
      metrics: [
        {
          id: 'total_value',
          label: 'Total value',
          value: 42,
          unit: 'currency',
          availability: 'available',
          source: 'test-fixture',
          asOfDate: BASE_NOW.toISOString(),
          calculationVersion: 'test',
        },
      ],
      portfolioCompanies: [{ name: 'Alpha AI', stage: 'Seed', moic: 2.1, status: 'active' }],
      hiddenMetricPolicy: { requested: [], applied: [] },
      sourceCalculationRunIds: ['calc-1'],
    },
    ...overrides,
  };
}

function validCreateBody(fundId = '2') {
  return {
    fundId,
    accessLevel: 'view_only',
    requirePasskey: false,
    hiddenMetrics: [],
  };
}

function storedPasskeyHash(passkey: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(passkey, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function resetState() {
  dbState.state.selectResults = [];
  dbState.state.insertValues = [];
  dbState.state.txInsertResults = [];
  dbState.state.txUpdateResults = [];
  dbState.db.select.mockClear();
  dbState.db.insert.mockClear();
  dbState.db.update.mockClear();
  dbState.db.transaction.mockClear();
  dbState.txMock.insert.mockClear();
  dbState.txMock.update.mockClear();

  snapshotState.createShareSnapshot.mockReset();
  snapshotState.createShareSnapshot.mockResolvedValue(makeSnapshot());
  snapshotState.getLatestShareSnapshot.mockReset();
  snapshotState.getLatestShareSnapshot.mockResolvedValue(makeSnapshot());
  snapshotState.markShareSnapshotsRevoked.mockReset();
  snapshotState.markShareSnapshotsRevoked.mockResolvedValue(undefined);
}

function expectNoShareMutation() {
  expect(dbState.db.insert).not.toHaveBeenCalled();
  expect(dbState.db.update).not.toHaveBeenCalled();
  expect(dbState.db.transaction).not.toHaveBeenCalled();
  expect(dbState.txMock.insert).not.toHaveBeenCalled();
  expect(dbState.txMock.update).not.toHaveBeenCalled();
  expect(snapshotState.createShareSnapshot).not.toHaveBeenCalled();
  expect(snapshotState.markShareSnapshotsRevoked).not.toHaveBeenCalled();
}

async function flushPublicViewWrite() {
  await vi.waitFor(() => expect(dbState.db.insert).toHaveBeenCalled());
}

const PRIVATE_PUBLIC_RESPONSE_KEYS = new Set([
  'fundId',
  'fundIdInternal',
  'passkeyHash',
  'createdBy',
  'idempotencyKey',
  'idempotencyRequestHash',
]);

function expectNoPrivateFundKeys(value: unknown, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectNoPrivateFundKeys(item, `${path}[${index}]`));
    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
    expect(
      PRIVATE_PUBLIC_RESPONSE_KEYS.has(key),
      `${path}.${key} should not expose private fund identifiers`
    ).toBe(false);
    expectNoPrivateFundKeys(nestedValue, `${path}.${key}`);
  });
}

describe('shares management boundary contracts', () => {
  beforeEach(() => resetState());

  const deniedUser = makeUser({ fundIds: [1], isAdmin: false });

  it.each([
    {
      name: 'POST /',
      act: () =>
        request(makeManagementApp({ user: deniedUser }))
          .post('/')
          .set('Idempotency-Key', 'deny-create-2')
          .send(validCreateBody('2')),
      expectedSelects: 0,
    },
    {
      name: 'GET /?fundId=2',
      act: () =>
        request(makeManagementApp({ user: deniedUser }))
          .get('/')
          .query({ fundId: '2' }),
      expectedSelects: 0,
    },
    {
      name: 'PATCH /:shareId',
      act: () => {
        dbState.state.selectResults.push([makeShare({ id: 'share-deny-patch', fundId: '2' })]);
        return request(makeManagementApp({ user: deniedUser }))
          .patch('/share-deny-patch')
          .send({ customTitle: 'should not write' });
      },
      expectedSelects: 1,
    },
    {
      name: 'DELETE /:shareId',
      act: () => {
        dbState.state.selectResults.push([makeShare({ id: 'share-deny-delete', fundId: '2' })]);
        return request(makeManagementApp({ user: deniedUser })).delete('/share-deny-delete');
      },
      expectedSelects: 1,
    },
    {
      name: 'GET /:shareId/analytics',
      act: () => {
        dbState.state.selectResults.push([makeShare({ id: 'share-deny-analytics', fundId: '2' })]);
        return request(makeManagementApp({ user: deniedUser })).get(
          '/share-deny-analytics/analytics'
        );
      },
      expectedSelects: 1,
    },
  ])(
    '$name returns 403 for cross-fund management access without mutation',
    async ({ act, expectedSelects }) => {
      const response = await act();

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ success: false, error: 'Fund access denied' });
      expect(dbState.db.select).toHaveBeenCalledTimes(expectedSelects);
      expectNoShareMutation();
    }
  );

  it('POST / denies a non-numeric string fundId without reaching idempotency or writes', async () => {
    const response = await request(makeManagementApp({ user: deniedUser }))
      .post('/')
      .set('Idempotency-Key', 'deny-create-x')
      .send(validCreateBody('x'));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: 'Fund access denied' });
    expect(dbState.db.select).not.toHaveBeenCalled();
    expectNoShareMutation();
  });

  it.each([
    {
      name: 'POST /',
      act: () => request(makeManagementApp(null)).post('/').send(validCreateBody('2')),
    },
    {
      name: 'GET /?fundId=2',
      act: () => request(makeManagementApp(null)).get('/').query({ fundId: '2' }),
    },
    {
      name: 'PATCH /:shareId',
      act: () =>
        request(makeManagementApp(null)).patch('/share-auth-gate').send({ customTitle: 'blocked' }),
    },
    {
      name: 'DELETE /:shareId',
      act: () => request(makeManagementApp(null)).delete('/share-auth-gate'),
    },
    {
      name: 'GET /:shareId/analytics',
      act: () => request(makeManagementApp(null)).get('/share-auth-gate/analytics'),
    },
  ])(
    '$name returns 401 before any fund-scope decision when no user is injected',
    async ({ act }) => {
      const response = await act();

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ success: false, error: 'Authentication required' });
      expect(dbState.db.select).not.toHaveBeenCalled();
      expectNoShareMutation();
    }
  );

  it('POST / allows the admin context path and creates a share snapshot', async () => {
    const createdShare = makeShare({ id: 'created-share', fundId: '2', createdBy: 'admin-1' });
    dbState.state.selectResults.push([]);
    dbState.state.txInsertResults.push([createdShare]);

    const response = await request(
      makeManagementApp({
        user: makeUser({ id: 'admin-1', sub: 'admin-1', fundIds: [1] }),
        context: makeContext({ userId: 'admin-1', role: 'admin' }),
      })
    )
      .post('/')
      .set('Idempotency-Key', 'admin-create-2')
      .send(validCreateBody('2'));

    expect(response.status).toBe(201);
    expect(response.headers['etag']).toBe('"1"');
    expect(response.body.share).toMatchObject({ id: 'created-share', fundId: '2' });
    expect(dbState.db.transaction).toHaveBeenCalledTimes(1);
    expect(dbState.txMock.insert).toHaveBeenCalledTimes(1);
    expect(snapshotState.createShareSnapshot).toHaveBeenCalledWith(
      createdShare,
      'admin-1',
      dbState.txMock
    );
  });

  it('GET / allows the strict string req.context.fundId path', async () => {
    dbState.state.selectResults.push([makeShare({ id: 'context-share', fundId: '2' })]);

    const response = await request(
      makeManagementApp({
        user: makeUser({ fundIds: [1] }),
        context: makeContext({ fundId: '2' }),
      })
    )
      .get('/')
      .query({ fundId: '2' });

    expect(response.status).toBe(200);
    expect(response.body.shares).toHaveLength(1);
    expect(response.body.shares[0]).toMatchObject({ id: 'context-share', fundId: '2' });
    expect(dbState.db.select).toHaveBeenCalledTimes(1);
  });

  it('PATCH /:shareId allows a manager with fundIds containing the numeric fund id', async () => {
    const existingShare = makeShare({ id: 'managed-patch', fundId: '2', version: 1 });
    const updatedShare = makeShare({
      id: 'managed-patch',
      fundId: '2',
      customTitle: 'Updated title',
      version: 2,
    });
    dbState.state.selectResults.push([existingShare]);
    dbState.state.txUpdateResults.push([updatedShare]);

    const response = await request(
      makeManagementApp({ user: makeUser({ fundIds: [2], isAdmin: false }) })
    )
      .patch('/managed-patch')
      .set('If-Match', '"1"')
      .send({ customTitle: 'Updated title' });

    expect(response.status).toBe(200);
    expect(response.headers['etag']).toBe('"2"');
    expect(response.body.share).toMatchObject({ id: 'managed-patch', version: 2 });
    expect(dbState.txMock.update).toHaveBeenCalledTimes(1);
    expect(snapshotState.createShareSnapshot).toHaveBeenCalledWith(
      updatedShare,
      'u1',
      dbState.txMock
    );
  });

  it('DELETE /:shareId allows a manager with fundIds containing the numeric fund id', async () => {
    const existingShare = makeShare({ id: 'managed-delete', fundId: '2', version: 1 });
    const revokedShare = makeShare({
      id: 'managed-delete',
      fundId: '2',
      isActive: false,
      version: 2,
    });
    dbState.state.selectResults.push([existingShare]);
    dbState.state.txUpdateResults.push([revokedShare]);

    const response = await request(
      makeManagementApp({ user: makeUser({ fundIds: [2], isAdmin: false }) })
    )
      .delete('/managed-delete')
      .set('If-Match', '"1"');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'Share revoked successfully' });
    expect(dbState.txMock.update).toHaveBeenCalledTimes(1);
    expect(snapshotState.markShareSnapshotsRevoked).toHaveBeenCalledWith(
      'managed-delete',
      expect.any(Date),
      dbState.txMock
    );
  });

  it.each([
    {
      name: 'PATCH /:shareId',
      act: (shareId: string) =>
        request(makeManagementApp({ user: deniedUser })).patch(`/${shareId}`),
    },
    {
      name: 'DELETE /:shareId',
      act: (shareId: string) =>
        request(makeManagementApp({ user: deniedUser })).delete(`/${shareId}`),
    },
    {
      name: 'GET /:shareId/analytics',
      act: (shareId: string) =>
        request(makeManagementApp({ user: deniedUser })).get(`/${shareId}/analytics`),
    },
  ])(
    '$name documents the current management existence-leak ordering without changing it',
    async ({ act }) => {
      dbState.state.selectResults.push([]);

      const missing = await act('missing-share');

      dbState.state.selectResults.push([makeShare({ id: 'real-share', fundId: '2' })]);
      const existingWrongFund = await act('real-share');

      expect(missing.status).toBe(404);
      expect(existingWrongFund.status).toBe(403);
      expectNoShareMutation();
    }
  );
});

describe('public shares anonymous token boundary contracts', () => {
  beforeEach(() => resetState());

  it('GET /:shareId returns only the requested token snapshot without authentication', async () => {
    dbState.state.selectResults.push([makeShare({ id: 'tok-public', fundId: '2' })]);
    snapshotState.getLatestShareSnapshot.mockResolvedValueOnce(
      makeSnapshot({ shareId: 'tok-public', payloadHash: 'hash-public' })
    );

    const response = await request(makePublicApp()).get('/tok-public');

    expect(response.status).toBe(200);
    expect(response.body.share).toMatchObject({
      id: 'tok-public',
      requirePasskey: false,
      snapshot: { shareId: 'tok-public', title: 'Investor snapshot' },
    });
    expectNoPrivateFundKeys(response.body);
    expect(snapshotState.getLatestShareSnapshot).toHaveBeenCalledWith('tok-public');
    await flushPublicViewWrite();
  });

  it('GET /:shareId returns 404 for an unknown token', async () => {
    dbState.state.selectResults.push([]);

    const response = await request(makePublicApp()).get('/missing-token');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: 'Share not found' });
    expect(snapshotState.getLatestShareSnapshot).not.toHaveBeenCalled();
  });

  it('GET /:shareId returns 410 for a revoked share token', async () => {
    dbState.state.selectResults.push([makeShare({ id: 'revoked-token', isActive: false })]);

    const response = await request(makePublicApp()).get('/revoked-token');

    expect(response.status).toBe(410);
    expect(response.body).toEqual({ success: false, error: 'Share has been revoked' });
    expect(snapshotState.getLatestShareSnapshot).not.toHaveBeenCalled();
  });

  it('GET /:shareId returns 410 for an expired share token', async () => {
    dbState.state.selectResults.push([
      makeShare({ id: 'expired-token', expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    ]);

    const response = await request(makePublicApp()).get('/expired-token');

    expect(response.status).toBe(410);
    expect(response.body).toEqual({ success: false, error: 'Share has expired' });
    expect(snapshotState.getLatestShareSnapshot).not.toHaveBeenCalled();
  });

  it('GET /:shareId returns 503 when the public snapshot is unavailable', async () => {
    dbState.state.selectResults.push([makeShare({ id: 'snapshot-missing' })]);
    snapshotState.getLatestShareSnapshot.mockResolvedValueOnce(undefined);

    const response = await request(makePublicApp()).get('/snapshot-missing');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ success: false, error: 'snapshot_unavailable' });
  });

  it('GET /:shareId returns 410 when the immutable snapshot is revoked', async () => {
    dbState.state.selectResults.push([makeShare({ id: 'snapshot-revoked' })]);
    snapshotState.getLatestShareSnapshot.mockResolvedValueOnce(
      makeSnapshot({ shareId: 'snapshot-revoked', revokedAt: BASE_NOW })
    );

    const response = await request(makePublicApp()).get('/snapshot-revoked');

    expect(response.status).toBe(410);
    expect(response.body).toEqual({ success: false, error: 'Share has been revoked' });
  });

  it('GET /:shareId returns a teaser without loading the snapshot for unverified passkey shares', async () => {
    dbState.state.selectResults.push([
      makeShare({ id: 'passkey-teaser', requirePasskey: true, passkeyHash: 'salt:hash' }),
    ]);

    const response = await request(makePublicApp()).get('/passkey-teaser');

    expect(response.status).toBe(200);
    expect(response.body.share).toEqual({
      id: 'passkey-teaser',
      requirePasskey: true,
      customTitle: 'Investor snapshot',
      customMessage: 'Quarterly view',
      expiresAt: null,
    });
    expect(response.body.share).not.toHaveProperty('snapshot');
    expect(snapshotState.getLatestShareSnapshot).not.toHaveBeenCalled();
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('GET /:shareId returns 304 for a matching public snapshot ETag', async () => {
    dbState.state.selectResults.push([makeShare({ id: 'etag-token' })]);
    snapshotState.getLatestShareSnapshot.mockResolvedValueOnce(
      makeSnapshot({ shareId: 'etag-token', payloadHash: 'hash-etag' })
    );

    const response = await request(makePublicApp())
      .get('/etag-token')
      .set('If-None-Match', '"hash-etag"');

    expect(response.status).toBe(304);
    expect(response.headers['etag']).toBe('"hash-etag"');
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST /:shareId/verify returns 400 when passkey is absent', async () => {
    const response = await request(makePublicApp()).post('/verify-missing-passkey/verify').send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, error: 'Validation error' });
    expect(dbState.db.select).not.toHaveBeenCalled();
  });

  it('POST /:shareId/verify returns 404 for an unknown token', async () => {
    dbState.state.selectResults.push([]);

    const response = await request(makePublicApp())
      .post('/missing-verify-token/verify')
      .send({ passkey: 'anything' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: 'Share not found' });
    expect(snapshotState.getLatestShareSnapshot).not.toHaveBeenCalled();
  });

  it('POST /:shareId/verify returns 410 for a revoked passkey share token', async () => {
    dbState.state.selectResults.push([
      makeShare({
        id: 'revoked-passkey',
        requirePasskey: true,
        passkeyHash: storedPasskeyHash('open-sesame'),
        isActive: false,
      }),
    ]);

    const response = await request(makePublicApp())
      .post('/revoked-passkey/verify')
      .send({ passkey: 'open-sesame' });

    expect(response.status).toBe(410);
    expect(response.body).toEqual({ success: false, error: 'Share has been revoked' });
    expect(snapshotState.getLatestShareSnapshot).not.toHaveBeenCalled();
  });

  it('POST /:shareId/verify returns 410 for an expired passkey share token', async () => {
    dbState.state.selectResults.push([
      makeShare({
        id: 'expired-passkey',
        requirePasskey: true,
        passkeyHash: storedPasskeyHash('open-sesame'),
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ]);

    const response = await request(makePublicApp())
      .post('/expired-passkey/verify')
      .send({ passkey: 'open-sesame' });

    expect(response.status).toBe(410);
    expect(response.body).toEqual({ success: false, error: 'Share has expired' });
    expect(snapshotState.getLatestShareSnapshot).not.toHaveBeenCalled();
  });

  it('POST /:shareId/verify returns 400 when the share does not require a passkey', async () => {
    dbState.state.selectResults.push([makeShare({ id: 'no-passkey-required' })]);

    const response = await request(makePublicApp())
      .post('/no-passkey-required/verify')
      .send({ passkey: 'anything' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: 'Share does not require passkey' });
    expect(snapshotState.getLatestShareSnapshot).not.toHaveBeenCalled();
  });

  it('POST /:shareId/verify returns 401 for a wrong passkey', async () => {
    dbState.state.selectResults.push([
      makeShare({
        id: 'wrong-passkey',
        requirePasskey: true,
        passkeyHash: storedPasskeyHash('correct-passkey'),
      }),
    ]);

    const response = await request(makePublicApp())
      .post('/wrong-passkey/verify')
      .send({ passkey: 'wrong-passkey' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ success: false, error: 'Invalid passkey' });
    expect(snapshotState.getLatestShareSnapshot).not.toHaveBeenCalled();
  });

  it('POST /:shareId/verify returns 503 when the verified snapshot is unavailable', async () => {
    dbState.state.selectResults.push([
      makeShare({
        id: 'verified-snapshot-missing',
        requirePasskey: true,
        passkeyHash: storedPasskeyHash('open-sesame'),
      }),
    ]);
    snapshotState.getLatestShareSnapshot.mockResolvedValueOnce(undefined);

    const response = await request(makePublicApp())
      .post('/verified-snapshot-missing/verify')
      .send({ passkey: 'open-sesame' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ success: false, error: 'snapshot_unavailable' });
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST /:shareId/verify returns the snapshot for a correct real passkey hash', async () => {
    dbState.state.selectResults.push([
      makeShare({
        id: 'correct-passkey',
        requirePasskey: true,
        passkeyHash: storedPasskeyHash('open-sesame'),
      }),
    ]);
    snapshotState.getLatestShareSnapshot.mockResolvedValueOnce(
      makeSnapshot({ shareId: 'correct-passkey', payloadHash: 'hash-verify' })
    );

    const response = await request(makePublicApp())
      .post('/correct-passkey/verify')
      .send({ passkey: 'open-sesame' });

    expect(response.status).toBe(200);
    expect(response.body.share).toMatchObject({
      id: 'correct-passkey',
      requirePasskey: true,
      snapshot: { shareId: 'correct-passkey' },
    });
    expectNoPrivateFundKeys(response.body);
    expect(snapshotState.getLatestShareSnapshot).toHaveBeenCalledWith('correct-passkey');
    await flushPublicViewWrite();
  });
});

describe('public API boundary path classification', () => {
  it.each([
    ['GET', '/public/shares/tok'],
    ['POST', '/public/shares/tok/verify'],
    ['GET', '/healthz'],
    ['GET', '/flags'],
  ])('allows %s %s as public', (method, path) => {
    expect(isPublicApiPath(method, path)).toBe(true);
  });

  it.each([
    ['POST', '/shares'],
    ['GET', '/shares'],
    ['PATCH', '/shares/abc'],
    ['DELETE', '/shares/abc'],
    ['GET', '/shares/abc/analytics'],
    ['POST', '/public/shares/tok'],
    ['GET', '/public/shares/tok/verify'],
    ['GET', '/public/shares'],
  ])('does not allow %s %s as public', (method, path) => {
    expect(isPublicApiPath(method, path)).toBe(false);
  });
});
