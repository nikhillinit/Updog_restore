import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from '../../server/routes';

describe('investment scenario capability routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '1mb' }));
    await registerRoutes(app);
  });

  it('returns explicit 501 for unsupported investment round writes', async () => {
    const response = await request(app)
      .post('/api/investments/1/rounds')
      .send({ name: 'Series A', amount: 1000000 })
      .expect(501);

    expect(response.body).toMatchObject({
      error: 'Storage operation is not supported for this route',
      code: 'UNSUPPORTED_STORAGE_OPERATION',
    });
  });

  it('returns explicit 501 for unsupported performance case writes', async () => {
    const response = await request(app)
      .post('/api/investments/1/cases')
      .send({ name: 'Base Case', probability: 0.5 })
      .expect(501);

    expect(response.body).toMatchObject({
      error: 'Storage operation is not supported for this route',
      code: 'UNSUPPORTED_STORAGE_OPERATION',
    });
  });
});
