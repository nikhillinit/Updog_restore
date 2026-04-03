import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { FundResultsComparisonV1Schema } from '@shared/contracts/fund-results-comparison-v1.contract';

vi.mock('../../server/services/fund-results-comparison-service', () => ({
  fundResultsComparisonService: {
    getComparison: vi.fn(),
  },
}));

describe('fund results comparison route integration', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '1mb' }));
    const { registerRoutes } = await import('../../server/routes');
    await registerRoutes(app);
  });

  beforeEach(async () => {
    const { fundResultsComparisonService } =
      await import('../../server/services/fund-results-comparison-service');
    vi.mocked(fundResultsComparisonService.getComparison).mockResolvedValue({
      fundId: 42,
      comparisonStatus: 'no_published_version',
      currentVersion: null,
      previousVersion: null,
      metricDeltas: [],
    });
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

  it('preserves not-found behavior in the full runtime', async () => {
    const { fundResultsComparisonService } =
      await import('../../server/services/fund-results-comparison-service');
    vi.mocked(fundResultsComparisonService.getComparison).mockResolvedValue(null);

    const response = await request(app).get('/api/funds/999/results-comparison').expect(404);

    expect(response.body).toHaveProperty('error', 'Fund not found');
  });
});
