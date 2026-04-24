import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockRegisterCompletionHandlers, mockAutomationStart } = vi.hoisted(() => ({
  mockRegisterCompletionHandlers: vi.fn(),
  mockAutomationStart: vi.fn(),
}));

vi.mock('../../../server/services/calc-run-completion-handlers.js', () => ({
  registerCompletionHandlers: mockRegisterCompletionHandlers,
}));

vi.mock('../../../server/services/variance-alert-automation.js', () => ({
  varianceAlertAutomationService: {
    start: mockAutomationStart,
  },
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
});
