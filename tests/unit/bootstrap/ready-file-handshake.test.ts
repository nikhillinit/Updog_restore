import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadEnvMock = vi.fn();
const buildProvidersMock = vi.fn();
const createServerMock = vi.fn();
const setReadyMock = vi.fn();
const logger = {
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
};

vi.mock('../../../server/config/index.js', () => ({
  loadEnv: loadEnvMock,
}));

vi.mock('../../../server/providers.js', () => ({
  buildProviders: buildProvidersMock,
}));

vi.mock('../../../server/server.js', () => ({
  createServer: createServerMock,
}));

vi.mock('../../../server/health/state.js', () => ({
  setReady: setReadyMock,
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger,
}));

describe('bootstrap ready-file handshake', () => {
  const originalTestReadyFile = process.env['TEST_READY_FILE'];
  let readyDir: string | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    readyDir = null;
  });

  afterEach(() => {
    if (originalTestReadyFile === undefined) {
      delete process.env['TEST_READY_FILE'];
    } else {
      process.env['TEST_READY_FILE'] = originalTestReadyFile;
    }

    if (readyDir) {
      fs.rmSync(readyDir, { recursive: true, force: true });
    }
  });

  it('writes server info when TEST_READY_FILE is set', async () => {
    readyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updog-ready-file-'));
    const readyFile = path.join(readyDir, 'vitest-int-server.json');
    process.env['TEST_READY_FILE'] = readyFile;

    const server = {
      listen: vi.fn((_port: number, callback: () => void) => {
        callback();
        return server;
      }),
      address: vi.fn(() => ({ port: 40123 })),
      on: vi.fn(),
      close: vi.fn(),
      requestTimeout: 0,
      headersTimeout: 0,
      keepAliveTimeout: 0,
    };

    loadEnvMock.mockReturnValue({
      NODE_ENV: 'test',
      PORT: 0,
      REDIS_URL: 'memory://',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
      ENABLE_QUEUES: 0,
    });
    buildProvidersMock.mockResolvedValue({
      mode: 'memory',
      rateLimitStore: null,
      queue: { enabled: false },
      teardown: vi.fn(),
    });
    createServerMock.mockResolvedValue(server);

    const processOnSpy = vi.spyOn(process, 'on').mockImplementation((() => process) as any);

    try {
      const { bootstrap } = await import('../../../server/bootstrap.js');
      await bootstrap();
    } finally {
      processOnSpy.mockRestore();
    }

    expect(server.listen).toHaveBeenCalledWith(0, expect.any(Function));
    expect(setReadyMock).toHaveBeenCalledWith(true);
    expect(logger.error).not.toHaveBeenCalled();

    const payload = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
    expect(payload).toEqual({
      port: 40123,
      baseUrl: 'http://localhost:40123',
      pid: process.pid,
    });
  });
});
