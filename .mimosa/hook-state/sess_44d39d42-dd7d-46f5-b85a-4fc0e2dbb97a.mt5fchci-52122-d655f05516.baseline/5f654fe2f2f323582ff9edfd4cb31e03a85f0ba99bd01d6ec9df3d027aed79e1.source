import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express, NextFunction, Request, Response } from 'express';

const {
  createServerMock,
  createLoggerMock,
  transformIndexHtmlMock,
  _ssrFixStacktraceMock,
  middlewaresMock,
  readFileMock,
  existsSyncMock,
  nanoidMock,
} = vi.hoisted(() => {
  const transformIndexHtmlMock = vi.fn();
  const _ssrFixStacktraceMock = vi.fn();
  const middlewaresMock = vi.fn();
  const createServerMock = vi.fn(async () => ({
    middlewares: middlewaresMock,
    transformIndexHtml: transformIndexHtmlMock,
    ssrFixStacktrace: _ssrFixStacktraceMock,
  }));
  const createLoggerMock = vi.fn(() => ({
    error: vi.fn(),
  }));
  const readFileMock = vi.fn();
  const existsSyncMock = vi.fn();
  const nanoidMock = vi.fn(() => 'test-id');

  return {
    createServerMock,
    createLoggerMock,
    transformIndexHtmlMock,
    _ssrFixStacktraceMock,
    middlewaresMock,
    readFileMock,
    existsSyncMock,
    nanoidMock,
  };
});

vi.mock('vite', () => ({
  createServer: createServerMock,
  createLogger: createLoggerMock,
}));

vi.mock('../../../vite.config', () => ({
  default: {},
}));

vi.mock('fs', () => ({
  default: {
    promises: {
      readFile: readFileMock,
    },
    existsSync: existsSyncMock,
  },
}));

vi.mock('nanoid', () => ({
  nanoid: nanoidMock,
}));

describe('server/vite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileMock.mockResolvedValue('<html><script src="/src/main.tsx"></script></html>');
    transformIndexHtmlMock.mockResolvedValue('<html>transformed</html>');
    existsSyncMock.mockReturnValue(true);
  });

  it('installs vite middleware and serves transformed index html', async () => {
    const app = {
      use: vi.fn(),
    } as unknown as Express;

    const { setupVite } = await import('../../../server/vite');
    await setupVite(app);

    expect(app.use).toHaveBeenNthCalledWith(1, middlewaresMock);
    expect(app.use).toHaveBeenCalledTimes(2);

    const routeHandler = app.use.mock.calls[1]?.[1] as (
      req: Request,
      res: Response,
      next: NextFunction
    ) => Promise<void>;

    const res = {
      status: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      end: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    await routeHandler(
      { originalUrl: '/dashboard' } as Request,
      res,
      next
    );

    expect(transformIndexHtmlMock).toHaveBeenCalledWith(
      '/dashboard',
      expect.stringContaining('src="/src/main.tsx?v=test-id"')
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.set).toHaveBeenCalledWith({ 'Content-Type': 'text/html' });
    expect(res.end).toHaveBeenCalledWith('<html>transformed</html>');
    expect(next).not.toHaveBeenCalled();
  });

  it('throws when the static build directory is missing', async () => {
    existsSyncMock.mockReturnValue(false);
    const app = {
      use: vi.fn(),
    } as unknown as Express;

    const { serveStatic } = await import('../../../server/vite');

    expect(() => serveStatic(app, 'missing-dist')).toThrow(
      'Could not find the build directory: missing-dist, make sure to build the client first'
    );
  });
});
