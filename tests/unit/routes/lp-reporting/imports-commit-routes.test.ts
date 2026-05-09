/**
 * Route tests for LP Reporting import commit endpoints (Phase 1c.2).
 *
 * Verifies:
 *   - 401 unauthenticated, 403 cross-fund, 200 happy path, 429 rate-limit.
 *   - 409 PREVIEW_DRIFT on hash mismatch.
 *   - auditLog middleware mounted on both endpoints.
 *   - Idempotency-Key replay short-circuits the underlying service.
 *   - No /api/public/* commit endpoint added.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import {
  LedgerImportCommitResponseSchema,
  ValuationMarkImportCommitResponseSchema,
} from '@shared/contracts/lp-reporting';
import {
  computePreviewHash,
  parseLedgerCsv,
  parseValuationMarksCsv,
} from '../../../../server/services/lp-reporting/import-reconciliation-service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const authState = {
  authenticated: true,
  userId: 7,
  fundIds: [1, 2] as number[],
};
let nextUserId = 9000;

vi.mock('../../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => {
    if (!authState.authenticated) {
      return res.sendStatus(401);
    }
    (
      req as Request & {
        user?: { id: string; userId?: number; fundIds: number[] };
      }
    ).user = {
      id: String(authState.userId),
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
    const user = (
      req as Request & {
        user?: { id: string; fundIds: number[] };
      }
    ).user;
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

const { auditLogSpy } = vi.hoisted(() => ({
  auditLogSpy: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../../../../server/middleware/auditLog', () => ({
  auditLog: (config: unknown) => auditLogSpy(config),
}));

// In-memory idempotency store for the test mock so we can exercise replay.
const fakeIdempotencyStore = new Map<string, { status: number; body: unknown }>();

vi.mock('../../../../server/middleware/idempotency', () => ({
  idempotency: () => (req: Request, res: Response, next: NextFunction) => {
    const key = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as
      | string
      | undefined;
    if (!key) {
      return next();
    }
    const cached = fakeIdempotencyStore.get(key);
    if (cached) {
      res.setHeader('Idempotency-Replay', 'true');
      return res.status(cached.status).json(cached.body);
    }
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        fakeIdempotencyStore.set(key, { status: res.statusCode, body });
      }
      return originalJson(body);
    };
    next();
  },
}));

// Spy on the commit service so we can assert call counts under idempotency.
const commitServiceMocks = vi.hoisted(() => ({
  commitLedgerImport: vi.fn(),
  commitValuationMarkImport: vi.fn(),
}));

vi.mock('../../../../server/services/lp-reporting/import-commit-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../server/services/lp-reporting/import-commit-service')
  >('../../../../server/services/lp-reporting/import-commit-service');
  return {
    ...actual,
    commitLedgerImport: commitServiceMocks.commitLedgerImport,
    commitValuationMarkImport: commitServiceMocks.commitValuationMarkImport,
  };
});

import importsRouter from '../../../../server/routes/lp-reporting/imports';
import { PreviewDriftError } from '../../../../server/services/lp-reporting/import-commit-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'lp-reporting');
const ledgerBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample-ledger.csv'));
const valuationBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample-valuation-marks.csv'));
const ledgerCsvBase64 = ledgerBuffer.toString('base64');
const valuationCsvBase64 = valuationBuffer.toString('base64');

const VALID_BATCH_ID = '22222222-2222-4222-8222-222222222222';

const ledgerPreviewHash = computePreviewHash(parseLedgerCsv(ledgerBuffer, 1).rows);
const valuationPreviewHash = computePreviewHash(parseValuationMarksCsv(valuationBuffer, 1).rows);

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '512kb' }));
  app.use(importsRouter);
  return app;
}

function ledgerCommitBody(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: 'csv',
    payload: ledgerCsvBase64,
    previewHash: ledgerPreviewHash,
    importBatchId: VALID_BATCH_ID,
    ...overrides,
  };
}

function valuationCommitBody(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: 'csv',
    payload: valuationCsvBase64,
    previewHash: valuationPreviewHash,
    importBatchId: VALID_BATCH_ID,
    ...overrides,
  };
}

const baseLedgerResponse = {
  persistedEventIds: [1001, 1002, 1003, 1004],
  importBatchId: VALID_BATCH_ID,
  committedAt: '2026-05-09T00:00:00Z',
  previewHash: ledgerPreviewHash,
  rowCount: 4,
};

const baseValuationResponse = {
  persistedMarkIds: [2001, 2002, 2003, 2004],
  importBatchId: VALID_BATCH_ID,
  committedAt: '2026-05-09T00:00:00Z',
  previewHash: valuationPreviewHash,
  rowCount: 4,
};

beforeEach(() => {
  authState.authenticated = true;
  authState.userId = nextUserId++;
  authState.fundIds = [1, 2];
  fakeIdempotencyStore.clear();
  commitServiceMocks.commitLedgerImport.mockReset();
  commitServiceMocks.commitValuationMarkImport.mockReset();
  commitServiceMocks.commitLedgerImport.mockResolvedValue(baseLedgerResponse);
  commitServiceMocks.commitValuationMarkImport.mockResolvedValue(baseValuationResponse);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Ledger commit
// ---------------------------------------------------------------------------

describe('POST /api/funds/:fundId/imports/ledger/commit', () => {
  it('returns 401 when unauthenticated', async () => {
    authState.authenticated = false;
    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/commit')
      .set('Idempotency-Key', 'kledger-401')
      .send(ledgerCommitBody());
    expect(res.status).toBe(401);
  });

  it('returns 403 on cross-fund access', async () => {
    const res = await request(buildApp())
      .post('/api/funds/99/imports/ledger/commit')
      .set('Idempotency-Key', 'kledger-403')
      .send(ledgerCommitBody());
    expect(res.status).toBe(403);
  });

  it('returns 200 with a valid LedgerImportCommitResponse on the happy path', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/commit')
      .set('Idempotency-Key', `kledger-200-${nextUserId}`)
      .send(ledgerCommitBody());
    expect(res.status).toBe(200);
    expect(() => LedgerImportCommitResponseSchema.parse(res.body)).not.toThrow();
    expect(commitServiceMocks.commitLedgerImport).toHaveBeenCalledTimes(1);
  });

  it('returns 409 PREVIEW_DRIFT envelope on hash mismatch', async () => {
    commitServiceMocks.commitLedgerImport.mockRejectedValueOnce(
      new PreviewDriftError({
        expectedPreviewHash: 'd'.repeat(64),
        actualPreviewHash: 'e'.repeat(64),
        diff: { addedSourceIds: ['row-1'], removedSourceIds: [] },
      })
    );

    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/commit')
      .set('Idempotency-Key', `kledger-409-${nextUserId}`)
      .send(ledgerCommitBody({ previewHash: 'd'.repeat(64) }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PREVIEW_DRIFT');
    expect(res.body.expectedPreviewHash).toBe('d'.repeat(64));
    expect(res.body.actualPreviewHash).toBe('e'.repeat(64));
    expect(Array.isArray(res.body.diff.addedSourceIds)).toBe(true);
  });

  it('returns 429 after 20 commit requests for the same user', async () => {
    authState.userId = nextUserId++;
    const app = buildApp();

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/funds/1/imports/ledger/commit')
        .set('Idempotency-Key', `kledger-rate-${i}-${authState.userId}`)
        .send(ledgerCommitBody());
      expect(res.status).toBe(200);
    }

    const limited = await request(app)
      .post('/api/funds/1/imports/ledger/commit')
      .set('Idempotency-Key', `kledger-rate-final-${authState.userId}`)
      .send(ledgerCommitBody());
    expect(limited.status).toBe(429);
  });

  it('Idempotency-Key replays the same body without invoking the service twice', async () => {
    const app = buildApp();
    const key = `kledger-replay-${nextUserId}`;

    const res1 = await request(app)
      .post('/api/funds/1/imports/ledger/commit')
      .set('Idempotency-Key', key)
      .send(ledgerCommitBody());
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/api/funds/1/imports/ledger/commit')
      .set('Idempotency-Key', key)
      .send(ledgerCommitBody());
    expect(res2.status).toBe(200);
    expect(res2.headers['idempotency-replay']).toBe('true');
    expect(res2.body).toEqual(res1.body);
    expect(commitServiceMocks.commitLedgerImport).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when body is malformed (missing previewHash)', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/ledger/commit')
      .set('Idempotency-Key', `kledger-400-${nextUserId}`)
      .send({ sourceType: 'csv', payload: ledgerCsvBase64, importBatchId: VALID_BATCH_ID });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Valuation-mark commit
// ---------------------------------------------------------------------------

describe('POST /api/funds/:fundId/imports/valuation-marks/commit', () => {
  it('returns 401 when unauthenticated', async () => {
    authState.authenticated = false;
    const res = await request(buildApp())
      .post('/api/funds/1/imports/valuation-marks/commit')
      .set('Idempotency-Key', 'kvm-401')
      .send(valuationCommitBody());
    expect(res.status).toBe(401);
  });

  it('returns 403 on cross-fund access', async () => {
    const res = await request(buildApp())
      .post('/api/funds/99/imports/valuation-marks/commit')
      .set('Idempotency-Key', 'kvm-403')
      .send(valuationCommitBody());
    expect(res.status).toBe(403);
  });

  it('returns 200 with a valid ValuationMarkImportCommitResponse on the happy path', async () => {
    const res = await request(buildApp())
      .post('/api/funds/1/imports/valuation-marks/commit')
      .set('Idempotency-Key', `kvm-200-${nextUserId}`)
      .send(valuationCommitBody());
    expect(res.status).toBe(200);
    expect(() => ValuationMarkImportCommitResponseSchema.parse(res.body)).not.toThrow();
    expect(commitServiceMocks.commitValuationMarkImport).toHaveBeenCalledTimes(1);
  });

  it('returns 409 PREVIEW_DRIFT envelope on hash mismatch', async () => {
    commitServiceMocks.commitValuationMarkImport.mockRejectedValueOnce(
      new PreviewDriftError({
        expectedPreviewHash: 'f'.repeat(64),
        actualPreviewHash: '0'.repeat(64),
        diff: { addedSourceIds: [], removedSourceIds: ['row-1'] },
      })
    );

    const res = await request(buildApp())
      .post('/api/funds/1/imports/valuation-marks/commit')
      .set('Idempotency-Key', `kvm-409-${nextUserId}`)
      .send(valuationCommitBody({ previewHash: 'f'.repeat(64) }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PREVIEW_DRIFT');
  });

  it('returns 429 after 20 commit requests for the same user', async () => {
    authState.userId = nextUserId++;
    const app = buildApp();

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/funds/1/imports/valuation-marks/commit')
        .set('Idempotency-Key', `kvm-rate-${i}-${authState.userId}`)
        .send(valuationCommitBody());
      expect(res.status).toBe(200);
    }

    const limited = await request(app)
      .post('/api/funds/1/imports/valuation-marks/commit')
      .set('Idempotency-Key', `kvm-rate-final-${authState.userId}`)
      .send(valuationCommitBody());
    expect(limited.status).toBe(429);
  });

  it('Idempotency-Key replays the same body without invoking the service twice', async () => {
    const app = buildApp();
    const key = `kvm-replay-${nextUserId}`;

    const res1 = await request(app)
      .post('/api/funds/1/imports/valuation-marks/commit')
      .set('Idempotency-Key', key)
      .send(valuationCommitBody());
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/api/funds/1/imports/valuation-marks/commit')
      .set('Idempotency-Key', key)
      .send(valuationCommitBody());
    expect(res2.status).toBe(200);
    expect(res2.headers['idempotency-replay']).toBe('true');
    expect(res2.body).toEqual(res1.body);
    expect(commitServiceMocks.commitValuationMarkImport).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Source grep / wiring assertions
// ---------------------------------------------------------------------------

describe('Source grep -- commit endpoints wired correctly', () => {
  const routerSource = fs.readFileSync(
    path.join(process.cwd(), 'server', 'routes', 'lp-reporting', 'imports.ts'),
    'utf8'
  );

  it('declares both commit endpoints', () => {
    expect(routerSource).toMatch(/\/api\/funds\/:fundId\/imports\/ledger\/commit/);
    expect(routerSource).toMatch(/\/api\/funds\/:fundId\/imports\/valuation-marks\/commit/);
  });

  it('does not add any /api/public route', () => {
    expect(routerSource).not.toMatch(/\/api\/public/);
  });

  it('mounts auditLog middleware on both commit handlers (source check)', () => {
    // Static check on the router source: each commit handler must mount
    // auditLog() and idempotency(). The router.post(...) blocks for each
    // commit endpoint are matched up to the next `router.post` or EOF.
    const sliceHandler = (src: string, route: string): string | null => {
      // Find the router.post(...) call whose first arg is the given route.
      const re = new RegExp(
        `router\\.post\\(\\s*['"]${route.replace(/\//g, '\\/').replace(/:/g, ':')}['"]`
      );
      const m = re.exec(src);
      if (!m) return null;
      const after = src.slice(m.index);
      const nextPost = after.slice(1).search(/router\.post\(/);
      return nextPost < 0 ? after : after.slice(0, nextPost + 1);
    };
    const ledgerBlock = sliceHandler(routerSource, '/api/funds/:fundId/imports/ledger/commit');
    const vmBlock = sliceHandler(routerSource, '/api/funds/:fundId/imports/valuation-marks/commit');
    expect(ledgerBlock).not.toBeNull();
    expect(vmBlock).not.toBeNull();
    expect(ledgerBlock!).toMatch(/auditLog\(/);
    expect(vmBlock!).toMatch(/auditLog\(/);
    expect(ledgerBlock!).toMatch(/idempotency\(/);
    expect(vmBlock!).toMatch(/idempotency\(/);
  });
});
