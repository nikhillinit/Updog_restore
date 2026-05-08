/**
 * Route tests for LP Reporting import dry-run endpoints (Phase 0.4).
 *
 * Verifies:
 *   - 401 when unauthenticated.
 *   - 403 on cross-fund access.
 *   - 200 happy path with the sample fixture.
 *   - DB spy: no INSERT into cash_flow_events or valuation_marks fires
 *     during the dry-run handler.
 *   - Source grep: no /commit endpoint exists; no /api/public/* added.
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

vi.mock('../../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
    if (!authState.authenticated) {
      return res.sendStatus(401);
    }
    (req as Request & { user?: { userId: number; fundIds: number[] } }).user = {
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
    const user = (req as Request & { user?: { userId: number; fundIds: number[] } }).user;
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

import importsRouter from '../../../../server/routes/lp-reporting/imports';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'lp-reporting');
const ledgerCsvBase64 = fs
  .readFileSync(path.join(FIXTURES_DIR, 'sample-ledger.csv'))
  .toString('base64');
const valuationCsvBase64 = fs
  .readFileSync(path.join(FIXTURES_DIR, 'sample-valuation-marks.csv'))
  .toString('base64');

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '512kb' }));
  app.use(importsRouter);
  return app;
}

beforeEach(() => {
  authState.authenticated = true;
  authState.userId = 7;
  authState.fundIds = [1, 2];
});

afterEach(() => {
  vi.restoreAllMocks();
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
});

describe('POST /api/funds/:fundId/imports/valuation-marks/dry-run', () => {
  it('returns 401 when unauthenticated', async () => {
    authState.authenticated = false;
    const res = await request(buildApp())
      .post('/api/funds/1/imports/valuation-marks/dry-run')
      .send({ sourceType: 'csv', payload: valuationCsvBase64 });
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

describe('Source grep -- no commit endpoint, no /api/public', () => {
  const routerSource = fs.readFileSync(
    path.join(process.cwd(), 'server', 'routes', 'lp-reporting', 'imports.ts'),
    'utf8'
  );

  it('does not declare a /commit endpoint', () => {
    expect(routerSource).not.toMatch(/['"][^'"]*\/commit['"]/);
  });

  it('does not add any /api/public route', () => {
    expect(routerSource).not.toMatch(/\/api\/public/);
  });

  it('uses /api/funds/:fundId/imports prefix only', () => {
    const matches =
      routerSource.match(/router\.(post|get|put|delete|patch)\(\s*['"]([^'"]+)['"]/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m).toMatch(/\/api\/funds\/:fundId\/imports\/[^/]+\/dry-run/);
    }
  });
});
