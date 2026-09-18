import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedRequestCredential } from '../../../../server/lib/auth/request-credentials';

const state = vi.hoisted(() => ({
  pilotFundId: 7 as number | null,
  authenticated: true,
  granted: true,
  save: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));

vi.mock('../../../../server/config/actuals-pilot-env', () => ({
  readActualsPilotFundId: () => state.pilotFundId,
}));
vi.mock('../../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    if (state.authenticated) {
      const authenticatedRequest = req as Request & {
        user?: Record<string, unknown>;
        authCredential?: VerifiedRequestCredential;
      };
      authenticatedRequest.user = {
        id: '9',
        sub: '9',
        email: 'draft@example.com',
        role: 'admin',
        roles: ['admin'],
        fundIds: [7],
        ip: '127.0.0.1',
        userAgent: 'vitest',
      };
      authenticatedRequest.authCredential = {
        source: 'bearer',
        token: 'verified',
        claims: { sub: '9', role: 'admin', roles: ['admin'], fundIds: [7] },
      } as VerifiedRequestCredential;
    }
    next();
  },
  requireFundAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../../../server/lib/auth/actuals-pilot-grant', () => ({
  requireActualsPilotGrant:
    (readFundId: () => number | null) => (req: Request, res: Response, next: NextFunction) => {
      if (!state.granted || Number(req.params['fundId']) !== readFundId()) {
        return res.status(404).json({ code: 'RESOURCE_NOT_FOUND' });
      }
      return next();
    },
}));
vi.mock('../../../../server/services/lp-reporting/actuals-draft-service', () => {
  class ActualsDraftError extends Error {
    constructor(
      public statusCode: number,
      public code: string,
      message: string
    ) {
      super(message);
    }
  }
  return {
    ActualsDraftError,
    actualsDraftETag: (fundId: number, head: { etag: string } | null) =>
      head?.etag ?? `"actuals-draft:${fundId}:none"`,
    saveActualsDraftRevision: state.save,
    listActualsDraftRevisions: state.list,
    getActualsDraftRevision: state.detail,
  };
});

const basePath = '/api/funds/7/imports/actuals/draft-revisions';
const key = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const emptyETag = '"actuals-draft:7:none"';
const savedETag = `"actuals-draft:7:1:${'a'.repeat(64)}"`;
const body = () => ({
  contractVersion: 'actuals-draft-save/1.0.0',
  classification: 'provisional',
  asOfDate: null,
  sourceNote: 'Owner estimate with incomplete rows.',
  correctionReason: 'Initial entry.',
  ledger: {
    templateVersion: 'actuals-ledger/1.0.0',
    fileName: 'draft.csv',
    payload: 'aW5jb21wbGV0ZQ==',
  },
  valuation: null,
});
const saveResult = (replayed = false) => ({
  contractVersion: 'actuals-draft-save-result/1.0.0',
  idempotencyKey: key,
  requestHash: 'b'.repeat(64),
  revision: { revision: 1, etag: savedETag },
  replayed,
});

async function makeApp() {
  vi.resetModules();
  const { default: router } = await import('../../../../server/routes/lp-reporting/imports');
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(router);
  return app;
}

beforeEach(() => {
  state.pilotFundId = 7;
  state.authenticated = true;
  state.granted = true;
  state.save.mockReset().mockResolvedValue(saveResult());
  state.list.mockReset().mockResolvedValue({
    contractVersion: 'actuals-draft-history/1.0.0',
    fundId: 7,
    head: null,
    revisions: [],
    nextBeforeRevision: null,
  });
  state.detail.mockReset().mockResolvedValue({
    contractVersion: 'actuals-draft-detail/1.0.0',
    revision: { revision: 1, etag: savedETag },
    ledger: { payload: body().ledger.payload, payloadAvailable: true },
    valuation: null,
  });
});

