import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from '../../server/routes';

describe('dashboard summary route', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '1mb' }));
    await registerRoutes(app);
  });

  it('serves the extracted dashboard summary read model', async () => {
    const response = await request(app).get('/api/dashboard-summary/1').expect(200);

    expect(response.body).toHaveProperty('fund.id', 1);
    expect(response.body).toHaveProperty('portfolioCompanies');
    expect(response.body).toHaveProperty('recentActivities');
    expect(response.body).toHaveProperty('summary.totalCompanies');
    expect(response.body.summary.totalCompanies).toBeGreaterThanOrEqual(0);
  });
});
