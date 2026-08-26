import type { Server } from 'node:http';

import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const { withIdempotencyMock } = vi.hoisted(() => ({
  withIdempotencyMock: vi.fn(),
}));

vi.mock('../../../server/lib/idempotency.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/idempotency.js')>();
  return { ...actual, withIdempotency: withIdempotencyMock };
});

vi.mock('../../../server/middleware/with-rls-transaction.js', () => ({
  withRLSTransaction: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

function configureMemoryEnvironment(): void {
  process.env['NODE_ENV'] = 'development';
  process.env['_EXPLICIT_NODE_ENV'] = 'development';
  process.env['REDIS_URL'] = 'memory://';
  process.env['_EXPLICIT_REDIS_URL'] = 'memory://';
  process.env['ENABLE_QUEUES'] = '0';
  process.env['ALLOW_MEMORY_STORAGE'] = '1';
  delete process.env['DATABASE_URL'];
  delete process.env['NEON_DATABASE_URL'];
  delete process.env['RATE_LIMIT_REDIS_URL'];
  delete process.env['QUEUE_REDIS_URL'];
  delete process.env['SESSION_REDIS_URL'];
}

function restoreEnvironment(original: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe('internal-economics generic idempotency createServer composition', () => {
  it('bypasses generic idempotency for a mixed-case trailing-slash alias before route validation', async () => {
    const originalEnvironment = { ...process.env };
    let server: Server | undefined;
    let providers: { teardown?: () => Promise<void> } | undefined;
    let setReady: ((ready: boolean) => void) | undefined;

    withIdempotencyMock.mockImplementation(
      () => (_req: unknown, _res: unknown, next: () => void) => next()
    );

    try {
      configureMemoryEnvironment();
      vi.resetModules();

      const configModule = await import('../../../server/config/index.js');
      const providersModule = await import('../../../server/providers.js');
      const completionHandlersModule =
        await import('../../../server/services/calc-run-completion-handlers.js');
      const varianceAlertModule =
        await import('../../../server/services/variance-alert-automation.js');
      const artifactRetentionModule =
        await import('../../../server/services/financial-observations/artifact-retention-service.js');
      const analysisCheckpointModule =
        await import('../../../server/services/internal-analysis/analysis-checkpoint-service.js');
      const serverModule = await import('../../../server/server.js');
      const jwtModule = await import('../../../server/lib/auth/jwt.js');
      const healthState = await import('../../../server/health/state.js');
      vi.spyOn(completionHandlersModule, 'registerCompletionHandlers').mockImplementation(() => {});
      vi.spyOn(varianceAlertModule.varianceAlertAutomationService, 'start').mockImplementation(
        () => {}
      );
      vi.spyOn(artifactRetentionModule.artifactRetentionService, 'start').mockImplementation(
        () => {}
      );
      vi.spyOn(
        analysisCheckpointModule.internalAnalysisCheckpointService,
        'start'
      ).mockImplementation(() => {});
      const config = configModule.loadEnv();
      providers = await providersModule.buildProviders(config);
      server = await serverModule.createServer(config, providers);
      setReady = healthState.setReady;
      setReady(true);

      const token = jwtModule.signToken({
        sub: '7',
        email: 'bootstrap-admin@example.com',
        role: 'admin',
        fundIds: [],
        org_id: 'bootstrap-org',
      });
      const response = await request(server)
        .post('/api/funds/abc/INTERNAL-ECONOMICS/RUNS/')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'bootstrap-alias')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: 'Invalid fund ID',
        message: 'Fund ID must be a canonical positive integer',
      });
      expect(withIdempotencyMock).not.toHaveBeenCalled();
    } finally {
      setReady?.(false);
      await closeServer(server);
      await providers?.teardown?.();
      restoreEnvironment(originalEnvironment);
      vi.restoreAllMocks();
      vi.clearAllMocks();
      vi.resetModules();
    }
  }, 30_000);
});
