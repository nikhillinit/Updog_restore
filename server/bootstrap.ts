#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any */ // Application bootstrap
 
 
 
 
/**
 * Bootstrap Entrypoint - Ensures env + providers are settled before any Redis access
 * Eliminates side-effect imports that auto-connect to Redis
 */

// Environment should already be loaded by process
import { loadEnv } from './config/index.js';
import { buildProviders } from './providers.js';
import { createServer } from './server.js';
import { setReady } from './health/state.js';
import type { Socket } from 'net';

async function bootstrap() {
  try {
    console.log('[bootstrap] ===== PHASE 0: START =====');
    console.log('[bootstrap] Starting application...');

    console.log('[bootstrap] ===== PHASE 1: ENV LOAD =====');
    // Load and validate environment first
    const cfg = loadEnv();
    console.log(`[bootstrap] Environment: ${cfg.NODE_ENV}, Port: ${cfg.PORT}`);
    console.log(`[bootstrap] REDIS_URL: ${cfg.REDIS_URL}`);
    console.log(`[bootstrap] DATABASE_URL: ${cfg.DATABASE_URL ? 'set' : 'undefined'}`);
    console.log(`[bootstrap] ENABLE_QUEUES: ${cfg.ENABLE_QUEUES}`);
    console.log(`[bootstrap] DISABLE_AUTH: ${process.env["DISABLE_AUTH"]}`);

    console.log('[bootstrap] ===== PHASE 2: PROVIDERS =====');
    // Build providers based on configuration (single source of truth)
    const providers = await buildProviders(cfg);
    console.log('[bootstrap] Providers built successfully');
    console.log(`[providers] Cache: ${providers.mode}, RateLimit: ${!!providers.rateLimitStore}, Queues: ${providers.queue?.enabled}`);

    console.log('[bootstrap] ===== PHASE 3: SERVER CREATE =====');
    // Create server with dependency injection
    const app = await createServer(cfg, providers);
    console.log('[bootstrap] Server created successfully');

    console.log('[bootstrap] ===== PHASE 4: LISTEN =====');
    // Start server
    const server = app.listen(cfg.PORT, () => {
      console.log('[bootstrap] ===== SERVER READY =====');
      console.log(`[startup] ${cfg.NODE_ENV} on :${cfg.PORT} | cache=${providers.mode} rl=${providers.rateLimitStore ? 'redis' : 'memory'}`);

      // Mark server as ready for requests
      setReady(true);
      console.log('✅ Server ready for requests');
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
      console.log(`\n🔻 Received ${signal}, shutting down gracefully...`);
      
      // Mark server as not ready
      setReady(false);
      console.log('[providers] Tearing down...');
      
      // Stop accepting new connections
      server.close(async () => {
        console.log('✅ HTTP server closed');
        
        // Close providers
        try {
          await providers.teardown?.();
          console.log('✅ Providers closed');
        } catch (error) {
          console.error('⚠️ Error during provider cleanup:', error);
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
    process['on']('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process['on']('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught errors
    process['on']('uncaughtException', (error: any) => {
      console.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });
    
    process['on']('unhandledRejection', (reason: any, promise: any) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit on unhandled rejections in dev, but log them
      if (cfg.NODE_ENV === 'production') {
        gracefulShutdown('unhandledRejection');
      }
    });
    
  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
    process.exit(1);
  }
}

// Run bootstrap
bootstrap();
