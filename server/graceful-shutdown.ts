/**
 * Graceful Shutdown Handler
 * Ensures clean shutdown of all services and connections
 */
import { Server } from 'http';
import { markShuttingDown } from './routes/health';

interface ShutdownOptions {
  timeout?: number;           // Maximum time to wait for graceful shutdown (ms)
  forceExitTimeout?: number;  // Time to force exit after initial timeout (ms)
  signals?: string[];         // Signals to listen for
  onShutdown?: () => Promise<void>; // Custom shutdown handler
  logger?: Console;           // Logger instance
}

interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  timeout?: number;
  critical?: boolean;
}

class GracefulShutdown {
  private isShuttingDown = false;
  private shutdownHandlers: ShutdownHandler[] = [];
  private server: Server | null = null;
  private options: Required<ShutdownOptions>;
  private shutdownPromise: Promise<void> | null = null;
  
  constructor(server?: Server, options?: ShutdownOptions) {
    this.server = server || null;
    this.options = {
      timeout: options?.timeout || 30000,
      forceExitTimeout: options?.forceExitTimeout || 5000,
      signals: options?.signals || ['SIGTERM', 'SIGINT', 'SIGUSR2'],
      onShutdown: options?.onShutdown || (async () => {}),
      logger: options?.logger || console,
    };
    
    this.registerSignalHandlers();
  }
  
  /**
   * Register a shutdown handler
   */
  public addHandler(handler: ShutdownHandler): void {
    this.shutdownHandlers.push(handler);
    this.options.logger.info(`[Shutdown] Registered handler: ${handler.name}`);
  }
  
  /**
   * Set the HTTP server to shut down
   */
  public setServer(server: Server): void {
    this.server = server;
  }
  
  /**
   * Register signal handlers
   */
  private registerSignalHandlers(): void {
    this.options.signals.forEach(signal => {
      process.on(signal, async () => {
        this.options.logger.info(`[Shutdown] Received signal: ${signal}`);
        await this.shutdown(signal);
      });
    });
    
    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      this.options.logger.error('[Shutdown] Uncaught exception:', error);
      await this.shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', async (reason) => {
      this.options.logger.error('[Shutdown] Unhandled rejection:', reason);
      await this.shutdown('unhandledRejection');
    });
  }
  
  /**
   * Perform graceful shutdown
   */
  public async shutdown(reason: string): Promise<void> {
    // Prevent multiple shutdown attempts
    if (this.isShuttingDown) {
      this.options.logger.info('[Shutdown] Already shutting down');
      return this.shutdownPromise!;
    }
    
    this.isShuttingDown = true;
    this.shutdownPromise = this.performShutdown(reason);
    
    return this.shutdownPromise;
  }
  
  /**
   * Internal shutdown implementation
   */
  private async performShutdown(reason: string): Promise<void> {
    const startTime = Date.now();
    
    this.options.logger.info(`[Shutdown] Starting graceful shutdown (reason: ${reason})`);
    this.options.logger.info(`[Shutdown] Timeout: ${this.options.timeout}ms`);
    
    // Mark health checks as shutting down
    markShuttingDown();
    
    // Stop accepting new connections
    if (this.server) {
      await this.stopServer();
    }
    
    // Execute custom shutdown handler
    if (this.options.onShutdown) {
      try {
        await this.withTimeout(
          this.options.onShutdown(),
          5000,
          'Custom shutdown handler'
        );
      } catch (error) {
        this.options.logger.error('[Shutdown] Custom handler error:', error);
      }
    }
    
    // Execute all registered handlers
    await this.executeHandlers();
    
    const elapsed = Date.now() - startTime;
    this.options.logger.info(`[Shutdown] Graceful shutdown completed in ${elapsed}ms`);
    
    // Exit the process
    process.exit(0);
  }
  
  /**
   * Stop the HTTP server
   */
  private async stopServer(): Promise<void> {
    if (!this.server) return;
    
    return new Promise<void>((resolve) => {
      this.options.logger.info('[Shutdown] Stopping HTTP server...');
      
      // Stop accepting new connections
      this.server!.close((error) => {
        if (error) {
          this.options.logger.error('[Shutdown] Error closing server:', error);
        } else {
          this.options.logger.info('[Shutdown] HTTP server stopped');
        }
        resolve();
      });
      
      // Force close after timeout
      setTimeout(() => {
        this.options.logger.warn('[Shutdown] Forcing server close after timeout');
        resolve();
      }, 10000);
    });
  }
  
  /**
   * Execute all shutdown handlers
   */
  private async executeHandlers(): Promise<void> {
    // Sort handlers by priority (critical first)
    const sortedHandlers = [...this.shutdownHandlers].sort((a, b) => {
      if (a.critical && !b.critical) return -1;
      if (!a.critical && b.critical) return 1;
      return 0;
    });
    
    // Execute handlers in parallel groups
    const criticalHandlers = sortedHandlers.filter(h => h.critical);
    const normalHandlers = sortedHandlers.filter(h => !h.critical);
    
    // Execute critical handlers first
    if (criticalHandlers.length > 0) {
      this.options.logger.info(`[Shutdown] Executing ${criticalHandlers.length} critical handlers...`);
      await this.executeHandlerGroup(criticalHandlers);
    }
    
    // Then execute normal handlers
    if (normalHandlers.length > 0) {
      this.options.logger.info(`[Shutdown] Executing ${normalHandlers.length} normal handlers...`);
      await this.executeHandlerGroup(normalHandlers);
    }
  }
  
  /**
   * Execute a group of handlers in parallel
   */
  private async executeHandlerGroup(handlers: ShutdownHandler[]): Promise<void> {
    const promises = handlers.map(async (handler) => {
      try {
        const timeout = handler.timeout || this.options.timeout;
        await this.withTimeout(
          handler.handler(),
          timeout,
          handler.name
        );
        this.options.logger.info(`[Shutdown] ✓ ${handler.name} completed`);
      } catch (error) {
        this.options.logger.error(`[Shutdown] ✗ ${handler.name} failed:`, error);
      }
    });
    
    await Promise.allSettled(promises);
  }
  
  /**
   * Execute a promise with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    name: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${name} timed out after ${timeout}ms`)),
          timeout
        )
      ),
    ]);
  }
}

// Singleton instance
let shutdownManager: GracefulShutdown | null = null;

/**
 * Initialize graceful shutdown
 */
