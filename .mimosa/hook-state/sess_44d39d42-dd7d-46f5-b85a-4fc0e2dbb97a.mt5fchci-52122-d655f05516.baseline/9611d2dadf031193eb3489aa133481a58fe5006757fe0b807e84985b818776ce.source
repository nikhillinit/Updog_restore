/**
 * Contract + route tests for GET /api/funds/:id/results-comparison
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  FundResultsComparisonV1Schema,
  PublishedVersionSummarySchema,
  MetricDeltaSchema,
} from '@shared/contracts/fund-results-comparison-v1.contract';
import type { FundResultsComparisonV1 } from '@shared/contracts/fund-results-comparison-v1.contract';

vi.mock('../../../server/services/fund-results-comparison-service', () => ({
  fundResultsComparisonService: {
    getComparison: vi.fn(),
  },
}));

let app: express.Express;

function validComparisonResponse(): FundResultsComparisonV1 {
  return {
    fundId: 1,
    comparisonStatus: 'comparable',
    currentVersion: {
      version: 4,
      publishedAt: '2026-03-29T12:00:00.000Z',
      calcRun: {
        runId: 91,
        status: 'ready',
        dispatchState: 'dispatched',
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
        status: 'calculating',
        dispatchState: 'partial',
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
        metric: 'fundSize',
        displayName: 'Fund Size',
        currentValue: 125000000,
        previousValue: 100000000,
        absoluteDelta: 25000000,
        percentageDelta: 25,
        driftCapable: true,
        driftReason: 'stable',
      },
    ],
  };
}

beforeAll(async () => {
  app = express();
  app.use(express.json());

  const { registerFundConfigRoutes } = await import('../../../server/routes/fund-config');
  registerFundConfigRoutes(app);
});

beforeEach(async () => {
  const { fundResultsComparisonService } = await import(
    '../../../server/services/fund-results-comparison-service'
  );
  vi.mocked(fundResultsComparisonService.getComparison).mockResolvedValue(validComparisonResponse());
});

describe('FundResultsComparisonV1 schemas', () => {
  it('parses a valid published version summary', () => {
    const parsed = PublishedVersionSummarySchema.safeParse(validComparisonResponse().currentVersion);
    expect(parsed.success).toBe(true);
  });

  it('parses a valid metric delta', () => {
    const parsed = MetricDeltaSchema.safeParse(validComparisonResponse().metricDeltas[0]);
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid response with unknown top-level fields', () => {
    const parsed = FundResultsComparisonV1Schema.safeParse({
      ...validComparisonResponse(),
      extra: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('GET /api/funds/:id/results-comparison', () => {
  it('returns 200 with valid FundResultsComparisonV1 shape', async () => {
    const res = await request(app).get('/api/funds/1/results-comparison');

    expect(res.status).toBe(200);
    expect(FundResultsComparisonV1Schema.safeParse(res.body).success).toBe(true);
  });

  it('returns no_published_version payload when comparison is unavailable', async () => {
    const { fundResultsComparisonService } = await import(
      '../../../server/services/fund-results-comparison-service'
    );
    vi.mocked(fundResultsComparisonService.getComparison).mockResolvedValue({
      fundId: 1,
      comparisonStatus: 'no_published_version',
      currentVersion: null,
      previousVersion: null,
      metricDeltas: [],
    });

    const res = await request(app).get('/api/funds/1/results-comparison');

    expect(res.status).toBe(200);
    expect(res.body.comparisonStatus).toBe('no_published_version');
    expect(res.body.currentVersion).toBeNull();
  });

  it('returns no_previous_version payload when only one published version exists', async () => {
    const { fundResultsComparisonService } = await import(
      '../../../server/services/fund-results-comparison-service'
    );
    vi.mocked(fundResultsComparisonService.getComparison).mockResolvedValue({
      fundId: 1,
      comparisonStatus: 'no_previous_version',
      currentVersion: validComparisonResponse().currentVersion,
      previousVersion: null,
      metricDeltas: [],
    });

    const res = await request(app).get('/api/funds/1/results-comparison');

    expect(res.status).toBe(200);
    expect(res.body.comparisonStatus).toBe('no_previous_version');
    expect(res.body.previousVersion).toBeNull();
  });

  it('returns 400 for invalid fund ID', async () => {
    const res = await request(app).get('/api/funds/abc/results-comparison');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid fund ID');
  });

  it('returns 404 for unknown fund', async () => {
    const { fundResultsComparisonService } = await import(
      '../../../server/services/fund-results-comparison-service'
    );
    vi.mocked(fundResultsComparisonService.getComparison).mockResolvedValue(null);

    const res = await request(app).get('/api/funds/999/results-comparison');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Fund not found');
  });

  it('returns 500 when the comparison service throws', async () => {
    const { fundResultsComparisonService } = await import(
      '../../../server/services/fund-results-comparison-service'
    );
    vi.mocked(fundResultsComparisonService.getComparison).mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/api/funds/1/results-comparison');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Failed to read results comparison');
  });
});
