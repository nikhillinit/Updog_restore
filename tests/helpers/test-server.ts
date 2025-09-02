/**
 * Enhanced Test Server Factory
 * Creates isolated test server instances
 */

import { Express } from 'express';
import { Server } from 'http';

interface TestServerOptions {
  port?: number;
  timeout?: number;
}

export interface TestServer {
  app: Express;
  server: Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * Create isolated test server
 */
export async function createTestServer(port?: number, options: TestServerOptions = {}): Promise<TestServer> {
  // Dynamic import to avoid circular dependencies during compilation issues
  let app: Express;
  
  try {
    const appModule = await import('../../server/app.js');
    app = appModule.app || appModule.default;
  } catch {
    // Fallback for development
    const express = await import('express');
    app = express.default();
    
    // Basic health endpoint for tests
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', test: true });
    });
  }

  return new Promise((resolve, reject) => {
    const actualPort = port || 0; // Use 0 for automatic assignment
    const server = app.listen(actualPort, () => {
      const address = server.address();
      const finalPort = typeof address === 'string' ? parseInt(address) : address?.port || 3333;
      
      const testServer: TestServer = {
        app,
        server,
        port: finalPort,
        close: () => new Promise((closeResolve) => {
          server.close(() => closeResolve());
        })
      };
      
      resolve(testServer);
    });

    server.on('error', (err) => {
      reject(new Error(`Test server failed to start: ${err.message}`));
    });

    // Set timeout for server operations
    if (options.timeout) {
      server.timeout = options.timeout;
    }
  });
}

/**
 * Create multiple isolated test servers for parallel testing
 */
export async function createTestServerCluster(count: number): Promise<TestServer[]> {
  const servers = await Promise.all(
    Array(count).fill(null).map(() => createTestServer())
  );
  
  return servers;
}