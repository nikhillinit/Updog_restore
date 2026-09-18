import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as database from '../../../server/db/index';
import { storage } from '../../../server/storage';
import router, { buildDatabaseHealthIdentity } from '../../../server/routes/health';

const databaseUrl = 'postgres://secret_user:secret_password@ep-direct.us.neon.tech/url_database';
const healthKey = 'health-route-test-key-32-characters';
const app = express();
app.use(router);

beforeEach(() => {
  vi.stubEnv('HEALTH_KEY', healthKey);
  vi.stubEnv('DATABASE_URL', databaseUrl);
  vi.spyOn(storage, 'ping').mockResolvedValue(true);
  vi.spyOn(database, 'queryScalar').mockResolvedValue('actual_database');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('database health identity', () => {
  it('emits only safe direct-database identity', () => {
    const result = buildDatabaseHealthIdentity('updog', databaseUrl);
    expect(result).toMatchObject({ database: 'connected', status: 'ok', databaseName: 'updog' });
    expect(result.databaseUrlHostFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('ep-direct');
  });

  it('refuses pooled endpoints', () => {
    expect(() =>
      buildDatabaseHealthIdentity('updog', 'postgres://u:p@ep-pooler.neon.tech/updog')
    ).toThrow(/pooled/i);
  });

  it('authenticates the route and derives identity from the API connection', async () => {
    const response = await request(app)
      .get('/api/health/db')
      .set('X-Health-Key', healthKey)
      .expect(200);
    expect(database.queryScalar).toHaveBeenCalledExactlyOnceWith('SELECT current_database()');
    expect(response.body).toEqual({
      database: 'connected',
      status: 'ok',
      databaseName: 'actual_database',
      databaseUrlHostFingerprint: `sha256:${createHash('sha256').update('ep-direct.us.neon.tech').digest('hex')}`,
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
    for (const secret of [
      'secret_user',
      'secret_password',
      'url_database',
      'ep-direct',
      'postgres://',
    ]) {
      expect(response.text).not.toContain(secret);
    }
  });

  it('denies unauthenticated identity reads before database access', async () => {
    const response = await request(app).get('/api/health/db').expect(401);
    expect(storage.ping).not.toHaveBeenCalled();
    expect(database.queryScalar).not.toHaveBeenCalled();
    expect(response.text).not.toContain('actual_database');
  });

  it.each(['database error', 'missing database name', 'missing URL', 'invalid URL', 'pooled URL'])(
    'fails closed without leaking connection details: %s',
    async (failure) => {
      if (failure === 'database error')
        vi.mocked(database.queryScalar).mockRejectedValue(new Error(databaseUrl));
      if (failure === 'missing database name')
        vi.mocked(database.queryScalar).mockResolvedValue(null);
      if (failure === 'missing URL') vi.stubEnv('DATABASE_URL', '');
      if (failure === 'invalid URL') vi.stubEnv('DATABASE_URL', 'secret_user:secret_password');
      if (failure === 'pooled URL')
        vi.stubEnv('DATABASE_URL', databaseUrl.replace('ep-direct.', 'ep-direct-pooler.'));
      const response = await request(app)
        .get('/api/health/db')
        .set('X-Health-Key', healthKey)
        .expect(503);
      expect(response.body).toMatchObject({ database: 'error', status: 'error' });
      expect(response.body).not.toHaveProperty('databaseUrlHostFingerprint');
      for (const secret of ['secret_user', 'secret_password', 'ep-direct', 'postgres://']) {
        expect(response.text).not.toContain(secret);
      }
    }
  );
});
