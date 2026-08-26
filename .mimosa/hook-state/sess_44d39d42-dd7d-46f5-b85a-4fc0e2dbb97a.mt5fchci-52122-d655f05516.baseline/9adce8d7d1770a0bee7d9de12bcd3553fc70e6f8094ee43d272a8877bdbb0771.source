import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Express } from 'express';
import type { User } from '@shared/schema';

import { makeApp } from '../../../server/app';
import { storage } from '../../../server/storage';
import { databaseMock } from '../../helpers/database-mock';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  cookieHeader,
  findSetCookie,
} from '../../helpers/browser-auth';

const app: Express = makeApp();

const TEST_USERNAME = 'analyst';
const TEST_PASSWORD = 'analyst-dev-2026';

const mockUser = (overrides: Partial<User> = {}): User => ({
  id: 3,
  username: TEST_USERNAME,
  password: bcrypt.hashSync(TEST_PASSWORD, 8),
  role: 'analyst',
  isActive: true,
  passwordUpdatedAt: new Date('2026-07-11T00:00:00.000Z'),
  createdAt: new Date('2026-07-11T00:00:00.000Z'),
  updatedAt: new Date('2026-07-11T00:00:00.000Z'),
  ...overrides,
});

function decodeClaims(token: string): JwtPayload {
  const claims = jwt.decode(token);
  if (!claims || typeof claims === 'string') throw new Error('Expected JWT claims');
  return claims;
}

function expectBaseCookieContract(
  cookie: ReturnType<typeof findSetCookie>,
  expected: { httpOnly: boolean; maxAge?: string }
): void {
  expect(cookie.attributes.get('path')).toBe('/');
  expect(cookie.attributes.get('samesite')).toBe('Lax');
  if (expected.maxAge !== undefined) {
    expect(cookie.attributes.get('max-age')).toBe(expected.maxAge);
  }
  expect(cookie.attributes.has('domain')).toBe(false);
  expect(cookie.attributes.has('httponly')).toBe(expected.httpOnly);
}

async function bootstrapCsrf(agent: ReturnType<typeof request.agent>) {
  const response = await agent.get('/api/auth/csrf');
  const cookie = findSetCookie(response, CSRF_COOKIE_NAME);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ csrfToken: cookie.value });
  expectBaseCookieContract(cookie, { httpOnly: false, maxAge: '86400' });
  return cookie.value;
}

function postLogin(
  agent: ReturnType<typeof request.agent>,
  csrfToken: string,
  credentials: { username: string; password: string }
) {
  return agent.post('/api/auth/login').set(CSRF_HEADER_NAME, csrfToken).send(credentials);
}

