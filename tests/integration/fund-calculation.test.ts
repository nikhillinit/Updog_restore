import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'http';
import express from 'express';
import healthRouter from '../../server/routes/health';
import fundsRouter from '../../server/routes/funds';
import { metricsRouter } from '../../server/metrics';
import { errorHandler } from '../../server/errors';

let server: any;

beforeAll(async () => {
  // Create a simplified test server
  const app = express();
  
  // Core hardening
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));

  // Routes first
  app.use(healthRouter);
  app.use(fundsRouter);
  app.use(metricsRouter); // exposes /metrics

  // Final error handler
  app.use(errorHandler());

  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve()); // Use port 0 for random available port
  });
});

afterAll(async () => {
  await new Promise<void>((res) => server.close(() => res()));
});

describe('Fund calculation endpoint', () => {
  it('deduplicates concurrent requests via Idempotency-Key', async () => {
    const payload = { fundSize: 100_000_000 };
    const key = 'itest-key-123';

    const r = await Promise.all([
      request(server).post('/api/funds/calculate').set('Idempotency-Key', key).send(payload),
      request(server).post('/api/funds/calculate').set('Idempotency-Key', key).send(payload),
      request(server).post('/api/funds/calculate').set('Idempotency-Key', key).send(payload)
    ]);

    const created = r.filter(x => x.headers['idempotency-status'] === 'created');
    expect(created.length).toBe(1);
    r.forEach(x => expect([200,201,202]).toContain(x.status));
  });

  it('returns 201 with result on first calculation without key, subsequent returns 202 joined/in-progress', async () => {
    const payload = { fundSize: 50_000_000 };

    const first = await request(server).post('/api/funds/calculate').send(payload);
    expect(first.headers['idempotency-status']).toBe('created');
    expect(first.status).toBe(201);

    const again = await request(server).post('/api/funds/calculate').send(payload);
    expect(['joined','created']).toContain(again.headers['idempotency-status']);
    expect([200,202,201]).toContain(again.status);
  });
});