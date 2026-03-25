import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HTTPServer } from 'http';

type MessageHandler = (payload?: unknown) => void;

interface MockSocket {
  readyState: number;
  sentMessages: string[];
  on: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  emit(event: string, payload?: unknown): void;
}

const { MockWebSocketServer, connectionHandlerRef, serverInstanceRef, mockLogger } = vi.hoisted(
  () => {
    const connectionHandlerRef: {
      current: ((socket: MockSocket) => void) | null;
    } = { current: null };

    const serverInstanceRef: {
      current: { close: ReturnType<typeof vi.fn> } | null;
    } = { current: null };

    class MockWebSocketServer {
      close = vi.fn();

      constructor(_options: unknown) {
        serverInstanceRef.current = this;
      }

      on(event: string, handler: (socket: MockSocket) => void) {
        if (event === 'connection') {
          connectionHandlerRef.current = handler;
        }
      }
    }

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    return { MockWebSocketServer, connectionHandlerRef, serverInstanceRef, mockLogger };
  }
);

vi.mock('ws', () => ({
  WebSocketServer: MockWebSocketServer,
  WebSocket: { OPEN: 1 },
}));

vi.mock('../../../server/logger', () => ({
  logger: mockLogger,
}));

function createMockSocket(): MockSocket {
  const handlers = new Map<string, MessageHandler>();
  const sentMessages: string[] = [];

  return {
    readyState: 1,
    sentMessages,
    on: vi.fn((event: string, handler: MessageHandler) => {
      handlers.set(event, handler);
    }),
    send: vi.fn((message: string) => {
      sentMessages.push(message);
    }),
    ping: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    emit(event: string, payload?: unknown) {
      handlers.get(event)?.(payload);
    },
  };
}

function parseLastMessage(socket: MockSocket): Record<string, unknown> {
  return JSON.parse(socket.sentMessages.at(-1) ?? 'null') as Record<string, unknown>;
}

describe('PortfolioMetricsWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    connectionHandlerRef.current = null;
    serverInstanceRef.current = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends connection, subscription, ping, and broadcast envelopes', async () => {
    const { default: PortfolioMetricsWebSocket } =
      await import('../../../server/websocket/portfolio-metrics');
    const service = new PortfolioMetricsWebSocket({} as HTTPServer);
    const socket = createMockSocket();

    connectionHandlerRef.current?.(socket);

    expect(JSON.parse(socket.sentMessages[0] ?? 'null')).toMatchObject({
      type: 'connected',
      message: 'Connected to portfolio metrics stream',
    });

    socket.emit('message', JSON.stringify({ type: 'subscribe', channel: 'metrics', fundId: 7 }));
    expect(parseLastMessage(socket)).toMatchObject({
      type: 'subscribed',
      channel: 'metrics:fund:7',
    });

    service.broadcast('metrics', { nav: 42 }, 7);
    expect(parseLastMessage(socket)).toMatchObject({
      type: 'data',
      channel: 'metrics:fund:7',
      data: { nav: 42 },
    });

    socket.emit('message', JSON.stringify({ type: 'ping' }));
    expect(parseLastMessage(socket)).toMatchObject({ type: 'pong' });
    expect(service.getStats()).toEqual({
      totalClients: 1,
      channelStats: { 'metrics:fund:7': 1 },
    });

    service.cleanup();

    expect(socket.close).toHaveBeenCalledWith(1000, 'Server shutting down');
    expect(serverInstanceRef.current?.close).toHaveBeenCalledTimes(1);
  });

  it('sends an error envelope for invalid websocket messages', async () => {
    const { default: PortfolioMetricsWebSocket } =
      await import('../../../server/websocket/portfolio-metrics');
    const service = new PortfolioMetricsWebSocket({} as HTTPServer);
    const socket = createMockSocket();

    connectionHandlerRef.current?.(socket);
    socket.emit('message', '{invalid json');

    expect(parseLastMessage(socket)).toMatchObject({
      type: 'error',
      message: 'Invalid message format',
    });

    service.cleanup();
  });
});
