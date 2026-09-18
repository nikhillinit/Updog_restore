import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { healthCheck } from '../../server/health';

const { execute, setHealth } = vi.hoisted(() => ({
  execute: vi.fn(),
  setHealth: vi.fn(),
}));

vi.mock('../../server/db', () => ({ db: { execute } }));
vi.mock('../../server/env', () => ({
  getEnv: () => ({ REDIS_URL: process.env['REDIS_URL'] }),
}));
vi.mock('../../server/metrics', () => ({ healthStatus: { set: setHealth } }));
vi.mock('../../server/storage', () => ({
  storage: {},
  getStorageRuntimeState: () => ({ kind: 'database', mockDatabase: false }),
}));

const app = express();
app.get('/health', healthCheck);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe('legacy health components', () => {
  it.each([undefined, 'memory://', 'redis://127.0.0.1:6379'])(
    'reports only probed database health when REDIS_URL is %s',
    async (redisUrl) => {
      vi.stubEnv('REDIS_URL', redisUrl);
      execute.mockResolvedValueOnce([]);

      const response = await request(app).get('/health').expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.components).toEqual([
        { name: 'database', status: 'healthy', message: 'Database connection successful' },
      ]);
      expect(execute).toHaveBeenCalledWith('SELECT 1');
      expect(setHealth.mock.calls).toEqual([
        [{ component: 'database' }, 1],
        [{ component: 'overall' }, 1],
      ]);
    }
  );

  it('preserves database failure status and gauges', async () => {
    execute.mockRejectedValueOnce(new Error('Database unavailable'));

    const response = await request(app).get('/health').expect(503);

    expect(response.body.status).toBe('unhealthy');
    expect(response.body.components).toEqual([
      { name: 'database', status: 'unhealthy', message: 'Database unavailable' },
    ]);
    expect(setHealth.mock.calls).toEqual([
      [{ component: 'database' }, 0],
      [{ component: 'overall' }, 0],
    ]);
  });
});
