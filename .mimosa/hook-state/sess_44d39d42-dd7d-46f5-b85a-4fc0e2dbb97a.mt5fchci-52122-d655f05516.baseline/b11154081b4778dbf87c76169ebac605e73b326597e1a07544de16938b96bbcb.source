import { EventEmitter } from 'node:events';
import type { Worker } from 'bullmq';
import packageJson from '../../../package.json' with { type: 'json' };
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createWorkerHealthApp,
  createHealthServer,
  registerWorker,
  resetWorkerHealthRegistrations,
  unregisterWorker,
} from '../../../workers/health-server';
import { resolveWorkerDeploymentIdentity } from '../../../workers/worker-deployment-identity';

const IDENTITY_ENV_KEYS = [
  'NODE_ENV',
  'WORKER_TYPE',
  'RAILWAY_SERVICE_NAME',
  'RAILWAY_ENVIRONMENT_NAME',
  'RAILWAY_GIT_COMMIT_SHA',
  'RAILWAY_DEPLOYMENT_ID',
  'VERCEL_GIT_COMMIT_SHA',
  'COMMIT_REF',
] as const;

const RAILWAY_COMMIT = 'a'.repeat(40);

type WorkerState = 'running' | 'paused' | 'stopped';

function registerTestWorker(
  name: string,
  state: WorkerState = 'running',
  detailsProvider?: () => Promise<Record<string, number>>
): void {
  const worker = new EventEmitter() as EventEmitter & {
    isRunning: () => boolean;
    isPaused: () => boolean;
  };
  worker.isRunning = () => state !== 'stopped';
  worker.isPaused = () => state === 'paused';
  registerWorker(name, worker as unknown as Worker, detailsProvider);
}

function setExactProductionIdentity(workerType = 'fund-scenario-calc'): void {
  process.env['NODE_ENV'] = 'production';
  process.env['WORKER_TYPE'] = workerType;
  process.env['RAILWAY_SERVICE_NAME'] = workerType;
  process.env['RAILWAY_ENVIRONMENT_NAME'] = 'production';
  process.env['RAILWAY_GIT_COMMIT_SHA'] = RAILWAY_COMMIT;
  process.env['RAILWAY_DEPLOYMENT_ID'] = 'deployment-123';
}

function createAppForIdentity(workerType: 'fund-scenario-calc' | 'capital-call-status') {
  try {
    return createWorkerHealthApp(resolveWorkerDeploymentIdentity(workerType));
  } catch {
    return createWorkerHealthApp(null);
  }
}

