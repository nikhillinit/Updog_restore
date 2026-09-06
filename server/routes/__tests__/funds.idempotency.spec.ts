import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearIdempotencyCache, idempotency } from '../../middleware/idempotency';

const app = express();
app.use(express.json());
app.use(idempotency());
app.post('/api/test', (_req: Request, res: Response) => {
  res.json({ id: 'test-fund', timestamp: Date.now() });
});
describe('API Idempotency Contract', () => {
  beforeEach(() => {
    clearIdempotencyCache();
  });

  it('returns 422 when one key is reused with a different request payload', async () => {
    const idempotencyKey = 'different-payload';

    const firstResponse = await request(app)
      .post('/api/test')
      .set('Idempotency-Key', idempotencyKey)
      .send({ data: 'first request' });
    const secondResponse = await request(app)
      .post('/api/test')
      .set('Idempotency-Key', idempotencyKey)
      .send({ data: 'second request' });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(422);
    expect(secondResponse.body).toEqual({
      error: 'idempotency_key_reused',
      message: 'Idempotency key used with different request payload',
    });
  });

  it('returns the cached response when key and payload match', async () => {
    const idempotencyKey = 'same-payload';
    const requestBody = { data: 'identical request' };

    const firstResponse = await request(app)
      .post('/api/test')
      .set('Idempotency-Key', idempotencyKey)
      .send(requestBody);
    const secondResponse = await request(app)
      .post('/api/test')
      .set('Idempotency-Key', idempotencyKey)
      .send(requestBody);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers['idempotency-replay']).toBe('true');
    expect(secondResponse.body).toEqual(firstResponse.body);
  });

  it('processes requests without an idempotency key', async () => {
    const response = await request(app).post('/api/test').send({ data: 'no key request' });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('test-fund');
  });
});
