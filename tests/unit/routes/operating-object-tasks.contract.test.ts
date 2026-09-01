import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { rowVersionETag } from '../../../server/lib/http-preconditions';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
  enforceTeamWriteRole: vi.fn((_req: Request, _res: Response) => true),
}));

const evidenceService = vi.hoisted(() => ({
  createTaskEvidenceLink: vi.fn(),
}));

const dbState = vi.hoisted(() => {
  const state = {
    insertResult: [] as unknown[],
    selectResult: [] as unknown[], // list path (.orderBy)
    loadQueue: [] as unknown[][], // each .limit(1) shifts one array (loadTask)
    updateResult: [] as unknown[], // .returning({ id })
    insertedValues: undefined as unknown,
    updatedValues: undefined as unknown,
  };
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((payload: unknown) => {
        state.insertedValues = payload;
        return {
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve(state.insertResult)),
          })),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((payload: unknown) => {
        state.updatedValues = payload;
        return {
          where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve(state.updateResult)) })),
        };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve(state.selectResult)),
          limit: vi.fn(() =>
            Promise.resolve(state.loadQueue.length > 0 ? state.loadQueue.shift() : [])
          ),
        })),
      })),
    })),
  };
  return { db, state };
});

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
  enforceTeamWriteRole: fundScopeState.enforceTeamWriteRole,
}));

vi.mock('../../../server/db', () => ({ db: dbState.db }));

vi.mock('../../../server/services/operating-objects/task-evidence-link-service', () => {
  class MockTaskEvidenceLinkServiceError extends Error {
    readonly status: number;
    constructor(
      readonly statusCode: number,
      readonly code: string,
      message: string
    ) {
      super(message);
      this.status = statusCode;
    }
  }
  return {
    TaskEvidenceLinkServiceError: MockTaskEvidenceLinkServiceError,
    createTaskEvidenceLink: evidenceService.createTaskEvidenceLink,
  };
});

import tasksRouter from '../../../server/routes/operating-object-tasks';
import { IdempotentCommandError } from '../../../server/lib/idempotent-command';
import { TaskEvidenceLinkServiceError } from '../../../server/services/operating-objects/task-evidence-link-service';
import { clearIdempotencyCache, idempotency } from '../../../server/middleware/idempotency';
import { TASK_CONTRACT_VERSION } from '../../../shared/contracts/operating-objects/task.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';

function makeApp(options: { railwayMiddleware?: boolean } = {}) {
  const app = express();
  app.use(express.json());
  if (options.railwayMiddleware) {
    // Railway surface: the generic in-memory idempotency middleware runs before
    // the router; the classifier must bypass it for task creation.
    app.use(idempotency());
  }
  app.use(tasksRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

// Mirrors the service preimage -- actor (createdBy) and status excluded.
const taskCreateHash = (fundId: number, title: string) =>
  canonicalSha256({
    commandKind: 'create_task',
    contractVersion: TASK_CONTRACT_VERSION,
    fundId,
    title,
  });

function denyOnce() {
  fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
    res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
    return false;
  });
}

function validBody(fundId = 1) {
  return { fundId, title: 'Follow up with LP' };
}

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    fundId: 1,
    title: 'Follow up with LP',
    status: 'open',
    ownerId: null,
    dueDate: null,
    description: null,
    createdBy: null,
    idempotencyKey: 'task-key-1',
    requestHash: taskCreateHash(1, 'Follow up with LP'),
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
    updatedAt: new Date('2026-06-16T00:00:00.000Z'),
    rowXmin: '1',
    ...overrides,
  };
}

