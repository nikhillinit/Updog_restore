import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';

let makeApp: typeof import('../../../server/app').makeApp;
let storage: typeof import('../../../server/storage').storage;
let verifyAccessTokenAsync: typeof import('../../../server/lib/auth/jwt').verifyAccessTokenAsync;
let app: Express;

const TEST_USERNAME = 'analyst';
const TEST_PASSWORD = 'analyst-dev-2026';

const mockUser = () => ({
  id: 3,
  username: TEST_USERNAME,
  password: bcrypt.hashSync(TEST_PASSWORD, 8),
});

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    makeApp = (await import('../../../server/app')).makeApp;
    ({ storage } = await import('../../../server/storage'));
    ({ verifyAccessTokenAsync } = await import('../../../server/lib/auth/jwt'));
    app = makeApp();
  });

  it('is reachable without a token (public path; 401 from handler, not the /api guard)', async () => {
    vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'x' });
    expect(res.status).not.toBe(415);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
  });

  it('unknown user -> 401 invalid_credentials', async () => {
    vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
  });

  it('bad password -> 401 (no enumeration difference vs unknown user)', async () => {
    vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(mockUser());
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_USERNAME, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
  });

  it('malformed body -> 400 invalid_request', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: '' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_request' });
  });

  it('good creds -> 200 with a verifiable admin token (fundIds [], 7d expiry)', async () => {
    vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(mockUser());
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    const claims = await verifyAccessTokenAsync(res.body.token);
    expect(claims.sub).toBe('3');
    expect(claims.email).toBe(TEST_USERNAME);
    expect(claims.role).toBe('admin');
    expect(claims.fundIds).toEqual([]);
    expect(claims.exp).toBeDefined();
    expect(claims.iat).toBeDefined();
    if (claims.exp && claims.iat) {
      expect(claims.exp - claims.iat).toBe(7 * 24 * 60 * 60);
    }
  });
});
