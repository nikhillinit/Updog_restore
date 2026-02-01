/**
 * Integration test setup - runs before each integration test file
 * Handles server startup, database connections, and external dependencies
 */

import { beforeAll, afterAll } from 'vitest';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

// Force UTC timezone for consistent date handling
process.env.TZ = 'UTC';

// Integration test environment
process.env.NODE_ENV = 'test';
process.env._EXPLICIT_NODE_ENV = process.env.NODE_ENV;
// Use ephemeral port (0) to avoid conflicts with zombie processes from previous runs
process.env.PORT = process.env.PORT || '0'; // 0 = OS assigns random available port
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_test';
process.env.REDIS_URL = 'memory://';
process.env.ENABLE_QUEUES = '0';
const rawBaseUrl = (process.env.BASE_URL ?? '').trim();
const normalizedBaseUrl =
  rawBaseUrl && rawBaseUrl !== '/'
    ? rawBaseUrl.startsWith('http://') || rawBaseUrl.startsWith('https://')
      ? rawBaseUrl
      : `http://${rawBaseUrl}`
    : '';
const effectiveBaseUrl = normalizedBaseUrl || `http://localhost:${process.env.PORT}`;
process.env.BASE_URL = effectiveBaseUrl;

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
    await delay(1000);
  }

  return false;
}

beforeAll(async () => {
  // Check if we need to start the server
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT}`;
  const healthUrl = new URL('/healthz', baseUrl).toString();

  if (normalizedBaseUrl) {
    const isReady = await waitForServer(healthUrl, 30000);
    if (!isReady) {
      throw new Error(`Server failed to start within 30 seconds. Check ${healthUrl}`);
    }
    console.log('Using externally managed test server');
    return;
  }

  try {
    const response = await fetch(healthUrl);
    if (response.ok) {
      console.log('Server already running, using existing instance');
      return;
    }
  } catch {
    // Server not running, need to start it
  }

  console.log('Starting test server with ephemeral port...');

  // CRITICAL: Explicitly preserve PORT to prevent .env override
  // The server config runs loadDotenv({ override: true }) which would
  // overwrite PORT=0 (ephemeral) with PORT=5000 from .env file
  const serverEnv = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
    _EXPLICIT_NODE_ENV: process.env.NODE_ENV || 'test',
    PORT: process.env.PORT || '0',  // Force ephemeral port
    _EXPLICIT_PORT: process.env.PORT || '0', // Marker to detect override
  };
  delete serverEnv.VITEST;

  let actualPort: string | null = null;
  let stdoutBuffer = '';

  serverProcess = spawn('npm', ['run', 'dev:api'], {
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  serverProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    stdoutBuffer += output;
    if (stdoutBuffer.length > 8192) {
      stdoutBuffer = stdoutBuffer.slice(-4096);
    }
    // Capture the actual port from server output (e.g., "api on http://localhost:54321")
    const portMatch = stdoutBuffer.match(/api on http:\/\/[^:]+:(\d+)/);
    if (portMatch && !actualPort) {
      actualPort = portMatch[1];
      console.log(`Server started on port ${actualPort}`);
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    const error = data.toString();
    if (!error.includes('ECONNREFUSED') && !error.includes('DATABASE_URL not set')) {
      console.error('Server error:', error);
    }
  });

  // Wait for port detection (up to 30 seconds)
  const portWaitLimitMs = 30000;
  let portWaitTime = 0;
  while (!actualPort && portWaitTime < portWaitLimitMs) {
    await delay(100);
    portWaitTime += 100;
  }

  if (!actualPort) {
    throw new Error(`Server did not report port within ${portWaitLimitMs / 1000} seconds`);
  }

  // Update BASE_URL with actual port
  const actualBaseUrl = `http://localhost:${actualPort}`;
  process.env.BASE_URL = actualBaseUrl;
  process.env.PORT = actualPort;
  console.log(`Test server using port ${actualPort}, BASE_URL=${actualBaseUrl}`);

  // Wait for server to be ready
  const actualHealthUrl = new URL('/healthz', actualBaseUrl).toString();
  const isReady = await waitForServer(actualHealthUrl, 30000);
  if (!isReady) {
    throw new Error(`Server failed to start within 30 seconds. Check ${actualHealthUrl}`);
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
        globalThis.setTimeout(() => {
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
