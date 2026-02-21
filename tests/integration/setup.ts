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
const VALID_TEST_JWT_SECRET = 'integration-test-jwt-secret-must-be-at-least-32-characters-long';
const VALID_TEST_JWT_ISSUER = 'updog-api';
const VALID_TEST_JWT_AUDIENCE = 'updog-client';
const VALID_TEST_CORS_ORIGIN = 'http://localhost:5173,http://localhost:5174,http://localhost:5175';

function sanitizeSecrets(env: NodeJS.ProcessEnv): void {
  if (!env.JWT_SECRET || env.JWT_SECRET.trim().length < 32) {
    env.JWT_SECRET = VALID_TEST_JWT_SECRET;
  }

  if (!env.JWT_ISSUER?.trim()) {
    env.JWT_ISSUER = VALID_TEST_JWT_ISSUER;
  }

  if (!env.JWT_AUDIENCE?.trim()) {
    env.JWT_AUDIENCE = VALID_TEST_JWT_AUDIENCE;
  }

  if (
    env.HEALTH_KEY !== undefined &&
    (env.HEALTH_KEY.trim().length < 16 ||
      env.HEALTH_KEY === 'undefined' ||
      env.HEALTH_KEY === 'null')
  ) {
    delete env.HEALTH_KEY;
  }
}

sanitizeSecrets(process.env);
process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
// Use ephemeral port (0) to avoid conflicts with zombie processes from previous runs
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_test';
process.env.REDIS_URL = 'memory://';
process.env._EXPLICIT_REDIS_URL = process.env.REDIS_URL;
process.env.ENABLE_QUEUES = '0';
process.env.CORS_ORIGIN = VALID_TEST_CORS_ORIGIN;

function isInvalidExternalBaseUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    // Port 0 is only valid as a bind hint, not as a client target.
    return parsed.port === '0';
  } catch {
    return true;
  }
}

type SetupState = typeof globalThis & {
  __integrationExternalBaseUrl?: string | null;
};

const setupState = globalThis as SetupState;
if (setupState.__integrationExternalBaseUrl === undefined) {
  const rawBaseUrl = (process.env.BASE_URL ?? '').trim();
  const normalizedBaseUrl =
    rawBaseUrl && rawBaseUrl !== '/'
      ? rawBaseUrl.startsWith('http://') || rawBaseUrl.startsWith('https://')
        ? rawBaseUrl
        : `http://${rawBaseUrl}`
      : '';
  setupState.__integrationExternalBaseUrl =
    normalizedBaseUrl !== '' && !isInvalidExternalBaseUrl(normalizedBaseUrl)
      ? normalizedBaseUrl
      : null;
}

const externalBaseUrl = setupState.__integrationExternalBaseUrl;
const hasExternalBaseUrl = externalBaseUrl !== null;

if (!hasExternalBaseUrl) {
  // Reset to ephemeral bind hint on each setup-file run to avoid stale port leakage.
  process.env.PORT = '0';
}

process.env.PORT = process.env.PORT || '0'; // 0 = OS assigns random available port
const effectiveBaseUrl = hasExternalBaseUrl
  ? (externalBaseUrl as string)
  : `http://localhost:${process.env.PORT}`;
process.env.BASE_URL = effectiveBaseUrl;

let serverProcess: ChildProcess | null = null;
const PORT_DETECTION_TIMEOUT_MS = 30000;
const LOG_TAIL_SIZE = 12;

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
  const baseUrl = hasExternalBaseUrl
    ? process.env.BASE_URL || `http://localhost:${process.env.PORT}`
    : 'http://localhost:0';
  const healthUrl = new URL('/healthz', baseUrl).toString();

  if (hasExternalBaseUrl) {
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
    PORT: '0', // Always use ephemeral port in local test-managed mode
    _EXPLICIT_PORT: '0', // Marker to prevent .env override to fixed ports
    REDIS_URL: process.env.REDIS_URL || 'memory://',
    _EXPLICIT_REDIS_URL: process.env.REDIS_URL || 'memory://',
    CORS_ORIGIN: VALID_TEST_CORS_ORIGIN,
  };
  sanitizeSecrets(serverEnv);
  delete serverEnv.VITEST;

  let actualPort: string | null = null;
  const stdoutTail: string[] = [];
  const stderrTail: string[] = [];
  const appendTail = (target: string[], chunk: string) => {
    for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
      target.push(line);
      if (target.length > LOG_TAIL_SIZE) {
        target.shift();
      }
    }
  };

  serverProcess = spawn('npm', ['run', 'dev:api'], {
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    detached: true,
  });

  serverProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    appendTail(stdoutTail, output);
    // Capture the actual port from server output (e.g., "api on http://localhost:54321")
    const portMatch = output.match(/api on http:\/\/[^:]+:(\d+)/);
    if (portMatch && !actualPort) {
      actualPort = portMatch[1];
      console.log(`Server started on port ${actualPort}`);
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    const error = data.toString();
    appendTail(stderrTail, error);
    if (!error.includes('ECONNREFUSED') && !error.includes('DATABASE_URL not set')) {
      console.error('Server error:', error);
    }
  });

  // Wait for port detection and fail fast if child process exits.
  let portWaitTime = 0;
  while (!actualPort && portWaitTime < PORT_DETECTION_TIMEOUT_MS) {
    if (serverProcess.exitCode !== null) {
      const stderrSummary = stderrTail.length ? stderrTail.join('\n') : '(no stderr captured)';
      throw new Error(
        `Server process exited before reporting port (exit=${serverProcess.exitCode}). Last stderr:\n${stderrSummary}`
      );
    }
    await delay(100);
    portWaitTime += 100;
  }

  if (!actualPort) {
    const stdoutSummary = stdoutTail.length ? stdoutTail.join('\n') : '(no stdout captured)';
    const stderrSummary = stderrTail.length ? stderrTail.join('\n') : '(no stderr captured)';
    throw new Error(
      `Server did not report port within ${PORT_DETECTION_TIMEOUT_MS / 1000} seconds.\nLast stdout:\n${stdoutSummary}\nLast stderr:\n${stderrSummary}`
    );
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
  if (serverProcess && serverProcess.pid) {
    console.log('Shutting down test server...');
    // Kill the entire process group (npm -> tsx -> node) to prevent zombie processes.
    // With detached: true, the child is the leader of its own process group.
    try {
      process.kill(-serverProcess.pid, 'SIGTERM');
    } catch {
      // Process group already exited
    }

    // Wait for graceful shutdown, then force-kill the group
    await new Promise((resolve) => {
      if (serverProcess) {
        serverProcess.on('exit', resolve);
        globalThis.setTimeout(() => {
          if (serverProcess?.pid) {
            try {
              process.kill(-serverProcess.pid, 'SIGKILL');
            } catch {
              // Already dead
            }
          }
          resolve(null);
        }, 5000);
      } else {
        resolve(null);
      }
    });
  }
});
