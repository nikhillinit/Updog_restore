import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from '../../server/routes';

describe('storage health mode exposure', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '1mb' }));
    await registerRoutes(app);
  });

  it('surfaces storage mode through readiness checks', async () => {
    const response = await request(app).get('/readyz').expect(200);

    expect(response.body).toHaveProperty('checks.storage');
    expect(['memory', 'database']).toContain(response.body.checks.storage);
    expect(response.body).toHaveProperty('storage.kind', response.body.checks.storage);
    expect(response.body).toHaveProperty('storage.capabilities.investmentScenarioWrites', false);
  });

  it('surfaces storage runtime details in detailed health output', async () => {
    const response = await request(app).get('/health/detailed').expect(200);

    expect(response.body).toHaveProperty('storage.kind');
    expect(response.body).toHaveProperty('metrics.mockDatabase');
  });
});
