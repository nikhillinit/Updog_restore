/**
 * Route tests for LP Reporting metric-run dry-run endpoint (Phase 1.3).
 *
 * Verifies:
 *   - 401 when unauthenticated.
 *   - 403 on cross-fund access (URL fundId not in user.fundIds).
 *   - 403 CROSS_FUND_RESOURCE when sourceEventIds reference rows from another fund.
 *   - 400 INVALID_REQUEST_BODY on schema violations.
 *   - 400 INVALID_FUND_ID when :fundId is non-numeric.
 *   - 400 UNSUPPORTED_PERSPECTIVE when perspective='vehicle'.
 *   - 200 happy path: results parse against the Phase 1.1 schema, dpi='0.250000'.
 *   - 200 empty inputs: ratios null with ZERO_CONTRIBUTIONS warning.
 *   - 429 after 21 calls in the rate-limit window.
 *   - DB-write spy: db.insert is never called from the dry-run handler.
 *   - Source grep: no /api/public, no /commit substring.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

import { LpMetricRunResultsSchema } from '@shared/contracts/lp-reporting';

const authState = {
  authenticated: true,
  userId: 7,
  fundIds: [1, 2] as number[],
};
let nextUserId = 800;

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
      // Let the route handler emit INVALID_FUND_ID; pass through.
      return next();
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

// ---------------------------------------------------------------------------
// DB mock: chainable select().from().where(...) returning fixture rows.
// db.insert is a vi.fn() so the assertions can confirm it was never called.
// ---------------------------------------------------------------------------

interface MockEventRow {
  id: number;
  fundId: number;
  eventType: string;
  amount: string;
  eventDate: Date;
  perspective: string;
  status: string | null;
  reversalOfEventId: number | null;
}

interface MockMarkRow {
  id: number;
  fundId: number;
  fairValue: string;
  markDate: string;
  asOfDate: string;
  status: string | null;
  confidenceLevel: string;
  companyId: number | null;
}

const dbState: {
  events: MockEventRow[];
  marks: MockMarkRow[];
  insertCalls: number;
} = {
  events: [],
  marks: [],
  insertCalls: 0,
};

// Tag tables by string kind so the db mock can route queries without depending
// on object identity (vi.mock factories are hoisted; outer references are not
// reachable from inside the factory).
vi.mock('@shared/schema/lp-reporting-evidence', () => ({
  cashFlowEvents: { _kind: 'cashFlowEvents' },
  valuationMarks: { _kind: 'valuationMarks' },
}));

vi.mock('../../../../server/db', () => {
  const insertSpy = vi.fn(() => {
    dbState.insertCalls += 1;
    return {
      values: vi.fn().mockResolvedValue([]),
    };
  });

  return {
    db: {
      insert: insertSpy,
      select: vi.fn(() => ({
        from: vi.fn((table: { _kind?: string }) => ({
          where: vi.fn(async () => {
            if (table?._kind === 'cashFlowEvents') {
              return [...dbState.events];
            }
            if (table?._kind === 'valuationMarks') {
              return [...dbState.marks];
            }
            return [];
          }),
        })),
      })),
    },
  };
});

// drizzle-orm's inArray is invoked by the route; provide a no-op since the
// mock's where() ignores its argument.
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    inArray: vi.fn(() => ({ _op: 'inArray' })),
  };
});

import metricRunsRouter from '../../../../server/routes/lp-reporting/metric-runs';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '512kb' }));
  app.use(metricRunsRouter);
  return app;
}

/**
 * Build a truth-case fixture: 4M called capital + 1M distribution + 4M NAV
 * yields dpi=0.25, rvpi=1.0, tvpi=1.25, moic=1.25.
 */
