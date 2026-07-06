import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const DEFAULT_DEFINITION_ID = '11111111-1111-4111-8111-111111111111';
const SECTOR_ID = '22222222-2222-4222-8222-222222222222';
const LOT_ID = '33333333-3333-4333-8333-333333333333';

const {
  accessCalls,
  accessMode,
  authCalls,
  mockDb,
  resetMockDb,
  mockRegisterCompletionHandlers,
  mockAutomationStart,
  mockSetupWebSocketServers,
} = vi.hoisted(() => {
  const selectResults: unknown[][] = [];

  function makeSelectChain(rows: unknown[]) {
    const resolved = Promise.resolve(rows);
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => resolved),
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
      finally: resolved.finally.bind(resolved),
    };
    return chain;
  }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResults.shift() ?? [])),
  };

  return {
    mockDb,
    authCalls: [] as string[],
    accessCalls: [] as string[],
    accessMode: { value: 'allow' as 'allow' | 'deny' },
    resetMockDb(results: unknown[][]) {
      selectResults.splice(0, selectResults.length, ...results);
      mockDb.select.mockClear();
    },
    mockRegisterCompletionHandlers: vi.fn(),
    mockAutomationStart: vi.fn(),
    mockSetupWebSocketServers: vi.fn(),
  };
});

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    authCalls.push(req.path);
    req.user = { id: 'user-1', email: 'user@example.com' } as never;
    next();
  },
  requireFundAccess: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    accessCalls.push(req.params['fundId'] ?? '');
    if (accessMode.value === 'deny') {
      return res.status(403).json({ error: 'forbidden' });
    }

    return next();
  },
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
  requireAnyRole:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
  requireExportFundGrant: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

vi.mock('../../../server/services/calc-run-completion-handlers.js', () => ({
  registerCompletionHandlers: mockRegisterCompletionHandlers,
}));

vi.mock('../../../server/services/variance-alert-automation.js', () => ({
  varianceAlertAutomationService: {
    start: mockAutomationStart,
  },
}));

vi.mock('../../../server/websocket/index.js', () => ({
  setupWebSocketServers: mockSetupWebSocketServers,
}));

describe('cohort routes on registerRoutes surface', () => {
  let server: import('http').Server | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    authCalls.length = 0;
    accessCalls.length = 0;
    accessMode.value = 'allow';
    resetMockDb([
      [
        {
          id: DEFAULT_DEFINITION_ID,
          fundId: 1,
          name: 'Default Company View',
          vintageGranularity: 'year',
          sectorTaxonomyVersion: 'v1',
          unit: 'company',
          isDefault: true,
          archivedAt: null,
        },
      ],
      [{ id: 10, name: 'Acme', sector: 'SaaS' }],
      [
        {
          id: 100,
          companyId: 10,
          investmentDate: new Date('2024-01-15T00:00:00Z'),
          amount: '1000000',
          round: 'Seed',
        },
      ],
      [{ id: SECTOR_ID, slug: 'saas', name: 'SaaS', isSystem: false }],
      [{ rawValueNormalized: 'saas', canonicalSectorId: SECTOR_ID }],
      [],
      [],
      [
        {
          id: LOT_ID,
          investmentId: 100,
          lotType: 'initial',
          sharePriceCents: 100n,
          sharesAcquired: '1000000',
          costBasisCents: 100000000n,
          createdAt: new Date('2024-01-15T00:00:00Z'),
        },
      ],
    ]);
  });

  afterEach(async () => {
    const serverToClose = server;
    server = undefined;

    if (serverToClose?.listening) {
      await new Promise<void>((resolve, reject) => {
        serverToClose.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('mounts Cohort Analysis on the canonical registerRoutes API surface', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    server = await registerRoutes(app);

    const res = await request(app).post('/api/cohorts/analyze').send({ fundId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.cohortDefinition).toMatchObject({
      id: DEFAULT_DEFINITION_ID,
      fundId: 1,
      name: 'Default Company View',
      vintageGranularity: 'year',
      sectorTaxonomyVersion: 'v1',
      unit: 'company',
    });
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({
      cohortKey: '2024',
      sectorId: SECTOR_ID,
      sectorName: 'SaaS',
      counts: {
        companies: 1,
        investments: 1,
      },
      exposure: {
        paidIn: 1000000,
        distributions: 0,
      },
      performance: {
        dpi: 0,
        tvpi: null,
        irr: null,
      },
    });
    expect(authCalls).toEqual(['/analyze']);
    expect(accessCalls).toEqual(['1']);
  }, 30_000);

  it('rejects Cohort Analysis when the user lacks fund access', async () => {
    accessMode.value = 'deny';
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    server = await registerRoutes(app);

    const res = await request(app).post('/api/cohorts/analyze').send({ fundId: 1 });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(authCalls).toEqual(['/analyze']);
    expect(accessCalls).toEqual(['1']);
    expect(mockDb.select).not.toHaveBeenCalled();
  }, 30_000);

  it('keeps archived cohort definitions hidden when includeArchived=false is passed as a query string', async () => {
    resetMockDb([
      [
        {
          id: DEFAULT_DEFINITION_ID,
          fundId: 1,
          name: 'Active Company View',
          vintageGranularity: 'year',
          sectorTaxonomyVersion: 'v1',
          unit: 'company',
          isDefault: true,
          archivedAt: null,
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          fundId: 1,
          name: 'Archived Company View',
          vintageGranularity: 'year',
          sectorTaxonomyVersion: 'v1',
          unit: 'company',
          isDefault: false,
          archivedAt: new Date('2025-01-01T00:00:00Z'),
        },
      ],
    ]);

    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    server = await registerRoutes(app);

    const res = await request(app).get('/api/cohorts/definitions?fundId=1&includeArchived=false');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fundId: 1,
      count: 1,
      definitions: [
        {
          id: DEFAULT_DEFINITION_ID,
          name: 'Active Company View',
          archivedAt: null,
        },
      ],
    });
    expect(authCalls).toEqual(['/definitions']);
    expect(accessCalls).toEqual(['1']);
  }, 30_000);
});
