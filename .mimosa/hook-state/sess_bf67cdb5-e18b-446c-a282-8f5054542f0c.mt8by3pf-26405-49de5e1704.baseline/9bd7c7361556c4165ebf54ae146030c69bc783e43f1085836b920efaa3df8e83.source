import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Route-layer H9 invalidation wiring: the reconciliation and import-commit
// handlers must call the seam AFTER a real mutation (non-replayed run /
// insertedCount > 0). Services are fully mocked so only the route wiring is
// under test. Mirrors the existing per-router behavior harnesses.

const { invalidateH9Artifacts } = vi.hoisted(() => ({
  invalidateH9Artifacts: vi.fn(async () => undefined),
}));
const authState = vi.hoisted(() => ({
  user: null as null | { id: number; userId: number; role: string; fundIds: number[] },
}));
const reconMock = vi.hoisted(() => ({ recordMoicReconciliation: vi.fn() }));
const commitMock = vi.hoisted(() => ({
  commitLedgerImport: vi.fn(),
  commitValuationMarkImport: vi.fn(),
}));

vi.mock('../../../server/services/h9-artifact-invalidation-service', () => ({
  invalidateH9Artifacts,
}));

vi.mock('../../../server/services/fund-moic-reconciliation-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-moic-reconciliation-service')>();
  return { ...actual, recordMoicReconciliation: reconMock.recordMoicReconciliation };
});

vi.mock('../../../server/services/lp-reporting/import-commit-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/lp-reporting/import-commit-service')>();
  return {
    ...actual,
    commitLedgerImport: commitMock.commitLedgerImport,
    commitValuationMarkImport: commitMock.commitValuationMarkImport,
  };
});

// Partial-mock auth: inject identity (keep requireFundAccess + requireRole real).
vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return {
    ...actual,
    requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
      if (!authState.user) return res.sendStatus(401);
      (req as Request & { user: unknown }).user = { ...authState.user };
      next();
    },
  };
});

import fundMoicRouter from '../../../server/routes/fund-moic';
import importsRouter from '../../../server/routes/lp-reporting/imports';

const ADMIN = { id: 101, userId: 101, role: 'admin', fundIds: [1] };
const previewHash = 'a'.repeat(64);
const BATCH_ID = '00000000-0000-4000-8000-000000000000';

function commitResponse(insertedCount: number) {
  return {
    importBatchId: BATCH_ID,
    previewHash,
    insertedCount,
    skippedExistingCount: 0,
    skippedDuplicateCount: 0,
    skippedExcludedCount: 0,
    insertedIds: insertedCount > 0 ? [10] : [],
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', fundMoicRouter);
  app.use(importsRouter);
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) =>
    res.status(500).json({ error: 'internal_error' })
  );
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { ...ADMIN };
});

describe('reconciliation route -> H9 invalidation wiring', () => {
  it('invalidates after a new (non-replayed) reconciliation run', async () => {
    reconMock.recordMoicReconciliation.mockResolvedValue({
      run: { runId: '1', createdAt: '2026-06-25T00:00:00.000Z' },
      replayed: false,
    });

    const res = await request(buildApp())
      .post('/api/admin/funds/1/moic/reconciliations')
      .set('Idempotency-Key', 'idem-recon-1')
      .send({});

    expect(res.status).toBe(201);
    expect(invalidateH9Artifacts).toHaveBeenCalledWith(1);
  });

  it('does NOT invalidate on a replayed reconciliation', async () => {
    reconMock.recordMoicReconciliation.mockResolvedValue({
      run: { runId: '1', createdAt: '2026-06-25T00:00:00.000Z' },
      replayed: true,
    });

    const res = await request(buildApp())
      .post('/api/admin/funds/1/moic/reconciliations')
      .set('Idempotency-Key', 'idem-recon-1')
      .send({});

    expect(res.status).toBe(200);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });
});

describe('ledger commit route -> H9 invalidation wiring', () => {
  it('invalidates when rows are inserted (insertedCount > 0)', async () => {
    commitMock.commitLedgerImport.mockResolvedValue(commitResponse(1));

    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/commit')
      .send({ sourceType: 'csv', payload: 'cGF5bG9hZA==', previewHash });

    expect(res.status).toBe(201);
    expect(invalidateH9Artifacts).toHaveBeenCalledWith(1);
  });

  it('does NOT invalidate when nothing was inserted (insertedCount 0)', async () => {
    commitMock.commitLedgerImport.mockResolvedValue(commitResponse(0));

    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/commit')
      .send({ sourceType: 'csv', payload: 'cGF5bG9hZA==', previewHash });

    expect(res.status).toBe(200);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });
});

describe('valuation-mark commit route -> H9 invalidation wiring', () => {
  it('invalidates when valuation marks are inserted (insertedCount > 0)', async () => {
    commitMock.commitValuationMarkImport.mockResolvedValue(commitResponse(1));

    const res = await request(buildApp())
      .post('/api/funds/1/imports/valuation-marks/commit')
      .send({ sourceType: 'csv', payload: 'cGF5bG9hZA==', previewHash });

    expect(res.status).toBe(201);
    expect(invalidateH9Artifacts).toHaveBeenCalledWith(1);
  });
});
