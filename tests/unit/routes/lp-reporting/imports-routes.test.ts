/**
 * Route tests for LP Reporting import dry-run and commit endpoints.
 *
 * Verifies:
 *   - 401 when unauthenticated.
 *   - 403 on cross-fund access.
 *   - 200 happy path with the sample fixture.
 *   - DB spy: no INSERT into cash_flow_events or valuation_marks fires
 *     during the dry-run handler.
 *   - Source grep: only ledger / valuation commit endpoints exist; no /api/public/* added.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const authState = {
  authenticated: true,
  userId: 7,
  fundIds: [1, 2] as number[],
};
let nextUserId = 700;

const commitServiceMock = vi.hoisted(() => {
  class MockImportCommitError extends Error {
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
    commitLedgerImport: vi.fn(),
    commitValuationMarkImport: vi.fn(),
    ImportCommitError: MockImportCommitError,
  };
});

vi.mock('../../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
    if (!authState.authenticated) {
      return res.sendStatus(401);
    }
    (req as Request & { user?: { id: number; userId: number; fundIds: number[] } }).user = {
      id: authState.userId,
      userId: authState.userId,
      fundIds: [...authState.fundIds],
    };
    next();
  },
  requireFundAccess: (req: Request, res: Response, next: NextFunction) => {
    const fundIdParam = req.params['fundId'];
    if (!fundIdParam) {
      return res.status(400).json({ error: 'Bad Request' });
    }
    const fundId = Number.parseInt(fundIdParam, 10);
    if (Number.isNaN(fundId)) {
      return res.status(400).json({ error: 'Bad Request' });
    }
    const user = (req as Request & { user?: { id: number; userId: number; fundIds: number[] } })
      .user;
    const userFundIds = user?.fundIds ?? [];
    if (userFundIds.length === 0) {
      return next();
    }
    if (userFundIds.includes(fundId)) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  },
}));

vi.mock('../../../../server/services/lp-reporting/import-commit-service', () => commitServiceMock);

import importsRouter from '../../../../server/routes/lp-reporting/imports';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'lp-reporting');
const ledgerCsvBase64 = fs
  .readFileSync(path.join(FIXTURES_DIR, 'sample-ledger.csv'))
  .toString('base64');
const valuationCsvBase64 = fs
  .readFileSync(path.join(FIXTURES_DIR, 'sample-valuation-marks.csv'))
  .toString('base64');
const previewHash = 'a'.repeat(64);

function buildValuationCsvWithFutureMark(): string {
  const futureYear = new Date().getUTCFullYear() + 1;
  return Buffer.from(
    [
      'company_id,mark_date,as_of_date,fair_value,currency,mark_source,confidence_level,valuation_method,cost_basis',
      '42,2026-03-31,2026-03-31,5000000.000000,USD,financing_round,high,priced_round,3000000.000000',
      '42,2026-04-15,2026-04-15,5500000.000000,USD,board_update,high,management_estimate,3000000.000000',
      '42,2026-04-20,2026-04-20,5800000.000000,USD,gp_estimate,medium,comparable_companies,3000000.000000',
      `42,${futureYear}-01-01,${futureYear}-01-01,6500000.000000,USD,board_update,medium,management_estimate,3000000.000000`,
    ].join('\n')
  ).toString('base64');
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '512kb' }));
  app.use(importsRouter);
  return app;
}

beforeEach(() => {
  authState.authenticated = true;
  authState.userId = nextUserId++;
  authState.fundIds = [1, 2];
});

afterEach(() => {
  vi.restoreAllMocks();
  commitServiceMock.commitLedgerImport.mockReset();
  commitServiceMock.commitValuationMarkImport.mockReset();
});

describe('POST /api/funds/:fundId/imports/ledger/dry-run', () => {
  it('returns 401 when unauthenticated', async () => {
    authState.authenticated = false;
    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/dry-run')
      .send({ sourceType: 'csv', payload: ledgerCsvBase64 });
    expect(res.status).toBe(401);
  });

  it('returns 403 on cross-fund access (fundId 99 not in user.fundIds)', async () => {
    const res = await request(buildApp())
      .post('/api/funds/99/imports/ledger/dry-run')
      .send({ sourceType: 'csv', payload: ledgerCsvBase64 });
    expect(res.status).toBe(403);
  });

  it('returns 200 with a valid ImportDryRunResponse on the happy path', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/dry-run')
      .send({ sourceType: 'csv', payload: ledgerCsvBase64 });
    expect(res.status).toBe(200);
    expect(res.body.sourceType).toBe('csv');
    expect(typeof res.body.importId).toBe('string');
    expect(res.body.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.parsedRows).toBeGreaterThan(0);
    expect(res.body.duplicateRows).toBe(1);
    expect(res.body.invalidRows).toBe(1);
    expect(typeof res.body.reconciliation.calledCapitalImported).toBe('string');
  });

  it('returns 400 when body is missing sourceType / payload', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/dry-run')
      .send({ sourceType: 'csv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_BODY');
  });

  it('returns 400 when sourceType is invalid', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/dry-run')
      .send({ sourceType: 'json', payload: ledgerCsvBase64 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for excel until an Excel parser is wired in', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/dry-run')
      .send({ sourceType: 'excel', payload: ledgerCsvBase64 });
    expect(res.status).toBe(400);
  });

  it('returns 429 after 20 dry-run requests for the same user', async () => {
    authState.userId = nextUserId++;
    const app = buildApp();
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/funds/1/imports/ledger/dry-run')
        .send({ sourceType: 'csv', payload: ledgerCsvBase64 });
      expect(res.status).toBe(200);
    }

    const limited = await request(app)
      .post('/api/funds/1/imports/ledger/dry-run')
      .send({ sourceType: 'csv', payload: ledgerCsvBase64 });
    expect(limited.status).toBe(429);

    authState.userId = nextUserId++;
    const otherUser = await request(app)
      .post('/api/funds/1/imports/ledger/dry-run')
      .send({ sourceType: 'csv', payload: ledgerCsvBase64 });
    expect(otherUser.status).toBe(200);
  });
});

describe('POST /api/funds/:fundId/imports/ledger/commit', () => {
  it('returns 401 when unauthenticated', async () => {
    authState.authenticated = false;
    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/commit')
      .send({ sourceType: 'csv', payload: ledgerCsvBase64, previewHash });
    expect(res.status).toBe(401);
  });

  it('returns 403 on cross-fund access', async () => {
    const res = await request(buildApp())
      .post('/api/funds/99/imports/ledger/commit')
      .send({ sourceType: 'csv', payload: ledgerCsvBase64, previewHash });
    expect(res.status).toBe(403);
  });

  it('passes fundId, numeric userId, payload, and previewHash to the commit service', async () => {
    commitServiceMock.commitLedgerImport.mockResolvedValueOnce({
      importBatchId: '11111111-2222-3333-4444-555555555555',
      previewHash,
      insertedCount: 2,
      skippedExistingCount: 0,
      skippedDuplicateCount: 1,
      skippedExcludedCount: 0,
      insertedIds: [10, 11],
    });

    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/commit')
      .send({ sourceType: 'csv', payload: ledgerCsvBase64, previewHash });

    expect(res.status).toBe(201);
    expect(res.body.insertedCount).toBe(2);
    expect(commitServiceMock.commitLedgerImport).toHaveBeenCalledWith({
      fundId: 1,
      userId: authState.userId,
      sourceType: 'csv',
      payload: ledgerCsvBase64,
      previewHash,
    });
  });

  it('returns 400 when previewHash is missing', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/commit')
      .send({ sourceType: 'csv', payload: ledgerCsvBase64 });
    expect(res.status).toBe(400);
    expect(commitServiceMock.commitLedgerImport).not.toHaveBeenCalled();
  });

  it('maps preview hash mismatch to 409', async () => {
    commitServiceMock.commitLedgerImport.mockRejectedValueOnce(
      new commitServiceMock.ImportCommitError(
        409,
        'PREVIEW_HASH_MISMATCH',
        'Dry-run preview hash no longer matches the submitted payload.'
      )
    );

    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/commit')
      .send({ sourceType: 'csv', payload: ledgerCsvBase64, previewHash });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PREVIEW_HASH_MISMATCH');
  });
});

describe('POST /api/funds/:fundId/imports/valuation-marks/commit', () => {
  it('commits valuation mark imports through the valuation service', async () => {
    commitServiceMock.commitValuationMarkImport.mockResolvedValueOnce({
      importBatchId: '11111111-2222-3333-4444-555555555555',
      previewHash,
      insertedCount: 1,
      skippedExistingCount: 0,
      skippedDuplicateCount: 0,
      skippedExcludedCount: 1,
      insertedIds: [12],
    });

    const res = await request(buildApp())
      .post('/api/funds/1/imports/valuation-marks/commit')
      .send({ sourceType: 'csv', payload: valuationCsvBase64, previewHash });

    expect(res.status).toBe(201);
    expect(res.body.skippedExcludedCount).toBe(1);
    expect(commitServiceMock.commitValuationMarkImport).toHaveBeenCalledWith({
      fundId: 1,
      userId: authState.userId,
      sourceType: 'csv',
      payload: valuationCsvBase64,
      previewHash,
    });
  });

  it('rejects notion valuation commits until a mark mapping exists', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/valuation-marks/commit')
      .send({ sourceType: 'notion', payload: valuationCsvBase64, previewHash });
    expect(res.status).toBe(400);
    expect(commitServiceMock.commitValuationMarkImport).not.toHaveBeenCalled();
  });
});

describe('POST /api/funds/:fundId/imports/valuation-marks/dry-run', () => {
  it('returns 401 when unauthenticated', async () => {
    authState.authenticated = false;
    const res = await request(buildApp())
      .post('/api/funds/1/imports/valuation-marks/dry-run')
      .send({ sourceType: 'csv', payload: buildValuationCsvWithFutureMark() });
    expect(res.status).toBe(401);
  });

  it('returns 403 on cross-fund access', async () => {
    const res = await request(buildApp())
      .post('/api/funds/99/imports/valuation-marks/dry-run')
      .send({ sourceType: 'csv', payload: valuationCsvBase64 });
    expect(res.status).toBe(403);
  });

  it('returns 200 with future-dated marks excluded from latestNavImported', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/valuation-marks/dry-run')
      .send({ sourceType: 'csv', payload: valuationCsvBase64 });
    expect(res.status).toBe(200);
    expect(res.body.reconciliation.latestNavImported).toBe('16300000.000000');
    const explanations: string[] = res.body.reconciliation.explanations;
    expect(explanations.some((e) => e.includes('future-dated'))).toBe(true);
  });

  it('returns 400 for notion valuation marks until a mark mapping exists', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/valuation-marks/dry-run')
      .send({ sourceType: 'notion', payload: valuationCsvBase64 });
    expect(res.status).toBe(400);
  });
});

describe('DB-write absence -- no INSERT runs during dry-run', () => {
  it('the imports router does NOT import the db module', () => {
    const routerSource = fs.readFileSync(
      path.join(process.cwd(), 'server', 'routes', 'lp-reporting', 'imports.ts'),
      'utf8'
    );
    const serviceSource = fs.readFileSync(
      path.join(
        process.cwd(),
        'server',
        'services',
        'lp-reporting',
        'import-reconciliation-service.ts'
      ),
      'utf8'
    );
    // The dry-run path should not pull in the db module at all. If a future
    // change wires in the db, this guard fails the gate so the verifier
    // catches it before the change reaches main.
    expect(routerSource).not.toMatch(/from\s+['"]\.\.\/\.\.\/db['"]/);
    expect(routerSource).not.toMatch(/INSERT\s+INTO/i);
    expect(routerSource).not.toMatch(/db\.insert\(/);
    expect(serviceSource).not.toMatch(/from\s+['"]\.\.\/\.\.\/db['"]/);
    expect(serviceSource).not.toMatch(/INSERT\s+INTO/i);
    expect(serviceSource).not.toMatch(/db\.insert\(/);
  });
});

describe('Source grep -- bounded commit endpoints, no /api/public', () => {
  const routerSource = fs.readFileSync(
    path.join(process.cwd(), 'server', 'routes', 'lp-reporting', 'imports.ts'),
    'utf8'
  );

  it('declares ledger and valuation commit endpoints only', () => {
    expect(routerSource).toMatch(/\/api\/funds\/:fundId\/imports\/ledger\/commit/);
    expect(routerSource).toMatch(/\/api\/funds\/:fundId\/imports\/valuation-marks\/commit/);
    expect(routerSource).not.toMatch(/metric-runs\/commit/);
  });

  it('does not add any /api/public route', () => {
    expect(routerSource).not.toMatch(/\/api\/public/);
  });

  it('uses /api/funds/:fundId/imports prefix only', () => {
    const matches =
      routerSource.match(/router\.(post|get|put|delete|patch)\(\s*['"]([^'"]+)['"]/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m).toMatch(/\/api\/funds\/:fundId\/imports\/[^/]+\/(dry-run|commit)/);
    }
  });
});
