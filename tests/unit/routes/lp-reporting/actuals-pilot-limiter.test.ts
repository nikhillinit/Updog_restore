import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { actualsPilotLimiter } from '../../../../server/routes/lp-reporting/imports';

describe('actualsPilotLimiter', () => {
  it('limits each user to 20 requests per hour with standard headers and Retry-After', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.user = {
        id: req.get('X-Test-User') ?? 'phase5a-user-a',
        sub: req.get('X-Test-User') ?? 'phase5a-user-a',
        email: 'pilot@example.com',
        role: 'admin',
        roles: ['admin'],
        ip: '127.0.0.1',
        userAgent: 'vitest',
        fundIds: [1],
      };
      next();
    });
    app.use(actualsPilotLimiter);
    app.get('/actuals', (_req, res) => res.json({ ok: true }));

    for (let index = 0; index < 20; index += 1) {
      const response = await request(app).get('/actuals');
      expect(response.status).toBe(200);
      expect(response.headers['ratelimit-limit']).toBe('20');
    }

    const otherUser = await request(app)
      .get('/actuals')
      .set('X-Test-User', 'phase5a-user-b');
    expect(otherUser.status).toBe(200);

    const limited = await request(app).get('/actuals');
    expect(limited.status).toBe(429);
    expect(limited.headers['ratelimit-limit']).toBe('20');
    expect(limited.headers['ratelimit-remaining']).toBe('0');
    expect(limited.headers['ratelimit-reset']).toBeDefined();
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    expect(limited.body).toEqual({
      error: 'Too Many Requests',
      code: 'RATE_LIMITED',
      retryAfter: Number(limited.headers['retry-after']),
    });
  });
});
