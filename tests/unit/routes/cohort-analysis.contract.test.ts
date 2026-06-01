/*
 * The adapter is safe ONLY because each route runs route-local requireAuth()
 * before the adapter. Without it, req.user is undefined and requireFundAccess
 * reads a missing fundIds as [] (admin-all), granting ANY fund - a fail-open.
 * Slice 3 body/query fund-scope helpers MUST NOT reuse requireFundAccess
 * without a preceding requireAuth() (they should call enforceProvidedFundScope
 * directly). This test injects req.user via the requireAuth mock, mirroring
 * production.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryChain = PromiseLike<unknown[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const dbState = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    insertValues: [] as unknown[],
    updateValues: [] as unknown[],
  };

  function next(): unknown[] {
    return state.selectResults.shift() ?? [];
  }

  function thenFor(result: unknown[]): QueryChain['then'] {
    return (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected);
  }

  function makeQuery(result: unknown[]): QueryChain {
    const query = {
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve(result)),
      then: thenFor(result),
    } as QueryChain;
    return query;
  }

  const db = {
    select: vi.fn(() => makeQuery(next())),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((payload: unknown) => {
        state.insertValues.push({ table, payload });
        return Promise.resolve();
      }),
    })),
    update: vi.fn((table: unknown) => {
      const result: unknown[] = [];
      const query = {
        set: vi.fn((payload: unknown) => {
          state.updateValues.push({ table, payload });
          return query;
        }),
        where: vi.fn(() => query),
        then: thenFor(result),
      };
      return query;
    }),
  };

  return { db, state };
});

vi.mock('../../../server/db', () => ({ db: dbState.db }));

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/lib/auth/jwt')>()),
  requireAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: 'u1',
      sub: 'u1',
      email: 'u@example.com',
      roles: ['user'],
      ip: '127.0.0.1',
      userAgent: 'vitest',
      fundIds: [1],
    };
    next();
  },
}));

vi.mock('@shared/core/cohorts/analysis/advanced-engine', () => ({ analyzeCohorts: vi.fn() }));

vi.mock('../../../server/lib/route-logger.js', () => ({
  createRouteLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { analyzeCohorts } from '@shared/core/cohorts/analysis/advanced-engine';
import cohortRouter from '../../../server/routes/cohort-analysis';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cohortRouter);
  return app;
}

const deniedEndpoints = [
  { method: 'post', path: '/analyze', source: 'body' },
  { method: 'get', path: '/unmapped', source: 'query' },
  { method: 'post', path: '/sector-mappings', source: 'body' },
  { method: 'get', path: '/definitions', source: 'query' },
  { method: 'post', path: '/definitions', source: 'body' },
  { method: 'post', path: '/seed', source: 'body' },
] as const;

describe('cohort-analysis fund-scope adapter contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.state.selectResults = [];
    dbState.state.insertValues = [];
    dbState.state.updateValues = [];
  });

  it.each(deniedEndpoints)(
    '$method $path denies cross-fund access before handler work',
    async ({ method, path, source }) => {
      const pendingRequest =
        method === 'post' ? request(makeApp()).post(path) : request(makeApp()).get(path);
      const response =
        source === 'body'
          ? await pendingRequest.send({ fundId: 2 })
          : await pendingRequest.query({ fundId: 2 });

      expect(response.status).toBe(403);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Forbidden',
          message: 'You do not have access to fund 2',
        })
      );
      expect(dbState.db.select).not.toHaveBeenCalled();
      expect(dbState.db.insert).not.toHaveBeenCalled();
      expect(dbState.db.update).not.toHaveBeenCalled();
      expect(analyzeCohorts).not.toHaveBeenCalled();
    }
  );

  it('passes the guard for one body endpoint and one query endpoint when fund scope matches', async () => {
    const bodyResponse = await request(makeApp()).post('/analyze').send({ fundId: 1 });
    const queryResponse = await request(makeApp()).get('/unmapped').query({ fundId: 1 });

    expect(bodyResponse.status).not.toBe(403);
    expect(queryResponse.status).not.toBe(403);
  });
});