describe('actuals draft revision HTTP boundary', () => {
  it('registers no draft endpoints when the pilot fund is unset', async () => {
    state.pilotFundId = null;
    const app = await makeApp();
    const responses = await Promise.all([
      request(app).post(basePath).send(body()),
      request(app).get(basePath),
      request(app).get(`${basePath}/1`),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([404, 404, 404]);
    expect(state.save).not.toHaveBeenCalled();
  });

  it('requires a strong If-Match and lowercase UUID before calling save', async () => {
    const app = await makeApp();
    const missing = await request(app).post(basePath).send(body());
    expect(missing.status).toBe(428);
    expect(missing.body.code).toBe('PRECONDITION_REQUIRED');
    const weak = await request(app)
      .post(basePath)
      .set('If-Match', `W/${emptyETag}`)
      .set('Idempotency-Key', key)
      .send(body());
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('INVALID_IF_MATCH');
    const invalidKey = await request(app)
      .post(basePath)
      .set('If-Match', emptyETag)
      .set('Idempotency-Key', key.toUpperCase())
      .send(body());
    expect(invalidKey.status).toBe(400);
    expect(invalidKey.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(state.save).not.toHaveBeenCalled();
  });

  it('saves incomplete bytes with a null cutoff and returns command identity and ETag', async () => {
    const app = await makeApp();
    const response = await request(app)
      .post(basePath)
      .set('If-Match', emptyETag)
      .set('Idempotency-Key', key)
      .send(body());
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['etag']).toBe(savedETag);
    expect(response.body).toEqual(saveResult());
    expect(state.save).toHaveBeenCalledWith({
      fundId: 7,
      actorId: 9,
      idempotencyKey: key,
      ifMatch: emptyETag,
      request: body(),
    });
  });

  it('returns 200 for an exact command replay', async () => {
    state.save.mockResolvedValue(saveResult(true));
    const app = await makeApp();
    const response = await request(app)
      .post(basePath)
      .set('If-Match', emptyETag)
      .set('Idempotency-Key', key)
      .send(body());
    expect(response.status).toBe(200);
    expect(response.body.replayed).toBe(true);
  });

  it('rejects non-JSON and publication-shaped draft requests', async () => {
    const app = await makeApp();
    expect(
      (await request(app).post(basePath).set('Content-Type', 'text/plain').send('csv')).status
    ).toBe(415);
    const invalid = await request(app)
      .post(basePath)
      .set('If-Match', emptyETag)
      .set('Idempotency-Key', key)
      .send({ ...body(), canPublish: true });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_BODY');
    expect(state.save).not.toHaveBeenCalled();
  });

  it.each([409, 412, 503])(
    'preserves service command failure %s without caching',
    async (status) => {
      const app = await makeApp();
      const { ActualsDraftError } =
        await import('../../../../server/services/lp-reporting/actuals-draft-service');
      state.save.mockRejectedValue(
        new ActualsDraftError(status, 'DRAFT_COMMAND_FAILURE', 'Retry exact command.')
      );
      const response = await request(app)
        .post(basePath)
        .set('If-Match', emptyETag)
        .set('Idempotency-Key', key)
        .send(body());
      expect(response.status).toBe(status);
      expect(response.body.code).toBe('DRAFT_COMMAND_FAILURE');
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
  );

  it('validates history cursors and returns a head ETag with metadata', async () => {
    const app = await makeApp();
    expect((await request(app).get(`${basePath}?beforeRevision=0`)).status).toBe(400);
    expect((await request(app).get(`${basePath}?beforeRevision=2&limit=100`)).status).toBe(400);
    expect(state.list).not.toHaveBeenCalled();
    const response = await request(app).get(`${basePath}?beforeRevision=2`);
    expect(response.status).toBe(200);
    expect(response.headers['etag']).toBe(emptyETag);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(state.list).toHaveBeenCalledWith({ fundId: 7, actorId: 9, beforeRevision: 2 });
    expect(response.body).not.toHaveProperty('ledger');
  });

  it('validates detail revisions and returns authenticated byte availability', async () => {
    const app = await makeApp();
    expect((await request(app).get(`${basePath}/01`)).status).toBe(400);
    expect((await request(app).get(`${basePath}/1?download=true`)).status).toBe(400);
    expect(state.detail).not.toHaveBeenCalled();
    const response = await request(app).get(`${basePath}/1`);
    expect(response.status).toBe(200);
    expect(response.headers['etag']).toBe(savedETag);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.ledger).toEqual({
      payload: body().ledger.payload,
      payloadAvailable: true,
    });
    expect(state.detail).toHaveBeenCalledWith({ fundId: 7, actorId: 9, revision: 1 });
  });

  it.each(['credential', 'grant', 'fund'])(
    'denies all endpoints on missing %s access',
    async (failure) => {
      const app = await makeApp();
      if (failure === 'credential') state.authenticated = false;
      if (failure === 'grant') state.granted = false;
      const path = failure === 'fund' ? basePath.replace('/7/', '/8/') : basePath;
      const responses = await Promise.all([
        request(app).post(path).set('If-Match', emptyETag).set('Idempotency-Key', key).send(body()),
        request(app).get(path),
        request(app).get(`${path}/1`),
      ]);
      expect(responses.map(({ status }) => status)).toEqual(
        Array(3).fill(failure === 'credential' ? 401 : 404)
      );
      expect(state.save).not.toHaveBeenCalled();
      expect(state.list).not.toHaveBeenCalled();
      expect(state.detail).not.toHaveBeenCalled();
    }
  );
});
