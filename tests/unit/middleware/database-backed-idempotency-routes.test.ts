import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { isDatabaseBackedIdempotencyRoute } from '../../../server/lib/database-backed-idempotency-routes';
import { clearIdempotencyCache, idempotency } from '../../../server/middleware/idempotency';

describe('database-backed idempotency route classification', () => {
  it.each([
    ['POST', '/api/funds/1/internal-economics/runs'],
    ['POST', '/api/funds/not-a-number/internal-economics/runs'],
  ])('matches %s %s', (method, path) => {
    expect(isDatabaseBackedIdempotencyRoute(method, path)).toBe(true);
  });

  it.each([
    ['GET', '/api/funds/1/internal-economics/runs'],
    ['PUT', '/api/funds/1/internal-economics/runs'],
    ['post', '/api/funds/1/internal-economics/runs'],
    ['POST', '/api/funds/internal-economics/runs'],
    ['POST', '/api/funds/1/internal-economics'],
    ['POST', '/api/funds/1/internal-economics/runs/'],
    ['POST', '/api/funds/1/internal-economics/runs/extra'],
    ['POST', '/api/funds/1/internal-economics/run'],
    ['POST', '/api/funds/1/internal-economics/runs-near'],
    ['POST', '/api/funds/1/internal-economics/runs?mode=create'],
    ['POST', '/prefix/api/funds/1/internal-economics/runs'],
  ])('does not match %s %s', (method, path) => {
    expect(isDatabaseBackedIdempotencyRoute(method, path)).toBe(false);
  });
});

describe('generic idempotency cache bypass', () => {
  beforeEach(() => {
    clearIdempotencyCache();
  });

  it('leaves the database-backed run command to its canonical handler', async () => {
    const app = express();
    let calls = 0;

    app.use(express.json());
    app.use(idempotency());
    app.post('/api/funds/:fundId/internal-economics/runs', (_req, res) => {
      calls += 1;
      res.status(201).json({ calls });
    });

    const first = await request(app)
      .post('/api/funds/invalid/internal-economics/runs')
      .set('Idempotency-Key', 'database-backed-command')
      .send({ input: 1 });
    const second = await request(app)
      .post('/api/funds/invalid/internal-economics/runs')
      .set('Idempotency-Key', 'database-backed-command')
      .send({ input: 1 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotency-replay']).toBeUndefined();
    expect(calls).toBe(2);
  });

  it('retains generic cache behavior for a near-match route', async () => {
    const app = express();
    let calls = 0;

    app.use(express.json());
    app.use(idempotency());
    app.post('/api/funds/:fundId/internal-economics/runs-near', (_req, res) => {
      calls += 1;
      res.status(201).json({ calls });
    });

    const first = await request(app)
      .post('/api/funds/1/internal-economics/runs-near')
      .set('Idempotency-Key', 'generic-near-match')
      .send({ input: 1 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await request(app)
      .post('/api/funds/1/internal-economics/runs-near')
      .set('Idempotency-Key', 'generic-near-match')
      .send({ input: 1 });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotency-replay']).toBe('true');
    expect(calls).toBe(1);
  });
});
