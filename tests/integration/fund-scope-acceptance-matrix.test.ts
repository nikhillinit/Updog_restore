import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Express } from 'express';

// Task 7: fail-closed acceptance safety net. Locks enforceProvidedFundScope's
// role-aware contract over both production route surfaces (dashboard-summary):
// non-admin callers need an explicit fund grant, while admin callers remain
// unrestricted. Deny cases short-circuit before the DB read; allow cases assert
// only that auth passed, independent of the read model returning 200/404/500.

let signToken: typeof import('../../server/lib/auth/jwt').signToken;
let makeAppSurface: Express;
let dockerHarness: { app: Express; cleanup: () => Promise<void> };

const NONEXISTENT_FUND = 987654;
const summaryPath = (id: number | string): string => `/api/dashboard-summary/${id}`;

const surfaces: ReadonlyArray<{ label: string; app: () => Express }> = [
  { label: 'makeApp', app: () => makeAppSurface },
  { label: 'registerRoutes', app: () => dockerHarness.app },
];

describe('fund-scope acceptance matrix (dashboard-summary) [fail-closed]', () => {
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
      // ---- deny boundary (short-circuits before any DB read) ----

      it('token scoped to a different fund (cross-fund) -> 403', async () => {
        await request(surface.app())
          .get(summaryPath(NONEXISTENT_FUND))
          .set('Authorization', bearer([NONEXISTENT_FUND + 1]))
          .expect(403);
      });

      it('non-admin token with empty fund grants -> 403', async () => {
        await request(surface.app())
          .get(summaryPath(NONEXISTENT_FUND))
          .set('Authorization', bearer([], 'analyst'))
          .expect(403);
      });

      // ---- allow boundary (auth passes; business layer resolves the fund) ----

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
