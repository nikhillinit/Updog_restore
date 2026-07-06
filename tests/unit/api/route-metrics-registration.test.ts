import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockRecordHttpMetrics,
  mockRegisterCompletionHandlers,
  mockAutomationStart,
  mockSetupWebSocketServers,
} = vi.hoisted(() => ({
  mockRecordHttpMetrics: vi.fn(),
  mockRegisterCompletionHandlers: vi.fn(),
  mockAutomationStart: vi.fn(),
  mockSetupWebSocketServers: vi.fn(),
}));

vi.mock('../../../server/metrics', async () => {
  const actual =
    await vi.importActual<typeof import('../../../server/metrics')>('../../../server/metrics');
  return {
    ...actual,
    recordHttpMetrics: mockRecordHttpMetrics,
  };
});

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

describe('route metrics registration', () => {
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

  it('records metrics for LP metric-run routes mounted before the old metrics middleware position', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json({ limit: '1mb' }));

    const { registerRoutes } = await import('../../../server/routes');
    server = await registerRoutes(app);

    const response = await request(app).post('/api/funds/1/metric-runs/dry-run').send({});

    expect(response.status).not.toBe(404);
    expect(mockRecordHttpMetrics).toHaveBeenCalledTimes(1);
    expect(mockRecordHttpMetrics).toHaveBeenCalledWith(
      'POST',
      expect.any(String),
      response.status,
      expect.any(Number)
    );
  }, 30_000);
});
