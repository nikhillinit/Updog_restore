import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { rowVersionETag } from '../../../server/lib/http-preconditions';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
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
        return { returning: vi.fn(() => Promise.resolve(state.insertResult)) };
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
}));

vi.mock('../../../server/db', () => ({ db: dbState.db }));

import tasksRouter from '../../../server/routes/operating-object-tasks';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(tasksRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

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
      2
    );
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST creates a task and returns 201 with an etag and no created_by leak', async () => {
    dbState.state.insertResult = [dbRow()];
    const res = await request(makeApp()).post('/api/funds/1/tasks').send(validBody(1));
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
    expect(dbState.db.insert).toHaveBeenCalledTimes(1);
  });

  it('POST stores status open and the parsed fundId on insert', async () => {
    dbState.state.insertResult = [dbRow()];
    await request(makeApp()).post('/api/funds/1/tasks').send(validBody(1));
    expect(dbState.state.insertedValues).toMatchObject({ status: 'open', fundId: 1 });
  });

  it('POST rejects a body fundId that does not match the path fundId', async () => {
    const res = await request(makeApp()).post('/api/funds/1/tasks').send(validBody(2));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'fundId mismatch' });
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST rejects a whitespace-only title', async () => {
    const res = await request(makeApp())
      .post('/api/funds/1/tasks')
      .send({ fundId: 1, title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid request body' });
    expect(dbState.db.insert).not.toHaveBeenCalled();
  });

  it('POST rejects unknown body keys (.strict)', async () => {
    const res = await request(makeApp())
      .post('/api/funds/1/tasks')
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
