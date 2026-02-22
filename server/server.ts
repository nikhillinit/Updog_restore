/* eslint-disable @typescript-eslint/no-explicit-any */ // Express app initialization

/**
 * DI-Friendly Express Server
 * Consumes providers instead of creating global connections
 */

import type { Response, NextFunction } from 'express';
import express, { type Request } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import bodyParser from 'body-parser';
import { withNonce, csp } from './security/csp';
import { cspReportRoute } from './routes/public/csp-report';
// REMOVED: Legacy simple flags route - use secure flagsRouter from routes/flags.ts instead
// import { flagsRoute } from './routes/public/flags';
import cors from 'cors';
import { requestId } from './middleware/requestId.js';
import { shutdownGuard } from './middleware/shutdownGuard.js';
import { rateLimitDetailed } from './middleware/rateLimitDetailed.js';
import { correlation } from './middleware/correlation.js';
import { engineGuardExpress } from './middleware/engineGuardExpress.js';
import { requireSecureContext } from './lib/secure-context.js';
import { withRLSTransaction } from './middleware/with-rls-transaction.js';
import { handlePreconditionError } from './lib/http-preconditions.js';
import { withIdempotency } from './lib/idempotency.js';
import { sendApiError, createErrorBody } from './lib/apiError.js';
import { registerRoutes } from './routes.js';
import { serveStatic, setupVite } from './vite.js';
import { errorHandler } from './errors.js';
import { metricsRouter } from './routes/metrics-endpoint.js';
import type { Providers } from './providers.js';

// CORS configuration with origin validation
function parseOrigins(raw?: string): string[] {
  if (!raw) return ['http://localhost:5173', 'http://localhost:5000'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      try {
        const u = new URL(s);
        return ['http:', 'https:'].includes(u.protocol) && !!u.hostname;
      } catch {
        return false;
      }
    });
}

