import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from '../../server/routes';

// /health/detailed requires X-Health-Key or bearer auth since PR #801.
const HEALTH_KEY = 'storage-health-mode-secret-32-chars-min';

describe('storage health mode exposure', () => {
  let app: express.Express;
  let previousHealthKey: string | undefined;

  beforeAll(async () => {
    previousHealthKey = process.env['HEALTH_KEY'];
    process.env['HEALTH_KEY'] = HEALTH_KEY;
    app = express();
    app.use(express.json({ limit: '1mb' }));
    await registerRoutes(app);
  });

  afterAll(() => {
    if (previousHealthKey === undefined) {
      delete process.env['HEALTH_KEY'];
    } else {
      process.env['HEALTH_KEY'] = previousHealthKey;
    }
  });

  it('surfaces storage mode through readiness checks', async () => {
    const response = await request(app).get('/readyz').expect(200);

    expect(response.body).toHaveProperty('checks.storage');
    expect(['memory', 'database']).toContain(response.body.checks.storage);
    expect(response.body).toHaveProperty('storage.kind', response.body.checks.storage);
    expect(response.body).toHaveProperty('storage.capabilities.investmentScenarioWrites', false);
  });

  it('surfaces storage runtime details in detailed health output', async () => {
    const response = await request(app)
      .get('/health/detailed')
      .set('X-Health-Key', HEALTH_KEY)
      .expect(200);

    expect(response.body).toHaveProperty('storage.kind');
    expect(response.body).toHaveProperty('metrics.mockDatabase');
  });
});