describe('cookie auth lifecycle', () => {
  beforeEach(() => {
    databaseMock.reset();
    databaseMock.setMockData('revoked_tokens', []);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/auth/csrf is public and issues a readable pre-auth cookie', async () => {
    const response = await request(app).get('/api/auth/csrf');
    const csrfCookie = findSetCookie(response, CSRF_COOKIE_NAME);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ csrfToken: csrfCookie.value });
    expectBaseCookieContract(csrfCookie, { httpOnly: false, maxAge: '86400' });
  });

  it('rejects login without pre-auth CSRF before credential evaluation', async () => {
    const credentials = vi.spyOn(storage, 'getUserByUsername');
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'csrf_validation_failed' });
    expect(credentials).not.toHaveBeenCalled();
  });

  it('rejects a mismatched pre-auth CSRF header', async () => {
    const agent = request.agent(app);
    await bootstrapCsrf(agent);
    const response = await postLogin(agent, 'different-token', {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'csrf_validation_failed' });
  });

  it('keeps invalid-credential responses uniform after valid CSRF', async () => {
    for (const candidate of [
      { stored: undefined, username: 'ghost', password: 'nope' },
      { stored: mockUser(), username: TEST_USERNAME, password: 'wrong' },
      { stored: mockUser({ isActive: false }), username: TEST_USERNAME, password: TEST_PASSWORD },
    ]) {
      vi.spyOn(storage, 'getUserByUsername').mockResolvedValueOnce(candidate.stored);
      const agent = request.agent(app);
      const csrfToken = await bootstrapCsrf(agent);
      const response = await postLogin(agent, csrfToken, {
        username: candidate.username,
        password: candidate.password,
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'invalid_credentials' });
    }
  });

  it('sets a 24-hour HttpOnly browser JWT and bound readable CSRF cookie without returning a token', async () => {
    vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(mockUser());
    vi.spyOn(storage, 'getUserFundGrants').mockResolvedValue([1, 2]);
    databaseMock.setMockData('users', [mockUser()]);
    const agent = request.agent(app);
    const preAuthToken = await bootstrapCsrf(agent);
    const response = await postLogin(agent, preAuthToken, {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: '3', email: TEST_USERNAME, role: 'analyst', fundIds: [1, 2] },
    });
    expect(response.body).not.toHaveProperty('token');
    expect(JSON.stringify(response.body)).not.toContain('eyJ');

    const sessionCookie = findSetCookie(response, SESSION_COOKIE_NAME);
    const csrfCookie = findSetCookie(response, CSRF_COOKIE_NAME);
    expectBaseCookieContract(sessionCookie, { httpOnly: true, maxAge: '86400' });
    expectBaseCookieContract(csrfCookie, { httpOnly: false, maxAge: '86400' });
    expect(csrfCookie.value).not.toBe(preAuthToken);

    const claims = decodeClaims(sessionCookie.value);
    expect(claims).toMatchObject({ sub: '3', role: 'analyst', fundIds: [1, 2] });
    expect(claims.exp).toBeDefined();
    expect(claims.iat).toBeDefined();
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(24 * 60 * 60);
  });

  it('allows reauthentication with the current session-bound CSRF token', async () => {
    vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(mockUser());
    vi.spyOn(storage, 'getUserFundGrants').mockResolvedValue([1, 2]);
    databaseMock.setMockData('users', [mockUser()]);
    const agent = request.agent(app);
    const preAuthToken = await bootstrapCsrf(agent);
    const firstLogin = await postLogin(agent, preAuthToken, {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    const sessionCsrf = findSetCookie(firstLogin, CSRF_COOKIE_NAME).value;

    const secondLogin = await postLogin(agent, sessionCsrf, {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });

    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body).toEqual({
      user: { id: '3', email: TEST_USERNAME, role: 'analyst', fundIds: [1, 2] },
    });
    expect(findSetCookie(secondLogin, CSRF_COOKIE_NAME).value).not.toBe(sessionCsrf);
  });

  it('rejects mixed cookie and Bearer credentials before CSRF source selection', async () => {
    vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(mockUser({ role: 'admin' }));
    databaseMock.setMockData('users', [mockUser({ role: 'admin' })]);
    const agent = request.agent(app);
    const preAuthToken = await bootstrapCsrf(agent);
    const login = await postLogin(agent, preAuthToken, {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    const sessionCsrf = findSetCookie(login, CSRF_COOKIE_NAME).value;

    const response = await agent
      .post('/api/auth/login')
      .set('Authorization', 'Bearer machine-token')
      .set(CSRF_HEADER_NAME, sessionCsrf)
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'ambiguous_credentials' });
  });

  it('keeps generic machine/test token signing at seven days', async () => {
    const { signToken } = await import('../../../server/lib/auth/jwt');
    const claims = decodeClaims(signToken({ sub: 'machine-user' }));
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(7 * 24 * 60 * 60);
  });

  it('GET /api/auth/session returns sanitized no-store identity and restores missing CSRF', async () => {
    vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(mockUser({ role: 'admin' }));
    databaseMock.setMockData('users', [mockUser({ role: 'admin' })]);
    const agent = request.agent(app);
    const preAuthToken = await bootstrapCsrf(agent);
    const login = await postLogin(agent, preAuthToken, {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    const sessionCookie = findSetCookie(login, SESSION_COOKIE_NAME);

    const response = await request(app)
      .get('/api/auth/session')
      .set('Cookie', cookieHeader({ name: SESSION_COOKIE_NAME, value: sessionCookie.value }));

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      user: { id: '3', email: TEST_USERNAME, role: 'admin', fundIds: [] },
    });
    expect(response.body).not.toHaveProperty('token');
    expectBaseCookieContract(findSetCookie(response, CSRF_COOKIE_NAME), {
      httpOnly: false,
      maxAge: '86400',
    });
  });

  it('cookie logout revokes the verified jti, clears both cookies, and blocks reuse', async () => {
    vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(mockUser({ role: 'admin' }));
    databaseMock.setMockData('users', [mockUser({ role: 'admin' })]);
    const agent = request.agent(app);
    const preAuthToken = await bootstrapCsrf(agent);
    const login = await postLogin(agent, preAuthToken, {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    const sessionCookie = findSetCookie(login, SESSION_COOKIE_NAME);
    const csrfCookie = findSetCookie(login, CSRF_COOKIE_NAME);
    const claims = decodeClaims(sessionCookie.value);

    const response = await agent
      .post('/api/auth/logout')
      .set(CSRF_HEADER_NAME, csrfCookie.value)
      .send({});

    expect(response.status).toBe(204);
    expect(databaseMock.getMockData('revoked_tokens')).toEqual([
      expect.objectContaining({ jti: claims.jti, userId: 3, reason: 'logout' }),
    ]);

    const clearedSession = findSetCookie(response, SESSION_COOKIE_NAME);
    const clearedCsrf = findSetCookie(response, CSRF_COOKIE_NAME);
    expect(clearedSession.value).toBe('');
    expect(clearedCsrf.value).toBe('');
    expectBaseCookieContract(clearedSession, { httpOnly: true });
    expectBaseCookieContract(clearedCsrf, { httpOnly: false });

    await request(app)
      .get('/api/auth/session')
      .set('Cookie', cookieHeader({ name: SESSION_COOKIE_NAME, value: sessionCookie.value }))
      .expect(401);
  });

  it('clears browser cookies but does not claim 204 when durable revocation fails', async () => {
    vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(mockUser({ role: 'admin' }));
    databaseMock.setMockData('users', [mockUser({ role: 'admin' })]);
    const agent = request.agent(app);
    const preAuthToken = await bootstrapCsrf(agent);
    const login = await postLogin(agent, preAuthToken, {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    const csrfCookie = findSetCookie(login, CSRF_COOKIE_NAME);
    databaseMock.insert.mockImplementationOnce(() => {
      throw new Error('revocation store unavailable');
    });

    const response = await agent
      .post('/api/auth/logout')
      .set(CSRF_HEADER_NAME, csrfCookie.value)
      .send({});

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(findSetCookie(response, SESSION_COOKIE_NAME).value).toBe('');
    expect(findSetCookie(response, CSRF_COOKIE_NAME).value).toBe('');
  });
});
