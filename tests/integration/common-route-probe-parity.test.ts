import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { type Response, type Test } from 'supertest';
import type { Express } from 'express';

import { COMMON_API_ROUTE_MANIFEST, type RouteProbe } from '../../shared/routes/api-route-manifest';

let makeAppSurface: Express;
let dockerHarness: { app: Express; cleanup: () => Promise<void> };
let adminAuth: string;

function requestForProbe(app: Express, probe: RouteProbe): Test {
  switch (probe.method) {
    case 'GET':
      return request(app).get(probe.path);
    case 'POST':
      return request(app).post(probe.path);
    case 'PUT':
      return request(app).put(probe.path);
    case 'PATCH':
      return request(app).patch(probe.path);
    case 'DELETE':
      return request(app).delete(probe.path);
  }
}

async function runProbe(app: Express, probe: RouteProbe): Promise<Response> {
  let pending = requestForProbe(app, probe);
  if (probe.authenticated) {
    pending = pending.set('Authorization', adminAuth);
  }
  if (probe.body !== undefined) {
    pending = pending.send(probe.body);
  }
  return pending;
}

describe('common route probe parity', () => {
  beforeAll(async () => {
    const { makeApp } = await import('../../server/app');
    const { createInProcessRouteHarness, createSyntheticAdminAuth } =
      await import('./in-process-route-harness');
    const { signToken } = await import('../../server/lib/auth/jwt');

    makeAppSurface = makeApp();
    dockerHarness = await createInProcessRouteHarness({ authenticateApi: true });
    adminAuth = createSyntheticAdminAuth(signToken);
  }, 60_000);

  afterAll(async () => {
    await dockerHarness?.cleanup();
  });

  for (const entry of COMMON_API_ROUTE_MANIFEST) {
    it(`${entry.id} has identical mount reachability`, async () => {
      const left = await runProbe(makeAppSurface, entry.probe);
      const right = await runProbe(dockerHarness.app, entry.probe);

      expect(left.status).toBe(entry.probe.expectedStatus);
      expect(right.status).toBe(entry.probe.expectedStatus);
      expect(left.status).toBe(right.status);
    }, 30_000);
  }

  it('keeps an authenticated unknown route on both catch-all paths', async () => {
    const probe: RouteProbe = {
      method: 'GET',
      path: '/api/__no_such_common_route__/1',
      expectedStatus: 404,
      authenticated: true,
    };
    const left = await runProbe(makeAppSurface, probe);
    const right = await runProbe(dockerHarness.app, probe);

    expect(left.status).toBe(404);
    expect(right.status).toBe(404);
    expect(left.body).toMatchObject({ error: 'not_found' });
    expect(right.body).toMatchObject({ error: 'not_found' });
  }, 30_000);
});
