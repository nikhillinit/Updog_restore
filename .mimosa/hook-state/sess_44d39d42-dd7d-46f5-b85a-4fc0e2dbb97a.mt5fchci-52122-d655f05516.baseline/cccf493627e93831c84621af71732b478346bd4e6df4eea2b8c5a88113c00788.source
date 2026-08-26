import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let initialSigtermListeners: Function[] = [];
let initialSigintListeners: Function[] = [];

const {
  getQueueConnectionOptionsMock,
  getCapitalCallStatusHardTimeoutMsMock,
  createCapitalCallStatusWorkerMock,
  registerWorkerMock,
  unregisterWorkerMock,
  createHealthServerMock,
  resolveWorkerDeploymentIdentityMock,
  redisConstructorMock,
  redisQuitMock,
  workerStopMock,
  healthServerCloseMock,
} = vi.hoisted(() => ({
  getQueueConnectionOptionsMock: vi.fn(),
  getCapitalCallStatusHardTimeoutMsMock: vi.fn(() => 30_000),
  createCapitalCallStatusWorkerMock: vi.fn(),
  registerWorkerMock: vi.fn(),
  unregisterWorkerMock: vi.fn(),
  createHealthServerMock: vi.fn(),
  resolveWorkerDeploymentIdentityMock: vi.fn(),
  redisConstructorMock: vi.fn(),
  redisQuitMock: vi.fn().mockResolvedValue(undefined),
  workerStopMock: vi.fn().mockResolvedValue(undefined),
  healthServerCloseMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../server/config/features', () => ({
  getQueueConnectionOptions: getQueueConnectionOptionsMock,
}));

vi.mock('../../../server/services/capital-call-status-timeout', () => ({
  getCapitalCallStatusHardTimeoutMs: getCapitalCallStatusHardTimeoutMsMock,
}));

vi.mock('../../../server/workers/capital-call-status-worker', () => ({
  createCapitalCallStatusWorker: createCapitalCallStatusWorkerMock,
}));

vi.mock('../../../workers/health-server', () => ({
  registerWorker: registerWorkerMock,
  unregisterWorker: unregisterWorkerMock,
  createHealthServer: createHealthServerMock,
}));

vi.mock('../../../workers/worker-deployment-identity', () => ({
  resolveWorkerDeploymentIdentity: resolveWorkerDeploymentIdentityMock,
}));

vi.mock('ioredis', () => ({
  default: class MockRedis {
    constructor(...args: unknown[]) {
      redisConstructorMock(...args);
    }

    quit = redisQuitMock;
  },
}));

