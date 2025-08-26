import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { makeApp } from '../../server/app.js';
import type { Express } from 'express';

describe('Reserves API Smoke Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = makeApp();
  });

  it('GET /api/v1/reserves/config returns health endpoints', async () => {
    const response = await request(app)
      .get('/api/v1/reserves/config')
      .expect(200);

    expect(response.body).toHaveProperty('/healthz');
    expect(response.body).toHaveProperty('/readyz');
  });

  it('POST /api/v1/reserves/calculate handles valid input', async () => {
    const payload = {
      availableReserves: 1000000,
      companies: [
        {
          id: 'test-company-1',
          name: 'Test Company A',
          stage: 'seed',
          invested: 250000,
          ownership: 0.15
        },
        {
          id: 'test-company-2', 
          name: 'Test Company B',
          stage: 'series_a',
          invested: 1000000,
          ownership: 0.10
        }
      ],
      stagePolicies: [
        { stage: 'seed', reserveMultiple: 2.5, weight: 1 },
        { stage: 'series_a', reserveMultiple: 2, weight: 1.2 }
      ],
      constraints: {
        minCheck: 25000,
        maxPerCompany: 500000,
        discountRateAnnual: 0.12
      }
    };

    const response = await request(app)
      .post('/api/v1/reserves/calculate')
      .send(payload)
      .expect(200);

    expect(response.body).toHaveProperty('allocations');
    expect(response.body).toHaveProperty('totalAllocated');
    expect(response.body).toHaveProperty('remaining');
    expect(Array.isArray(response.body.allocations)).toBe(true);
    
    // Conservation check
    const totalIn = payload.availableReserves;
    const totalOut = response.body.totalAllocated + response.body.remaining;
    expect(Math.abs(totalIn - totalOut)).toBeLessThan(0.01);
  });

  it('POST /api/v1/reserves/calculate rejects invalid schema', async () => {
    const invalidPayload = {
      availableReserves: -1000, // negative reserves
      companies: [],
      stagePolicies: []  // empty policies
    };

    await request(app)
      .post('/api/v1/reserves/calculate')
      .send(invalidPayload)
      .expect(400);
  });

  it('POST /api/v1/reserves/calculate rejects missing stage policy', async () => {
    const payload = {
      availableReserves: 1000000,
      companies: [
        { id: 'c1', name: 'Company 1', stage: 'seed', invested: 100000, ownership: 0.1 }
      ],
      stagePolicies: [
        { stage: 'series_a', reserveMultiple: 2, weight: 1 } // no seed policy
      ]
    };

    await request(app)
      .post('/api/v1/reserves/calculate')
      .send(payload)
      .expect(422);
  });

  it('handles empty companies list', async () => {
    const payload = {
      availableReserves: 1000000,
      companies: [],
      stagePolicies: [
        { stage: 'seed', reserveMultiple: 2, weight: 1 }
      ]
    };

    const response = await request(app)
      .post('/api/v1/reserves/calculate')
      .send(payload)
      .expect(200);

    expect(response.body.allocations).toEqual([]);
    expect(response.body.totalAllocated).toBe(0);
    expect(response.body.remaining).toBe(1000000);
  });

  it('handles zero available reserves', async () => {
    const payload = {
      availableReserves: 0,
      companies: [
        { id: 'c1', name: 'Company 1', stage: 'seed', invested: 100000, ownership: 0.1 }
      ],
      stagePolicies: [
        { stage: 'seed', reserveMultiple: 2, weight: 1 }
      ]
    };

    const response = await request(app)
      .post('/api/v1/reserves/calculate')
      .send(payload)
      .expect(200);

    expect(response.body.allocations).toEqual([]);
    expect(response.body.totalAllocated).toBe(0);
    expect(response.body.remaining).toBe(0);
  });
});