describe('worker health app', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    resetWorkerHealthRegistrations();
    for (const key of IDENTITY_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    resetWorkerHealthRegistrations();
    for (const key of IDENTITY_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
  });

  it.each([
    ['no worker', () => undefined],
    ['wrong worker', () => registerTestWorker('capital-call-status')],
    [
      'extra worker',
      () => {
        registerTestWorker('fund-scenario-calc');
        registerTestWorker('capital-call-status');
      },
    ],
    ['paused worker', () => registerTestWorker('fund-scenario-calc', 'paused')],
    ['stopped worker', () => registerTestWorker('fund-scenario-calc', 'stopped')],
    [
      'worker health callback error',
      () =>
        registerTestWorker('fund-scenario-calc', 'running', async () => {
          throw new Error('outbox unavailable');
        }),
    ],
  ])('returns unavailable when %s', async (_caseName, setup) => {
    setExactProductionIdentity();
    setup();

    const app = createAppForIdentity('fund-scenario-calc');
    const [health, ready] = await Promise.all([
      request(app).get('/health'),
      request(app).get('/ready'),
    ]);

    expect(health.status).toBe(503);
    expect(health.body.status).toBe('unhealthy');
    expect(ready.status).toBe(503);
    expect(ready.body.status).toBe('not_ready');
  });

  it.each([
    ['missing NODE_ENV', () => delete process.env['NODE_ENV']],
    [
      'invalid NODE_ENV',
      () => {
        process.env['NODE_ENV'] = 'staging';
      },
    ],
    [
      'local identity with a Railway marker',
      () => {
        process.env['NODE_ENV'] = 'test';
        delete process.env['RAILWAY_ENVIRONMENT_NAME'];
        delete process.env['RAILWAY_GIT_COMMIT_SHA'];
        delete process.env['RAILWAY_DEPLOYMENT_ID'];
      },
    ],
    ['missing WORKER_TYPE', () => delete process.env['WORKER_TYPE']],
    [
      'mismatched WORKER_TYPE',
      () => {
        process.env['WORKER_TYPE'] = 'capital-call-status';
      },
    ],
    ['missing Railway service name', () => delete process.env['RAILWAY_SERVICE_NAME']],
    [
      'mismatched Railway service name',
      () => {
        process.env['RAILWAY_SERVICE_NAME'] = 'capital-call-status';
      },
    ],
    ['missing Railway environment name', () => delete process.env['RAILWAY_ENVIRONMENT_NAME']],
    [
      'mismatched Railway environment name',
      () => {
        process.env['RAILWAY_ENVIRONMENT_NAME'] = 'staging';
      },
    ],
    ['missing Railway commit', () => delete process.env['RAILWAY_GIT_COMMIT_SHA']],
    [
      'malformed Railway commit',
      () => {
        process.env['RAILWAY_GIT_COMMIT_SHA'] = 'not-a-sha';
      },
    ],
    [
      'uppercase Railway commit',
      () => {
        process.env['RAILWAY_GIT_COMMIT_SHA'] = 'A'.repeat(40);
      },
    ],
    [
      'release identity commit mismatch',
      () => {
        process.env['VERCEL_GIT_COMMIT_SHA'] = 'b'.repeat(40);
      },
    ],
    ['missing Railway deployment ID', () => delete process.env['RAILWAY_DEPLOYMENT_ID']],
  ])('returns unavailable with %s', async (_caseName, invalidate) => {
    setExactProductionIdentity();
    registerTestWorker('fund-scenario-calc');
    invalidate();

    const app = createAppForIdentity('fund-scenario-calc');
    const [health, ready] = await Promise.all([
      request(app).get('/health'),
      request(app).get('/ready'),
    ]);

    expect(health.status).toBe(503);
    expect(ready.status).toBe(503);
  });

  it('keeps liveness process-only when identity and workers are invalid', async () => {
    const response = await request(createWorkerHealthApp(null)).get('/live');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('alive');
  });

  it('uses explicit local identity without synthesizing Railway provider values', async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['WORKER_TYPE'] = 'fund-scenario-calc';
    registerTestWorker('fund-scenario-calc');

    const app = createAppForIdentity('fund-scenario-calc');
    const [health, ready] = await Promise.all([
      request(app).get('/health'),
      request(app).get('/ready'),
    ]);

    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
    expect(health.body).toMatchObject({
      status: 'healthy',
      version: packageJson.version,
      commit: 'local',
      environment: 'test',
      workerType: 'fund-scenario-calc',
      deploymentId: 'local',
    });
  });

  it.each(['fund-scenario-calc', 'capital-call-status'] as const)(
    'returns healthy only for exact %s production identity and one running worker',
    async (workerType) => {
      setExactProductionIdentity(workerType);
      registerTestWorker(workerType, 'running', async () => ({ exhaustedOutboxCount: 2 }));

      const app = createAppForIdentity(workerType);
      const [health, ready] = await Promise.all([
        request(app).get('/health'),
        request(app).get('/ready'),
      ]);

      expect(health.status).toBe(200);
      expect(ready.status).toBe(200);
      expect(health.body).toMatchObject({
        status: 'healthy',
        version: packageJson.version,
        commit: RAILWAY_COMMIT,
        environment: 'production',
        workerType,
        deploymentId: 'deployment-123',
        workers: [expect.objectContaining({ name: workerType, exhaustedOutboxCount: 2 })],
      });
      expect(ready.body).toMatchObject({
        status: 'ready',
        workerType,
        commit: RAILWAY_COMMIT,
        deploymentId: 'deployment-123',
      });
    }
  );

  it('does not let health-detail callbacks override canonical worker state', async () => {
    setExactProductionIdentity();
    registerTestWorker(
      'fund-scenario-calc',
      'running',
      async () =>
        ({
          name: 'capital-call-status',
          status: 'unhealthy',
          isRunning: false,
          jobsProcessed: 999,
          lastJobTime: 'spoofed',
          exhaustedOutboxCount: 2,
        }) as unknown as Record<string, number>
    );

    const response = await request(createAppForIdentity('fund-scenario-calc')).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.workers).toEqual([
      expect.objectContaining({
        name: 'fund-scenario-calc',
        status: 'healthy',
        isRunning: true,
        jobsProcessed: 0,
        exhaustedOutboxCount: 2,
      }),
    ]);
  });

  it('uses the identity captured at startup instead of mutable environment values', async () => {
    setExactProductionIdentity();
    const identity = resolveWorkerDeploymentIdentity('fund-scenario-calc');
    process.env['WORKER_TYPE'] = 'capital-call-status';
    process.env['RAILWAY_GIT_COMMIT_SHA'] = 'b'.repeat(40);
    registerTestWorker('fund-scenario-calc');

    const response = await request(createWorkerHealthApp(identity)).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      workerType: 'fund-scenario-calc',
      commit: RAILWAY_COMMIT,
    });
  });

  it('keeps nonempty legacy local health healthy without allowing a vacuous registry', async () => {
    process.env['NODE_ENV'] = 'development';
    registerTestWorker('reserve');

    expect((await request(createWorkerHealthApp()).get('/health')).status).toBe(200);
    resetWorkerHealthRegistrations();
    expect((await request(createWorkerHealthApp()).get('/health')).status).toBe(503);
  });

  it('removes a stopped worker from health state', async () => {
    process.env['NODE_ENV'] = 'development';
    const worker = new EventEmitter() as EventEmitter & {
      isRunning: () => boolean;
      isPaused: () => boolean;
    };
    worker.isRunning = () => true;
    worker.isPaused = () => false;
    registerWorker('fund-scenario-calc', worker as unknown as Worker);

    expect(unregisterWorker('fund-scenario-calc', worker as unknown as Worker)).toBe(true);
    expect((await request(createWorkerHealthApp()).get('/health')).status).toBe(503);
  });

  it('does not let delayed cleanup unregister a replacement worker', async () => {
    process.env['NODE_ENV'] = 'development';
    const oldWorker = new EventEmitter() as EventEmitter & {
      isRunning: () => boolean;
      isPaused: () => boolean;
    };
    const replacementWorker = new EventEmitter() as EventEmitter & {
      isRunning: () => boolean;
      isPaused: () => boolean;
    };
    oldWorker.isRunning = replacementWorker.isRunning = () => true;
    oldWorker.isPaused = replacementWorker.isPaused = () => false;
    registerWorker('fund-scenario-calc', oldWorker as unknown as Worker);
    registerWorker('fund-scenario-calc', replacementWorker as unknown as Worker);

    expect(unregisterWorker('fund-scenario-calc', oldWorker as unknown as Worker)).toBe(false);
    expect((await request(createWorkerHealthApp()).get('/health')).status).toBe(200);
  });

  it('returns an awaited, idempotently closable listener runtime', async () => {
    const runtime = await createHealthServer(0, null);

    expect(runtime.server.listening).toBe(true);
    await runtime.close();
    await runtime.close();
    expect(runtime.server.listening).toBe(false);
  });
});
