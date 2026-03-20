/**
 * Route Ownership Smoke Tests for /api/funds
 *
 * Phase 0A deliverable: proves which handler owns each endpoint on the
 * canonical registerRoutes() surface.
 *
 * App assembly mirrors production mount topology:
 * - routes/funds.ts mounted at /api (routes.ts:47-48)
 * - inline GET handlers (routes.ts:138-187)
 * - inline POST handler (routes.ts:189-232) added AFTER router mount
 *
 * This reproduces Express mount-order precedence exactly.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// See funds-endpoint-snapshots.test.ts for explanation of this mock.
// The idempotency factory is passed without calling it, causing Express
// to hang. Mock to pass-through (matches production no-op behavior).
vi.mock('../../../server/middleware/idempotency', () => ({
  idempotency: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

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

  // Inline POST handler (routes.ts:189-232) - added AFTER router mount
  // In production, this is shadowed by the router POST at funds.ts:63
  // because Express processes mounted routers before inline handlers
  const { z } = await import('zod');
  app.post('/api/funds', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        size: z.number().positive(),
        deployedCapital: z.number().min(0).optional(),
        managementFee: z.number().min(0).max(1),
        carryPercentage: z.number().min(0).max(1),
        vintageYear: z.number().int().min(2000).max(2030),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid fund data',
          details: { validationErrors: parsed.error.format() },
        });
      }
      const fund = await storage.createFund({
        name: parsed.data.name,
        size: String(parsed.data.size),
        managementFee: String(parsed.data.managementFee),
        carryPercentage: String(parsed.data.carryPercentage),
        vintageYear: parsed.data.vintageYear,
      });
      res.status(201).json(fund);
    } catch {
      res.status(500).json({ error: 'Failed to create fund', message: 'Internal error' });
    }
  });
});

describe('POST /api/funds route ownership', () => {
  it('is handled by the router (funds.ts), not the inline handler (routes.ts)', async () => {
    const payload = {
      name: 'Ownership Test Fund',
      size: 100_000_000,
      managementFee: 0.02,
      carryPercentage: 0.2,
      vintageYear: 2026,
    };

    const res = await request(app).post('/api/funds').send(payload);

    // Router handler (funds.ts:63) returns { success, data, message }
    // Inline handler (routes.ts:189) returns raw Fund object
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('message', 'Fund created successfully');

    // If we see these properties at top level, the inline handler won
    // (it returns the raw Fund without wrapper)
    expect(res.body).not.toHaveProperty('name');
    expect(res.body).not.toHaveProperty('size');
  });
});

describe('GET /api/funds route ownership', () => {
  it('inline handler at routes.ts:138 is reachable', async () => {
    const res = await request(app).get('/api/funds');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/funds/:id route ownership', () => {
  it('inline handler at routes.ts:151 is reachable', async () => {
    // Use the seeded fund ID 1 (DatabaseMock creates UUIDs for new funds,
    // but the inline GET handler expects numeric IDs)
    const res = await request(app).get('/api/funds/1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });
});

describe('POST /api/funds/calculate mount prefix validation', () => {
  it('documents the actual reachable path for calculate endpoint', async () => {
    const body = { fundSize: 100_000_000 };

    const singlePrefix = await request(app).post('/api/funds/calculate').send(body);

    const doublePrefix = await request(app).post('/api/api/funds/calculate').send(body);

    // One of these should succeed, documenting the mount-prefix bug
    const reachablePath =
      singlePrefix.status < 400
        ? '/api/funds/calculate'
        : doublePrefix.status < 400
          ? '/api/api/funds/calculate (BUG: double prefix)'
          : 'NEITHER PATH REACHABLE';

    console.log(`Calculate endpoint reachable at: ${reachablePath}`);
    console.log(`  /api/funds/calculate -> ${singlePrefix.status}`);
    console.log(`  /api/api/funds/calculate -> ${doublePrefix.status}`);

    // At least one path should be reachable
    const eitherReachable = singlePrefix.status < 400 || doublePrefix.status < 400;
    expect(eitherReachable).toBe(true);
  });
});