export function initializeGracefulShutdown(
  server?: Server,
  options?: ShutdownOptions
): GracefulShutdown {
  if (!shutdownManager) {
    shutdownManager = new GracefulShutdown(server, options);
    
    // Register default handlers
    registerDefaultHandlers(shutdownManager);
  } else if (server) {
    shutdownManager.setServer(server);
  }
  
  return shutdownManager;
}

/**
 * Register default shutdown handlers
 */
function registerDefaultHandlers(manager: GracefulShutdown): void {
  // Database connections
  manager.addHandler({
    name: 'PostgreSQL',
    critical: true,
    timeout: 10000,
    handler: async () => {
      try {
        const { closePool } = await import('./db/pg-circuit');
        await closePool();
      } catch (error) {
        // Try basic pool closure
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        await pool.end();
      }
    },
  });
  
  // Redis connection
  manager.addHandler({
    name: 'Redis',
    critical: true,
    timeout: 5000,
    handler: async () => {
      try {
        const { closeRedis } = await import('./db/redis-circuit');
        await closeRedis();
      } catch (error) {
        // Try basic Redis closure
        const { Redis } = await import('ioredis');
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        await redis.quit();
      }
    },
  });
  
  // Worker queues (if using BullMQ)
  manager.addHandler({
    name: 'Worker Queues',
    critical: false,
    timeout: 15000,
    handler: async () => {
      try {
        const { Queue, Worker } = await import('bullmq');
        // Close any active workers/queues
        // This would need actual implementation based on your queue setup
      } catch (error) {
        // Queue system not in use
      }
    },
  });
  
  // WebSocket connections (if applicable)
  manager.addHandler({
    name: 'WebSocket Connections',
    critical: false,
    timeout: 5000,
    handler: async () => {
      try {
        // Close WebSocket connections
        // This would need actual implementation based on your WebSocket setup
      } catch (error) {
        // WebSocket not in use
      }
    },
  });
  
  // Circuit breakers
  manager.addHandler({
    name: 'Circuit Breakers',
    critical: false,
    timeout: 2000,
    handler: async () => {
      try {
        const { breakerRegistry } = await import('./infra/circuit-breaker/breaker-registry');
        // Log final state
        const states = breakerRegistry.getAll();
        console.log('[Shutdown] Circuit breaker final states:', states);
      } catch (error) {
        // Circuit breakers not in use
      }
    },
  });
}

/**
 * Register custom shutdown handler
 */
export function registerShutdownHandler(handler: ShutdownHandler): void {
  if (!shutdownManager) {
    throw new Error('Graceful shutdown not initialized. Call initializeGracefulShutdown first.');
  }
  
  shutdownManager.addHandler(handler);
}

/**
 * Trigger manual shutdown
 */
export async function triggerShutdown(reason: string = 'manual'): Promise<void> {
  if (!shutdownManager) {
    console.error('[Shutdown] Manager not initialized, forcing exit');
    process.exit(1);
  }
  
  await shutdownManager.shutdown(reason);
}

/**
 * Express middleware to handle shutdown routes
 */
export function shutdownMiddleware() {
  return (req: any, res: any, next: any) => {
    // Admin shutdown endpoint (requires auth)
    if (req.path === '/admin/shutdown' && req.method === 'POST') {
      const adminKey = process.env.ADMIN_KEY;
      if (!adminKey || req.get('X-Admin-Key') !== adminKey) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      res.json({ message: 'Shutdown initiated' });
      
      // Trigger shutdown after response
      setImmediate(() => {
        triggerShutdown('admin-request');
      });
      
      return;
    }
    
    next();
  };
}

// Legacy compatibility function
export function registerShutdown(server: any, logger: Console = console): void {
  initializeGracefulShutdown(server, { logger });
}

export default {
  initializeGracefulShutdown,
  registerShutdownHandler,
  triggerShutdown,
  shutdownMiddleware,
  registerShutdown,
};