import type { Express, NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryChain = PromiseLike<unknown[]> & {
  from: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
};

const dbState = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
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
      leftJoin: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => query),
      offset: vi.fn(() => Promise.resolve(result)),
      then: thenFor(result),
    } as QueryChain;

    return query;
  }

  return {
    db: {
      select: vi.fn(() => makeQuery(next())),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
    },
    state,
  };
});

const calculatorState = vi.hoisted(() => ({
  calculateSummary: vi.fn(),
}));

const startupState = vi.hoisted(() => ({
  registerCompletionHandlers: vi.fn(),
  automationStart: vi.fn(),
  setupWebSocketServers: vi.fn(),
}));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: 'lp-user',
      sub: 'lp-user',
      email: 'lp@example.com',
      role: 'lp',
      roles: ['lp'],
      fundIds: [7],
      lpId: 9001,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    next();
  },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireFundAccess: (req: Request, res: Response, next: NextFunction) => {
    const fundId = Number(req.params['fundId']);
    if (Number.isFinite(fundId) && req.user?.fundIds?.includes(fundId)) return next();
    return res.status(403).json({ error: 'Forbidden' });
  },
}));

vi.mock('../../../server/middleware/requireLPAccess', () => ({
  requireLPAccess: (req: Request, _res: Response, next: NextFunction) => {
    req.lpProfile = {
      id: 9001,
      name: 'Runtime LP',
      email: 'lp@example.com',
      entityType: 'institution',
      fundIds: [7],
    };
    next();
  },
  requireLPFundAccess: (req: Request, res: Response, next: NextFunction) => {
    const fundId = Number(req.params['fundId']);
    if (req.lpProfile?.fundIds.includes(fundId)) return next();
    return res.status(403).json({ error: 'FORBIDDEN' });
  },
}));

vi.mock('../../../server/middleware/schema-isolation', () => ({
  enforceSchemaIsolation: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  handleSchemaViolation: (_err: unknown, _req: Request, _res: Response, next: NextFunction) =>
    next(),
}));

vi.mock('../../../server/middleware/performance-monitor.js', () => ({
  monitor: {
    middleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  },
}));

vi.mock('../../../server/services/calc-run-completion-handlers.js', () => ({
  registerCompletionHandlers: startupState.registerCompletionHandlers,
}));

vi.mock('../../../server/services/variance-alert-automation.js', () => ({
  varianceAlertAutomationService: {
    start: startupState.automationStart,
  },
}));

vi.mock('../../../server/websocket/index.js', () => ({
  setupWebSocketServers: startupState.setupWebSocketServers,
}));

vi.mock('../../../server/config/features.js', () => ({
  FEATURES: {
    redis: false,
    queues: false,
    sessions: false,
    portfolioIntelligence: false,
    metrics: false,
    statGating: false,
  },
  flag: vi.fn(() => false),
  getQueueConfig: vi.fn(() => ({
    enabled: false,
    queueRedisUrl: null,
    reason: 'disabled in route test',
  })),
  getQueueConnectionOptions: vi.fn(() => null),
}));

vi.mock('../../../server/db', () => ({ db: dbState.db }));

vi.mock('../../../server/services/lp-calculator', () => ({
  lpCalculator: calculatorState,
}));

vi.mock('../../../server/observability/lp-metrics', () => ({
  recordLPRequest: vi.fn(),
  recordCacheHit: vi.fn(),
  recordError: vi.fn(),
  recordDataPoints: vi.fn(),
  startTimer: vi.fn(() => () => 0),
}));

vi.mock('../../../server/services/lp-audit-logger', () => {
  const noop = vi.fn(async () => undefined);
  return {
    lpAuditLogger: {
      logProfileView: noop,
      logSummaryView: noop,
      logCapitalAccountView: noop,
      logFundDetailView: noop,
      logHoldingsView: noop,
      logPerformanceView: noop,
      logBenchmarkView: noop,
      logReportGeneration: noop,
      logReportListView: noop,
      logReportStatusView: noop,
      logReportDownload: noop,
      logSettingsUpdate: noop,
      logCapitalCallsListView: noop,
      logDistributionsListView: noop,
      logDocumentsListView: noop,
      logNotificationsView: noop,
    },
  };
});

vi.mock('../../../server/lib/crypto/cursor-signing', () => ({
  createCursor: vi.fn(
    ({ offset, limit }: { offset: number; limit: number }) => `cursor:${offset}:${limit}`
  ),
  verifyCursor: vi.fn((cursor: string) => {
    const match = /^cursor:(\d+):(\d+)$/.exec(cursor);
    if (!match) throw new Error('bad cursor');
    return { offset: Number(match[1]), limit: Number(match[2]) };
  }),
}));

vi.mock('../../../server/lib/crypto/pii-sanitizer', () => ({
  sanitizeForLogging: (value: unknown) => value,
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getFund: vi.fn(async (id: number) => ({ id, name: `Fund ${id}` })),
  },
}));

vi.mock('../../../server/queues/report-generation-queue', () => ({
  isReportQueueAvailable: vi.fn(() => true),
  enqueueReportGeneration: vi.fn(async () => ({ jobId: 'job-1', estimatedWaitMs: 0 })),
}));

type RuntimeSurface = {
  label: string;
  app: Express;
};

type EndpointCase = {
  path: string;
  assertBody: (body: Record<string, unknown>) => void;
};

