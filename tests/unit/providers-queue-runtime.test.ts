import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redisConnect: vi.fn(),
  redisPing: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisSetex: vi.fn(),
  redisDel: vi.fn(),
  redisQuit: vi.fn(),
  initializeSimulationQueue: vi.fn(),
  initializeReportQueue: vi.fn(),
  initializeBacktestingQueue: vi.fn(),
  initializeFundScenarioCalcWorker: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerDebug: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: function IORedisMock() {
    return {
      connect: mocks.redisConnect,
      ping: mocks.redisPing,
      get: mocks.redisGet,
      set: mocks.redisSet,
      setex: mocks.redisSetex,
      del: mocks.redisDel,
      quit: mocks.redisQuit,
    };
  },
}));

vi.mock('../../server/lib/logger.js', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
  },
}));

vi.mock('../../server/queues/simulation-queue.js', () => ({
  initializeSimulationQueue: mocks.initializeSimulationQueue,
}));
vi.mock('../../server/queues/report-generation-queue.js', () => ({
  initializeReportQueue: mocks.initializeReportQueue,
}));
vi.mock('../../server/queues/backtesting-queue.js', () => ({
  initializeBacktestingQueue: mocks.initializeBacktestingQueue,
}));
vi.mock('../../server/queues/fund-scenario-calc-worker-init.js', () => ({
  initializeFundScenarioCalcWorker: mocks.initializeFundScenarioCalcWorker,
}));
const queueRuntime = (close = vi.fn().mockResolvedValue(undefined)) => ({ close });
const SENTINEL = 'sentinel-redis-credential';

function makeReplyError(): Error {
  const error = new Error('WRONGPASS invalid username-password pair');
  error.name = 'ReplyError';
  Object.defineProperty(error, 'command', {
    configurable: true,
    enumerable: true,
    value: { name: 'auth', args: ['default', SENTINEL] },
  });
  return error;
}

function expectSanitizedLog(mock: typeof mocks.loggerWarn | typeof mocks.loggerError): void {
  const serialized = JSON.stringify(mock.mock.calls);
  expect(serialized).toContain('WRONGPASS');
  expect(serialized).not.toContain(SENTINEL);
  expect(serialized).not.toContain('command');
  expect(serialized).not.toContain('args');
}

