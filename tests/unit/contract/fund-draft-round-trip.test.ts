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
let lastWorkflowCommand: Record<string, unknown> | null = null;

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
  const published = {
    ...draft,
    id: 102,
    version: 2,
    isDraft: false,
    isPublished: true,
    publishedAt: new Date(),
  };
  databaseMock.setMockData('fundconfigs', [draft, published]);
  const workflow = await import('../../../server/services/fund-workflow-service');
  vi.spyOn(workflow, 'executeFundWorkflowCommand').mockImplementation(async (command, execute) => ({
    ...(lastWorkflowCommand = command as unknown as Record<string, unknown>),
    ...(await execute(command.source === 'published' ? published : draft)),
    replayed: false,
  }));
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

describe('same-fund published revision', () => {
  it('returns the latest published source as a raw draft response with a strong revision', async () => {
    const response = await request(app).get('/api/funds/1/revision-source');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 102, fundId: 1, version: 2 });
    expect(response.body.config).toEqual({ fundName: 'Initial draft' });
    expect(response.headers['fund-draft-revision']).toMatch(/^"[0-9a-f]{16}"$/);
  });

  it('does not expose revision-source database errors', async () => {
    const { databaseMock } = await import('../../helpers/database-mock');
    databaseMock.select.mockImplementationOnce(() => {
      throw new Error('SELECT secret_column FROM private_schema.internal_table');
    });

    const response = await request(app).get('/api/funds/1/revision-source');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Failed to load revision source',
      message: 'Revision source could not be loaded; retry the request',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret_column');
    expect(JSON.stringify(response.body)).not.toContain('private_schema');
  });

  it('starts a revision through the durable save_draft command with a published marker', async () => {
    const response = await request(app)
      .post('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send({ sourceConfigId: 102, sourceConfigVersion: 2 });

    expect(response.status).toBe(201);
    expect(lastWorkflowCommand).toMatchObject({
      operation: 'save_draft',
      source: 'published',
      targetFundId: 1,
      body: { sourceConfigId: 102, sourceConfigVersion: 2 },
    });
    expect(response.body.data.config).toEqual({ fundName: 'Initial draft' });
  });

  it('rejects malformed revision source bodies before dispatch', async () => {
    const response = await request(app)
      .post('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send({ sourceConfigId: 102, sourceConfigVersion: 2, config: {} });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('REVISION_SOURCE_VALIDATION_ERROR');
  });

  it.each([
    [412, 'PRECONDITION_FAILED', 'A newer published configuration is available'],
    [409, 'ACTIVE_DRAFT_EXISTS', 'An active draft already exists for this fund'],
    [409, 'IDEMPOTENCY_KEY_REUSE', 'This key belongs to a different command'],
  ] as const)(
    'returns %s workflow conflicts without creating another draft',
    async (status, code, message) => {
      const workflow = await import('../../../server/services/fund-workflow-service');
      vi.mocked(workflow.executeFundWorkflowCommand).mockRejectedValueOnce(
        new workflow.FundWorkflowError(
          status,
          code,
          message,
          status === 412 ? '"fedcba9876543210"' : undefined
        )
      );

      const response = await request(app)
        .post('/api/funds/1/draft')
        .set('Idempotency-Key', randomUUID())
        .set('If-Match', '"0123456789abcdef"')
        .send({ sourceConfigId: 102, sourceConfigVersion: 2 });

      expect(response.status).toBe(status);
      expect(response.body.code).toBe(code);
    }
  );

  it('marks same-key retry responses as idempotent replays', async () => {
    const workflow = await import('../../../server/services/fund-workflow-service');
    vi.mocked(workflow.executeFundWorkflowCommand).mockResolvedValueOnce({
      status: 201,
      body: { success: true, data: { id: 102, fundId: 1, version: 2, config: validDraftPayload } },
      etag: '"fedcba9876543210"',
      fundId: 1,
      configId: 102,
      replayed: true,
    });

    const response = await request(app)
      .post('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send({ sourceConfigId: 102, sourceConfigVersion: 2 });

    expect(response.status).toBe(201);
    expect(response.headers['idempotency-replay']).toBe('true');
  });

  it('requires an authenticated write principal', async () => {
    const unauthenticated = express();
    unauthenticated.use(express.json());
    const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
    registerFundConfigRoutes(unauthenticated);

    const response = await request(unauthenticated)
      .post('/api/funds/1/draft')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', '"0123456789abcdef"')
      .send({ sourceConfigId: 102, sourceConfigVersion: 2 });

    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(response.status).toBeLessThanOrEqual(403);
  });
});
