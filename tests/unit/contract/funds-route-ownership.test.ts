/**
 * Route Ownership Tests for /api/funds
 *
 * Phase 0B: validates that POST /api/funds has exactly one owner on the
 * registerRoutes() surface -- the router in server/routes/funds.ts.
 * Phase 4 extends that normalization so GET /api/funds and GET /api/funds/:id
 * are also router-owned.
 *
 * App assembly mirrors production mount topology:
 * - routes/funds.ts mounted at /api (routes.ts:40-41)
 *
 * The idempotency import was fixed (default export = pre-called middleware),
 * so the factory mock is no longer needed.
 */

import { afterAll, describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  fundsEndpointKey,
  supportedCanonicalFundsEndpoints,
} from '../../../server/contracts/funds-endpoint-ownership';

let app: express.Express;
const fundRoutesModulePromise = import('../../../server/routes/funds');
const registerRoutesModulePromise = import('../../../server/routes');

describe('funds endpoint ownership manifest', () => {
  it('declares one supported canonical owner per endpoint on registerRoutes', () => {
    const canonicalEntries = supportedCanonicalFundsEndpoints.map(
      ({ method, path, runtimeSurface, ownerModule }) => ({
        method,
        path,
        runtimeSurface,
        ownerModule,
      })
    );

    expect(canonicalEntries).toEqual([
      {
        method: 'GET',
        path: '/api/funds',
        runtimeSurface: 'registerRoutes',
        ownerModule: 'server/routes/funds.ts',
      },
      {
        method: 'GET',
        path: '/api/funds/:id',
        runtimeSurface: 'registerRoutes',
        ownerModule: 'server/routes/funds.ts',
      },
      {
        method: 'POST',
        path: '/api/funds',
        runtimeSurface: 'registerRoutes',
        ownerModule: 'server/routes/funds.ts',
      },
      {
        method: 'POST',
        path: '/api/funds/calculate',
        runtimeSurface: 'registerRoutes',
        ownerModule: 'server/routes/funds.ts',
      },
    ]);

    const keys = supportedCanonicalFundsEndpoints.map(fundsEndpointKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

beforeAll(async () => {
  app = express();
  app.set('trust proxy', false);
  app.use(express.json({ limit: '1mb' }));

  // Mount funds router at /api (same as routes.ts:40-41)
  const fundRoutes = await fundRoutesModulePromise;
  app.use('/api', fundRoutes.default);
});

describe('POST /api/funds route ownership (post-cutover)', () => {
  it('is owned by the router (funds.ts) with wrapper contract', async () => {
    const payload = {
      name: 'Ownership Sole Owner Fund',
      size: 100_000_000,
      managementFee: 0.02,
      carryPercentage: 0.2,
      vintageYear: 2026,
    };

    const res = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'ownership-sole-owner-01')
      .send(payload);

    // Router handler (funds.ts) returns { success, data, message }
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('message', 'Fund created successfully');

    // No raw fund shape at top level (the deleted inline handler's contract)
    expect(res.body).not.toHaveProperty('name');
    expect(res.body).not.toHaveProperty('size');
  });

  it('returns 400 with error property for invalid input', async () => {
    const res = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'ownership-invalid-01')
      .send({ name: '', size: -1 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/funds route ownership (post-cutover)', () => {
  it('router handler at funds.ts is reachable without inline assembly', async () => {
    const res = await request(app).get('/api/funds');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/funds/:id route ownership (post-cutover)', () => {
  it('router handler at funds.ts is reachable without inline assembly', async () => {
    const res = await request(app).get('/api/funds/1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });
});

describe('POST /api/funds/calculate mount prefix (post-cutover)', () => {
  it('is reachable at /api/funds/calculate after prefix fix', async () => {
    const res = await request(app).post('/api/funds/calculate').send({ fundSize: 100_000_000 });

    expect(res.status).toBeLessThan(400);
  });

  it('returns 404 at /api/api/funds/calculate (double prefix eliminated)', async () => {
    const res = await request(app).post('/api/api/funds/calculate').send({ fundSize: 100_000_000 });

    expect(res.status).toBe(404);
  });
});

/**
 * Authoritative-runtime smoke proof (Phase 0B + Phase 4).
 *
 * Boots the real registerRoutes() path to prove endpoint ownership on the
 * actual production surface for all four canonical funds endpoints.
 */
describe('registerRoutes() smoke proof', () => {
  let smokeServer: import('http').Server | undefined;
  let smokeApp: express.Express;

  beforeAll(async () => {
    smokeApp = express();
    smokeApp.set('trust proxy', false);
    smokeApp.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await registerRoutesModulePromise;
    smokeServer = await registerRoutes(smokeApp);
  }, 30_000);

  afterAll(async () => {
    const serverToClose = smokeServer;
    smokeServer = undefined;

    if (serverToClose?.listening) {
      await new Promise<void>((resolve, reject) => {
        serverToClose.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('POST /api/funds returns 201 with router-owned wrapper on real boot path', async () => {
    const payload = {
      name: 'Smoke Proof Boot Fund',
      size: 75_000_000,
      managementFee: 0.02,
      carryPercentage: 0.2,
      vintageYear: 2026,
    };

    const res = await request(smokeApp)
      .post('/api/funds')
      .set('Idempotency-Key', 'smoke-proof-boot-01')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('message');
  });

  it('GET /api/funds returns 200 with array on real boot path', async () => {
    const res = await request(smokeApp).get('/api/funds');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST -> GET /api/funds/:id round-trips on real boot path', async () => {
    const createRes = await request(smokeApp)
      .post('/api/funds')
      .set('Idempotency-Key', 'smoke-proof-boot-detail-01')
      .send({
        name: 'Smoke Proof Detail Fund',
        size: 80_000_000,
        managementFee: 0.02,
        carryPercentage: 0.2,
        vintageYear: 2026,
      });

    expect(createRes.status).toBe(201);
    const createdId = createRes.body.data.id;
    expect(typeof createdId).toBe('number');

    const detailRes = await request(smokeApp).get(`/api/funds/${createdId}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body).toHaveProperty('id', createdId);
    expect(detailRes.body).toHaveProperty('name', 'Smoke Proof Detail Fund');
  });
});
