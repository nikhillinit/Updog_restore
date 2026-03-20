/**
 * Contract Snapshot Tests for /api/funds endpoints
 *
 * Phase 0B: validates post-cutover state where the router in
 * server/routes/funds.ts is the sole POST /api/funds owner on the
 * registerRoutes() surface. The inline POST handler has been removed.
 *
 * App assembly mirrors the production mount topology:
 * - routes/funds.ts mounted at /api (routes.ts:47-48)
 * - inline GET handlers remain load-bearing (routes.ts:138-187)
 *
 * Phase 0A note: the idempotency import was fixed from named (factory)
 * to default (pre-called middleware), so the mock is no longer needed.
 */

import { describe, it, expect, beforeAll } from 'vitest';
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

  // Mount inline GET handlers (same as routes.ts:138-187)
  const { storage } = await import('../../../server/storage');

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
});

describe('POST /api/funds contract snapshot', () => {
  it('returns 201 with { success, data, message } wrapper for valid payload', async () => {
    const payload = {
      name: 'Snapshot Valid Fund',
      size: 100_000_000,
      managementFee: 0.02,
      carryPercentage: 0.2,
      vintageYear: 2026,
    };

    const res = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'snapshot-valid-fund-01')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('name', 'Snapshot Valid Fund');
    expect(res.body.data).toHaveProperty('size');
    expect(res.body.data).toHaveProperty('managementFee');
    expect(res.body.data).toHaveProperty('carryPercentage');
    expect(res.body.data).toHaveProperty('vintageYear');
    expect(res.body.data.engineResults).toBeNull();
  });

  it('does not return the deleted raw-fund response shape', async () => {
    const payload = {
      name: 'Snapshot Shape Check Fund',
      size: 50_000_000,
      managementFee: 0.02,
      carryPercentage: 0.2,
      vintageYear: 2026,
    };

    const res = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'snapshot-shape-check-01')
      .send(payload);

    expect(res.status).toBe(201);
    // The deleted inline handler returned the raw Fund object at top level.
    // The router handler wraps it in { success, data, message }.
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    // Raw fund shape would have 'name' at top level, not nested under 'data'
    expect(res.body).not.toHaveProperty('name');
    expect(res.body).not.toHaveProperty('size');
  });

  it('returns 400 with error for invalid payload', async () => {
    const res = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'snapshot-invalid-01')
      .send({ name: '', size: -1 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/funds contract snapshot', () => {
  it('returns 200 with array of funds', async () => {
    const res = await request(app).get('/api/funds');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/funds/:id contract snapshot', () => {
  it('returns 200 with fund object for numeric ID that exists in mock', async () => {
    const res = await request(app).get('/api/funds/1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name');
  });

  it('returns 404 for non-existent fund ID', async () => {
    const res = await request(app).get('/api/funds/999999');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for invalid fund ID', async () => {
    const res = await request(app).get('/api/funds/abc');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/funds/calculate reachability (post-cutover)', () => {
  it('is reachable at /api/funds/calculate after prefix fix', async () => {
    const res = await request(app).post('/api/funds/calculate').send({ fundSize: 100_000_000 });

    // After fixing /api/funds/calculate -> /funds/calculate in the router,
    // mounted at /api, this resolves to /api/funds/calculate correctly.
    expect(res.status).toBeLessThan(400);
  });

  it('returns 404 at the old double-prefix path /api/api/funds/calculate', async () => {
    const res = await request(app).post('/api/api/funds/calculate').send({ fundSize: 100_000_000 });

    expect(res.status).toBe(404);
  });
});
