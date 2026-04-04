import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { FundResultsComparisonV1Schema } from '@shared/contracts/fund-results-comparison-v1.contract';
import { createInProcessRouteHarness } from './in-process-route-harness';

vi.mock('../../server/services/fund-results-comparison-service', () => ({
  fundResultsComparisonService: {
    getComparison: vi.fn(),
  },
}));

function noPublishedVersionResponse() {
  return {
    fundId: 42,
    comparisonStatus: 'no_published_version' as const,
    currentVersion: null,
    previousVersion: null,
    metricDeltas: [],
  };
}

function noPreviousVersionResponse() {
  return {
    fundId: 42,
    comparisonStatus: 'no_previous_version' as const,
    currentVersion: {
      version: 3,
      publishedAt: '2026-03-29T12:00:00.000Z',
      calcRun: {
        runId: 90,
        status: 'ready' as const,
        dispatchState: 'dispatched' as const,
        lastCalculatedAt: '2026-03-29T12:30:00.000Z',
        correlationId: 'corr-90',
      },
      metrics: {
        fundSize: 120000000,
        reserveRatio: 0.5,
        avgConfidence: 0.62,
        yearsToFullDeploy: 3,
      },
    },
    previousVersion: null,
    metricDeltas: [],
  };
}

function comparableResponse() {
  return {
    fundId: 42,
    comparisonStatus: 'comparable' as const,
    currentVersion: {
      version: 4,
      publishedAt: '2026-03-29T12:00:00.000Z',
      calcRun: {
        runId: 91,
        status: 'ready' as const,
        dispatchState: 'dispatched' as const,
        lastCalculatedAt: '2026-03-29T12:30:00.000Z',
        correlationId: 'corr-91',
      },
      metrics: {
        fundSize: 125000000,
        reserveRatio: 0.5,
        avgConfidence: 0.7,
        yearsToFullDeploy: 4,
      },
    },
    previousVersion: {
      version: 3,
      publishedAt: '2026-03-20T10:00:00.000Z',
      calcRun: {
        runId: 81,
        status: 'calculating' as const,
        dispatchState: 'partial' as const,
        lastCalculatedAt: null,
        correlationId: 'corr-81',
      },
      metrics: {
        fundSize: 100000000,
        reserveRatio: 0.4,
        avgConfidence: 0.55,
        yearsToFullDeploy: 3,
      },
    },
    metricDeltas: [
      {
        metric: 'fundSize' as const,
        displayName: 'Fund Size',
        currentValue: 125000000,
        previousValue: 100000000,
        absoluteDelta: 25000000,
        percentageDelta: 25,
        driftCapable: true,
        driftReason: 'stable' as const,
      },
    ],
  };
}

describe('fund results comparison route integration', () => {
  let app: Awaited<ReturnType<typeof createInProcessRouteHarness>>['app'];
  let cleanup: Awaited<ReturnType<typeof createInProcessRouteHarness>>['cleanup'];

  beforeAll(async () => {
    const harness = await createInProcessRouteHarness();
    app = harness.app;
    cleanup = harness.cleanup;
  });

  beforeEach(async () => {
    const { fundResultsComparisonService } =
      await import('../../server/services/fund-results-comparison-service');
    vi.mocked(fundResultsComparisonService.getComparison).mockResolvedValue(
      noPublishedVersionResponse()
    );
  });

  afterAll(async () => {
    await cleanup();
  });

  it('mounts the comparison route in the full runtime and serves the expected contract', async () => {
    const response = await request(app).get('/api/funds/42/results-comparison').expect(200);

    expect(FundResultsComparisonV1Schema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({
      fundId: 42,
      comparisonStatus: 'no_published_version',
      currentVersion: null,
      previousVersion: null,
      metricDeltas: [],
    });
  });

  it('preserves no_previous_version behavior in the full runtime', async () => {
    const { fundResultsComparisonService } =
      await import('../../server/services/fund-results-comparison-service');
    vi.mocked(fundResultsComparisonService.getComparison).mockResolvedValue(
      noPreviousVersionResponse()
    );

    const response = await request(app).get('/api/funds/42/results-comparison').expect(200);

    expect(FundResultsComparisonV1Schema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({
      fundId: 42,
      comparisonStatus: 'no_previous_version',
      previousVersion: null,
      metricDeltas: [],
    });
  });

  it('preserves comparable behavior in the full runtime without widening the response shape', async () => {
    const { fundResultsComparisonService } =
      await import('../../server/services/fund-results-comparison-service');
    vi.mocked(fundResultsComparisonService.getComparison).mockResolvedValue(comparableResponse());

    const response = await request(app).get('/api/funds/42/results-comparison').expect(200);

    expect(FundResultsComparisonV1Schema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({
      fundId: 42,
      comparisonStatus: 'comparable',
      currentVersion: {
        version: 4,
      },
      previousVersion: {
        version: 3,
      },
      metricDeltas: [
        expect.objectContaining({
          metric: 'fundSize',
          displayName: 'Fund Size',
          absoluteDelta: 25000000,
        }),
      ],
    });
    expect(Object.keys(response.body).sort()).toEqual(
      ['comparisonStatus', 'currentVersion', 'fundId', 'metricDeltas', 'previousVersion'].sort()
    );
  });

  it('preserves not-found behavior in the full runtime', async () => {
    const { fundResultsComparisonService } =
      await import('../../server/services/fund-results-comparison-service');
    vi.mocked(fundResultsComparisonService.getComparison).mockResolvedValue(null);

    const response = await request(app).get('/api/funds/999/results-comparison').expect(404);

    expect(response.body).toHaveProperty('error', 'Fund not found');
  });
});