describe('provider queue runtime policy', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mocks.redisConnect.mockReset().mockResolvedValue(undefined);
    mocks.redisPing.mockReset().mockResolvedValue(undefined);
    mocks.redisGet.mockReset().mockResolvedValue(null);
    mocks.redisSet.mockReset().mockResolvedValue(undefined);
    mocks.redisSetex.mockReset().mockResolvedValue(undefined);
    mocks.redisDel.mockReset().mockResolvedValue(undefined);
    mocks.redisQuit.mockReset().mockResolvedValue(undefined);
    mocks.initializeSimulationQueue.mockReset().mockResolvedValue(queueRuntime());
    mocks.initializeReportQueue.mockReset().mockResolvedValue(queueRuntime());
    mocks.initializeBacktestingQueue.mockReset().mockResolvedValue(queueRuntime());
    mocks.initializeFundScenarioCalcWorker.mockReset().mockResolvedValue(queueRuntime());
    mocks.loggerInfo.mockReset();
    mocks.loggerWarn.mockReset();
    mocks.loggerDebug.mockReset();
    mocks.loggerError.mockReset();
    process.env = { ...originalEnv };
  });

  it('rejects invalid in-process consumers before provider side effects', async () => {
    const { buildProviders } = await import('../../server/providers.js');

    await expect(
      buildProviders({
        NODE_ENV: 'production',
        ENABLE_IN_PROCESS_QUEUE_WORKERS: '1',
      } as ReturnType<typeof import('../../server/config/index.js').loadEnv>)
    ).rejects.toThrow(/in-process queue workers/i);

    expect(mocks.loggerInfo).not.toHaveBeenCalled();
  });

  it('creates only three producer resources when consumers are disabled', async () => {
    const simulation = queueRuntime();
    const report = queueRuntime();
    const backtesting = queueRuntime();
    mocks.initializeSimulationQueue.mockResolvedValue(simulation);
    mocks.initializeReportQueue.mockResolvedValue(report);
    mocks.initializeBacktestingQueue.mockResolvedValue(backtesting);
    const { createProviderQueueRuntime } =
      await import('../../server/queues/provider-queue-runtime.js');

    const runtime = await createProviderQueueRuntime({
      queueRedisUrl: 'redis://queue.test:6379',
      startConsumers: false,
    });

    expect(runtime).toMatchObject({
      enabled: true,
      producersEnabled: true,
      consumersEnabled: false,
    });
    expect(mocks.initializeSimulationQueue).toHaveBeenCalledWith(expect.anything(), {
      startConsumer: false,
    });
    expect(mocks.initializeReportQueue).toHaveBeenCalledWith(expect.anything(), {
      startConsumer: false,
    });
    expect(mocks.initializeBacktestingQueue).toHaveBeenCalledWith(expect.anything(), {
      startConsumer: false,
    });
    expect(mocks.initializeFundScenarioCalcWorker).not.toHaveBeenCalled();

    await runtime.close();
    await runtime.close();
    expect(simulation.close).toHaveBeenCalledTimes(1);
    expect(report.close).toHaveBeenCalledTimes(1);
    expect(backtesting.close).toHaveBeenCalledTimes(1);
    expect(mocks.redisQuit).toHaveBeenCalledTimes(1);
  });

  it('creates no legacy provider queues in production while queue capability remains enabled', async () => {
    const registry = await import('../../server/queues/registry.js');
    const routeOwnedClose = vi.fn().mockImplementation(async () => {
      registry.unregisterQueueRuntime('fund-scenario-calc', 'producer');
    });
    registry.registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => ({}) as never,
      isInitialized: () => true,
      healthMode: 'producer',
      close: routeOwnedClose,
    });
    const { buildProviders } = await import('../../server/providers.js');

    const providers = await buildProviders({
      NODE_ENV: 'production',
      REDIS_URL: 'memory://',
      QUEUE_REDIS_URL: 'redis://queue.test:6379',
      ENABLE_QUEUES: '1',
      ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
    } as ReturnType<typeof import('../../server/config/index.js').loadEnv>);

    expect(providers.queue).toMatchObject({
      enabled: false,
      producersEnabled: false,
      consumersEnabled: false,
    });
    expect(mocks.initializeSimulationQueue).not.toHaveBeenCalled();
    expect(mocks.initializeReportQueue).not.toHaveBeenCalled();
    expect(mocks.initializeBacktestingQueue).not.toHaveBeenCalled();
    expect(mocks.initializeFundScenarioCalcWorker).not.toHaveBeenCalled();
    await providers.teardown?.();
    expect(routeOwnedClose).toHaveBeenCalledTimes(1);
    expect(registry.getRegisteredQueueRuntimes().size).toBe(0);
  });

  it('uses raw Vercel deployment markers for every provider queue decision', async () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    const { buildProviders } = await import('../../server/providers.js');

    const providers = await buildProviders({
      NODE_ENV: 'development',
      REDIS_URL: 'memory://',
      QUEUE_REDIS_URL: 'redis://queue.test:6379',
      ENABLE_QUEUES: '1',
      ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
    } as ReturnType<typeof import('../../server/config/index.js').loadEnv>);

    expect(providers.queue).toMatchObject({ enabled: false, producersEnabled: false });
    expect(mocks.initializeSimulationQueue).not.toHaveBeenCalled();
    expect(mocks.initializeReportQueue).not.toHaveBeenCalled();
    expect(mocks.initializeBacktestingQueue).not.toHaveBeenCalled();
  });

  it('continues app teardown to route-owned resources after provider close failure', async () => {
    const registry = await import('../../server/queues/registry.js');
    const routeOwnedClose = vi.fn().mockImplementation(async () => {
      registry.unregisterQueueRuntime('fund-scenario-calc', 'producer');
    });
    registry.registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => ({}) as never,
      isInitialized: () => true,
      healthMode: 'producer',
      close: routeOwnedClose,
    });
    mocks.initializeSimulationQueue.mockResolvedValue(
      queueRuntime(vi.fn().mockRejectedValue(new Error('provider close failure')))
    );
    const { buildProviders } = await import('../../server/providers.js');

    const providers = await buildProviders({
      NODE_ENV: 'development',
      REDIS_URL: 'memory://',
      QUEUE_REDIS_URL: 'redis://queue.test:6379',
      ENABLE_QUEUES: '1',
      ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
    } as ReturnType<typeof import('../../server/config/index.js').loadEnv>);

    await providers.teardown?.();

    expect(routeOwnedClose).toHaveBeenCalledTimes(1);
    expect(registry.getRegisteredQueueRuntimes().size).toBe(0);
  });

  it('starts all local consumers only on explicit opt-in', async () => {
    const { createProviderQueueRuntime } =
      await import('../../server/queues/provider-queue-runtime.js');

    const runtime = await createProviderQueueRuntime({
      queueRedisUrl: 'redis://queue.test:6379',
      startConsumers: true,
    });

    expect(runtime).toMatchObject({
      enabled: true,
      producersEnabled: true,
      consumersEnabled: true,
    });
    for (const initializer of [
      mocks.initializeSimulationQueue,
      mocks.initializeReportQueue,
      mocks.initializeBacktestingQueue,
    ]) {
      expect(initializer).toHaveBeenCalledWith(expect.anything(), { startConsumer: true });
    }
    expect(mocks.initializeFundScenarioCalcWorker).toHaveBeenCalledTimes(1);
  });

  it('closes successful siblings and reports disabled after partial initialization failure', async () => {
    const simulation = queueRuntime(
      vi.fn().mockRejectedValue(new Error('simulation close failed'))
    );
    const backtesting = queueRuntime();
    const routeOwnedProducerClose = vi.fn().mockResolvedValue(undefined);
    const registry = await import('../../server/queues/registry.js');
    registry.registerQueueRuntime('fund-scenario-calc', {
      getQueue: () => ({}) as never,
      isInitialized: () => true,
      healthMode: 'producer',
      close: routeOwnedProducerClose,
    });
    mocks.initializeSimulationQueue.mockResolvedValue(simulation);
    mocks.initializeReportQueue.mockRejectedValue(new Error('report unavailable'));
    mocks.initializeBacktestingQueue.mockResolvedValue(backtesting);

    const { createProviderQueueRuntime } =
      await import('../../server/queues/provider-queue-runtime.js');
    const runtime = await createProviderQueueRuntime({
      queueRedisUrl: 'redis://queue.test:6379',
      startConsumers: false,
    });

    expect(runtime).toMatchObject({
      enabled: false,
      producersEnabled: false,
      consumersEnabled: false,
    });
    expect(simulation.close).toHaveBeenCalledTimes(1);
    expect(backtesting.close).toHaveBeenCalledTimes(1);
    expect(routeOwnedProducerClose).not.toHaveBeenCalled();
    expect(mocks.redisQuit).toHaveBeenCalledTimes(1);
    expect(registry.getRegisteredQueueRuntime('fund-scenario-calc')).toBeDefined();
    registry.resetQueueRegistry();
  });

  it('sanitizes rejected queue initialization errors before logging', async () => {
    mocks.initializeReportQueue.mockRejectedValue(makeReplyError());
    const { createProviderQueueRuntime } =
      await import('../../server/queues/provider-queue-runtime.js');

    await createProviderQueueRuntime({
      queueRedisUrl: 'redis://queue.test:6379',
      startConsumers: false,
    });

    expectSanitizedLog(mocks.loggerWarn);
  });

  it('sanitizes provider teardown errors before logging', async () => {
    const { BoundedMemoryCache } = await import('../../server/cache/memory.js');
    vi.spyOn(BoundedMemoryCache.prototype, 'close').mockRejectedValueOnce(makeReplyError());
    const { buildProviders } = await import('../../server/providers.js');
    const providers = await buildProviders({
      NODE_ENV: 'development',
      REDIS_URL: 'memory://',
      ENABLE_QUEUES: '0',
      ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
    } as ReturnType<typeof import('../../server/config/index.js').loadEnv>);

    await providers.teardown?.();

    expectSanitizedLog(mocks.loggerError);
  });

  it('sanitizes Redis cache operation and close errors before logging', async () => {
    mocks.redisGet.mockRejectedValueOnce(makeReplyError());
    mocks.redisQuit.mockRejectedValueOnce(makeReplyError());
    const { buildProviders } = await import('../../server/providers.js');
    const providers = await buildProviders({
      NODE_ENV: 'development',
      REDIS_URL: 'redis://cache.test:6379',
      ENABLE_QUEUES: '0',
      ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
    } as ReturnType<typeof import('../../server/config/index.js').loadEnv>);

    await providers.cache.get('cache-key');
    await providers.cache.close?.();

    expect(mocks.loggerWarn).toHaveBeenCalledTimes(2);
    expectSanitizedLog(mocks.loggerWarn);
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain(SENTINEL);
  });

  it('does not log the configured Redis URL when initializing provider queues', async () => {
    const queueRedisUrl = 'redis://default:provider-queue-secret@queue.test:6379';
    const { buildProviders } = await import('../../server/providers.js');

    await buildProviders({
      NODE_ENV: 'development',
      REDIS_URL: 'memory://',
      QUEUE_REDIS_URL: queueRedisUrl,
      ENABLE_QUEUES: '1',
      ENABLE_IN_PROCESS_QUEUE_WORKERS: '0',
    } as ReturnType<typeof import('../../server/config/index.js').loadEnv>);

    expect(JSON.stringify(mocks.loggerDebug.mock.calls)).not.toContain(queueRedisUrl);
  });
});
