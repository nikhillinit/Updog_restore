/**
 * Batch 3A2: HTTP contract test for GET /api/funds/:id/results
 *
 * Mocks fund-results-read-service at module level. Validates HTTP status
 * codes, error shapes, and response conformance to FundResultsReadV1Schema.
 *
 * Pattern: identical to fund-state-route.test.ts
 * Per MEMORY.md: set mock return values in beforeEach, not at declaration.
 *
 * TDD: Write these FIRST, then implement the route handler.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock the service module before any imports that use it
vi.mock('../../../server/services/fund-results-read-service', () => ({
  fundResultsReadService: {
    getResults: vi.fn(),
  },
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());

  const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
  registerFundConfigRoutes(app);
});

beforeEach(async () => {
  const { fundResultsReadService } =
    await import('../../../server/services/fund-results-read-service');
  vi.mocked(fundResultsReadService.getResults).mockResolvedValue(validReadyResponse());
});

describe('GET /api/funds/:id/results', () => {
  // ── Happy path ──

  it('returns 200 with valid FundResultsReadV1 shape', async () => {
    const res = await request(app).get('/api/funds/1/results');

    expect(res.status).toBe(200);
    const { FundResultsReadV1Schema } = await import('@shared/contracts/fund-results-v1.contract');
    const parsed = FundResultsReadV1Schema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it('returns ready status with available reserve and pacing sections', async () => {
    const res = await request(app).get('/api/funds/1/results');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.sections.reserve.status).toBe('available');
    expect(res.body.sections.pacing.status).toBe('available');
    expect(res.body.sections.reserve).toHaveProperty('payload');
    expect(res.body.sections.pacing).toHaveProperty('payload');
  });

  it('returns ready status with reserve unavailable (partial availability)', async () => {
    const { fundResultsReadService } =
      await import('../../../server/services/fund-results-read-service');
    vi.mocked(fundResultsReadService.getResults).mockResolvedValue({
      ...validReadyResponse(),
      sections: {
        ...validReadyResponse().sections,
        reserve: { status: 'unavailable', reason: 'No calculation results available' },
      },
    });

    const res = await request(app).get('/api/funds/1/results');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.sections.reserve.status).toBe('unavailable');
    expect(res.body.sections.reserve.reason).toBeTruthy();
  });

  it('accepts widened Track A section variants at the route boundary', async () => {
    const { fundResultsReadService } =
      await import('../../../server/services/fund-results-read-service');
    vi.mocked(fundResultsReadService.getResults).mockResolvedValue(validTrackAResponse());

    const res = await request(app).get('/api/funds/1/results');
    const { FundResultsReadV1Schema } = await import('@shared/contracts/fund-results-v1.contract');
    const parsed = FundResultsReadV1Schema.safeParse(res.body);

    expect(res.status).toBe(200);
    expect(parsed.success).toBe(true);
    expect(res.body.sections.scorecard.status).toBe('available');
    expect(res.body.sections.scenarios.status).toBe('unavailable');
    expect(res.body.sections.waterfall.status).toBe('available');
  });

  // ── Error paths ──

  it('returns 404 when service returns null', async () => {
    const { fundResultsReadService } =
      await import('../../../server/services/fund-results-read-service');
    vi.mocked(fundResultsReadService.getResults).mockResolvedValue(null);

    const res = await request(app).get('/api/funds/999/results');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for non-numeric fund ID', async () => {
    const res = await request(app).get('/api/funds/abc/results');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid fund ID');
  });

  it('returns 400 for negative fund ID', async () => {
    const res = await request(app).get('/api/funds/-1/results');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid fund ID');
  });

  it('returns 403 without reading results when user lacks fund scope', async () => {
    const { fundResultsReadService } =
      await import('../../../server/services/fund-results-read-service');
    const getResultsSpy = vi.mocked(fundResultsReadService.getResults);
    getResultsSpy.mockClear();
    const restrictedApp = express();
    restrictedApp.use(express.json());
    restrictedApp.use((req, _res, next) => {
      req.user = {
        id: 'user-7',
        sub: 'user-7',
        email: 'user7@example.com',
        roles: [],
        fundIds: [99],
        ip: '127.0.0.1',
        userAgent: 'vitest',
      };
      next();
    });
    const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
    registerFundConfigRoutes(restrictedApp);

    const res = await request(restrictedApp).get('/api/funds/1/results');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: 'Forbidden',
      code: 'FUND_ACCESS_DENIED',
      message: 'You do not have access to fund 1',
    });
    expect(getResultsSpy).not.toHaveBeenCalled();
  });

  it('returns 500 when service throws', async () => {
    const { fundResultsReadService } =
      await import('../../../server/services/fund-results-read-service');
    vi.mocked(fundResultsReadService.getResults).mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/api/funds/1/results');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  // ── Structural assertions ──

  it('response includes fund identity block', async () => {
    const res = await request(app).get('/api/funds/1/results');

    expect(res.body).toHaveProperty('fundId', 1);
    expect(res.body.fund).toHaveProperty('name');
    expect(res.body.fund).toHaveProperty('vintageYear');
    expect(res.body.fund).toHaveProperty('size');
  });

  it('response includes lifecycle block', async () => {
    const res = await request(app).get('/api/funds/1/results');

    expect(res.body).toHaveProperty('lifecycle');
    expect(res.body.lifecycle).toHaveProperty('configState');
    expect(res.body.lifecycle).toHaveProperty('calculationState');
  });

  it('response includes lifecycle evidence fields for results provenance', async () => {
    const res = await request(app).get('/api/funds/1/results');

    expect(res.status).toBe(200);
    expect(res.body.lifecycle.configState).toHaveProperty('publishedVersion', 1);
    expect(res.body.lifecycle.calculationState).toHaveProperty('configVersion', 1);
    expect(res.body.lifecycle.calculationState).toHaveProperty('runId', 10);
    expect(res.body.lifecycle.calculationState).toHaveProperty('status', 'ready');
    expect(res.body.lifecycle.calculationState).toHaveProperty(
      'lastCalculatedAt',
      '2026-03-20T12:30:00.000Z'
    );

    const { FundResultsReadV1Schema } = await import('@shared/contracts/fund-results-v1.contract');
    const parsed = FundResultsReadV1Schema.parse(res.body);
    expect(parsed.lifecycle.configState.publishedVersion).toBe(1);
    expect(parsed.lifecycle.calculationState.configVersion).toBe(1);
    expect(parsed.lifecycle.calculationState.runId).toBe(10);
    expect(parsed.lifecycle.calculationState.status).toBe('ready');
    expect(parsed.lifecycle.calculationState.lastCalculatedAt).toBe('2026-03-20T12:30:00.000Z');
  });

  it('available section includes legacyEvidence flag', async () => {
    const res = await request(app).get('/api/funds/1/results');

    expect(res.body.sections.reserve).toHaveProperty('legacyEvidence');
    expect(typeof res.body.sections.reserve.legacyEvidence).toBe('boolean');
  });
});

// ── Fixtures ──

function validReadyResponse() {
  return {
    status: 'ready' as const,
    fundId: 1,
    fund: { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 },
    lifecycle: {
      fundId: 1,
      configState: {
        latestVersion: 1,
        draftVersion: null,
        publishedVersion: 1,
        hasDraft: false,
        hasPublished: true,
        publishedAt: '2026-03-20T12:00:00.000Z',
        draftUpdatedAt: null,
        publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
      },
      calculationState: {
        status: 'ready',
        configVersion: 1,
        runId: 10,
        correlationId: 'test-corr-id',
        dispatchState: 'dispatched',
        availableSnapshotTypes: ['RESERVE', 'PACING'],
        expectedSnapshotTypes: ['RESERVE', 'PACING'],
        lastCalculatedAt: '2026-03-20T12:30:00.000Z',
        lastError: null,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent: false },
    },
    sections: {
      reserve: {
        status: 'available' as const,
        calculatedAt: '2026-03-20T12:30:00.000Z',
        source: 'fund_snapshots' as const,
        legacyEvidence: false,
        payload: {
          totalAllocation: 40_000_000,
          reserveRatio: 0.4,
          avgConfidence: 0.85,
          allocations: [{ allocation: 40_000_000, confidence: 0.85, rationale: 'Follow-on' }],
        },
      },
      pacing: {
        status: 'available' as const,
        calculatedAt: '2026-03-20T12:30:00.000Z',
        source: 'fund_snapshots' as const,
        legacyEvidence: false,
        payload: {
          deploymentRate: 5_000_000,
          yearsToFullDeploy: 5,
          totalQuarters: 20,
          marketCondition: 'neutral',
          deployments: [],
        },
      },
      scorecard: { status: 'unavailable' as const, reason: 'No authoritative source' },
      scenarios: { status: 'unavailable' as const, reason: 'No authoritative source' },
      waterfall: { status: 'unavailable' as const, reason: 'No authoritative source' },
      economics: {
        status: 'unavailable' as const,
        reason: 'GP economics is disabled',
        reasonCode: 'ECONOMICS_DISABLED' as const,
      },
    },
  };
}

function validTrackAResponse() {
  return {
    ...validReadyResponse(),
    sections: {
      ...validReadyResponse().sections,
      scorecard: {
        status: 'available' as const,
        payload: {
          fundName: { value: 'Test Fund', source: 'funds' as const },
          fundSize: { value: 100_000_000, source: 'funds' as const },
          vintageYear: { value: 2024, source: 'funds' as const },
          reserveRatio: { value: 0.4, source: 'fund_snapshots' as const },
          avgConfidence: { value: 0.85, source: 'fund_snapshots' as const },
          yearsToFullDeploy: { value: 5, source: 'fund_snapshots' as const },
          lastCalculatedAt: { value: '2026-03-20T12:30:00.000Z', source: 'fund_state' as const },
        },
      },
      waterfall: {
        status: 'available' as const,
        source: 'fund_config' as const,
        configVersion: 1,
        publishedAt: '2026-03-20T12:00:00.000Z',
        payload: {
          view: 'setup-summary' as const,
          type: 'american' as const,
          tierCount: 1,
          tiers: [
            {
              name: 'Tier 1',
              preferredReturn: 0.08,
              catchUp: null,
              gpSplit: 20,
              lpSplit: 80,
              condition: 'irr' as const,
              conditionValue: 0.08,
            },
          ],
          recyclingEnabled: true,
          recyclingType: 'both' as const,
          recyclingCap: 25,
          recyclingPeriod: 24,
          exitRecyclingRate: 0.5,
          mgmtFeeRecyclingRate: 0.25,
          allowFutureRecycling: false,
        },
      },
    },
  };
}
