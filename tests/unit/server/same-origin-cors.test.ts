import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeApp } from '../../../server/app';
import { createPreAuthCsrfToken } from '../../../server/lib/auth/csrf';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, cookieHeader } from '../../helpers/browser-auth';
import { databaseMock } from '../../helpers/database-mock';

// CORS and CSRF remain real; this suite does not need external Redis storage.
vi.mock('../../../server/lib/rateLimitStore', () => ({
  createRateLimitStore: async () => undefined,
}));

const HOST = 'updog-stage.example.test';
const ORIGIN = 'https://updog-stage.example.test';

describe('makeApp same-origin CORS', () => {
  beforeEach(() => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://canonical.example.test');
    vi.stubEnv('SESSION_SECRET', 'same-origin-cors-session-secret-at-least-32-chars');
    databaseMock.reset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('accepts its exact request origin in production without an allowlist entry', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENABLE_QUEUES', '0');
    vi.stubEnv('ENABLE_IN_PROCESS_QUEUE_WORKERS', '0');
    const response = await request(makeApp())
      .get('/healthz')
      .set('Host', HOST)
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
  });

  it('lets a staged same-origin login reach schema validation with valid CSRF', async () => {
    const token = createPreAuthCsrfToken();
    const response = await request(makeApp())
      .post('/api/auth/login')
      .set('Host', HOST)
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', ORIGIN)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Cookie', cookieHeader({ name: CSRF_COOKIE_NAME, value: token }))
      .set(CSRF_HEADER_NAME, token)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('still rejects same-origin login without CSRF', async () => {
    const response = await request(makeApp())
      .post('/api/auth/login')
      .set('Host', HOST)
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', ORIGIN)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'csrf_validation_failed' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it.each([
    'https://foreign.example.test',
    'https://updog-stage.example.test.evil.test',
    'http://updog-stage.example.test',
    'https://updog-stage.example.test:444',
    'null',
  ])('denies %s before route execution or response disclosure', async (origin) => {
    const response = await request(makeApp())
      .post('/api/auth/login')
      .set('Host', HOST)
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-Host', new URL(origin === 'null' ? 'https://foreign.test' : origin).host)
      .set('Origin', origin)
      .send({});

    expect(response.status).toBe(403);
    expect(response.text).toBe('Forbidden');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(databaseMock.getCallHistory()).toEqual([]);
    expect(response.body).not.toHaveProperty('user');
  });

  it('preserves explicitly allowed cross-origin CORS preflight', async () => {
    const response = await request(makeApp())
      .options('/api/auth/login')
      .set('Host', HOST)
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://canonical.example.test')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://canonical.example.test');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
