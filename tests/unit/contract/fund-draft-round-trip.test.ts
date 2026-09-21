/**
 * Draft save round-trip test (unit-level, uses db mock)
 *
 * Validates:
 * - FundDraftWriteV1Schema strict validation on PUT /api/funds/:id/draft
 * - Unknown keys rejected (strict mode)
 * - Existing draft updates preserve complete DTOs; command atomicity is covered in PG
 *
 * Note: Uses the database mock (tests/helpers/database-mock.ts) that is
 * automatically loaded by the server test project's setupFiles.
 */

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { validDraftPayload, minimalDraftPayload } from '../../fixtures/fund-contract-v1-fixtures';

let app: express.Express;

beforeEach(async () => {
  const { databaseMock } = await import('../../helpers/database-mock');
  const draft = {
    id: 101,
    fundId: 1,
    version: 1,
    draftRevision: 1n,
    config: { fundName: 'Initial draft' },
    isDraft: true,
    isPublished: false,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  databaseMock.setMockData('fundconfigs', [draft]);
  const workflow = await import('../../../server/services/fund-workflow-service');
  vi.spyOn(workflow, 'executeFundWorkflowCommand').mockImplementation(
    async (_command, execute) => ({
      ...(await execute(draft)),
      replayed: false,
    })
  );
});

beforeAll(async () => {
  app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    req.user = {
      id: '1',
      sub: '1',
      email: 'partner@example.com',
      role: 'partner',
      roles: ['partner'],
      fundIds: [1],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    next();
  });

  // Mount funds router for POST /api/funds (creates funds in storage mock)
  const fundRoutes = await import('../../../server/routes/funds');
  app.use('/api', fundRoutes.default);

  // Mount fund-config routes (PUT/GET /api/funds/:id/draft uses db mock)
  const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
  registerFundConfigRoutes(app);
});

describe('PUT /api/funds/:id/draft validation', () => {
  it('rejects unknown keys in draft payload', async () => {
    // Use a hardcoded fund ID (db mock returns data for any ID via findFirst)
    const putRes = await request(app)
      .put('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send({ fundName: 'Test', bogusField: true });

    expect(putRes.status).toBe(400);
    expect(putRes.body).toHaveProperty('code', 'DRAFT_VALIDATION_ERROR');
    expect(putRes.body).toHaveProperty('issues');
    expect(putRes.body.issues.length).toBeGreaterThan(0);
  });

  it('rejects missing fundName', async () => {
    const putRes = await request(app)
      .put('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send({ fundSize: 50_000_000 });

    expect(putRes.status).toBe(400);
    expect(putRes.body).toHaveProperty('code', 'DRAFT_VALIDATION_ERROR');
  });

  it('accepts valid full draft payload', async () => {
    const putRes = await request(app)
      .put('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send(validDraftPayload);

    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/api/funds/1/draft');
    expect(getRes.status).toBe(200);
    expect(getRes.body.config?.targetMetrics).toMatchObject(validDraftPayload.targetMetrics!);
  });

  it('accepts minimal draft payload (fundName only)', async () => {
    const putRes = await request(app)
      .put('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send(minimalDraftPayload);

    expect(putRes.status).toBe(200);
  });

  it('preserves cashless GP commitment percentage through save and load', async () => {
    const putRes = await request(app)
      .put('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send({
        fundName: 'Cashless GP Fund',
        gpCommitment: 2_000_000,
        fundedFromFeesPct: 0.4,
      });

    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/api/funds/1/draft');
    expect(getRes.status).toBe(200);
    expect(getRes.body.config?.fundedFromFeesPct).toBe(0.4);
  });

  it('rejects duplicate IDs in stage arrays', async () => {
    const putRes = await request(app)
      .put('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send({
        fundName: 'Test',
        stages: [
          { id: 'dup', name: 'Seed', graduate: 30, exit: 10, months: 18 },
          { id: 'dup', name: 'Series A', graduate: 50, exit: 20, months: 24 },
        ],
      });

    expect(putRes.status).toBe(400);
    expect(putRes.body).toHaveProperty('code', 'DRAFT_VALIDATION_ERROR');
  });

  it('rejects nonpositive period values', async () => {
    const putRes = await request(app)
      .put('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send({
        fundName: 'Invalid Period Fund',
        fundLife: 0,
        investmentPeriod: 0,
      });

    expect(putRes.status).toBe(400);
    expect(putRes.body).toHaveProperty('code', 'DRAFT_VALIDATION_ERROR');
  });

  it('returns 400 for invalid fund ID', async () => {
    const putRes = await request(app).put('/api/funds/abc/draft').send(minimalDraftPayload);

    expect(putRes.status).toBe(400);
    expect(putRes.body).toHaveProperty('error', 'Invalid fund ID');
  });
});
