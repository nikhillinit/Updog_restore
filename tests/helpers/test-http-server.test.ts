import { describe, it, expect, afterEach } from 'vitest';
import { createTestHttpServer, type TestHttpServer } from './test-http-server';
import type { FeatureFlagState } from './test-state-manager';

type ServerInternals = {
  flagState: FeatureFlagState;
};

describe('TestHttpServer', () => {
  let server: TestHttpServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.cleanup();
      // eslint-disable-next-line require-atomic-updates
      server = null;
    }
  });

  it('should create an Express app', () => {
    server = createTestHttpServer();
    expect(server.getApp()).toBeDefined();
  });

  it('should return a supertest wrapper', async () => {
    server = createTestHttpServer();
    server.getApp().get('/test', (_req, res) => res.json({ ok: true }));

    const res = await server.request().get('/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('should update feature flags', () => {
    server = createTestHttpServer();
    server.setFeatureFlag('wizard.v1', { enabled: true });

    const internals = server as unknown as ServerInternals;
    const flag = internals.flagState.getFlag('wizard.v1');
    expect(flag?.enabled).toBe(true);
  });

  it('should toggle the kill switch', () => {
    server = createTestHttpServer();
    server.setKillSwitch(true);
    expect(process.env['FLAGS_DISABLED_ALL']).toBe('1');

    server.setKillSwitch(false);
    expect(process.env['FLAGS_DISABLED_ALL']).toBeUndefined();
  });

  it('should reset state', () => {
    server = createTestHttpServer();
    const token = server.createAuthToken({ sub: 'user-1', role: 'admin' });
    server.setFeatureFlag('wizard.v1', { enabled: true });
    server.setKillSwitch(true);

    server.resetState();

    const internals = server as unknown as ServerInternals;
    const flag = internals.flagState.getFlag('wizard.v1');
    expect(flag?.enabled).toBe(false);
    expect(server.getTokenRegistry().verifyToken(token)).toBeNull();
    expect(process.env['FLAGS_DISABLED_ALL']).toBeUndefined();
  });

  it('should create admin and read-only tokens', () => {
    server = createTestHttpServer();
    const adminToken = server.createAdminToken();
    const readToken = server.createReadOnlyToken();

    expect(server.getTokenRegistry().verifyToken(adminToken)?.role).toBe('admin');
    expect(server.getTokenRegistry().verifyToken(readToken)?.role).toBe('flag_read');
  });

  it('should create custom auth tokens', () => {
    server = createTestHttpServer();
    const token = server.createAuthToken({ sub: 'custom-user', role: 'flag_admin' });

    const claims = server.getTokenRegistry().verifyToken(token);
    expect(claims).toMatchObject({ sub: 'custom-user', role: 'flag_admin' });
  });

  it('should enforce auth middleware when enabled', async () => {
    server = createTestHttpServer({
      middleware: {
        auth: { enabled: true },
      },
    });
    server.getApp().get('/secure', (_req, res) => res.json({ ok: true }));

    const res = await server.request().get('/secure');
    expect(res.status).toBe(401);
  });

  it('should allow access when auth middleware is disabled', async () => {
    server = createTestHttpServer({
      middleware: {
        auth: { enabled: false },
      },
    });
    server.getApp().get('/open', (_req, res) => res.json({ ok: true }));

    const res = await server.request().get('/open');
    expect(res.status).toBe(200);
  });

  it('should accept valid tokens when auth middleware is enabled', async () => {
    server = createTestHttpServer({
      middleware: {
        auth: { enabled: true },
      },
    });
    server.getApp().get('/secure', (req, res) => res.json({ user: req.user }));

    const token = server.createAuthToken({ sub: 'user-42', role: 'flag_read' });
    const res = await server.request().get('/secure').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.sub).toBe('user-42');
  });

  it('should apply rate limiting when enabled', async () => {
    server = createTestHttpServer({
      middleware: {
        rateLimit: { enabled: true, max: 2, windowMs: 60_000 },
      },
    });
    server.getApp().get('/limited', (_req, res) => res.json({ ok: true }));

    await server.request().get('/limited');
    await server.request().get('/limited');
    const res = await server.request().get('/limited');

    expect(res.status).toBe(429);
  });

  it('should mount flag routes when configured', async () => {
    server = createTestHttpServer({
      routes: { mountFlagRoutes: true },
    });

    const res = await server.request().get('/api/flags/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cache');
  });

  it('should not mount flag routes by default', async () => {
    server = createTestHttpServer();
    const res = await server.request().get('/api/flags/status');
    expect(res.status).toBe(404);
  });
});
