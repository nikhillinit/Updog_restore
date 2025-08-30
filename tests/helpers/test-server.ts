import type { Server } from 'http';
import type { Express } from 'express';

let servers: Map<string, Server> = new Map();

/**
 * Gets an available port for testing
 */
export async function getPort(): Promise<number> {
  // Dynamic import to avoid issues if get-port isn't installed
  try {
    const getPortModule = await import('get-port');
    return await getPortModule.default();
  } catch {
    // Fallback to random port in range
    return Math.floor(Math.random() * (65535 - 49152) + 49152);
  }
}

/**
 * Starts a test server on an ephemeral port
 */
export async function startTestServer(
  app: Express, 
  name: string = 'default'
): Promise<{ port: number; baseURL: string; server: Server }> {
  const port = await getPort();
  
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      servers.set(name, server);
      resolve({
        port,
        baseURL: `http://127.0.0.1:${port}`,
        server
      });
    });
    
    server.on('error', reject);
  });
}

/**
 * Stops a test server
 */
export async function stopTestServer(name: string = 'default'): Promise<void> {
  const server = servers.get(name);
  if (!server) return;
  
  return new Promise((resolve) => {
    server.close(() => {
      servers.delete(name);
      resolve();
    });
  });
}

/**
 * Stops all test servers
 */
export async function stopAllTestServers(): Promise<void> {
  const promises = Array.from(servers.keys()).map(name => stopTestServer(name));
  await Promise.all(promises);
}