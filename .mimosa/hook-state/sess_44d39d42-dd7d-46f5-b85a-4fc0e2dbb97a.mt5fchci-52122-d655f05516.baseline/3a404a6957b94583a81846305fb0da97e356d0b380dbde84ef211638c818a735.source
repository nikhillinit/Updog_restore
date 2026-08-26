import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingHttpHeaders, IncomingMessage, Server as HTTPServer } from 'http';
import type PortfolioMetricsWebSocket from '../../../server/websocket/portfolio-metrics';

type MessageHandler = (payload?: unknown) => void;
type UpgradeDone = (verified: boolean, code?: number, message?: string) => void;
type VerifyClient = (
  info: { origin: string; secure: boolean; req: IncomingMessage },
  done: UpgradeDone
) => void;

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

const {
  MockWebSocketServer,
  connectionHandlerRef,
  serverInstanceRef,
  verifyClientRef,
  mockDb,
  dbRowsRef,
  verifyAccessTokenAsyncMock,
  mockLogger,
} = vi.hoisted(() => {
  const connectionHandlerRef: {
    current: ((socket: MockSocket, request: IncomingMessage) => void) | null;
  } = { current: null };

  const serverInstanceRef: {
    current: { close: ReturnType<typeof vi.fn> } | null;
  } = { current: null };

  const verifyClientRef: { current: VerifyClient | null } = { current: null };
  const dbRowsRef: { current: Array<{ fundId: number }> } = { current: [] };
  const verifyAccessTokenAsyncMock = vi.fn();

  const query = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.limit.mockImplementation(() => Promise.resolve(dbRowsRef.current));

  const mockDb = {
    select: vi.fn(() => query),
  };

  class MockWebSocketServer {
    close = vi.fn();

    constructor(options: unknown) {
      serverInstanceRef.current = this;
      verifyClientRef.current = (options as { verifyClient?: VerifyClient }).verifyClient ?? null;
    }

    on(event: string, handler: (socket: MockSocket, request: IncomingMessage) => void) {
      if (event === 'connection') connectionHandlerRef.current = handler;
    }
  }

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    MockWebSocketServer,
    connectionHandlerRef,
    serverInstanceRef,
    verifyClientRef,
    mockDb,
    dbRowsRef,
    verifyAccessTokenAsyncMock,
    mockLogger,
  };
});

vi.mock('ws', () => ({
  WebSocketServer: MockWebSocketServer,
  WebSocket: { OPEN: 1 },
}));

vi.mock('../../../server/db', () => ({ db: mockDb }));

vi.mock('../../../server/lib/auth/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/lib/auth/jwt')>();
  return { ...actual, verifyAccessTokenAsync: verifyAccessTokenAsyncMock };
});

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

function createUpgradeRequest(headers: IncomingHttpHeaders): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
}

function parseLastMessage(socket: MockSocket): Record<string, unknown> {
  return JSON.parse(socket.sentMessages.at(-1) ?? 'null') as Record<string, unknown>;
}

async function flushMessageHandling(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

const AUTH_CLAIMS = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'analyst',
  fundIds: [7],
};

// Non-team principal: strict fund-scope grants apply (no universal team READ).
const SCOPED_CLAIMS = {
  sub: 'lp-user-1',
  email: 'lp@example.com',
  role: 'lp',
  lpId: 'lp-1',
  fundIds: [7],
};

