/*
 * Real-guard contract: requireAuth is mocked to inject req.user; requireFundAccess is the REAL guard. Deny = caller fundIds [1] targeting fund 2. The exact toBe(403) (not just not-200) ensures the :fundId reached the guard; a 400 would mean it did not.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = vi.hoisted(() => {
  const calls = { select: 0, insert: 0, update: 0, delete: 0 };

  function chain() {
    const p = new Proxy(function chainTarget() {}, {
      get(_target, prop: string | symbol) {
        if (prop === 'then') {
          return (resolve: (value: unknown[]) => void) => resolve([]);
        }
        return () => p;
      },
      apply() {
        return p;
      },
    });
    return p;
  }

  const db = {
    select: (..._args: unknown[]) => {
      calls.select += 1;
      return chain();
    },
    insert: (..._args: unknown[]) => {
      calls.insert += 1;
      return chain();
    },
    update: (..._args: unknown[]) => {
      calls.update += 1;
      return chain();
    },
    delete: (..._args: unknown[]) => {
      calls.delete += 1;
      return chain();
    },
  };

  return { db, calls };
});

const importServiceMock = vi.hoisted(() => ({
  runLedgerDryRun: vi.fn(),
  runValuationMarkDryRun: vi.fn(),
  commitLedgerImport: vi.fn(),
  commitValuationMarkImport: vi.fn(),
}));

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return {
    ...actual,
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
  };
});

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../server/db', () => ({ db: dbState.db }));

vi.mock('../../../server/services/lp-reporting/import-reconciliation-service', () => ({
  runLedgerDryRun: importServiceMock.runLedgerDryRun,
  runValuationMarkDryRun: importServiceMock.runValuationMarkDryRun,
}));

vi.mock('../../../server/services/lp-reporting/import-commit-service', () => {
  class ImportCommitError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.name = 'ImportCommitError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  return {
    commitLedgerImport: importServiceMock.commitLedgerImport,
    commitValuationMarkImport: importServiceMock.commitValuationMarkImport,
    ImportCommitError,
  };
});

import importsRouter from '../../../server/routes/lp-reporting/imports';

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(importsRouter);
  return app;
}

function resetDbCalls() {
  dbState.calls.select = 0;
  dbState.calls.insert = 0;
  dbState.calls.update = 0;
  dbState.calls.delete = 0;
}

describe('lp-reporting imports fund-scope guard contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbCalls();
  });

  it.each([
    '/api/funds/2/imports/ledger/dry-run',
    '/api/funds/2/imports/valuation-marks/dry-run',
    '/api/funds/2/imports/ledger/commit',
    '/api/funds/2/imports/valuation-marks/commit',
  ])('denies cross-fund POST %s before service or db work', async (path) => {
    const res = await request(makeApp()).post(path).send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: 'Forbidden',
        message: 'You do not have access to fund 2',
      })
    );
    expect(importServiceMock.runLedgerDryRun).not.toHaveBeenCalled();
    expect(importServiceMock.runValuationMarkDryRun).not.toHaveBeenCalled();
    expect(importServiceMock.commitLedgerImport).not.toHaveBeenCalled();
    expect(importServiceMock.commitValuationMarkImport).not.toHaveBeenCalled();
    expect(dbState.calls.select).toBe(0);
    expect(dbState.calls.insert).toBe(0);
    expect(dbState.calls.update).toBe(0);
  });

  it('allows same-fund import requests past the guard', async () => {
    const res = await request(makeApp()).post('/api/funds/1/imports/ledger/dry-run').send({});

    expect(res.status).not.toBe(403);
  });
});
