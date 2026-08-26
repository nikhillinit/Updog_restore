import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';

import { validateRequest } from '../../../server/middleware/validation';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.get(
    '/funds/:fundId/things',
    validateRequest({
      params: z.object({ fundId: z.string().regex(/^\d+$/) }),
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
    }),
    (req, res) => {
      res.status(200).json({ params: req.params, query: req.query });
    }
  );
  return app;
}

describe('validateRequest query handling (Express 5 getter-only req.query)', () => {
  it('does not 500 and exposes the validated query to the handler', async () => {
    const res = await request(makeApp()).get('/funds/7/things?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.query).toMatchObject({ limit: 5 });
    expect(res.body.params).toMatchObject({ fundId: '7' });
  });

  it('applies query schema defaults to the validated query', async () => {
    const res = await request(makeApp()).get('/funds/7/things');
    expect(res.status).toBe(200);
    expect(res.body.query).toMatchObject({ limit: 20 });
  });

  it('returns 400 when query validation fails', async () => {
    const res = await request(makeApp()).get('/funds/7/things?limit=999');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation error' });
  });
});
