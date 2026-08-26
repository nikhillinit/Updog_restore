import request from 'supertest';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createFundWithInitialDraftMock } = vi.hoisted(() => ({
  createFundWithInitialDraftMock: vi.fn(),
}));

vi.mock('../../../server/services/fund-persistence-service', () => ({
  fundPersistenceService: {
    createFundWithInitialDraft: createFundWithInitialDraftMock,
  },
}));

vi.mock('../../../server/lib/auth/credentials', () => ({
  getUserFundGrants: vi.fn().mockResolvedValue([42]),
}));

vi.mock('../../../server/lib/auth/revocation.js', () => ({
  assertTokenUsable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock('../../../server/middleware/idempotency', () => ({
  default: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getAllFunds: vi.fn().mockResolvedValue([]),
    getFund: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../../server/shared/idempotency-instance', () => ({ idem: {} }));
vi.mock('../../../server/lib/inflight-server', () => ({ getOrStart: vi.fn() }));
vi.mock('../../../server/metrics', () => ({ calcDurationMs: { startTimer: vi.fn(() => vi.fn()) } }));
vi.mock('../../../server/lib/hash', () => ({ hashPayload: vi.fn(() => 'mock-hash') }));
vi.mock('../../../server/core/enhanced-fund-model', () => ({ EnhancedFundModel: vi.fn() }));

import fundsRouter from '../../../server/routes/funds';
import {
  requireWriteRole,
  requireAuth,
  signBrowserSessionToken,
  signToken,
  verifyAccessToken,
} from '../../../server/lib/auth/jwt';
import { requireCsrf, createSessionCsrfToken } from '../../../server/lib/auth/csrf';
import { enforceProvidedFundScope } from '../../../server/lib/auth/provided-fund-scope';
import { PARTNER_WRITE_ROLES } from '@shared/auth/effective-roles';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  cookieHeader,
  findSetCookie,
} from '../../helpers/browser-auth';

const payload = {
  name: 'Credential Renewal Fund',
  size: 50_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2026,
};

const createdFund = {
  id: 42,
  name: payload.name,
  size: '50000000',
  managementFee: '0.02',
  carryPercentage: '0.2',
  vintageYear: payload.vintageYear,
  status: 'draft',
  engineResults: null,
  createdAt: new Date('2026-01-15T00:00:00Z'),
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth(), requireCsrf);
  app.use('/api', fundsRouter);
  app.post(
    '/api/funds/:fundId/write',
    requireWriteRole(PARTNER_WRITE_ROLES),
    async (req, res) => {
      const fundId = Number(req.params['fundId']);
      if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) return;
      res.json({ ok: true, fundId });
    }
  );
  return app;
}

function cookieAuth(token: string, csrfToken: string) {
  return {
    Cookie: cookieHeader(
      { name: SESSION_COOKIE_NAME, value: token },
      { name: CSRF_COOKIE_NAME, value: csrfToken }
    ),
    [CSRF_HEADER_NAME]: csrfToken,
  };
}

describe('fund creation credential renewal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createFundWithInitialDraftMock.mockResolvedValue({ fund: createdFund });
  });

  it('renews cookie session and permits new-fund write while stale session remains denied', async () => {
    const app = createApp();
    const oldToken = signBrowserSessionToken({
      sub: '12',
      email: 'partner@example.com',
      role: 'partner',
      fundIds: [],
    });
    const oldClaims = verifyAccessToken(oldToken);
    const oldCsrf = createSessionCsrfToken(String(oldClaims.jti));

    const created = await request(app)
      .post('/api/funds')
      .set(cookieAuth(oldToken, oldCsrf))
      .send(payload);

    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty('renewedAccessToken');
    const renewedSession = findSetCookie(created, SESSION_COOKIE_NAME);
    const renewedCsrf = findSetCookie(created, CSRF_COOKIE_NAME);
    expect(renewedSession.attributes.get('httponly')).toBe(true);
    expect(renewedCsrf.attributes.has('httponly')).toBe(false);

    const renewedWrite = await request(app)
      .post('/api/funds/42/write')
      .set(cookieAuth(renewedSession.value, renewedCsrf.value));
    expect(renewedWrite.status).toBe(200);

    const staleWrite = await request(app)
      .post('/api/funds/42/write')
      .set(cookieAuth(oldToken, oldCsrf));
    expect(staleWrite.status).toBe(403);
  });

  it('returns bearer renewal with no-store and leaves stale bearer denied', async () => {
    const app = createApp();
    const oldToken = signToken({
      sub: '12',
      email: 'partner@example.com',
      role: 'partner',
      fundIds: [],
    });

    const created = await request(app)
      .post('/api/funds')
      .set('Authorization', `Bearer ${oldToken}`)
      .send(payload);

    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body.renewedAccessToken).toEqual(expect.any(String));
    expect(created.headers['set-cookie']).toBeUndefined();

    const renewedWrite = await request(app)
      .post('/api/funds/42/write')
      .set('Authorization', `Bearer ${created.body.renewedAccessToken}`);
    expect(renewedWrite.status).toBe(200);

    const staleWrite = await request(app)
      .post('/api/funds/42/write')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(staleWrite.status).toBe(403);
  });
});
