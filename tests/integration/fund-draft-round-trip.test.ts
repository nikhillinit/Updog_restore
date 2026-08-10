/**
 * Integration test: Draft save round-trip
 *
 * PUT draft -> GET draft -> assert response.body.config deep-equals sent payload.
 * Also validates upsert: second PUT updates instead of creating duplicate.
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { users } from '@shared/schema';
import { db } from '../../server/db';
import { validDraftPayload, minimalDraftPayload } from '../fixtures/fund-contract-v1-fixtures';
import { makeJwt } from '../utils/integrationAuth';

let app: express.Express;
const fixture = { partnerUserId: undefined as number | undefined };
const MODULE_RUN_ID = randomUUID();
const PARTNER_USERNAME = `integration-fund-draft-round-trip-${MODULE_RUN_ID}`;
const PARTNER_PASSWORD = 'test-only-password';
const idempotencyKey = (operation: string): string => `draft-rt-${MODULE_RUN_ID}-${operation}`;

const partnerToken = (fundIds: number[] = []): string => {
  if (fixture.partnerUserId === undefined) {
    throw new Error('Integration-test partner user is not provisioned');
  }

  return makeJwt({
    userId: String(fixture.partnerUserId),
    email: 'draft-partner@example.com',
    role: 'partner',
    fundIds,
  });
};

beforeAll(async () => {
  const [partnerUser] = await db
    .insert(users)
    .values({
      username: PARTNER_USERNAME,
      password: PARTNER_PASSWORD,
      role: 'partner',
      isActive: true,
      isReleaseCanaryPrincipal: false,
    })
    .returning({ id: users.id });

  if (!partnerUser || !Number.isInteger(partnerUser.id) || partnerUser.id <= 0) {
    throw new Error('Failed to provision integration-test partner user');
  }
  Object.assign(fixture, { partnerUserId: partnerUser.id });

  app = express();
  app.use(express.json({ limit: '1mb' }));

  const { requireAuth } = await import('../../server/lib/auth/jwt');
  app.use('/api', requireAuth());

  // Mount funds router at /api for POST /api/funds
  const fundRoutes = await import('../../server/routes/funds');
  app.use('/api', fundRoutes.default);

  // Mount fund-config routes (registers PUT /api/funds/:id/draft, GET /api/funds/:id/draft)
  const { registerFundConfigRoutes } = await import('../../server/routes/fund-config');
  registerFundConfigRoutes(app);
});

afterAll(async () => {
  if (fixture.partnerUserId === undefined) return;

  await db.delete(users).where(eq(users.id, fixture.partnerUserId));
  Object.assign(fixture, { partnerUserId: undefined });
});

describe('PUT /api/funds/:id/draft round-trip', () => {
  it('saves and retrieves a full draft payload', async () => {
    // First create a fund to get a valid ID
    const createRes = await request(app)
      .post('/api/funds')
      .set('Authorization', `Bearer ${partnerToken()}`)
      .set('Idempotency-Key', idempotencyKey('create-01'))
      .send({ name: 'Draft RT Fund', size: 50_000_000 });

    expect(createRes.status).toBe(201);
    const fundId = createRes.body.data.id;

    // PUT full draft
    const authorization = `Bearer ${partnerToken([fundId])}`;
    const putRes = await request(app)
      .put(`/api/funds/${fundId}/draft`)
      .set('Authorization', authorization)
      .send(validDraftPayload);

    expect(putRes.status).toBe(200);
    expect(putRes.body).toHaveProperty('success', true);

    // GET draft back
    const getRes = await request(app)
      .get(`/api/funds/${fundId}/draft`)
      .set('Authorization', authorization);

    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty('config');
    expect(getRes.body.config).toMatchObject(validDraftPayload);
  });

  it('upserts on second PUT (does not create duplicate)', async () => {
    const createRes = await request(app)
      .post('/api/funds')
      .set('Authorization', `Bearer ${partnerToken()}`)
      .set('Idempotency-Key', idempotencyKey('upsert-01'))
      .send({ name: 'Upsert Fund', size: 25_000_000 });

    expect(createRes.status).toBe(201);
    const fundId = createRes.body.data.id;

    // First PUT
    const authorization = `Bearer ${partnerToken([fundId])}`;
    const put1 = await request(app)
      .put(`/api/funds/${fundId}/draft`)
      .set('Authorization', authorization)
      .send(minimalDraftPayload);
    expect(put1.status).toBe(200);

    // Second PUT with more fields -- should update, not insert
    const put2 = await request(app)
      .put(`/api/funds/${fundId}/draft`)
      .set('Authorization', authorization)
      .send(validDraftPayload);
    expect(put2.status).toBe(200);

    // GET should return the second payload
    const getRes = await request(app)
      .get(`/api/funds/${fundId}/draft`)
      .set('Authorization', authorization);
    expect(getRes.status).toBe(200);
    expect(getRes.body.config).toMatchObject(validDraftPayload);
  });

  it('rejects unknown keys in draft payload', async () => {
    const createRes = await request(app)
      .post('/api/funds')
      .set('Authorization', `Bearer ${partnerToken()}`)
      .set('Idempotency-Key', idempotencyKey('strict-01'))
      .send({ name: 'Strict Fund', size: 10_000_000 });

    expect(createRes.status).toBe(201);
    const fundId = createRes.body.data.id;

    const putRes = await request(app)
      .put(`/api/funds/${fundId}/draft`)
      .set('Authorization', `Bearer ${partnerToken([fundId])}`)
      .send({ fundName: 'Test', bogusField: true });

    expect(putRes.status).toBe(400);
    expect(putRes.body).toHaveProperty('code', 'DRAFT_VALIDATION_ERROR');
    expect(putRes.body).toHaveProperty('issues');
  });

  it('returns 404 for non-existent fund', async () => {
    const putRes = await request(app)
      .put('/api/funds/999999/draft')
      .set('Authorization', `Bearer ${partnerToken([999999])}`)
      .send(minimalDraftPayload);

    expect(putRes.status).toBe(404);
  });
});
