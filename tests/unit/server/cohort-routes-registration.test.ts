import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const DEFAULT_DEFINITION_ID = '11111111-1111-4111-8111-111111111111';
const SECTOR_ID = '22222222-2222-4222-8222-222222222222';
const LOT_ID = '33333333-3333-4333-8333-333333333333';

const { mockDb, resetMockDb, mockRegisterCompletionHandlers, mockAutomationStart } = vi.hoisted(
  () => {
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
      resetMockDb(results: unknown[][]) {
        selectResults.splice(0, selectResults.length, ...results);
        mockDb.select.mockClear();
      },
      mockRegisterCompletionHandlers: vi.fn(),
      mockAutomationStart: vi.fn(),
    };
  }
);

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

vi.mock('../../../server/services/calc-run-completion-handlers.js', () => ({
  registerCompletionHandlers: mockRegisterCompletionHandlers,
}));

vi.mock('../../../server/services/variance-alert-automation.js', () => ({
  varianceAlertAutomationService: {
    start: mockAutomationStart,
  },
}));

describe('cohort routes on registerRoutes surface', () => {
  let server: import('http').Server | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
  }, 30_000);
});
