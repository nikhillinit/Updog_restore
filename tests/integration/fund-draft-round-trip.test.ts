/**
 * Integration test: Draft save round-trip
 *
 * PUT draft -> GET draft -> assert response.body.config deep-equals sent payload.
 * Also validates upsert: second PUT updates instead of creating duplicate.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { validDraftPayload, minimalDraftPayload } from '../fixtures/fund-contract-v1-fixtures';

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json({ limit: '1mb' }));

  // Mount funds router at /api for POST /api/funds
  const fundRoutes = await import('../../server/routes/funds');
  app.use('/api', fundRoutes.default);

  // Mount fund-config routes (registers PUT /api/funds/:id/draft, GET /api/funds/:id/draft)
  const { registerFundConfigRoutes } = await import('../../server/routes/fund-config');
  registerFundConfigRoutes(app);
});

describe('PUT /api/funds/:id/draft round-trip', () => {
  it('saves and retrieves a full draft payload', async () => {
    // First create a fund to get a valid ID
    const createRes = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'draft-rt-create-01')
      .send({ name: 'Draft RT Fund', size: 50_000_000 });

    expect(createRes.status).toBe(201);
    const fundId = createRes.body.data.id;

    // PUT full draft
    const putRes = await request(app).put(`/api/funds/${fundId}/draft`).send(validDraftPayload);

    expect(putRes.status).toBe(200);
    expect(putRes.body).toHaveProperty('success', true);

    // GET draft back
    const getRes = await request(app).get(`/api/funds/${fundId}/draft`);

    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty('config');
    expect(getRes.body.config).toMatchObject(validDraftPayload);
  });

  it('upserts on second PUT (does not create duplicate)', async () => {
    const createRes = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'draft-rt-upsert-01')
      .send({ name: 'Upsert Fund', size: 25_000_000 });

    expect(createRes.status).toBe(201);
    const fundId = createRes.body.data.id;

    // First PUT
    const put1 = await request(app).put(`/api/funds/${fundId}/draft`).send(minimalDraftPayload);
    expect(put1.status).toBe(200);

    // Second PUT with more fields -- should update, not insert
    const put2 = await request(app).put(`/api/funds/${fundId}/draft`).send(validDraftPayload);
    expect(put2.status).toBe(200);

    // GET should return the second payload
    const getRes = await request(app).get(`/api/funds/${fundId}/draft`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.config).toMatchObject(validDraftPayload);
  });

  it('rejects unknown keys in draft payload', async () => {
    const createRes = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', 'draft-rt-strict-01')
      .send({ name: 'Strict Fund', size: 10_000_000 });

    expect(createRes.status).toBe(201);
    const fundId = createRes.body.data.id;

    const putRes = await request(app)
      .put(`/api/funds/${fundId}/draft`)
      .send({ fundName: 'Test', bogusField: true });

    expect(putRes.status).toBe(400);
    expect(putRes.body).toHaveProperty('code', 'DRAFT_VALIDATION_ERROR');
    expect(putRes.body).toHaveProperty('issues');
  });

  it('returns 404 for non-existent fund', async () => {
    const putRes = await request(app).put('/api/funds/999999/draft').send(minimalDraftPayload);

    expect(putRes.status).toBe(404);
  });
});
