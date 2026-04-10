/**
 * Bootstrap - Ensures env + providers are settled before any Redis access.
 * Eliminates side-effect imports that auto-connect to Redis.
 *
 * This module is side-effect-free: call bootstrap() explicitly from main.ts.
 */

import { loadEnv } from './config/index.js';
import { buildProviders } from './providers.js';
import { createServer } from './server.js';
import { setReady } from './health/state.js';
import { logger } from './lib/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import type { Socket } from 'net';

export async function bootstrap() {
  try {
    logger.info({ phase: 'start' }, 'PHASE 0: START');
    logger.info({ phase: 'start' }, 'Starting application...');

    logger.info({ phase: 'env' }, 'PHASE 1: ENV LOAD');
    // Load and validate environment first
    const cfg = loadEnv();
    logger.info({ phase: 'env', env: cfg.NODE_ENV, port: cfg.PORT }, 'Environment loaded');
    logger.debug({ phase: 'env', redisUrl: cfg.REDIS_URL }, 'REDIS_URL');
    logger.debug({ phase: 'env', dbSet: !!cfg.DATABASE_URL }, 'DATABASE_URL');
    logger.debug({ phase: 'env', queues: cfg.ENABLE_QUEUES }, 'ENABLE_QUEUES');
    logger.debug({ phase: 'env', disableAuth: process.env['DISABLE_AUTH'] }, 'DISABLE_AUTH');

    logger.info({ phase: 'providers' }, 'PHASE 2: PROVIDERS');
    // Build providers based on configuration (single source of truth)
    const providers = await buildProviders(cfg);
    logger.info({ phase: 'providers' }, 'Providers built successfully');
    logger.info(
      {
        phase: 'providers',
        cache: providers.mode,
        rateLimit: !!providers.rateLimitStore,
        queues: providers.queue?.enabled,
      },
      'Provider summary'
    );

    logger.info({ phase: 'server' }, 'PHASE 3: SERVER CREATE');
    // Create server with dependency injection (returns http.Server with WebSocket)
    const server = await createServer(cfg, providers);
    logger.info({ phase: 'server' }, 'Server created successfully');

    logger.info({ phase: 'listen' }, 'PHASE 4: LISTEN');
    const testReadyFile = process.env['TEST_READY_FILE'];

    // Start server
    server.listen(cfg.PORT, () => {
      const address = server.address();
      const actualPort =
        typeof address === 'object' && address && 'port' in address ? address.port : cfg.PORT;
      const baseUrl = `http://localhost:${actualPort}`;
      logger.info({ phase: 'ready' }, 'SERVER READY');
      logger.info(
        {
          phase: 'ready',
          env: cfg.NODE_ENV,
          port: cfg.PORT,
          cache: providers.mode,
          rateLimit: providers.rateLimitStore ? 'redis' : 'memory',
        },
        `api on ${baseUrl}`
      );

      // Mark server as ready for requests
      setReady(true);
      logger.info({ phase: 'ready' }, 'Server ready for requests');

      if (testReadyFile) {
        try {
          fs.mkdirSync(path.dirname(testReadyFile), { recursive: true });
          fs.writeFileSync(
            testReadyFile,
            JSON.stringify({ port: actualPort, baseUrl, pid: process.pid })
          );
        } catch (error) {
          logger.error({ phase: 'ready', err: error, testReadyFile }, 'Failed to write ready file');
        }
      }
    });

    // Track open sockets for graceful shutdown
    const sockets = new Set<Socket>();
    server['on']('connection', (socket: Socket) => {
      sockets.add(socket);
      socket['on']('close', () => sockets.delete(socket));
    });

    // Set server timeouts to avoid slowloris attacks
    server.requestTimeout = 60_000;
    server.headersTimeout = 65_000;
    server.keepAliveTimeout = 61_000;

    // Graceful shutdown handling
    async function gracefulShutdown(signal: string) {
      logger.info({ phase: 'shutdown', signal }, `Received ${signal}, shutting down gracefully...`);

      // Mark server as not ready
      setReady(false);
      logger.info({ phase: 'shutdown' }, 'Tearing down...');

      // Stop accepting new connections
      server.close(async () => {
        logger.info({ phase: 'shutdown' }, 'HTTP server closed');

        // Close providers
        try {
          await providers.teardown?.();
          logger.info({ phase: 'shutdown' }, 'Providers closed');
        } catch (error) {
          logger.error({ phase: 'shutdown', err: error }, 'Error during provider cleanup');
        }

        process.exit(0);
      });

      // Force close sockets and exit after 10 seconds
      setTimeout(() => {
        logger.error({ phase: 'shutdown' }, 'Forcing socket closure after timeout');
        for (const socket of sockets) {
          socket.destroy();
        }
        logger.error(
          { phase: 'shutdown' },
          'Could not close connections in time, forcefully shutting down'
        );
        process.exit(1);
      }, 10_000).unref();
    }

    // Listen for termination signals
    process['on']('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process['on']('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process['on']('uncaughtException', (error: unknown) => {
      logger.fatal({ err: error }, 'Uncaught Exception');
      gracefulShutdown('uncaughtException');
    });

    process['on']('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
      logger.error({ err: reason }, 'Unhandled Rejection');
      // Don't exit on unhandled rejections in dev, but log them
      if (cfg.NODE_ENV === 'production') {
        gracefulShutdown('unhandledRejection');
      }
    });
  } catch (error) {
    logger.fatal({ err: error }, 'FATAL: Bootstrap failed');
    process.exit(1);
  }
}
