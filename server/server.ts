/**
 * DI-Friendly Express Server
 * Consumes providers instead of creating global connections
 */

import express, { type Express, type Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { requestId } from './middleware/requestId.js';
import { shutdownGuard } from './middleware/shutdownGuard.js';
import { rateLimitDetailed } from './middleware/rateLimitDetailed.js';
import { sendApiError, createErrorBody } from './lib/apiError.js';
import { registerRoutes } from './routes.js';
import { setupVite, serveStatic, log } from './vite.js';
import type { Providers } from './providers.js';

// CORS configuration with origin validation
function parseOrigins(raw?: string): string[] {
  if (!raw) return ['http://localhost:5173', 'http://localhost:5000'];
  return raw.split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => {
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
): Promise<Express> {
  const app = express();
  
  console.log('[server] Creating Express application...');
  
  // Bind providers to app.locals for routes/services
  app.locals.providers = providers;
  app.locals.cache = providers.cache;
  app.locals.config = config;
  
  // Security first - disable version disclosure
  app.disable('x-powered-by');
  
  // Trust proxy configuration from environment or safe defaults
  const trustProxy = process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal';
  app.set('trust proxy', trustProxy);
  
  // Request ID MUST be first for correlation on all paths
  app.use(requestId());
  
  // Version headers for observability
  app.use((req, res, next) => {
    const version = config.APP_VERSION;
    res.set('X-Service-Version', version);
    res.set('X-Service-Name', 'fund-platform-api');
    (req as any).version = version;
    next();
  });
  
  // Shutdown guard MUST be after version headers
  app.use(shutdownGuard());
  
  // Security and performance middleware
  app.use(helmet({
    crossOriginEmbedderPolicy: false, // Allow Vite dev and dynamic imports
    contentSecurityPolicy: config.NODE_ENV === 'production' 
      ? {
          useDefaults: true,
          directives: {
            "script-src": ["'self'"], // TODO: Add nonces and remove unsafe-inline
            "style-src": ["'self'", "'unsafe-inline'"], // TODO: Use nonces for inline styles
            "connect-src": ["'self'", process.env.API_ORIGIN ?? "'self'"],
            "img-src": ["'self'", "data:", "blob:"],
            "font-src": ["'self'", "data:"],
            "frame-ancestors": ["'none'"],
          }
        }
      : {
          useDefaults: true,
          directives: {
            "connect-src": ["'self'", "ws:", "wss:", "http://localhost:*"],
            "img-src": ["'self'", "data:", "blob:"],
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow HMR in dev
            "style-src": ["'self'", "'unsafe-inline'"],
          }
        }
  }));
  
  // CORS configuration with origin validation
  const corsOrigins = parseOrigins(config.CORS_ORIGIN);
  
  // Fail fast if CORS_ORIGIN is set but invalid
  if (process.env.CORS_ORIGIN && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGIN set but no valid origins were parsed. Check your configuration.');
  }
  
  app.use(cors({
    origin: corsOrigins,
    credentials: true,
    exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  }));
  
  app.use(compression());
  
  // Body parsing with size limits
  const bodyLimit = config.BODY_LIMIT;
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: bodyLimit }));
  
  // Body parser error handler (now has req.requestId available)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (!err) return next();
    
    // Ensure X-Request-ID is set
    if ((req as any).requestId && !res.get('X-Request-ID')) {
      res.set('X-Request-ID', (req as any).requestId);
    }
    
    if (err?.type === 'entity.too.large') {
      return sendApiError(res, 413, createErrorBody('Payload Too Large', (req as any).requestId, 'PAYLOAD_TOO_LARGE'));
    }
    if (err?.type === 'entity.parse.failed') {
      return sendApiError(res, 400, createErrorBody('Invalid JSON', (req as any).requestId, 'INVALID_JSON'));
    }
    next(err);
  });
  
  // Request logging middleware with version
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;
  
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  
    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        const version = config.APP_VERSION;
        
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms [v${version}]`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
  
        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }
  
        // Include version in structured logs
        console.log(JSON.stringify({
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
          requestId: (req as any).requestId
        }));
      }
    });
  
    next();
  });
  
  // Rate limiter: pass store; undefined => memory store (no redis)
  app.use('/health/detailed', rateLimitDetailed({ store: providers.rateLimitStore }));
  
  // Register API routes with dependency injection
  await registerRoutes(app);
  
  // Global error handler - ensures X-Request-ID on all errors
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const rid = (req as any).requestId || 'unknown';
    if (!res.get('X-Request-ID')) res.set('X-Request-ID', rid);

    // Avoid double-sending - delegate to Express default handler
    if (res.headersSent) {
      console.error('Headers already sent; delegating to default handler', { err, rid });
      return _next(err); // Delegate to Express default error handler
    }

    const status = err.status ?? err.statusCode ?? 500;
    // Mask 5xx errors - details go to logs only
    const message = status >= 500 
      ? 'Internal Server Error' 
      : String(err.message || 'Error');
    
    const body = createErrorBody(message, rid, err.code);

    console.error('Request failed', { err, status, rid });
    sendApiError(res, status, body);
  });
  
  // Setup Vite in development and static serving in production
  if (config.NODE_ENV === "development") {
    // We'll setup Vite but need to be careful about the server parameter
    console.log('[server] Setting up Vite development mode...');
    // Note: setupVite expects a server, but we're returning Express app
    // This might need adjustment based on your Vite setup
  } else {
    console.log('[server] Setting up static file serving...');
    serveStatic(app);
  }
  
  console.log('[server] Express application created successfully');
  return app;
}