describe('PortfolioMetricsWebSocket', () => {
  let service: PortfolioMetricsWebSocket | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccessTokenAsyncMock.mockReset();
    vi.resetModules();
    vi.useFakeTimers();
    connectionHandlerRef.current = null;
    serverInstanceRef.current = null;
    verifyClientRef.current = null;
    dbRowsRef.current = [];
  });

  afterEach(() => {
    service?.cleanup();
    service = null;
    vi.useRealTimers();
  });

  async function importService() {
    const { default: PortfolioMetricsWebSocket } =
      await import('../../../server/websocket/portfolio-metrics');
    service = new PortfolioMetricsWebSocket({} as HTTPServer);
  }

  async function verifyUpgrade(headers: IncomingHttpHeaders) {
    const request = createUpgradeRequest(headers);
    const verifyClient = verifyClientRef.current;
    if (!verifyClient) throw new Error('verifyClient was not registered');

    const result = await new Promise<{ verified: boolean; code?: number; message?: string }>(
      (resolve) => {
        verifyClient(
          {
            origin: typeof headers.origin === 'string' ? headers.origin : '',
            secure: false,
            req: request,
          },
          (verified, code, message) => resolve({ verified, code, message })
        );
      }
    );
    return { request, result };
  }

  async function openConnection(headers: IncomingHttpHeaders) {
    const { request, result } = await verifyUpgrade(headers);
    const socket = createMockSocket();
    if (result.verified) connectionHandlerRef.current?.(socket, request);
    return { request, result, socket };
  }

  it('sends connection, subscription, ping, and broadcast envelopes after authenticated upgrade', async () => {
    verifyAccessTokenAsyncMock.mockResolvedValue(AUTH_CLAIMS);
    await importService();
    const { result, socket } = await openConnection({
      authorization: 'Bearer valid-token',
      host: 'localhost:5000',
    });

    expect(result).toMatchObject({ verified: true });
    expect(JSON.parse(socket.sentMessages[0] ?? 'null')).toMatchObject({
      type: 'connected',
      message: 'Connected to portfolio metrics stream',
    });

    socket.emit('message', JSON.stringify({ type: 'subscribe', channel: 'metrics', fundId: 7 }));
    await flushMessageHandling();
    expect(parseLastMessage(socket)).toMatchObject({
      type: 'subscribed',
      channel: 'metrics:fund:7',
    });

    service?.broadcast('metrics', { nav: 42 }, 7);
    expect(parseLastMessage(socket)).toMatchObject({
      type: 'data',
      channel: 'metrics:fund:7',
      data: { nav: 42 },
    });

    socket.emit('message', JSON.stringify({ type: 'ping' }));
    await flushMessageHandling();
    expect(parseLastMessage(socket)).toMatchObject({ type: 'pong' });
    expect(service?.getStats()).toEqual({
      totalClients: 1,
      channelStats: { 'metrics:fund:7': 1 },
    });
  });

  it('rejects upgrades without credentials', async () => {
    await importService();
    const { result } = await verifyUpgrade({ host: 'localhost:5000' });

    expect(result).toMatchObject({ verified: false, code: 401, message: 'Unauthorized' });
    expect(verifyAccessTokenAsyncMock).not.toHaveBeenCalled();
  });

  it('does not treat deferred token verification as successful', async () => {
    let rejectVerification: ((error: Error) => void) | undefined;
    verifyAccessTokenAsyncMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectVerification = reject;
        })
    );
    await importService();

    const request = createUpgradeRequest({ authorization: 'Bearer slow-token' });
    const verifyClient = verifyClientRef.current;
    if (!verifyClient) throw new Error('verifyClient was not registered');
    const done = vi.fn<UpgradeDone>();
    verifyClient({ origin: '', secure: false, req: request }, done);

    await flushMessageHandling();
    expect(done).not.toHaveBeenCalled();

    rejectVerification?.(new Error('slow verification failed'));
    await flushMessageHandling();
    expect(done).toHaveBeenCalledWith(false, 401, 'Unauthorized');
  });

  it('requires an allowed Origin for cookie credentials but not Bearer credentials', async () => {
    verifyAccessTokenAsyncMock.mockResolvedValue(AUTH_CLAIMS);
    await importService();

    const deniedCookie = await verifyUpgrade({
      cookie: 'updog.session=valid-token',
      origin: 'https://evil.example',
      host: 'localhost:5000',
    });
    expect(deniedCookie.result).toMatchObject({ verified: false, code: 403, message: 'Forbidden' });
    expect(verifyAccessTokenAsyncMock).not.toHaveBeenCalled();

    const allowedCookie = await verifyUpgrade({
      cookie: 'updog.session=valid-token',
      origin: 'http://localhost:5173',
      host: 'localhost:5000',
    });
    expect(allowedCookie.result).toMatchObject({ verified: true });

    const bearerWithUntrustedOrigin = await verifyUpgrade({
      authorization: 'Bearer valid-token',
      origin: 'https://evil.example',
      host: 'localhost:5000',
    });
    expect(bearerWithUntrustedOrigin.result).toMatchObject({ verified: true });
  });

  it('authorizes fund and entity channels against the authenticated fund scope', async () => {
    verifyAccessTokenAsyncMock.mockResolvedValue(SCOPED_CLAIMS);
    await importService();
    const { socket } = await openConnection({ authorization: 'Bearer valid-token' });

    socket.emit('message', JSON.stringify({ type: 'subscribe', channel: 'metrics', fundId: 7 }));
    await flushMessageHandling();
    expect(parseLastMessage(socket)).toMatchObject({ type: 'subscribed' });

    socket.emit('message', JSON.stringify({ type: 'subscribe', channel: 'metrics', fundId: 8 }));
    await flushMessageHandling();
    expect(parseLastMessage(socket)).toMatchObject({
      type: 'error',
      message: 'Subscription is not authorized',
    });

    const entityChannels = [
      ['scenario', '11111111-1111-4111-8111-111111111111'],
      ['forecast', '22222222-2222-4222-8222-222222222222'],
      ['simulation', '33333333-3333-4333-8333-333333333333'],
    ] as const;
    for (const [channel, entityId] of entityChannels) {
      dbRowsRef.current = [{ fundId: 7 }];
      socket.emit('message', JSON.stringify({ type: 'subscribe', channel, entityId }));
      await flushMessageHandling();
      expect(parseLastMessage(socket)).toMatchObject({ type: 'subscribed' });
    }

    dbRowsRef.current = [{ fundId: 8 }];
    socket.emit(
      'message',
      JSON.stringify({
        type: 'subscribe',
        channel: 'scenario',
        entityId: '44444444-4444-4444-8444-444444444444',
      })
    );
    await flushMessageHandling();
    expect(parseLastMessage(socket)).toMatchObject({ type: 'error' });

    dbRowsRef.current = [];
    socket.emit(
      'message',
      JSON.stringify({
        type: 'subscribe',
        channel: 'forecast',
        entityId: '55555555-5555-4555-8555-555555555555',
      })
    );
    await flushMessageHandling();
    expect(parseLastMessage(socket)).toMatchObject({ type: 'error' });

    for (const channel of ['metrics', 'scenario', 'forecast', 'simulation'] as const) {
      socket.emit('message', JSON.stringify({ type: 'subscribe', channel }));
      await flushMessageHandling();
      expect(parseLastMessage(socket)).toMatchObject({ type: 'error' });
    }

    for (const [channel, entityId] of [
      ['metrics', '99999999-9999-4999-8999-999999999999'],
      ['scenario', '66666666-6666-4666-8666-666666666666'],
      ['forecast', '77777777-7777-4777-8777-777777777777'],
      ['simulation', '88888888-8888-4888-8888-888888888888'],
    ] as const) {
      dbRowsRef.current = [{ fundId: 7 }];
      socket.emit(
        'message',
        JSON.stringify({ type: 'subscribe', channel, fundId: 7, ...(entityId && { entityId }) })
      );
      await flushMessageHandling();
      expect(parseLastMessage(socket)).toMatchObject({ type: 'error' });
    }
  });

  it('grants universal team READ to team roles without explicit fund grants', async () => {
    verifyAccessTokenAsyncMock.mockResolvedValue({ ...AUTH_CLAIMS, role: 'viewer', fundIds: [] });
    await importService();
    const { socket } = await openConnection({ authorization: 'Bearer valid-token' });

    socket.emit('message', JSON.stringify({ type: 'subscribe', channel: 'metrics', fundId: 42 }));
    await flushMessageHandling();
    expect(parseLastMessage(socket)).toMatchObject({ type: 'subscribed' });

    // Unscoped subscriptions stay rejected even for team readers.
    socket.emit('message', JSON.stringify({ type: 'subscribe', channel: 'metrics' }));
    await flushMessageHandling();
    expect(parseLastMessage(socket)).toMatchObject({
      type: 'error',
      message: 'Subscription is not authorized',
    });
  });

  it('reports subscription availability errors distinctly from malformed messages', async () => {
    verifyAccessTokenAsyncMock.mockResolvedValue(SCOPED_CLAIMS);
    await importService();
    const { socket } = await openConnection({ authorization: 'Bearer valid-token' });

    const failure = new Error('database offline');
    const query = mockDb.select as ReturnType<typeof vi.fn>;
    query.mockImplementationOnce(() => {
      throw failure;
    });

    socket.emit(
      'message',
      JSON.stringify({
        type: 'subscribe',
        channel: 'scenario',
        entityId: '11111111-1111-4111-8111-111111111111',
      })
    );
    await flushMessageHandling();

    expect(parseLastMessage(socket)).toMatchObject({
      type: 'error',
      message: 'Subscription service unavailable',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[PortfolioMetricsWS] Subscription handling failed',
      expect.objectContaining({ error: 'database offline' })
    );
  });

  it('sends an error envelope for invalid websocket messages after authenticated upgrade', async () => {
    verifyAccessTokenAsyncMock.mockResolvedValue(AUTH_CLAIMS);
    await importService();
    const { socket } = await openConnection({ authorization: 'Bearer valid-token' });

    socket.emit('message', '{invalid json');
    await flushMessageHandling();

    expect(parseLastMessage(socket)).toMatchObject({
      type: 'error',
      message: 'Invalid message format',
    });
  });
});
