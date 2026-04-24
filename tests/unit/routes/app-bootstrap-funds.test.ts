import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeApp } from '../../../server/app';

describe('makeApp bootstrap surface', () => {
  it('accepts browser RUM beacons on /api/metrics/rum', async () => {
    const app = makeApp();

    const res = await request(app).post('/api/metrics/rum').send({
      name: 'LCP',
      value: 1200,
      pathname: '/fund-setup',
      rating: 'good',
      navigationType: 'navigate',
      timestamp: Date.now(),
    });

    expect(res.status).toBe(204);
  });

  it('creates funds through POST /api/funds', async () => {
    const app = makeApp();

    const res = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'make-app-bootstrap-fund-01')
      .send({
        name: 'Bootstrap Surface Fund',
        size: 100_000_000,
        managementFee: 0.02,
        carryPercentage: 0.2,
        vintageYear: 2026,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data.id');
    expect(res.body).toHaveProperty('message', 'Fund created successfully');
  });

  it('surfaces the variance dashboard route on the bootstrap app', async () => {
    const app = makeApp();

    const res = await request(app).get('/api/funds/abc/variance-dashboard');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid fund ID');
  });
});
