/**
 * Contract Snapshot Tests for /api/funds endpoints
 *
 * Phase 0B: validates post-cutover state where the router in
 * server/routes/funds.ts is the sole POST /api/funds owner on the
 * registerRoutes() surface. Phase 4 extends that ownership to the canonical
 * GET endpoints as well.
 *
 * App assembly mirrors the production mount topology:
 * - routes/funds.ts mounted at /api (routes.ts:40-41)
 *
 * Phase 0A note: the idempotency import was fixed from named (factory)
 * to default (pre-called middleware), so the mock is no longer needed.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  fundsEndpointKey,
  supportedCanonicalFundsEndpoints,
} from '../../../server/contracts/funds-endpoint-ownership';

let app: express.Express;

const snapshotCoverageKeys = [
  fundsEndpointKey({ method: 'GET', path: '/api/funds', runtimeSurface: 'registerRoutes' }),
  fundsEndpointKey({ method: 'GET', path: '/api/funds/:id', runtimeSurface: 'registerRoutes' }),
  fundsEndpointKey({ method: 'POST', path: '/api/funds', runtimeSurface: 'registerRoutes' }),
  fundsEndpointKey({
    method: 'POST',
    path: '/api/funds/calculate',
    runtimeSurface: 'registerRoutes',
  }),
].sort();

beforeAll(async () => {
  app = express();
  app.set('trust proxy', false);
  app.use(express.json({ limit: '1mb' }));

  // Mount funds router at /api (same as routes.ts:40-41)
  const fundRoutes = await import('../../../server/routes/funds');
  app.use('/api', fundRoutes.default);
});

describe('funds endpoint ownership manifest coverage', () => {
  it('keeps snapshot coverage aligned with the supported canonical manifest', () => {
    const manifestKeys = supportedCanonicalFundsEndpoints.map(fundsEndpointKey).sort();
    expect(snapshotCoverageKeys).toEqual(manifestKeys);
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

  it('accepts canonical payload with size=0 (provisional)', async () => {
    const res = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'snapshot-size-zero-01')
      .send({ name: 'Zero Size Fund', size: 0 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('name', 'Zero Size Fund');
  });

  it('returns 400 FUND_NO_MARKERS when neither name nor basics present', async () => {
    const res = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'snapshot-no-markers-01')
      .send({ fundSize: 50_000_000 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'FUND_NO_MARKERS');
  });

  it('returns 400 when the removed legacy basics format is submitted', async () => {
    const res = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'snapshot-legacy-format-01')
      .send({ basics: { name: 'Legacy Fund', size: 50_000_000 } });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'FUND_LEGACY_FORMAT_REMOVED');
  });

  it('creates a fund that becomes visible through the canonical GET list endpoint', async () => {
    const postRes = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'snapshot-round-trip-01')
      .send({
        name: 'Snapshot Round Trip Fund',
        size: 65_000_000,
        managementFee: 0.02,
        carryPercentage: 0.2,
        vintageYear: 2026,
      });

    expect(postRes.status).toBe(201);
    expect(postRes.body).toHaveProperty('data.id');

    const createdId = String(postRes.body.data.id);
    const getRes = await request(app).get('/api/funds');

    expect(getRes.status).toBe(200);

    const createdFund = (getRes.body as Array<Record<string, unknown>>).find(
      (fund) => String(fund['id']) === createdId
    );

    expect(createdFund).toBeTruthy();
    expect(createdFund).toHaveProperty('name', 'Snapshot Round Trip Fund');
    expect(Number(createdFund?.['size'])).toBe(65_000_000);
  });

  it('creates a fund retrievable by numeric ID through the canonical GET detail endpoint', async () => {
    const postRes = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'snapshot-detail-readback-01')
      .send({
        name: 'Detail Readback Fund',
        size: 42_000_000,
        managementFee: 0.02,
        carryPercentage: 0.2,
        vintageYear: 2026,
      });

    expect(postRes.status).toBe(201);
    const createdId = postRes.body.data.id;
    expect(typeof createdId).toBe('number');

    const detailRes = await request(app).get(`/api/funds/${createdId}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body).toHaveProperty('id', createdId);
    expect(detailRes.body).toHaveProperty('name', 'Detail Readback Fund');
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