describe('capital call status worker entrypoint', () => {
  beforeEach(() => {
    initialSigtermListeners = process.listeners('SIGTERM');
    initialSigintListeners = process.listeners('SIGINT');
    vi.resetModules();
    vi.clearAllMocks();
    getQueueConnectionOptionsMock.mockReturnValue({ host: 'queue-host', port: 6380 });
    resolveWorkerDeploymentIdentityMock.mockReturnValue({
      version: '1.5.0',
      commit: 'a'.repeat(40),
      environment: 'production',
      workerType: 'capital-call-status',
      deploymentId: 'deployment-123',
    });
    createCapitalCallStatusWorkerMock.mockReturnValue({
      getBullMqWorker: vi.fn(() => ({ name: 'bull-worker' })),
      getHealthDetails: vi.fn().mockResolvedValue({ exhaustedOutboxCount: 0 }),
      start: vi.fn().mockResolvedValue(undefined),
      stop: workerStopMock,
    });
    createHealthServerMock.mockResolvedValue({ close: healthServerCloseMock });
  });

  afterEach(() => {
    for (const listener of process.listeners('SIGTERM')) {
      if (!initialSigtermListeners.includes(listener)) process.removeListener('SIGTERM', listener);
    }
    for (const listener of process.listeners('SIGINT')) {
      if (!initialSigintListeners.includes(listener)) process.removeListener('SIGINT', listener);
    }
    vi.restoreAllMocks();
  });

  it('passes a literal expected worker type to deployment identity and health', async () => {
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');

    await startCapitalCallStatusWorker();

    expect(resolveWorkerDeploymentIdentityMock).toHaveBeenCalledWith('capital-call-status');
    expect(createHealthServerMock).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ workerType: 'capital-call-status' })
    );
  });

  it('waits for scheduler and outbox initialization before exposing health', async () => {
    let resolveStart: (() => void) | undefined;
    const start = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        })
    );
    createCapitalCallStatusWorkerMock.mockReturnValue({
      getBullMqWorker: vi.fn(() => ({ name: 'bull-worker' })),
      getHealthDetails: vi.fn().mockResolvedValue({ exhaustedOutboxCount: 0 }),
      start,
      stop: vi.fn().mockResolvedValue(undefined),
    });
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');
    const starting = startCapitalCallStatusWorker();
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(createHealthServerMock).not.toHaveBeenCalled();
    resolveStart?.();
    await starting;
    expect(createHealthServerMock).toHaveBeenCalledTimes(1);
  });

  it('does not expose health when scheduler or outbox initialization rejects', async () => {
    const failure = new Error('scheduler initialization failed');
    createCapitalCallStatusWorkerMock.mockReturnValue({
      getBullMqWorker: vi.fn(() => ({ name: 'bull-worker' })),
      getHealthDetails: vi.fn().mockResolvedValue({ exhaustedOutboxCount: 0 }),
      start: vi.fn().mockRejectedValue(failure),
      stop: workerStopMock,
    });
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');
    await expect(startCapitalCallStatusWorker()).rejects.toThrow(failure);
    expect(createHealthServerMock).not.toHaveBeenCalled();
    expect(workerStopMock).toHaveBeenCalledTimes(1);
    expect(redisQuitMock).toHaveBeenCalledTimes(1);
    expect(unregisterWorkerMock).toHaveBeenCalledWith(
      'capital-call-status',
      expect.objectContaining({ name: 'bull-worker' })
    );
  });

  it('preserves the initialization error while attempting every cleanup step', async () => {
    const failure = new Error('outbox initialization failed');
    workerStopMock.mockRejectedValueOnce(new Error('worker cleanup failed'));
    createCapitalCallStatusWorkerMock.mockReturnValue({
      getBullMqWorker: vi.fn(() => ({ name: 'bull-worker' })),
      getHealthDetails: vi.fn().mockResolvedValue({ exhaustedOutboxCount: 0 }),
      start: vi.fn().mockRejectedValue(failure),
      stop: workerStopMock,
    });
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');

    await expect(startCapitalCallStatusWorker()).rejects.toBe(failure);
    expect(workerStopMock).toHaveBeenCalledTimes(1);
    expect(redisQuitMock).toHaveBeenCalledTimes(1);
    expect(unregisterWorkerMock).toHaveBeenCalledTimes(1);
    expect(createHealthServerMock).not.toHaveBeenCalled();
  });

  it('makes stop idempotent and still quits Redis when worker cleanup rejects', async () => {
    workerStopMock.mockRejectedValueOnce(new Error('worker cleanup failed'));
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');
    const runtime = await startCapitalCallStatusWorker();

    await expect(runtime.stop()).rejects.toThrow('worker cleanup failed');
    await expect(runtime.stop()).rejects.toThrow('worker cleanup failed');
    expect(workerStopMock).toHaveBeenCalledTimes(1);
    expect(redisQuitMock).toHaveBeenCalledTimes(1);
    expect(unregisterWorkerMock).toHaveBeenCalledTimes(1);
  });

  it('quits Redis when worker construction rejects', async () => {
    const failure = new Error('BullMQ worker construction failed');
    createCapitalCallStatusWorkerMock.mockRejectedValueOnce(failure);
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');

    await expect(startCapitalCallStatusWorker()).rejects.toBe(failure);

    expect(redisQuitMock).toHaveBeenCalledTimes(1);
    expect(registerWorkerMock).not.toHaveBeenCalled();
    expect(createHealthServerMock).not.toHaveBeenCalled();
  });

  it('removes early signal handlers when Redis construction throws', async () => {
    const failure = new Error('Redis construction failed');
    redisConstructorMock.mockImplementationOnce(() => {
      throw failure;
    });
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');

    await expect(startCapitalCallStatusWorker()).rejects.toBe(failure);
    expect(process.listeners('SIGTERM')).toEqual(initialSigtermListeners);
    expect(process.listeners('SIGINT')).toEqual(initialSigintListeners);
    expect(createCapitalCallStatusWorkerMock).not.toHaveBeenCalled();
  });

  it('independently closes worker, health listener, and Redis while preserving first error', async () => {
    const workerFailure = new Error('worker cleanup failed');
    workerStopMock.mockRejectedValueOnce(workerFailure);
    healthServerCloseMock.mockRejectedValueOnce(new Error('health cleanup failed'));
    redisQuitMock.mockRejectedValueOnce(new Error('redis cleanup failed'));
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');
    const runtime = await startCapitalCallStatusWorker();

    await expect(runtime.stop()).rejects.toBe(workerFailure);

    expect(workerStopMock).toHaveBeenCalledTimes(1);
    expect(healthServerCloseMock).toHaveBeenCalledTimes(1);
    expect(redisQuitMock).toHaveBeenCalledTimes(1);
  });

  it('continues worker, health, and Redis cleanup when unregistering the worker fails', async () => {
    const unregisterFailure = new Error('worker unregister failed');
    unregisterWorkerMock.mockImplementationOnce(() => {
      throw unregisterFailure;
    });
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');
    const runtime = await startCapitalCallStatusWorker();

    await expect(runtime.stop()).rejects.toBe(unregisterFailure);
    expect(workerStopMock).toHaveBeenCalledTimes(1);
    expect(healthServerCloseMock).toHaveBeenCalledTimes(1);
    expect(redisQuitMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid deployment identity before Redis, worker, health, registration, scheduler, or listener side effects', async () => {
    const identityError = new Error('Worker deployment identity is invalid');
    resolveWorkerDeploymentIdentityMock.mockImplementation(() => {
      throw identityError;
    });
    const onSpy = vi.spyOn(process, 'once');
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');

    await expect(startCapitalCallStatusWorker()).rejects.toThrow(identityError);
    expect(getQueueConnectionOptionsMock).not.toHaveBeenCalled();
    expect(getCapitalCallStatusHardTimeoutMsMock).not.toHaveBeenCalled();
    expect(redisConstructorMock).not.toHaveBeenCalled();
    expect(createCapitalCallStatusWorkerMock).not.toHaveBeenCalled();
    expect(registerWorkerMock).not.toHaveBeenCalled();
    expect(createHealthServerMock).not.toHaveBeenCalled();
    expect(onSpy).not.toHaveBeenCalled();
  });

  it('stops a worker resolved after SIGTERM during deferred construction without later registration or health startup', async () => {
    let resolveWorker:
      ((worker: ReturnType<typeof createCapitalCallStatusWorkerMock>) => void) | undefined;
    const worker = {
      getBullMqWorker: vi.fn(() => ({ name: 'bull-worker' })),
      getHealthDetails: vi.fn().mockResolvedValue({ exhaustedOutboxCount: 0 }),
      start: vi.fn().mockResolvedValue(undefined),
      stop: workerStopMock,
    };
    createCapitalCallStatusWorkerMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWorker = resolve;
        })
    );
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');

    const onceSpy = vi.spyOn(process, 'once');
    const starting = startCapitalCallStatusWorker();
    const sigtermHandler = onceSpy.mock.calls.find(([signal]) => signal === 'SIGTERM')?.[1];
    expect(sigtermHandler).toEqual(expect.any(Function));
    const signalStopping = (sigtermHandler as () => Promise<void>)();
    let signalStopSettled = false;
    void signalStopping.then(() => {
      signalStopSettled = true;
    });
    await Promise.resolve();
    expect(signalStopSettled).toBe(false);
    resolveWorker?.(worker);
    const runtime = await starting;

    await signalStopping;
    await runtime.stop();
    expect(workerStopMock).toHaveBeenCalledTimes(1);
    expect(redisQuitMock).toHaveBeenCalledTimes(1);
    expect(registerWorkerMock).not.toHaveBeenCalled();
    expect(worker.start).not.toHaveBeenCalled();
    expect(createHealthServerMock).not.toHaveBeenCalled();
  });

  it('closes health resolved after SIGTERM during deferred health startup without resurrection', async () => {
    let resolveHealth: ((health: { close: typeof healthServerCloseMock }) => void) | undefined;
    createHealthServerMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHealth = resolve;
        })
    );
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');

    const onceSpy = vi.spyOn(process, 'once');
    const starting = startCapitalCallStatusWorker();
    await vi.waitFor(() => expect(createHealthServerMock).toHaveBeenCalledTimes(1));
    const sigtermHandler = onceSpy.mock.calls.find(([signal]) => signal === 'SIGTERM')?.[1];
    expect(sigtermHandler).toEqual(expect.any(Function));
    const signalStopping = (sigtermHandler as () => Promise<void>)();
    let signalStopSettled = false;
    void signalStopping.then(() => {
      signalStopSettled = true;
    });
    await Promise.resolve();
    expect(signalStopSettled).toBe(false);
    resolveHealth?.({ close: healthServerCloseMock });
    const runtime = await starting;

    await signalStopping;
    expect(workerStopMock).toHaveBeenCalledTimes(1);
    expect(unregisterWorkerMock).toHaveBeenCalledTimes(1);
    expect(healthServerCloseMock).toHaveBeenCalledTimes(1);
    expect(redisQuitMock).toHaveBeenCalledTimes(1);
    await runtime.stop();
    expect(workerStopMock).toHaveBeenCalledTimes(1);
    expect(unregisterWorkerMock).toHaveBeenCalledTimes(1);
    expect(healthServerCloseMock).toHaveBeenCalledTimes(1);
    expect(redisQuitMock).toHaveBeenCalledTimes(1);
  });

  it('removes signal listeners when stop completes and keeps stop idempotent', async () => {
    const { startCapitalCallStatusWorker } =
      await import('../../../workers/capital-call-status-worker');
    const runtime = await startCapitalCallStatusWorker();

    expect(process.listeners('SIGTERM')).toHaveLength(initialSigtermListeners.length + 1);
    expect(process.listeners('SIGINT')).toHaveLength(initialSigintListeners.length + 1);
    await runtime.stop();
    await runtime.stop();

    expect(process.listeners('SIGTERM')).toEqual(initialSigtermListeners);
    expect(process.listeners('SIGINT')).toEqual(initialSigintListeners);
    expect(workerStopMock).toHaveBeenCalledTimes(1);
  });
});