export async function createServer(
  config: ReturnType<typeof import('./config/index.js').loadEnv>,
  providers: Providers
): Promise<import('node:http').Server> {
  const app = express();

  console.log('[server] Creating Express application...');
  console.log(`[server] NODE_ENV: ${config.NODE_ENV}`);

  // Bind providers to app.locals for routes/services
  app.locals['providers'] = providers;
  app.locals['cache'] = providers.cache;
  app.locals['config'] = config;

  // Security first - disable version disclosure
  app['disable']('x-powered-by');

  // Trust proxy configuration from environment or safe defaults
  const trustProxy = process.env['TRUST_PROXY'] || 'loopback, linklocal, uniquelocal';
  app['set']('trust proxy', trustProxy);

  // Request ID MUST be first for correlation on all paths
  app.use(requestId());

  // Correlation ID for tracing
  app.use(correlation);

  // CSP nonce generation
  app.use(withNonce);

  // Engine guards for NaN/Infinity sanitization and fault injection
  app.use(engineGuardExpress());

  // Version headers for observability
  app.use((req: Request, res: Response, next: NextFunction) => {
    const version = config.APP_VERSION;
    res['set']('X-Service-Version', version);
    res['set']('X-Service-Name', 'fund-platform-api');
    req.version = version;
    next();
  });

  // Shutdown guard MUST be after version headers
  app.use(shutdownGuard());

  // Security and performance middleware - use our enhanced CSP instead
  app.use(csp());

  // CORS configuration with origin validation
  const corsOrigins = parseOrigins(config.CORS_ORIGIN);

  // Fail fast if CORS_ORIGIN is set but invalid
  if (process.env['CORS_ORIGIN'] && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGIN set but no valid origins were parsed. Check your configuration.');
  }

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    })
  );

  app.use(compression());

  // Body parsing with size limits and CSP report support
  const bodyLimit = config.BODY_LIMIT;
  app.use(
    bodyParser['json']({
      limit: bodyLimit,
      type: ['application/json', 'application/csp-report'],
    })
  );
  app.use(express.urlencoded({ extended: false, limit: bodyLimit }));

  // Body parser error handler (now has req.requestId available)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (!err) return next();

    // Ensure X-Request-ID is set
    if (req.requestId && !res['get']('X-Request-ID')) {
      res['set']('X-Request-ID', req.requestId);
    }

    if (err?.type === 'entity.too.large') {
      return sendApiError(
        res,
        413,
        createErrorBody('Payload Too Large', req.requestId, 'PAYLOAD_TOO_LARGE')
      );
    }
    if (err?.type === 'entity.parse.failed') {
      return sendApiError(res, 400, createErrorBody('Invalid JSON', req.requestId, 'INVALID_JSON'));
    }
    next(err);
  });

  // Public routes (before rate limiting)
  app.use('/api', cspReportRoute);
  // REMOVED: Legacy flagsRoute - secure flagsRouter in routes/flags.ts handles /api/flags
  // app.use("/api", flagsRoute);

  // Request logging middleware with version
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson: any) {
      capturedJsonResponse = bodyJson;
      return originalResJson.call(res, bodyJson);
    };

    res['on']('finish', () => {
      const duration = Date.now() - start;
      if (path.startsWith('/api')) {
        const version = config.APP_VERSION;

        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms [v${version}]`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = `${logLine.slice(0, 79)}…`;
        }

        // Include version in structured logs
        console.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'info',
            msg: logLine,
            service: 'fund-platform-api',
            version,
            environment: config.NODE_ENV,
            method: req.method,
            path,
            statusCode: res.statusCode,
            duration,
            requestId: req.requestId,
          })
        );
      }
    });

    next();
  });

  // Rate limiter: pass store; undefined => memory store (no redis)
  app.use(
    '/health/detailed',
    rateLimitDetailed(
      providers.rateLimitStore !== undefined ? { store: providers.rateLimitStore } : undefined
    )
  );

  // Metrics endpoints (public, no auth required)
  app.use('/metrics', metricsRouter);

  // RUM metrics endpoint (public, for browser telemetry)
  const { metricsRumRouter } = await import('./routes/metrics-rum.js');
  const { rumOriginGuard, rumSamplingGuard, rumLimiter } =
    await import('./routes/metrics-rum.guard.js');

  // Apply guards and router together at the same path to prevent path resolution issues
  // Guards run in order: origin check -> rate limit -> sampling -> privacy (in router)
  app.use(rumOriginGuard, rumLimiter, rumSamplingGuard, metricsRumRouter);

  // Centralized public-path matcher (mount-relative, no /api prefix)
  // Normalizes trailing slashes for consistent matching
  const PUBLIC_EXACT = new Set(['/healthz', '/readyz', '/flags', '/flags/status']);
  const PUBLIC_PREFIXES = ['/health/', '/health'];

  function isPublicPath(mountRelativePath: string): boolean {
    const p =
      mountRelativePath.endsWith('/') && mountRelativePath.length > 1
        ? mountRelativePath.slice(0, -1)
        : mountRelativePath;
    if (PUBLIC_EXACT.has(p)) return true;
    return PUBLIC_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix));
  }

  // Apply authentication and RLS middleware to protected routes
  // Note: Some routes like /healthz and /metrics are public
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    // Skip auth for public endpoints (req.path is mount-relative under /api)
    if (isPublicPath(req.path)) {
      return next();
    }

    // For development, you might want to bypass auth - remove this in production!
    if (config.NODE_ENV === 'development' && !process.env['REQUIRE_AUTH']) {
      // Mock context for development
      req.context = {
        userId: 'dev-user',
        email: 'dev@example.com',
        role: 'admin',
        orgId: 'dev-org',
        fundId: req.params['fundId'] || (req.query['fundId'] as string),
      };
      return next();
    }

    // Apply secure context for production
    requireSecureContext(req, res, next);
  });

  // Apply RLS transaction middleware to protected data routes
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    // Skip for public endpoints (mount-relative paths)
    // /flags and /flags/status are public; /flags/admin/* requires auth+RLS
    if (isPublicPath(req.path)) {
      return next();
    }

    // Skip for GET requests that don't need transactions (optional)
    // For maximum security, you might want transactions on all routes
    const requiresTransaction =
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ||
      req.path.includes('/funds') ||
      req.path.includes('/reserves') ||
      req.path.includes('/portfolio');

    if (requiresTransaction && req.context) {
      return withRLSTransaction()(req, res, next);
    }

    next();
  });

  // Apply idempotency middleware to mutation endpoints
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (
      ['POST', 'PUT', 'PATCH'].includes(req.method) &&
      (req.path.includes('/reserves/calculate') ||
        req.path.includes('/funds') ||
        req.path.includes('/investments'))
    ) {
      return withIdempotency()(req, res, next);
    }
    next();
  });

  // Register API routes with dependency injection (returns http.Server with WebSocket)
  const httpServer = await registerRoutes(app);

  // Precondition error handler
  app.use(handlePreconditionError);

  // Global error handler - uses structured error handler
  app.use(errorHandler());

  // Client asset strategy:
  // CI contract: `.github/workflows/security-tests.yml` runs `npm run dev:api`
  // without a client build, so dist/public may be missing. Keep API-only boot safe.
  const distPublicPath = path.resolve(process.cwd(), 'dist', 'public');
  const distExists = fs.existsSync(distPublicPath);
  const isProductionMode = config.NODE_ENV === 'production';
  const useViteMiddleware = process.env['USE_VITE_MIDDLEWARE'] === 'true';
  let serverMode: 'static' | 'vite' | 'api-only';

  if (isProductionMode && !distExists) {
    throw new Error(
      `Production mode requires ${distPublicPath}. Run 'npm run build' or set NODE_ENV=development`
    );
  }

  if (distExists) {
    console.log('[server] Serving static client from dist/public');
    serverMode = 'static';
    serveStatic(app, distPublicPath);
  } else if (!isProductionMode && useViteMiddleware) {
    console.log('[server] USE_VITE_MIDDLEWARE enabled; attaching Vite middleware...');
    serverMode = 'vite';
    await setupVite(app);
  } else {
    console.log('[server] No dist/public found; running in API-only mode');
    serverMode = 'api-only';
    app.get('/', (_req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'fund-platform-api', env: config.NODE_ENV });
    });
  }

  console.log(`[server] Mode selected: ${serverMode}`);

  console.log('[server] Express application created successfully');
  return httpServer;
}
