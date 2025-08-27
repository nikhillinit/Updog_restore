/**
 * Test server utilities for integration testing
 * Provides ephemeral port allocation and clean server lifecycle management
 */

import type { Express } from 'express';
import type { FastifyInstance } from 'fastify';

/**
 * Get an available ephemeral port
 * Falls back to a random port in range 3000-9999 if get-port is unavailable
 */
export async function getEphemeralPort(): Promise<number> {
  try {
    // Try to use get-port if available
    const getPort = await import('get-port').catch(() => null);
    if (getPort) {
      return await getPort.default();
    }
  } catch {
    // Ignore import errors
  }
  
  // Fallback: find an available port manually
  const net = await import('net');
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Could not get port'));
      }
    });
    server.on('error', reject);
  });
}

interface TestServerConfig {
  port?: number;
  host?: string;
  env?: Record<string, string>;
}

interface TestServerHandle {
  port: number;
  host: string;
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Start a test server with automatic port allocation and cleanup
 */
export async function startTestServer(
  buildApp: () => Promise<Express | FastifyInstance>,
  config: TestServerConfig = {}
): Promise<TestServerHandle> {
  const port = config.port || await getEphemeralPort();
  const host = config.host || '127.0.0.1';
  
  // Apply environment variables if provided
  if (config.env) {
    Object.assign(process.env, config.env);
  }
  
  const app = await buildApp();
  
  // Handle both Express and Fastify
  let server: any;
  
  if ('listen' in app && typeof app.listen === 'function') {
    // Express-style server
    server = await new Promise<any>((resolve, reject) => {
      const s = app.listen(port, host, () => resolve(s));
      s.on('error', reject);
    });
  } else if ('server' in app) {
    // Fastify-style server
    await (app as FastifyInstance).listen({ port, host });
    server = (app as any).server;
  } else {
    throw new Error('Unknown server type');
  }
  
  return {
    port,
    host,
    baseUrl: `http://${host}:${port}`,
    close: async () => {
      try {
        if (server) {
          await new Promise<void>((resolve) => {
            if (server.close) {
              server.close(() => resolve());
            } else if ('close' in app && typeof (app as any).close === 'function') {
              (app as any).close().then(resolve);
            } else {
              resolve();
            }
          });
        }
      } catch (error) {
        console.warn('Error closing test server:', error);
      }
    }
  };
}

/**
 * Ensure servers are cleaned up after tests
 */
export function setupServerCleanup(servers: TestServerHandle[] = []) {
  // Track all servers
  const activeServers = servers;
  
  // Cleanup helper
  const cleanup = async () => {
    await Promise.all(
      activeServers.map(s => s.close().catch(() => {}))
    );
    activeServers.length = 0;
  };
  
  // Register cleanup handlers
  if (typeof afterAll === 'function') {
    afterAll(cleanup);
  }
  
  if (typeof process !== 'undefined') {
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }
  
  return {
    add: (server: TestServerHandle) => activeServers.push(server),
    cleanup
  };
}

/**
 * Wait for a server to be ready by polling a health endpoint
 */
export async function waitForServer(
  baseUrl: string,
  options: {
    timeout?: number;
    interval?: number;
    healthPath?: string;
  } = {}
): Promise<void> {
  const timeout = options.timeout || 30000;
  const interval = options.interval || 500;
  const healthPath = options.healthPath || '/health';
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${baseUrl}${healthPath}`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Server at ${baseUrl} did not become ready within ${timeout}ms`);
}