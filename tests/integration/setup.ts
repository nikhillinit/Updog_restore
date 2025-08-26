/**
 * Integration test setup - runs before each integration test file
 * Handles server startup, database connections, and external dependencies
 */

import { beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { setTimeout } from 'timers/promises';

// Force UTC timezone for consistent date handling
process.env.TZ = 'UTC';

// Integration test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3333'; // Different from dev to avoid conflicts
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_test';
process.env.REDIS_URL = 'memory://';
process.env.ENABLE_QUEUES = '0';

let serverProcess: ChildProcess | null = null;

async function waitForServer(url: string, timeout: number = 30000): Promise<boolean> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await setTimeout(1000);
  }
  
  return false;
}

beforeAll(async () => {
  // Check if we need to start the server
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT}`;
  const healthUrl = `${baseUrl}/healthz`;
  
  try {
    const response = await fetch(healthUrl);
    if (response.ok) {
      console.log('Server already running, using existing instance');
      return;
    }
  } catch {
    // Server not running, need to start it
  }
  
  console.log('Starting test server...');
  
  serverProcess = spawn('npm', ['run', 'dev:quick'], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });
  
  serverProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    if (output.includes('api on http://')) {
      console.log('Server startup detected');
    }
  });
  
  serverProcess.stderr?.on('data', (data) => {
    const error = data.toString();
    if (!error.includes('ECONNREFUSED') && !error.includes('DATABASE_URL not set')) {
      console.error('Server error:', error);
    }
  });
  
  // Wait for server to be ready
  const isReady = await waitForServer(healthUrl, 30000);
  if (!isReady) {
    throw new Error(`Server failed to start within 30 seconds. Check ${healthUrl}`);
  }
  
  console.log('Test server ready');
}, 60000); // Increase timeout for server startup

afterAll(async () => {
  if (serverProcess) {
    console.log('Shutting down test server...');
    serverProcess.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise((resolve) => {
      if (serverProcess) {
        serverProcess.on('exit', resolve);
        setTimeout(() => {
          if (serverProcess && !serverProcess.killed) {
            serverProcess.kill('SIGKILL');
          }
          resolve(null);
        }, 5000);
      } else {
        resolve(null);
      }
    });
  }
});