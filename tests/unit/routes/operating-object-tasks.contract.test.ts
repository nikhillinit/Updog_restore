import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));

const dbState = vi.hoisted(() => {
  const state = {
    insertResult: [] as unknown[],
    selectResult: [] as unknown[],
    insertedValues: undefined as unknown,
  };
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((payload: unknown) => {
        state.insertedValues = payload;
        return { returning: vi.fn(() => Promise.resolve(state.insertResult)) };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve(state.selectResult)),
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
    dbState.db.select.mockClear();
    dbState.state.insertResult = [];
    dbState.state.selectResult = [];
    dbState.state.insertedValues = undefined;
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