describe('operating-object tasks route contracts', () => {
  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    fundScopeState.enforceTeamWriteRole.mockReset();
    fundScopeState.enforceTeamWriteRole.mockReturnValue(true);
    dbState.db.insert.mockClear();
    dbState.db.update.mockClear();
    dbState.db.select.mockClear();
    dbState.state.insertResult = [];
    dbState.state.selectResult = [];
    dbState.state.loadQueue = [];
    dbState.state.updateResult = [];
    dbState.state.insertedValues = undefined;
    dbState.state.updatedValues = undefined;
  });

  it('POST rejects a non-canonical fundId before the scope check and any DB write', async () => {
    const res = await request(makeApp()).post('/api/funds/01/tasks').send(validBody(1));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid fund ID' });
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST denies a cross-fund scope before any DB write', async () => {
    denyOnce();
    const res = await request(makeApp()).post('/api/funds/2/tasks').send(validBody(2));
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceProvidedFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2,
      { forWrite: true }
    );
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST denies non-team-write principals before any DB write', async () => {
    fundScopeState.enforceTeamWriteRole.mockImplementationOnce((_req, res) => {
      res.status(403).json({ error: 'Forbidden', code: 'TEAM_WRITE_REQUIRED' });
      return false;
    });
    const res = await request(makeApp())
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'task-key-role')
      .send(validBody(1));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TEAM_WRITE_REQUIRED');
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST creates a task and returns 201 with an etag and no created_by leak', async () => {
    dbState.state.insertResult = [dbRow()];
    const res = await request(makeApp())
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'task-key-1')
      .send(validBody(1));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 10,
      fundId: 1,
      title: 'Follow up with LP',
      status: 'open',
    });
    expect(typeof res.body.etag).toBe('string');
    expect(res.body.etag.length).toBeGreaterThan(0);
    expect(res.body).not.toHaveProperty('createdBy');
    expect(res.body).not.toHaveProperty('created_by');
    expect(res.body).not.toHaveProperty('idempotencyKey');
    expect(res.body).not.toHaveProperty('requestHash');
    expect(dbState.db.insert).toHaveBeenCalledTimes(1);
  });

  it('POST stores status open, the parsed fundId, and the trimmed Idempotency-Key on insert', async () => {
    dbState.state.insertResult = [dbRow()];
    await request(makeApp())
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', ' task-key-1 ')
      .send(validBody(1));
    expect(dbState.state.insertedValues).toMatchObject({
      status: 'open',
      fundId: 1,
      idempotencyKey: 'task-key-1',
      requestHash: taskCreateHash(1, 'Follow up with LP'),
    });
  });

  it('POST requires Idempotency-Key (428) BEFORE body validation', async () => {
    // Invalid body + missing key must still 428, proving order.
    const res = await request(makeApp()).post('/api/funds/1/tasks').send({ fundId: 1 });
    expect(res.status).toBe(428);
    expect(res.body).toMatchObject({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST rejects a malformed Idempotency-Key (400)', async () => {
    const res = await request(makeApp())
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'bad key')
      .send(validBody(1));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'INVALID_IDEMPOTENCY_KEY' });
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST replays an identical request as 200 with the stored row', async () => {
    dbState.state.insertResult = []; // conflict -> DO NOTHING -> reload
    dbState.state.loadQueue = [[dbRow()]];
    const res = await request(makeApp())
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'task-key-1')
      .send(validBody(1));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 10, fundId: 1, title: 'Follow up with LP' });
    expect(typeof res.body.etag).toBe('string');
  });

  it('POST maps key reuse with a different payload to 409 IDEMPOTENCY_KEY_REUSE', async () => {
    dbState.state.insertResult = [];
    dbState.state.loadQueue = [[dbRow()]]; // stored hash is for 'Follow up with LP'
    const res = await request(makeApp())
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'task-key-1')
      .send({ fundId: 1, title: 'A different task' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'IDEMPOTENCY_KEY_REUSE' });
  });

  it('POST rejects a body fundId that does not match the path fundId', async () => {
    const res = await request(makeApp())
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'task-key-1')
      .send(validBody(2));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'fundId mismatch' });
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST rejects a whitespace-only title', async () => {
    const res = await request(makeApp())
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'task-key-1')
      .send({ fundId: 1, title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid request body' });
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST rejects unknown body keys (.strict)', async () => {
    const res = await request(makeApp())
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'task-key-1')
      .send({ ...validBody(1), status: 'done' });
    expect(res.status).toBe(400);
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('GET lists tasks newest-first (pass-through of the indexed DESC query)', async () => {
    dbState.state.selectResult = [dbRow({ id: 20 }), dbRow({ id: 11 })];
    const res = await request(makeApp()).get('/api/funds/1/tasks');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe(20);
    expect(res.body.data[1].id).toBe(11);
    expect(typeof res.body.data[0].etag).toBe('string');
    expect(dbState.db.select).toHaveBeenCalledTimes(1);
  });

  it('GET denies a cross-fund scope before any DB read', async () => {
    denyOnce();
    const res = await request(makeApp()).get('/api/funds/2/tasks');
    expect(res.status).toBe(403);
    expect(dbState.db.select).not.toHaveBeenCalled();
  });
});

