import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from '../../server/routes';

describe('core summary routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '1mb' }));
    await registerRoutes(app);
  });

  it('serves the extracted legacy fund metrics route', async () => {
    const response = await request(app).get('/api/fund-metrics/1').expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('serves the extracted reserve summary route', async () => {
    const response = await request(app).get('/api/reserves/1').expect(200);

    expect(response.body).toHaveProperty('fundId', 1);
    expect(response.body).toHaveProperty('allocations');
    expect(Array.isArray(response.body.allocations)).toBe(true);
  });

  it('serves the extracted pacing summary route', async () => {
    const response = await request(app).get('/api/pacing/summary').expect(200);

    expect(response.body).toHaveProperty('fundSize');
    expect(response.body).toHaveProperty('deployments');
    expect(Array.isArray(response.body.deployments)).toBe(true);
  });

  it('serves the extracted cohort summary route', async () => {
    const response = await request(app).get('/api/cohorts/analysis').expect(200);

    expect(response.body).toHaveProperty('cohortId');
    expect(response.body).toHaveProperty('companies');
    expect(Array.isArray(response.body.companies)).toBe(true);
  });
});
