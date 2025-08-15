import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { validateEnv, getEnv } from "./env";
import { NatsBridge } from "./nats-bridge";
import { requestId } from "./middleware/requestId";
import { shutdownGuard } from './middleware/shutdownGuard';
import { sendApiError, createErrorBody } from "./lib/apiError";
import { setReady } from "./health/state";
import type { Socket } from 'net';

const app = express();

// Security first - disable version disclosure
app.disable('x-powered-by');

// Trust proxy configuration from environment or safe defaults
const trustProxy = process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal';
app.set('trust proxy', trustProxy);

// Request ID MUST be first for correlation on all paths
app.use(requestId());

// Shutdown guard MUST be second to reject early (pre-parse)
app.use(shutdownGuard());

// Security and performance middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow Vite dev and dynamic imports
  contentSecurityPolicy: process.env.NODE_ENV === 'production' 
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

const corsOrigins = parseOrigins(process.env.CORS_ORIGIN);

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
const bodyLimit = process.env.BODY_LIMIT ?? '1mb';
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
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Validate environment variables on startup
  const env = validateEnv();
  console.log('✅ Environment validation passed');
  
  const server = await registerRoutes(app);
  
  // Track open sockets for graceful shutdown
  const sockets = new Set<Socket>();
  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  
  // Set server timeouts to avoid slowloris attacks
  server.requestTimeout = 60_000;
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 61_000;
  
  // Initialize NATS WebSocket bridge (skip in development without NATS_URL)
  let natsBridge: NatsBridge | null = null;
  if (process.env.NATS_URL) {
    natsBridge = new NatsBridge(server);
    try {
      await natsBridge.connect();
      console.log('✅ NATS WebSocket bridge initialized');
    } catch (error) {
      console.log('⚠️  NATS connection failed, continuing without real-time features:', error instanceof Error ? error.message : String(error));
    }
  } else {
    console.log('⚠️  NATS_URL not set, skipping real-time features for development');
  }

  // Global error handler - ensures X-Request-ID on all errors
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const rid = req.requestId || 'unknown';
    if (!res.get('X-Request-ID')) res.set('X-Request-ID', rid);

    // Avoid double-sending - delegate to Express default handler
    if (res.headersSent) {
      req.log?.error({ err, rid }, 'Headers already sent; delegating to default handler');
      return _next(err); // Delegate to Express default error handler
    }

    const status = err.status ?? err.statusCode ?? 500;
    // Mask 5xx errors - details go to logs only
    const message = status >= 500 
      ? 'Internal Server Error' 
      : String(err.message || 'Error');
    
    const body = createErrorBody(message, rid, err.code);

    req.log?.error({ err, status, rid }, 'Request failed');
    sendApiError(res, status, body);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use validated environment port
  const port = env.PORT;
  server.listen(port, () => {
    log(`serving on port ${port}`);
    // Mark service as ready after successful startup
    setReady(true);
  });

  // Graceful shutdown handling
  async function gracefulShutdown(signal: string) {
    console.log(`\n🔻 Received ${signal}, shutting down gracefully...`);
    
    // Immediately mark service as not ready
    setReady(false);
    
    // Stop accepting new connections
    server.close(async () => {
      console.log('✅ HTTP server closed');
      
      // Close external connections
      try {
        // Close database connections if available
        const { storage } = await import('./storage');
        if (storage.close) {
          await storage.close();
          console.log('✅ Database connections closed');
        }
        
        // Close Redis if available
        if (storage.closeRedis) {
          await storage.closeRedis();
          console.log('✅ Redis connections closed');
        }
        
        // Close NATS if connected
        if (natsBridge) {
          await natsBridge.disconnect?.();
          console.log('✅ NATS disconnected');
        }
      } catch (error) {
        console.error('⚠️ Error during cleanup:', error);
      }
      
      process.exit(0);
    });
    
    // Force close sockets and exit after 10 seconds
    setTimeout(() => {
      console.error('⚠️ Forcing socket closure after timeout');
      for (const socket of sockets) {
        socket.destroy();
      }
      console.error('❌ Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10_000).unref();
  }
  
  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit on unhandled rejections in dev, but log them
    if (process.env.NODE_ENV === 'production') {
      gracefulShutdown('unhandledRejection');
    }
  });
})();
