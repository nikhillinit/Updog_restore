import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from '../../server/routes';
import { storage } from '../../server/storage';

describe('dashboard summary route', () => {
  let app: express.Express;
  let fundId: number;

  beforeAll(async () => {
    const fund = await storage.createFund({
      name: `Dashboard Summary Route Fund ${Date.now()}`,
      size: '10000000',
      managementFee: '0.0200',
      carryPercentage: '0.2000',
      vintageYear: 2026,
    });
    fundId = fund.id;

    app = express();
    app.use(express.json({ limit: '1mb' }));
    await registerRoutes(app);
  });

  it('serves the extracted dashboard summary read model', async () => {
    const response = await request(app).get(`/api/dashboard-summary/${fundId}`).expect(200);

    expect(response.body).toHaveProperty('fund.id', fundId);
    expect(response.body).toHaveProperty('portfolioCompanies');
    expect(response.body).toHaveProperty('recentActivities');
    expect(response.body).toHaveProperty('summary.totalCompanies');
    expect(response.body.summary.totalCompanies).toBeGreaterThanOrEqual(0);
  });

  it('preserves the invalid-number contract for fund id parsing', async () => {
    const response = await request(app).get('/api/dashboard-summary/abc').expect(400);

    expect(response.body).toMatchObject({
      error: 'Invalid fund ID',
      message: 'fund ID must be a finite number',
    });
  });
});
