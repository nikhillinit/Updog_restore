import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HTTPServer } from 'http';

interface MockSocket {
  id: string;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  handlers: Record<string, (...args: unknown[]) => unknown>;
}

class MockSocketServer {
  public readonly engine = { clientsCount: 1 };
  public readonly sockets = {
    sockets: new Map([['socket-1', {}]]),
    adapter: { rooms: new Map<string, Set<string>>() },
  };
  public readonly emit = vi.fn();
  public readonly close = vi.fn();
  public connectionHandler?: (socket: MockSocket) => void;

  on(event: string, handler: (socket: MockSocket) => void): void {
    if (event === 'connection') {
      this.connectionHandler = handler;
    }
  }
}

const {
  execAsyncMock,
  SocketIOServerMock,
  _watchMock,
  watcher,
  requireMock,
  loggerMock,
  socketServerInstances,
} = vi.hoisted(() => {
  const execAsyncMock = vi.fn();
  const socketServerInstances: MockSocketServer[] = [];
  const SocketIOServerMock = vi.fn(function () {
    const server = new MockSocketServer();
    socketServerInstances.push(server);
    return server;
  });
  const watcher = {
    on: vi.fn().mockReturnThis(),
    close: vi.fn(),
  };
  const _watchMock = vi.fn(() => watcher);
  const requireMock = vi.fn(() => ({ watch: _watchMock }));
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    execAsyncMock,
    SocketIOServerMock,
    _watchMock,
    watcher,
    requireMock,
    loggerMock,
    socketServerInstances,
  };
});

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
}));

vi.mock('socket.io', () => ({
  Server: SocketIOServerMock,
}));

vi.mock('module', () => ({
  createRequire: vi.fn(() => requireMock),
}));

vi.mock('../../../server/logger', () => ({
  logger: loggerMock,
}));

function createSocket(id = 'socket-1'): MockSocket {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  return {
    id,
    handlers,
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      handlers[event] = handler;
    }),
  };
}

describe('dev dashboard websocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketServerInstances.length = 0;
    execAsyncMock.mockImplementation(async (command: string) => {
      if (command.startsWith('npx tsc')) {
        return {
          stdout: 'server/app.ts(2,1): error TS1005: websocket\n',
          stderr: '',
        };
      }

      if (command.startsWith('git status --porcelain')) {
        return { stdout: ' M server/websocket/dev-dashboard.ts\n', stderr: '' };
      }

      if (command.startsWith('npm run test:quick')) {
        return { stdout: '{"numPassedTests":6,"numFailedTests":1}\n', stderr: '' };
      }

      return { stdout: '', stderr: '' };
    });
  });

  it('emits typed metric snapshots on connection and request', async () => {
    const { default: DevDashboardWebSocket } =
      await import('../../../server/websocket/dev-dashboard');
    const instance = new DevDashboardWebSocket({} as HTTPServer);
    const socketServer = socketServerInstances[0];
    const socket = createSocket();

    socketServer.connectionHandler?.(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const requestMetrics = socket.handlers.request_metrics;
    expect(requestMetrics).toBeTypeOf('function');
    requestMetrics?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(socket.emit).toHaveBeenCalledWith(
      'dev_dashboard_event',
      expect.objectContaining({
        type: 'metrics_update',
      })
    );

    expect(socket.emit).toHaveBeenCalledTimes(2);
    instance.cleanup();
    expect(watcher.close).toHaveBeenCalledTimes(1);
    expect(socketServer.close).toHaveBeenCalledTimes(1);
  });

  it('broadcasts test execution events', async () => {
    const { default: DevDashboardWebSocket } =
      await import('../../../server/websocket/dev-dashboard');
    new DevDashboardWebSocket({} as HTTPServer);
    const socketServer = socketServerInstances[0];
    const socket = createSocket();

    socketServer.connectionHandler?.(socket);
    const triggerTests = socket.handlers.trigger_tests;
    expect(triggerTests).toBeTypeOf('function');

    await triggerTests?.();

    expect(socketServer.emit).toHaveBeenCalledWith(
      'dev_dashboard_event',
      expect.objectContaining({
        type: 'test_started',
      })
    );
    expect(socketServer.emit).toHaveBeenCalledWith(
      'dev_dashboard_event',
      expect.objectContaining({
        type: 'test_completed',
        data: expect.objectContaining({
          results: expect.objectContaining({
            passed: 6,
            failed: 1,
          }),
        }),
      })
    );
  });
});
