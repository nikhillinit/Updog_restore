/**
 * Route Ownership Tests for /api/funds
 *
 * Phase 0B: validates that POST /api/funds has exactly one owner on the
 * registerRoutes() surface -- the router in server/routes/funds.ts.
 * The shadowed inline POST handler has been removed from routes.ts.
 *
 * App assembly mirrors production mount topology:
 * - routes/funds.ts mounted at /api (routes.ts:47-48)
 * - inline GET handlers (routes.ts:138-187) remain load-bearing
 *
 * The idempotency import was fixed (default export = pre-called middleware),
 * so the factory mock is no longer needed.
 */

import { afterAll, describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.set('trust proxy', false);
  app.use(express.json({ limit: '1mb' }));

  // Mount funds router at /api (same as routes.ts:47-48)
  const fundRoutes = await import('../../../server/routes/funds');
  app.use('/api', fundRoutes.default);

  const { storage } = await import('../../../server/storage');

  // Inline GET handlers (same as routes.ts:138-187)
  app.get('/api/funds', async (_req: Request, res: Response) => {
    try {
      const funds = await storage.getAllFunds();
      res.json(funds);
    } catch {
      res.status(500).json({ error: 'Database query failed', message: 'Internal error' });
    }
  });

  app.get('/api/funds/:id', async (req: Request, res: Response) => {
    try {
      const idParam = req.params['id'];
      const id = Number(idParam);
      if (Number.isNaN(id) || id <= 0) {
        return res
          .status(400)
          .json({ error: 'Invalid fund ID', message: `Invalid ID: ${idParam}` });
      }
      const fund = await storage.getFund(id);
      if (!fund) {
        return res.status(404).json({ error: 'Fund not found', message: `No fund with ID ${id}` });
      }
      res.json(fund);
    } catch {
      res.status(500).json({ error: 'Database query failed', message: 'Internal error' });
    }
  });

  // No inline POST /api/funds -- removed in Phase 0B cutover.
  // The router handler at funds.ts is now the sole POST owner.
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
  it('inline handler at routes.ts is still reachable', async () => {
    const res = await request(app).get('/api/funds');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/funds/:id route ownership (post-cutover)', () => {
  it('inline handler at routes.ts is still reachable', async () => {
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
 * Authoritative-runtime smoke proof (Phase 0B mandatory).
 *
 * Boots the real registerRoutes() path to prove POST /api/funds ownership
 * on the actual production surface. This is intentionally narrow: it only
 * asserts the POST contract, not the full 30+ route set.
 */
describe('registerRoutes() smoke proof', () => {
  let smokeServer: import('http').Server | undefined;

  afterAll(async () => {
    const serverToClose = smokeServer;
    smokeServer = undefined;

    if (serverToClose?.listening) {
      // registerRoutes() returns an http.Server that may not be listening.
      // close() throws if not listening, so guard against that.
      await new Promise<void>((resolve, reject) => {
        serverToClose.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('POST /api/funds returns 201 with router-owned wrapper on real boot path', async () => {
    const smokeApp = express();
    smokeApp.set('trust proxy', false);
    smokeApp.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    smokeServer = await registerRoutes(smokeApp);

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
  }, 15_000);
});
