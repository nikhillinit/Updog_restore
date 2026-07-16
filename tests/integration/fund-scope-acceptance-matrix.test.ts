import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Express } from 'express';

// Universal internal-read acceptance safety net. Locks the approved role-aware
// contract over both production route surfaces (dashboard-summary): admin,
// partner, and analyst callers may read every fund; LP callers remain outside
// this internal surface. A nonexistent fund therefore reaches the read model
// and returns 404 instead of being hidden behind a fund-grant 403.

let signToken: typeof import('../../server/lib/auth/jwt').signToken;
let makeAppSurface: Express;
let dockerHarness: { app: Express; cleanup: () => Promise<void> };

const NONEXISTENT_FUND = 987654;
const summaryPath = (id: number | string): string => `/api/dashboard-summary/${id}`;

const surfaces: ReadonlyArray<{ label: string; app: () => Express }> = [
  { label: 'makeApp', app: () => makeAppSurface },
  { label: 'registerRoutes', app: () => dockerHarness.app },
];

describe('fund-scope acceptance matrix (dashboard-summary) [universal internal read]', () => {
  beforeAll(async () => {
    const { makeApp } = await import('../../server/app');
    const { createInProcessRouteHarness } = await import('./in-process-route-harness');

    ({ signToken } = await import('../../server/lib/auth/jwt'));
    makeAppSurface = makeApp();
    dockerHarness = await createInProcessRouteHarness();
  }, 60_000);

  afterAll(async () => {
    await dockerHarness?.cleanup();
  });

  const bearer = (fundIds: number[], role = 'analyst'): string => {
    const signed = signToken({
      sub: 'matrix-user',
      email: 'matrix@example.com',
      role,
      fundIds,
    });
    const claims = jwt.decode(signed);
    const secret = process.env['JWT_SECRET'];
    if (claims === null || typeof claims === 'string' || !secret) {
      throw new Error('Failed to build integration-test bearer token');
    }

    // This matrix isolates fund-scope decisions from the DB-backed revocation
    // lookup. A non-numeric subject plus no jti keeps token verification local.
    delete claims.jti;
    return `Bearer ${jwt.sign(claims, secret, { algorithm: 'HS256' })}`;
  };

  // registerRoutes intentionally omits makeApp's outer /api authentication
  // boundary, so preserve these existing boundary assertions on makeApp.
  it('no token -> 401', async () => {
    await request(makeAppSurface).get(summaryPath(NONEXISTENT_FUND)).expect(401);
  });

  it('malformed fundId param -> 400', async () => {
    await request(makeAppSurface)
      .get(summaryPath('abc'))
      .set('Authorization', bearer([], 'admin'))
      .expect(400);
  });

  for (const surface of surfaces) {
    describe(surface.label, () => {
      it('partner token scoped to a different fund reaches resource lookup -> 404', async () => {
        await request(surface.app())
          .get(summaryPath(NONEXISTENT_FUND))
          .set('Authorization', bearer([NONEXISTENT_FUND + 1], 'partner'))
          .expect(404);
      });

      it('analyst token with empty fund grants reaches resource lookup -> 404', async () => {
        await request(surface.app())
          .get(summaryPath(NONEXISTENT_FUND))
          .set('Authorization', bearer([], 'analyst'))
          .expect(404);
      });

      it('token scoped to the same fund -> auth allowed (not 401/403)', async () => {
        const res = await request(surface.app())
          .get(summaryPath(NONEXISTENT_FUND))
          .set('Authorization', bearer([NONEXISTENT_FUND]));
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });

      it('admin token with empty fund grants -> auth allowed (not 401/403)', async () => {
        const res = await request(surface.app())
          .get(summaryPath(NONEXISTENT_FUND))
          .set('Authorization', bearer([], 'admin'));
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });
  }
});
