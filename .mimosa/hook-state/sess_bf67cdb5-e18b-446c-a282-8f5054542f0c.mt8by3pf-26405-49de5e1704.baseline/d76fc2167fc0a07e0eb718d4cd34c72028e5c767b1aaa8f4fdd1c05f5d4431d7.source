import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queueConstructorMock, workerConstructorMock } = vi.hoisted(() => ({
  queueConstructorMock: vi.fn(),
  workerConstructorMock: vi.fn(),
}));

vi.mock('bullmq', async () => {
  const actual = await vi.importActual<typeof import('bullmq')>('bullmq');
  return {
    ...actual,
    Queue: function MockQueue(...args: unknown[]) {
      queueConstructorMock(...args);
      return { close: vi.fn(), on: vi.fn() };
    },
    Worker: function MockWorker(...args: unknown[]) {
      workerConstructorMock(...args);
      return { close: vi.fn(), on: vi.fn() };
    },
  };
});

describe('queue production boundary', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    queueConstructorMock.mockReset();
    workerConstructorMock.mockReset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('rejects Vercel consumer opt-in before app construction side effects', async () => {
    process.env.NODE_ENV = 'test';
    process.env.VERCEL = '1';
    process.env.ENABLE_IN_PROCESS_QUEUE_WORKERS = '1';

    const { makeApp } = await import('../../../server/app.js');

    expect(() => makeApp()).toThrow(/Vercel/i);
    expect(queueConstructorMock).not.toHaveBeenCalled();
    expect(workerConstructorMock).not.toHaveBeenCalled();
  });

  it('constructs Vercel app with no legacy queues or workers', async () => {
    process.env.NODE_ENV = 'test';
    process.env.VERCEL_ENV = 'preview';
    process.env.ENABLE_IN_PROCESS_QUEUE_WORKERS = '0';

    const { makeApp } = await import('../../../server/app.js');

    expect(makeApp()).toBeDefined();
    expect(queueConstructorMock).not.toHaveBeenCalled();
    expect(workerConstructorMock).not.toHaveBeenCalled();
  });
});