describe('operating-object tasks PATCH route', () => {
  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    fundScopeState.enforceTeamWriteRole.mockReset();
    fundScopeState.enforceTeamWriteRole.mockReturnValue(true);
    dbState.db.insert.mockClear();
    dbState.db.update.mockClear();
    dbState.db.select.mockClear();
    dbState.state.insertResult = [];
    dbState.state.selectResult = [];
    dbState.state.loadQueue = [];
    dbState.state.updateResult = [];
    dbState.state.insertedValues = undefined;
    dbState.state.updatedValues = undefined;
  });

  const etagFor = (xmin: string) => rowVersionETag(xmin);

  it('rejects a non-canonical fundId before scope/If-Match/DB', async () => {
    const res = await request(makeApp())
      .patch('/api/funds/01/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid fund ID' });
    expect(fundScopeState.enforceProvidedFundScope).not.toHaveBeenCalled();
    expect(dbState.db.select).not.toHaveBeenCalled();
    expect(dbState.db.update).not.toHaveBeenCalled();
  });

  it('rejects a non-canonical taskId', async () => {
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/01')
      .set('If-Match', etagFor('1'))
      .send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid task ID' });
    expect(dbState.db.update).not.toHaveBeenCalled();
  });

  it('denies a cross-fund scope before If-Match and any DB access', async () => {
    denyOnce();
    const res = await request(makeApp())
      .patch('/api/funds/2/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(dbState.db.select).not.toHaveBeenCalled();
    expect(dbState.db.update).not.toHaveBeenCalled();
  });

  it('requires If-Match (428) BEFORE body validation', async () => {
    // Invalid body (empty) + missing If-Match must still 428, proving order.
    const res = await request(makeApp()).patch('/api/funds/1/tasks/10').send({});
    expect(res.status).toBe(428);
    expect(res.body).toMatchObject({ error: 'precondition_required' });
    expect(dbState.db.select).not.toHaveBeenCalled();
  });

  it('rejects an empty patch (400) when If-Match is present', async () => {
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid request body' });
    expect(dbState.db.select).not.toHaveBeenCalled();
  });

  it('rejects a fundId-only patch (400, no DB read)', async () => {
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ fundId: 1 });
    expect(res.status).toBe(400);
    expect(dbState.db.select).not.toHaveBeenCalled();
  });

  it('rejects unknown body keys (.strict)', async () => {
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ title: 'x', bogus: 1 });
    expect(res.status).toBe(400);
    expect(dbState.db.select).not.toHaveBeenCalled();
  });

  it('rejects a body fundId that does not match the path (400, no DB read)', async () => {
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ fundId: 2, title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'fundId mismatch' });
    expect(dbState.db.select).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not exist', async () => {
    dbState.state.loadQueue = [[]];
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ title: 'x' });
    expect(res.status).toBe(404);
    expect(dbState.db.update).not.toHaveBeenCalled();
  });

  it('returns 412 on a stale If-Match', async () => {
    dbState.state.loadQueue = [[dbRow({ rowXmin: '1' })]];
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('2'))
      .send({ title: 'x' });
    expect(res.status).toBe(412);
    expect(res.body).toMatchObject({ error: 'precondition_failed', current: etagFor('1') });
    expect(dbState.db.update).not.toHaveBeenCalled();
  });

  it('edits a field and rotates the etag (200)', async () => {
    dbState.state.loadQueue = [
      [dbRow({ rowXmin: '1' })],
      [dbRow({ rowXmin: '2', title: 'Updated' })],
    ];
    dbState.state.updateResult = [{ id: 10 }];
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ title: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
    expect(res.body.etag).toBe(etagFor('2'));
    expect(res.body.etag).not.toBe(etagFor('1'));
    expect(dbState.state.updatedValues).toMatchObject({ title: 'Updated' });
    expect(dbState.db.update).toHaveBeenCalledTimes(1);
  });

  it('allows a free status transition open -> done', async () => {
    dbState.state.loadQueue = [
      [dbRow({ rowXmin: '1', status: 'open' })],
      [dbRow({ rowXmin: '2', status: 'done' })],
    ];
    dbState.state.updateResult = [{ id: 10 }];
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(dbState.state.updatedValues).toMatchObject({ status: 'done' });
  });

  it('allows reopen done -> open (no terminal state, no 409)', async () => {
    dbState.state.loadQueue = [
      [dbRow({ rowXmin: '1', status: 'done' })],
      [dbRow({ rowXmin: '2', status: 'open' })],
    ];
    dbState.state.updateResult = [{ id: 10 }];
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ status: 'open' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
  });

  it('clears a nullable field via explicit null', async () => {
    dbState.state.loadQueue = [
      [dbRow({ rowXmin: '1', ownerId: 42 })],
      [dbRow({ rowXmin: '2', ownerId: null })],
    ];
    dbState.state.updateResult = [{ id: 10 }];
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ ownerId: null });
    expect(res.status).toBe(200);
    expect(res.body.ownerId).toBeNull();
    expect(dbState.state.updatedValues).toMatchObject({ ownerId: null });
  });

  it('returns 412 when the atomic update touches zero rows but the row still exists', async () => {
    dbState.state.loadQueue = [[dbRow({ rowXmin: '1' })], [dbRow({ rowXmin: '9' })]];
    dbState.state.updateResult = [];
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ title: 'x' });
    expect(res.status).toBe(412);
    expect(res.body).toMatchObject({ current: etagFor('9') });
  });

  it('returns 404 when the row vanishes between precondition and update', async () => {
    dbState.state.loadQueue = [[dbRow({ rowXmin: '1' })], []];
    dbState.state.updateResult = [];
    const res = await request(makeApp())
      .patch('/api/funds/1/tasks/10')
      .set('If-Match', etagFor('1'))
      .send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('operating-object task evidence POST route', () => {
  const publicLink = {
    contractVersion: 'task-evidence-link/1.0.0',
    linkId: 31,
    fundId: 1,
    taskId: 10,
    target: { kind: 'analysis_reference', id: 11 },
    createdAt: '2026-08-01T12:00:00.000Z',
  } as const;

  beforeEach(() => {
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    fundScopeState.enforceTeamWriteRole.mockReset();
    fundScopeState.enforceTeamWriteRole.mockReturnValue(true);
    evidenceService.createTaskEvidenceLink.mockReset();
    evidenceService.createTaskEvidenceLink.mockResolvedValue({
      evidenceLink: publicLink,
      replayed: false,
    });
  });

  it.each([
    ['/api/funds/01/tasks/10/evidence-links', 'Invalid fund ID'],
    ['/api/funds/1/tasks/01/evidence-links', 'Invalid task ID'],
  ])('rejects non-canonical path %s', async (path, error) => {
    const response = await request(makeApp())
      .post(path)
      .set('Idempotency-Key', 'evidence-1')
      .send({ target: { kind: 'analysis_reference', id: 11 } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(error);
    expect(evidenceService.createTaskEvidenceLink).not.toHaveBeenCalled();
  });

  it('returns 403 before target lookup when request-fund access is missing', async () => {
    denyOnce();
    const response = await request(makeApp())
      .post('/api/funds/2/tasks/10/evidence-links')
      .set('Idempotency-Key', 'evidence-1')
      .send({ target: { kind: 'analysis_reference', id: 11 } });

    expect(response.status).toBe(403);
    expect(evidenceService.createTaskEvidenceLink).not.toHaveBeenCalled();
  });

  it('requires and validates Idempotency-Key', async () => {
    const missing = await request(makeApp())
      .post('/api/funds/1/tasks/10/evidence-links')
      .send({ target: { kind: 'analysis_reference', id: 11 } });
    const malformed = await request(makeApp())
      .post('/api/funds/1/tasks/10/evidence-links')
      .set('Idempotency-Key', 'bad key')
      .send({ target: { kind: 'analysis_reference', id: 11 } });

    expect(missing.status).toBe(428);
    expect(missing.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it.each([
    {},
    { target: { kind: 'analysis_draft', id: 11 } },
    { target: { kind: 'analysis_reference', id: 0 } },
    { target: { kind: 'analysis_reference', id: 11 }, extra: true },
  ])('rejects invalid strict evidence body %#', async (body) => {
    const response = await request(makeApp())
      .post('/api/funds/1/tasks/10/evidence-links')
      .set('Idempotency-Key', 'evidence-1')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TASK_EVIDENCE_LINK_BODY');
    expect(evidenceService.createTaskEvidenceLink).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'analysis_reference', id: 11 }, 201],
    [{ kind: 'internal_economics_run', id: 12 }, 201],
  ] as const)('creates target $kind with strict response', async (target, status) => {
    evidenceService.createTaskEvidenceLink.mockResolvedValue({
      evidenceLink: { ...publicLink, target },
      replayed: false,
    });

    const response = await request(makeApp())
      .post('/api/funds/1/tasks/10/evidence-links')
      .set('Idempotency-Key', ' evidence-1 ')
      .send({ target });

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ ...publicLink, target });
    expect(response.headers['location']).toBeUndefined();
    expect(evidenceService.createTaskEvidenceLink).toHaveBeenCalledWith({
      fundId: 1,
      taskId: 10,
      target,
      actorId: null,
      idempotencyKey: 'evidence-1',
    });
  });

  it('returns 200 for identical replay', async () => {
    evidenceService.createTaskEvidenceLink.mockResolvedValue({
      evidenceLink: publicLink,
      replayed: true,
    });

    const response = await request(makeApp())
      .post('/api/funds/1/tasks/10/evidence-links')
      .set('Idempotency-Key', 'evidence-1')
      .send({ target: publicLink.target });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(publicLink);
  });

  it.each([
    [
      new TaskEvidenceLinkServiceError(404, 'EVIDENCE_TARGET_NOT_FOUND', 'Target not found.'),
      404,
      'EVIDENCE_TARGET_NOT_FOUND',
    ],
    [
      new IdempotentCommandError(409, 'IDEMPOTENCY_KEY_REUSE', 'Key conflict.'),
      409,
      'IDEMPOTENCY_KEY_REUSE',
    ],
  ] as const)('maps typed service failures', async (error, status, code) => {
    evidenceService.createTaskEvidenceLink.mockRejectedValue(error);

    const response = await request(makeApp())
      .post('/api/funds/1/tasks/10/evidence-links')
      .set('Idempotency-Key', 'evidence-1')
      .send({ target: publicLink.target });

    expect(response.status).toBe(status);
    expect(response.body.error).toBe(code);
  });
});

describe('task-create dual-surface idempotency parity (Vercel direct vs Railway middleware)', () => {
  beforeEach(() => {
    clearIdempotencyCache();
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    fundScopeState.enforceTeamWriteRole.mockReset();
    fundScopeState.enforceTeamWriteRole.mockReturnValue(true);
    dbState.db.insert.mockClear();
    dbState.state.insertResult = [];
    dbState.state.loadQueue = [];
  });

  async function runSequence(app: ReturnType<typeof makeApp>) {
    // 1st: fresh create (insert wins).
    dbState.state.insertResult = [dbRow()];
    dbState.state.loadQueue = [];
    const created = await request(app)
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'task-key-1')
      .send(validBody(1));

    // 2nd: identical replay (insert conflicts, stored hash matches).
    dbState.state.insertResult = [];
    dbState.state.loadQueue = [[dbRow()]];
    const replayed = await request(app)
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'task-key-1')
      .send(validBody(1));

    // 3rd: same key, different payload (stored hash differs).
    dbState.state.insertResult = [];
    dbState.state.loadQueue = [[dbRow()]];
    const conflicted = await request(app)
      .post('/api/funds/1/tasks')
      .set('Idempotency-Key', 'task-key-1')
      .send({ fundId: 1, title: 'A different task' });

    return { created, replayed, conflicted };
  }

  it('produces the identical 201 / 200-replay / 409 outcome on both surfaces', async () => {
    const vercel = await runSequence(makeApp());
    clearIdempotencyCache();
    const railway = await runSequence(makeApp({ railwayMiddleware: true }));

    for (const surface of [vercel, railway]) {
      expect(surface.created.status).toBe(201);
      expect(surface.replayed.status).toBe(200);
      expect(surface.conflicted.status).toBe(409);
      expect(surface.conflicted.body).toMatchObject({ error: 'IDEMPOTENCY_KEY_REUSE' });
    }
    expect(railway.created.body).toEqual(vercel.created.body);
    expect(railway.replayed.body).toEqual(vercel.replayed.body);

    // The Railway chain must have BYPASSED the generic cache: a cached 201
    // replay would carry Idempotency-Replay and mask the database 200/409.
    expect(railway.created.headers['idempotency-replay']).toBeUndefined();
    expect(railway.replayed.headers['idempotency-replay']).toBeUndefined();
    expect(railway.conflicted.headers['idempotency-replay']).toBeUndefined();
  });
});
