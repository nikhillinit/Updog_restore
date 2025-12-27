import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  MockTokenRegistry,
  createTestAuthMiddleware,
  createAdminToken,
  createReadOnlyToken,
  createCustomToken,
  type JWTClaims,
} from './test-auth-helpers';

describe('MockTokenRegistry', () => {
  let registry: MockTokenRegistry;

  beforeEach(() => {
    registry = new MockTokenRegistry();
  });

  it('should store and retrieve tokens', () => {
    const token = 'test-token-123';
    const claims: JWTClaims = { sub: 'user1', role: 'admin' };
    registry.addToken(token, claims);
    expect(registry.verifyToken(token)).toEqual(claims);
  });

  it('should return null for unknown tokens', () => {
    expect(registry.verifyToken('missing-token')).toBeNull();
  });

  it('should clear tokens', () => {
    const token = 'test-token-456';
    const claims: JWTClaims = { sub: 'user2', role: 'flag_read' };
    registry.addToken(token, claims);
    registry.clear();
    expect(registry.verifyToken(token)).toBeNull();
  });
});

describe('createTestAuthMiddleware', () => {
  const buildApp = (registry: MockTokenRegistry, devMode?: boolean) => {
    const app = express();
    app.use(createTestAuthMiddleware(registry, { devMode }));
    app.get('/test', (req, res) => res.json({ user: req.user }));
    return app;
  };

  it('should return 401 for missing Authorization header', async () => {
    const registry = new MockTokenRegistry();
    const app = buildApp(registry);
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
  });

  it('should return 401 for invalid token format', async () => {
    const registry = new MockTokenRegistry();
    const app = buildApp(registry);
    const res = await request(app).get('/test').set('Authorization', 'Token abc');
    expect(res.status).toBe(401);
  });

  it('should return 401 for unknown token', async () => {
    const registry = new MockTokenRegistry();
    const app = buildApp(registry);
    const res = await request(app).get('/test').set('Authorization', 'Bearer missing');
    expect(res.status).toBe(401);
  });

  it('should set req.user for valid mock token', async () => {
    const registry = new MockTokenRegistry();
    const token = 'valid-token';
    const claims: JWTClaims = {
      sub: 'user-123',
      role: 'flag_read',
      email: 'user@example.com',
      fundIds: [1, 2],
    };
    registry.addToken(token, claims);

    const app = buildApp(registry);
    const res = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'test-agent');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 'user-123',
      sub: 'user-123',
      email: 'user@example.com',
      role: 'flag_read',
      roles: ['flag_read'],
      fundIds: [1, 2],
      userAgent: 'test-agent',
    });
    expect(res.body.user.ip).toBeDefined();
  });

  it('should support dev-token bypass', async () => {
    const registry = new MockTokenRegistry();
    const app = buildApp(registry, true);
    const res = await request(app).get('/test').set('Authorization', 'Bearer dev-token');

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.roles).toContain('flag_admin');
  });
});

describe('auth helper factories', () => {
  let registry: MockTokenRegistry;

  beforeEach(() => {
    registry = new MockTokenRegistry();
  });

  it('should create admin token with admin role', () => {
    const token = createAdminToken(registry);
    const claims = registry.verifyToken(token);
    expect(claims?.role).toBe('admin');
  });

  it('should create read-only token with flag_read role', () => {
    const token = createReadOnlyToken(registry);
    const claims = registry.verifyToken(token);
    expect(claims?.role).toBe('flag_read');
  });

  it('should create custom token with provided claims', () => {
    const token = createCustomToken(registry, {
      sub: 'custom-user',
      role: 'flag_admin',
      email: 'custom@example.com',
    });
    const claims = registry.verifyToken(token);
    expect(claims).toMatchObject({
      sub: 'custom-user',
      role: 'flag_admin',
      email: 'custom@example.com',
    });
  });
});
