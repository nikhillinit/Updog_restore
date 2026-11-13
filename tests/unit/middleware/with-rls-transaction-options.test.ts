import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const scope = { completed: false };
  return {
    scope,
    runWithDatabaseContext: vi.fn(),
  };
});

vi.mock('../../../server/db.js', () => ({
  db: {},
  pool: { connect: vi.fn() },
  runWithDatabaseContext: mocks.runWithDatabaseContext,
}));

vi.mock('../../../server/db/request-context.js', () => ({
  getRequestDatabaseScope: () => mocks.scope,
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: { child: () => ({ error: vi.fn() }) },
}));

import { withRLSTransaction } from '../../../server/middleware/with-rls-transaction.js';

describe('withRLSTransaction database context options', () => {
  beforeEach(() => {
    mocks.scope.completed = false;
    mocks.runWithDatabaseContext.mockReset();
    mocks.runWithDatabaseContext.mockImplementation(
      async (_context, callback: (database: object, client: object) => Promise<unknown>) =>
        callback({}, {})
    );
  });

  function appFor(method: 'get' | 'post', path: string) {
    const app = express();
    app[method](
      path,
      (req, _res, next) => {
        req.context = {
          userId: 'user-1',
          email: 'user-1@example.test',
          orgId: 'org-1',
          role: 'admin',
        };
        next();
      },
      withRLSTransaction(),
      (_req, res) => res.status(200).json({ ok: true })
    );
    return app;
  }

  it('passes disconnect cancellation without a deadline for ordinary requests', async () => {
    await request(appFor('get', '/ordinary')).get('/ordinary').expect(200, { ok: true });

    const options = mocks.runWithDatabaseContext.mock.calls[0]![2];
    expect(options).toEqual({ signal: expect.any(AbortSignal) });
    expect(options).not.toHaveProperty('timeoutMs');
  });

  it.each(['/api/funds/1/publish', '/api/funds/1/draft'])(
    'retains the workflow deadline with the disconnect cancellation signal for %s',
    async (path) => {
      await request(appFor('post', path)).post(path).expect(200, { ok: true });

      expect(mocks.runWithDatabaseContext.mock.calls[0]![2]).toEqual({
        timeoutMs: 60_000,
        signal: expect.any(AbortSignal),
      });
    }
  );
});
