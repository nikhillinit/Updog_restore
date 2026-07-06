import type { Server } from 'node:http';

import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler, ValidationError } from '../../../server/errors';
import { requestId } from '../../../server/middleware/requestId';
import { validateRequest } from '../../../server/middleware/validation';

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

const ENV_KEYS = [
  'NODE_ENV',
  'REQUIRE_AUTH',
  'DEFAULT_USER_ID',
  'JWT_SECRET',
  'JWT_AUDIENCE',
  'JWT_ISSUER',
  'SESSION_SECRET',
] as const;

const originalEnv = new Map<string, string | undefined>();

function saveEnv() {
  for (const key of ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  originalEnv.clear();
}

function configureDevelopmentAuthBypass() {
  process.env.NODE_ENV = 'development';
  process.env.REQUIRE_AUTH = '0';
  process.env.DEFAULT_USER_ID = '1';
  process.env.JWT_SECRET = 'route-error-test-secret-32-chars-min';
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env.JWT_ISSUER = 'updog-test';
  process.env.SESSION_SECRET = 'route-error-session-secret-32-chars-min';
}

async function makeAppWithDevBypass() {
  configureDevelopmentAuthBypass();
  const { makeApp } = await import('../../../server/app');
  return makeApp();
}

async function makeRegisterRoutesHarness() {
  const app = express();
  app.set('trust proxy', false);
  app.use(requestId());
  app.use(express.json({ limit: '1mb' }));

  const { registerRoutes } = await import('../../../server/routes');
  const server = await registerRoutes(app);

  app.get('/contract/domain-error', (_req, _res, next) => {
    next(new ValidationError('Route contract validation failed'));
  });

  app.post(
    '/contract/validate-body',
    validateRequest({
      body: z.object({
        name: z.string().min(1),
      }),
    }),
    (_req, res) => {
      res.status(204).end();
    }
  );

  app.use(errorHandler());

  return { app, server };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe('route error contracts', () => {
  const servers: Server[] = [];

  beforeEach(() => {
    saveEnv();
    vi.resetModules();
    mockRegisterCompletionHandlers.mockClear();
    mockAutomationStart.mockClear();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => closeServer(server)));
    vi.doUnmock('../../../server/routes/ai.js');
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('pins the active registerRoutes errorHandler response shape and request id propagation', async () => {
    const { app, server } = await makeRegisterRoutesHarness();
    servers.push(server);

    const response = await request(app).get('/contract/domain-error');

    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'Route contract validation failed',
      requestId: response.headers['x-request-id'],
      ts: expect.any(String),
    });
  }, 30_000);

  it('pins registerRoutes validation middleware errors before service extraction', async () => {
    const { app, server } = await makeRegisterRoutesHarness();
    servers.push(server);

    const response = await request(app).post('/contract/validate-body').send({});

    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toMatchObject({
      error: 'Validation error',
      message: 'Request body validation failed',
    });
    expect(response.body.details.validationErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['name'],
        }),
      ])
    );
  }, 30_000);

  it('pins makeApp fallback 404 behavior with request id propagation', async () => {
    const app = await makeAppWithDevBypass();

    const response = await request(app).get('/definitely-not-mounted');

    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toEqual({
      error: 'not_found',
    });
  }, 30_000);

  it('pins makeApp route validation behavior through the active route stack', async () => {
    const app = await makeAppWithDevBypass();

    const response = await request(app).get('/api/deals/opportunities?limit=abc');

    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toMatchObject({
      error: 'validation_error',
    });
  }, 30_000);

  it('pins makeApp fallback error masking to the shared error handler contract', async () => {
    configureDevelopmentAuthBypass();
    vi.doMock('../../../server/routes/ai.js', () => {
      const router = express.Router();
      router.get('/contract-4xx', (_req, _res, next) => {
        next(Object.assign(new Error('Route contract validation failed'), { status: 400 }));
      });
      router.get('/contract-5xx', (_req, _res, next) => {
        next(Object.assign(new Error('database password leaked in stack'), { status: 500 }));
      });
      return { default: router };
    });

    const { makeApp } = await import('../../../server/app');
    const app = makeApp();

    const clientError = await request(app).get('/api/ai/contract-4xx');
    expect(clientError.status).toBe(400);
    expect(clientError.headers['x-request-id']).toEqual(expect.any(String));
    expect(clientError.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'Route contract validation failed',
      requestId: clientError.headers['x-request-id'],
      ts: expect.any(String),
    });

    const serverError = await request(app).get('/api/ai/contract-5xx');
    expect(serverError.status).toBe(500);
    expect(serverError.headers['x-request-id']).toEqual(expect.any(String));
    expect(serverError.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
      requestId: serverError.headers['x-request-id'],
      ts: expect.any(String),
    });
  }, 30_000);
});