const endpointCases: EndpointCase[] = [
  {
    path: '/api/lp/profile',
    assertBody: (body) => expect(body).toHaveProperty('name', 'Runtime LP'),
  },
  {
    path: '/api/lp/summary',
    assertBody: (body) => expect(body).toHaveProperty('lpId', 9001),
  },
  {
    path: '/api/lp/capital-calls',
    assertBody: (body) => expect(body).toHaveProperty('calls'),
  },
  {
    path: '/api/lp/distributions',
    assertBody: (body) => expect(body).toHaveProperty('distributions'),
  },
  {
    path: '/api/lp/documents',
    assertBody: (body) => expect(body).toHaveProperty('documents'),
  },
  {
    path: '/api/lp/notifications',
    assertBody: (body) => expect(body).toHaveProperty('notifications'),
  },
  {
    path: '/api/lp/notifications/unread-count',
    assertBody: (body) => expect(body).toHaveProperty('unreadCount', 3),
  },
];

const servers: Server[] = [];

function resetState() {
  dbState.state.selectResults = [];
  dbState.db.select.mockClear();
  dbState.db.update.mockClear();
  calculatorState.calculateSummary.mockReset();
}

function summaryResult() {
  return {
    lpId: 9001,
    lpName: 'Runtime LP',
    totalCommittedCents: 10_000_000n,
    totalCalledCents: 4_000_000n,
    totalDistributedCents: 1_000_000n,
    totalNAVCents: 8_000_000n,
    totalUnfundedCents: 6_000_000n,
    fundCount: 1,
    irr: 0.1,
    moic: 2.25,
  };
}

function capitalCallRow() {
  return {
    id: 'call-1',
    lpId: 9001,
    fundId: 7,
    fundName: 'Fund VII',
    callNumber: 3,
    callAmountCents: 250_000n,
    dueDate: '2026-02-01',
    callDate: '2026-01-15',
    purpose: 'Follow-on reserve',
    status: 'pending',
    paidAmountCents: 0n,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
  };
}

function distributionRow() {
  return {
    id: 'dist-1',
    lpId: 9001,
    fundId: 7,
    fundName: 'Fund VII',
    distributionNumber: 2,
    totalAmountCents: 125_000n,
    distributionDate: '2026-01-20',
    distributionType: 'capital_gains',
    status: 'completed',
    returnOfCapitalCents: 100_000n,
    preferredReturnCents: 25_000n,
    carriedInterestCents: 0n,
    catchUpCents: 0n,
    createdAt: new Date('2026-01-20T00:00:00.000Z'),
  };
}

function documentRow() {
  return {
    id: 'doc-1',
    fundId: 7,
    documentType: 'quarterly_report',
    title: 'Q4 Report',
    description: null,
    fileName: 'q4.pdf',
    fileSize: 2_500_000,
    mimeType: 'application/pdf',
    documentDate: '2025-12-31',
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    accessLevel: 'standard',
    fundName: 'Fund VII',
  };
}

function notificationRow() {
  return {
    id: 'notification-1',
    type: 'report_ready',
    title: 'Report ready',
    message: 'Your quarterly report is ready.',
    relatedEntityType: 'report',
    relatedEntityId: 'report-1',
    actionUrl: '/lp/reports/report-1',
    read: false,
    readAt: null,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

function prepareEndpoint(path: string) {
  resetState();

  if (path === '/api/lp/summary') {
    calculatorState.calculateSummary.mockResolvedValueOnce(summaryResult());
  }

  if (path === '/api/lp/capital-calls') {
    dbState.state.selectResults = [[capitalCallRow()]];
  }

  if (path === '/api/lp/distributions') {
    dbState.state.selectResults = [[distributionRow()]];
  }

  if (path === '/api/lp/documents') {
    dbState.state.selectResults = [[documentRow()]];
  }

  if (path === '/api/lp/notifications') {
    dbState.state.selectResults = [[notificationRow()], [{ count: 3 }]];
  }

  if (path === '/api/lp/notifications/unread-count') {
    dbState.state.selectResults = [[{ count: 3 }]];
  }
}

async function makeRegisterRoutesSurface(label: string, withApiAuth: boolean) {
  const app = express();
  app.set('trust proxy', false);
  app.use(express.json());

  if (withApiAuth) {
    const { requireAuth } = await import('../../../server/lib/auth/jwt');
    app.use('/api', requireAuth());
  }

  const { registerRoutes } = await import('../../../server/routes');
  const server = await registerRoutes(app);
  servers.push(server);

  return { label, app };
}

async function buildSurfaces(): Promise<RuntimeSurface[]> {
  const { makeApp } = await import('../../../server/app');

  return [
    { label: 'makeApp() live and serverless source runtime', app: makeApp() },
    await makeRegisterRoutesSurface('bare registerRoutes(app) route-registration parity', false),
    await makeRegisterRoutesSurface('server.ts /api auth composition parity', true),
  ];
}

describe('LP dashboard runtime routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  afterEach(async () => {
    resetState();

    while (servers.length > 0) {
      const server = servers.pop();
      if (server?.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    }
  });

  it('mounts dashboard API endpoints on the runtime surfaces instead of test-only fixtures', async () => {
    const surfaces = await buildSurfaces();

    for (const surface of surfaces) {
      for (const endpoint of endpointCases) {
        prepareEndpoint(endpoint.path);

        const response = await request(surface.app).get(endpoint.path);

        expect(response.status, `${surface.label} ${endpoint.path}`).toBe(200);
        expect(response.body, `${surface.label} ${endpoint.path}`).not.toHaveProperty(
          'error',
          'not_found'
        );
        endpoint.assertBody(response.body as Record<string, unknown>);
      }

      resetState();
      const unknownResponse = await request(surface.app).get('/api/lp/not-real-dashboard-endpoint');

      expect(unknownResponse.status, `${surface.label} unknown route`).toBe(404);
      expect(unknownResponse.body, `${surface.label} unknown route`).toHaveProperty(
        'error',
        'not_found'
      );
    }
  }, 30_000);
});
