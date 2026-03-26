import express, { type Express } from 'express';
import fs from 'fs';
import path from 'path';
import { type Server } from 'http';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import viteConfig from '../vite.config';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

interface ViteLogger {
  error(message: string, options?: unknown): void;
}

interface ViteServerLike {
  middlewares: RequestHandler;
  transformIndexHtml(url: string, template: string): Promise<string>;
  ssrFixStacktrace(error: Error): void;
}

interface ViteModuleLike {
  createServer(config: Record<string, unknown>): Promise<unknown>;
  createLogger(): unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isViteLogger(value: unknown): value is ViteLogger {
  return isRecord(value) && typeof value['error'] === 'function';
}

function isViteServerLike(value: unknown): value is ViteServerLike {
  return (
    isRecord(value) &&
    typeof value['middlewares'] === 'function' &&
    typeof value['transformIndexHtml'] === 'function' &&
    typeof value['ssrFixStacktrace'] === 'function'
  );
}

function isViteModuleLike(value: unknown): value is ViteModuleLike {
  return (
    isRecord(value) &&
    typeof value['createServer'] === 'function' &&
    typeof value['createLogger'] === 'function'
  );
}

export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  process.stdout.write(`${formattedTime} [${source}] ${message}\n`);
}

export async function setupVite(app: Express, server?: Server) {
  const viteModule: unknown = await import('vite');
  if (!isViteModuleLike(viteModule)) {
    throw new Error('Unexpected Vite module shape');
  }

  const viteLoggerCandidate = viteModule.createLogger();
  if (!isViteLogger(viteLoggerCandidate)) {
    throw new Error('Unexpected Vite logger shape');
  }

  const baseConfigUnknown: unknown = viteConfig;
  const baseConfig = isRecord(baseConfigUnknown) ? baseConfigUnknown : {};

  const viteCandidate = await viteModule.createServer({
    ...baseConfig,
    configFile: false,
    customLogger: {
      ...viteLoggerCandidate,
      error: (msg: string, options?: unknown) => {
        const viteLogger = viteLoggerCandidate;
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      middlewareMode: true,
      hmr: server ? { server } : false,
      allowedHosts: true,
    },
    appType: 'custom',
  });
  if (!isViteServerLike(viteCandidate)) {
    throw new Error('Unexpected Vite dev server shape');
  }

  const vite = viteCandidate;

  app.use(vite.middlewares);
  app.use('*', async (req: Request, res: Response, next: NextFunction) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(serverDir, '..', 'client', 'index.html');

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, 'utf-8');
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(page);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

export function serveStatic(app: Express, distPath?: string) {
  const resolvedDistPath = distPath ?? path.resolve(process.cwd(), 'dist', 'public');

  if (!fs.existsSync(resolvedDistPath)) {
    throw new Error(
      `Could not find the build directory: ${resolvedDistPath}, make sure to build the client first`
    );
  }

  app.use(express.static(resolvedDistPath));

  // fall through to index.html if the file doesn't exist
  app.use('*', (_req: Request, res: Response) => {
    res.sendFile(path.resolve(resolvedDistPath, 'index.html'));
  });
}