function seedHappyPathFixture(fundId: number): { eventIds: number[]; markIds: number[] } {
  dbState.events = [
    {
      id: 101,
      fundId,
      eventType: 'lp_capital_call',
      amount: '4000000.000000',
      eventDate: new Date('2024-01-15T00:00:00Z'),
      perspective: 'lp_net',
      status: 'approved',
      reversalOfEventId: null,
    },
    {
      id: 102,
      fundId,
      eventType: 'lp_distribution',
      amount: '1000000.000000',
      eventDate: new Date('2025-06-30T00:00:00Z'),
      perspective: 'lp_net',
      status: 'approved',
      reversalOfEventId: null,
    },
  ];
  dbState.marks = [
    {
      id: 201,
      fundId,
      fairValue: '4000000.000000',
      markDate: '2026-03-31',
      asOfDate: '2026-03-31',
      status: 'approved',
      confidenceLevel: 'high',
      companyId: 42,
    },
  ];
  return { eventIds: [101, 102], markIds: [201] };
}

beforeEach(() => {
  authState.authenticated = true;
  authState.userId = nextUserId++;
  authState.fundIds = [1, 2];
  dbState.events = [];
  dbState.marks = [];
  dbState.insertCalls = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/funds/:fundId/metric-runs/dry-run', () => {
  it('returns 401 when unauthenticated', async () => {
    authState.authenticated = false;
    const res = await request(buildApp()).post('/api/funds/1/metric-runs/dry-run').send({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceEventIds: [],
      sourceMarkIds: [],
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 on cross-fund access (fundId 99 not in user.fundIds)', async () => {
    const res = await request(buildApp()).post('/api/funds/99/metric-runs/dry-run').send({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceEventIds: [],
      sourceMarkIds: [],
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 CROSS_FUND_RESOURCE when an event row belongs to a different fund', async () => {
    dbState.events = [
      {
        id: 999,
        fundId: 7, // NOT the URL fundId
        eventType: 'lp_capital_call',
        amount: '1000000.000000',
        eventDate: new Date('2024-01-15T00:00:00Z'),
        perspective: 'lp_net',
        status: 'approved',
        reversalOfEventId: null,
      },
    ];
    const res = await request(buildApp())
      .post('/api/funds/1/metric-runs/dry-run')
      .send({
        asOfDate: '2026-03-31',
        runType: 'quarterly_report',
        perspective: 'lp_net',
        sourceEventIds: [999],
        sourceMarkIds: [],
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CROSS_FUND_RESOURCE');
  });

  it('returns 400 INVALID_REQUEST_BODY when asOfDate is missing', async () => {
    const res = await request(buildApp()).post('/api/funds/1/metric-runs/dry-run').send({
      runType: 'quarterly_report',
      perspective: 'lp_net',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST_BODY');
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('returns 400 INVALID_REQUEST_BODY when perspective enum is invalid', async () => {
    const res = await request(buildApp()).post('/api/funds/1/metric-runs/dry-run').send({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'not_a_perspective',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST_BODY');
  });

  it('returns 400 INVALID_FUND_ID when :fundId is not numeric', async () => {
    const res = await request(buildApp()).post('/api/funds/abc/metric-runs/dry-run').send({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'lp_net',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FUND_ID');
  });

  it("returns 400 UNSUPPORTED_PERSPECTIVE when perspective='vehicle'", async () => {
    const res = await request(buildApp()).post('/api/funds/1/metric-runs/dry-run').send({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'vehicle',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('UNSUPPORTED_PERSPECTIVE');
  });

  it('returns 200 with locked-shape results on the happy path', async () => {
    const { eventIds, markIds } = seedHappyPathFixture(1);
    const res = await request(buildApp()).post('/api/funds/1/metric-runs/dry-run').send({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceEventIds: eventIds,
      sourceMarkIds: markIds,
    });
    expect(res.status).toBe(200);

    // The response.results must round-trip the locked Phase 1.1 schema.
    const parsed = LpMetricRunResultsSchema.parse(res.body.results);
    expect(parsed.dpi).toBe('0.250000');
    expect(parsed.rvpi).toBe('1.000000');
    expect(parsed.tvpi).toBe('1.250000');
    expect(parsed.moic).toBe('1.250000');
    expect(parsed.contributionsTotal).toBe('4000000.000000');
    expect(parsed.distributionsTotal).toBe('1000000.000000');
    expect(parsed.currentNav).toBe('4000000.000000');
    expect(parsed.markConfidenceMix).toEqual({ high: 1, medium: 0, low: 0 });

    expect(typeof res.body.inputsHash).toBe('string');
    expect(res.body.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.runType).toBe('quarterly_report');
    expect(res.body.diagnostics.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('returns 200 with all-null ratios and ZERO_CONTRIBUTIONS warning on empty input', async () => {
    const res = await request(buildApp()).post('/api/funds/1/metric-runs/dry-run').send({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceEventIds: [],
      sourceMarkIds: [],
    });
    expect(res.status).toBe(200);
    const parsed = LpMetricRunResultsSchema.parse(res.body.results);
    expect(parsed.dpi).toBeNull();
    expect(parsed.rvpi).toBeNull();
    expect(parsed.tvpi).toBeNull();
    expect(parsed.moic).toBeNull();
    expect(parsed.contributionsTotal).toBe('0.000000');
    expect(parsed.distributionsTotal).toBe('0.000000');
    expect(parsed.currentNav).toBe('0.000000');

    const warnings: { code: string; message: string }[] = res.body.diagnostics.warnings;
    expect(warnings.some((w) => w.code === 'ZERO_CONTRIBUTIONS')).toBe(true);
  });

  it('returns 429 after 20 successful calls within the rate-limit window', async () => {
    authState.userId = nextUserId++;
    const app = buildApp();
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post('/api/funds/1/metric-runs/dry-run').send({
        asOfDate: '2026-03-31',
        runType: 'quarterly_report',
        perspective: 'lp_net',
        sourceEventIds: [],
        sourceMarkIds: [],
      });
      expect(res.status).toBe(200);
    }

    const limited = await request(app).post('/api/funds/1/metric-runs/dry-run').send({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceEventIds: [],
      sourceMarkIds: [],
    });
    expect(limited.status).toBe(429);

    // A different user is bucketed independently.
    authState.userId = nextUserId++;
    const otherUser = await request(app).post('/api/funds/1/metric-runs/dry-run').send({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceEventIds: [],
      sourceMarkIds: [],
    });
    expect(otherUser.status).toBe(200);
  });
});

describe('DB-write absence -- dry-run never inserts', () => {
  it('does not call db.insert during the happy-path handler', async () => {
    const { eventIds, markIds } = seedHappyPathFixture(1);
    const res = await request(buildApp()).post('/api/funds/1/metric-runs/dry-run').send({
      asOfDate: '2026-03-31',
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceEventIds: eventIds,
      sourceMarkIds: markIds,
    });
    expect(res.status).toBe(200);
    expect(dbState.insertCalls).toBe(0);
  });
});

describe('Source grep -- no commit endpoint, no /api/public', () => {
  const routerSource = fs.readFileSync(
    path.join(process.cwd(), 'server', 'routes', 'lp-reporting', 'metric-runs.ts'),
    'utf8'
  );

  it('does not declare a /commit endpoint', () => {
    expect(routerSource).not.toMatch(/['"][^'"]*\/commit['"]/);
  });

  it('does not add any /api/public route', () => {
    expect(routerSource).not.toMatch(/\/api\/public/);
  });

  it('does not write to lp_metric_runs (no db.insert call site)', () => {
    expect(routerSource).not.toMatch(/db\.insert\(/);
    expect(routerSource).not.toMatch(/INSERT\s+INTO/i);
  });

  it('uses /api/funds/:fundId/metric-runs/dry-run prefix only', () => {
    const matches =
      routerSource.match(/router\.(post|get|put|delete|patch)\(\s*['"]([^'"]+)['"]/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m).toMatch(/\/api\/funds\/:fundId\/metric-runs\/dry-run/);
    }
  });
});
