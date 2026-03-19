import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const { loggerInfoMock, loggerDebugMock, loggerErrorMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('../../../server/logger', () => ({
  logger: {
    info: loggerInfoMock,
    debug: loggerDebugMock,
    error: loggerErrorMock,
  },
}));

import sseRouter, { broadcastFundEvent, getSSEStats } from '../../../server/routes/sse-events';

type RouteHandler = (req: Request, res: Response) => void;

type RouterLayer = {
  route?: {
    path?: string;
    stack: Array<{
      handle: RouteHandler;
    }>;
  };
};

type MockRequest = Partial<Request> & {
  params: Record<string, string | undefined>;
  query: Record<string, unknown>;
  on: (event: 'close', handler: () => void) => void;
};

type MockResponse = Partial<Response> & {
  headers: Record<string, string>;
  statusCode: number;
  jsonBody?: unknown;
  writableEnded: boolean;
  writes: string[];
  setHeader: (name: string, value: string) => void;
  flushHeaders: () => void;
  status: (code: number) => MockResponse;
  json: (body: unknown) => MockResponse;
  write: (chunk: string) => boolean;
  end: () => MockResponse;
};

function getRouteHandler(path: string): RouteHandler {
  const layers = (sseRouter as unknown as { stack: RouterLayer[] }).stack;
  const layer = layers.find((entry) => entry.route?.path === path);
  const handler = layer?.route?.stack[0]?.handle;

  if (!handler) {
    throw new Error(`Route handler not found for ${path}`);
  }

  return handler;
}

function createMockResponse(): MockResponse {
  const response: MockResponse = {
    headers: {},
    statusCode: 200,
    writableEnded: false,
    writes: [],
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    flushHeaders() {
      return undefined;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
    write(chunk: string) {
      this.writes.push(chunk);
      return true;
    },
    end() {
      this.writableEnded = true;
      return this;
    },
  };

  return response;
}

describe('SSE routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const stats = getSSEStats();
    expect(stats.totalFundConnections).toBe(0);
    expect(stats.totalSimulationConnections).toBe(0);
  });

  it('returns 400 for invalid fund ids', () => {
    const handler = getRouteHandler('/api/events/fund/:fundId');
    const response = createMockResponse();
    const request: MockRequest = {
      params: { fundId: 'invalid' },
      query: {},
      on: vi.fn(),
    };

    handler(request as Request, response as unknown as Response);

    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toEqual({
      error: 'Invalid fund ID',
      message: 'Fund ID must be a positive integer',
    });
  });

  it('broadcasts only events allowed by the connection filter and cleans up on close', () => {
    const handler = getRouteHandler('/api/events/fund/:fundId');
    const response = createMockResponse();
    let closeHandler: (() => void) | undefined;

    const request: MockRequest = {
      params: { fundId: '42' },
      query: { eventTypes: 'simulation:progress' },
      on: (_event, handlerFn) => {
        closeHandler = handlerFn;
      },
    };

    handler(request as Request, response as unknown as Response);

    expect(getSSEStats().totalFundConnections).toBe(1);
    response.writes = [];

    broadcastFundEvent(42, 'simulation:progress', { phase: 'running' });
    expect(response.writes.join('')).toContain('event: simulation:progress');
    expect(response.writes.join('')).toContain('"phase":"running"');

    response.writes = [];
    broadcastFundEvent(42, 'forecast:ready', { phase: 'done' });
    expect(response.writes).toEqual([]);

    closeHandler?.();
    expect(getSSEStats().totalFundConnections).toBe(0);
  });
});
