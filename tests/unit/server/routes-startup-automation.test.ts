import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockRegisterCompletionHandlers, mockAutomationStart, mockSetupWebSocketServers } =
  vi.hoisted(() => ({
    mockRegisterCompletionHandlers: vi.fn(),
    mockAutomationStart: vi.fn(),
    mockSetupWebSocketServers: vi.fn(),
  }));

vi.mock('../../../server/services/calc-run-completion-handlers.js', () => ({
  registerCompletionHandlers: mockRegisterCompletionHandlers,
}));

vi.mock('../../../server/services/variance-alert-automation.js', () => ({
  varianceAlertAutomationService: {
    start: mockAutomationStart,
  },
}));

vi.mock('../../../server/websocket/index.js', () => ({
  setupWebSocketServers: mockSetupWebSocketServers,
}));

describe('registerRoutes automation startup', () => {
  let server: import('http').Server | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const serverToClose = server;
    server = undefined;

    if (serverToClose?.listening) {
      await new Promise<void>((resolve, reject) => {
        serverToClose.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('wires completion handlers and alert automation startup during route registration', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    server = await registerRoutes(app);

    expect(mockRegisterCompletionHandlers).toHaveBeenCalledTimes(1);
    expect(mockAutomationStart).toHaveBeenCalledTimes(1);
    expect(mockSetupWebSocketServers).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('mounts the deal pipeline router on the registerRoutes surface', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    server = await registerRoutes(app);

    const res = await request(app).get('/api/deals/opportunities?limit=abc');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'validation_error');
  }, 30_000);

  it('mounts reserve allocation and sensitivity JSON routes on the registerRoutes surface', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    server = await registerRoutes(app);

    const allocationRes = await request(app).get('/api/funds/not-a-number/allocations/latest');
    const sensitivityRes = await request(app).get('/api/funds/not-a-number/sensitivity/runs');

    expect(allocationRes.status).toBe(400);
    expect(allocationRes.type).toMatch(/json/);
    expect(allocationRes.body).toHaveProperty('error', 'Invalid fund ID');
    expect(sensitivityRes.status).toBe(400);
    expect(sensitivityRes.type).toMatch(/json/);
    expect(sensitivityRes.body).toHaveProperty('code', 'INVALID_FUND_ID');
  }, 30_000);

  it('mounts LP reporting import and metric-run routes on the registerRoutes surface', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    server = await registerRoutes(app);

    const importRes = await request(app).post('/api/funds/1/imports/ledger/dry-run').send({});
    const metricRunRes = await request(app).post('/api/funds/1/metric-runs/dry-run').send({});

    expect(importRes.status).not.toBe(404);
    expect(metricRunRes.status).not.toBe(404);
  }, 30_000);

  it('returns JSON for unknown API routes instead of falling through to HTML', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    server = await registerRoutes(app);

    const res = await request(app).get('/api/not-a-mounted-route');

    expect(res.status).toBe(404);
    expect(res.type).toMatch(/json/);
    expect(res.body).toHaveProperty('error', 'not_found');
  }, 30_000);
});
