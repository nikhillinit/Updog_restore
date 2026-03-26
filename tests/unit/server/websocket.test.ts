import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HTTPServer } from 'http';

interface MockSocket {
  id: string;
  rooms: Set<string>;
  on: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  handlers: Record<string, (...args: unknown[]) => unknown>;
}

class MockSocketIOServer {
  public readonly sockets = {
    sockets: new Map([['socket-1', {}]]),
    adapter: {
      rooms: new Map<string, Set<string>>([['fund:1', new Set(['socket-1'])]]),
    },
  };
  public readonly to = vi.fn(() => ({ emit: vi.fn() }));
  public readonly on = vi.fn((event: string, handler: (socket: MockSocket) => void) => {
    if (event === 'connection') {
      this.connectionHandler = handler;
    }
  });
  public connectionHandler?: (socket: MockSocket) => void;
}

const {
  SocketIOServerMock,
  loggerMock,
  findFirstMock,
} = vi.hoisted(() => ({
  SocketIOServerMock: vi.fn(() => new MockSocketIOServer()),
  loggerMock: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  findFirstMock: vi.fn(),
}));

vi.mock('socket.io', () => ({
  Server: SocketIOServerMock,
}));

vi.mock('../../../server/logger', () => ({
  logger: loggerMock,
}));

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      funds: {
        findFirst: findFirstMock,
      },
    },
  },
}));

function createSocket(): MockSocket {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const socket: MockSocket = {
    id: 'socket-1',
    rooms: new Set(['socket-1']),
    handlers,
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      handlers[event] = handler;
    }),
    join: vi.fn((room: string) => {
      socket.rooms.add(room);
    }),
    leave: vi.fn((room: string) => {
      socket.rooms.delete(room);
    }),
  };
  return socket;
}

let socket: MockSocket;

describe('server websocket broker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socket = createSocket();
    findFirstMock.mockResolvedValue({ id: 1 });
  });

  it('subscribes and unsubscribes sockets using typed callbacks', async () => {
    const { initializeWebSocket } = await import('../../../server/websocket');
    const io = initializeWebSocket({} as HTTPServer) as unknown as MockSocketIOServer;

    io.connectionHandler?.(socket);

    const subscribeAck = vi.fn();
    await socket.handlers['subscribe:fund']?.({ fundId: 1, eventTypes: ['calls'] }, subscribeAck);
    expect(subscribeAck).toHaveBeenCalledWith({ success: true, fundId: 1 });
    expect(socket.join).toHaveBeenCalledWith('fund:1');
    expect(socket.join).toHaveBeenCalledWith('fund:1:event:calls');

    const stateAck = vi.fn();
    socket.handlers['get:subscriptions']?.(stateAck);
    expect(stateAck).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptions: [1],
      })
    );

    const unsubscribeAck = vi.fn();
    await socket.handlers['unsubscribe:fund']?.({ fundId: 1 }, unsubscribeAck);
    expect(unsubscribeAck).toHaveBeenCalledWith({ success: true, fundId: 1 });
    expect(socket.leave).toHaveBeenCalledWith('fund:1');
  });

  it('publishes fund events to both room channels', async () => {
    const { publishFundEvent } = await import('../../../server/websocket');
    const emitMock = vi.fn();
    const io = {
      to: vi.fn(() => ({ emit: emitMock })),
    };

    await publishFundEvent(7, 'capital-call', { amount: 10 }, io as never);

    expect(io.to).toHaveBeenCalledWith('fund:7');
    expect(io.to).toHaveBeenCalledWith('fund:7:event:capital-call');
    expect(emitMock).toHaveBeenCalledTimes(2);
  });
});
