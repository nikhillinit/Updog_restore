import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Task 7: characterization safety net. Locks the CURRENT fund-scope behavior of
// enforceProvidedFundScope over the real makeApp route stack (dashboard-summary),
// so the planned fail-closed migration (post-PR-7b) cannot silently regress the
// deny boundary. enforceProvidedFundScope runs BEFORE the DB read, so the deny
// cases (401/400/403) short-circuit; the allow cases assert only that auth
// passed (status not 401/403), independent of the read model returning 200/404.

let makeApp: typeof import('../../server/app').makeApp;
let signToken: typeof import('../../server/lib/auth/jwt').signToken;
let app: Express;

const NONEXISTENT_FUND = 987654;
const summaryPath = (id: number | string): string => `/api/dashboard-summary/${id}`;

describe('fund-scope acceptance matrix (dashboard-summary) [current behavior]', () => {
  beforeAll(async () => {
    makeApp = (await import('../../server/app')).makeApp;
    ({ signToken } = await import('../../server/lib/auth/jwt'));
  });

  beforeEach(() => {
    app = makeApp();
  });

  const bearer = (fundIds: number[], role = 'analyst'): string =>
    `Bearer ${signToken({ sub: 'matrix-user', email: 'matrix@example.com', role, fundIds })}`;

  // ---- deny boundary (short-circuits before any DB read) ----

  it('no token -> 401', async () => {
    await request(app).get(summaryPath(NONEXISTENT_FUND)).expect(401);
  });

  it('malformed fundId param -> 400', async () => {
    await request(app)
      .get(summaryPath('abc'))
      .set('Authorization', bearer([], 'admin'))
      .expect(400);
  });

  it('token scoped to a different fund (cross-fund) -> 403', async () => {
    await request(app)
      .get(summaryPath(NONEXISTENT_FUND))
      .set('Authorization', bearer([NONEXISTENT_FUND + 1]))
      .expect(403);
  });

  // ---- allow boundary (auth passes; business layer resolves the fund) ----

  it('token scoped to the same fund -> auth allowed (not 401/403)', async () => {
    const res = await request(app)
      .get(summaryPath(NONEXISTENT_FUND))
      .set('Authorization', bearer([NONEXISTENT_FUND]));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  // Documents the CURRENT contract: empty fundIds == unrestricted (any role).
  // The fail-closed migration (post-PR-7b) tightens this to 403 for non-admin
  // roles; this assertion is the safety net that will flag that intended change.
  it('empty-fundIds token (current "unrestricted" contract) -> auth allowed (not 401/403)', async () => {
    const res = await request(app)
      .get(summaryPath(NONEXISTENT_FUND))
      .set('Authorization', bearer([], 'analyst'));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
