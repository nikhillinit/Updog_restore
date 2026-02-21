/**
 * Vitest globalSetup for integration tests.
 *
 * Spawns a SINGLE Express server for the entire test run (instead of per-file
 * via setupFiles). Writes the detected port to a temp file so the worker
 * process can pick it up in setupFiles.
 *
 * This eliminates the ~31-cycle spawn/kill ceiling that exhausted CI runners.
 */

import { spawn, type ChildProcess, execSync } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const PORT_FILE = path.join(os.tmpdir(), 'vitest-int-server.json');

const PORT_DETECTION_TIMEOUT_MS = 30_000;
const HEALTHZ_TIMEOUT_MS = 30_000;
const LOG_TAIL_SIZE = 12;

const VALID_TEST_JWT_SECRET = 'integration-test-jwt-secret-must-be-at-least-32-characters-long';
const VALID_TEST_JWT_ISSUER = 'updog-api';
const VALID_TEST_JWT_AUDIENCE = 'updog-client';
const VALID_TEST_CORS_ORIGIN = 'http://localhost:5173,http://localhost:5174,http://localhost:5175';

let serverProcess: ChildProcess | null = null;

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

function isInvalidExternalBaseUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.port === '0';
  } catch {
    return true;
  }
}

async function waitForServer(url: string, timeout: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await delay(1000);
  }
  return false;
}

function appendTail(target: string[], chunk: string): void {
  for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
    target.push(line);
    if (target.length > LOG_TAIL_SIZE) target.shift();
  }
}

function killProcessTree(pid: number): void {
  if (os.platform() === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch {
      // Already dead
    }
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // Already dead
    }
  }
}

function forceKillProcessTree(pid: number): void {
  if (os.platform() === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch {
      // Already dead
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Already dead
    }
  }
}

export async function setup(): Promise<void> {
  // Check for externally-managed server
  const rawBaseUrl = (process.env.BASE_URL ?? '').trim();
  const normalizedBaseUrl =
    rawBaseUrl && rawBaseUrl !== '/'
      ? rawBaseUrl.startsWith('http://') || rawBaseUrl.startsWith('https://')
        ? rawBaseUrl
        : `http://${rawBaseUrl}`
      : '';
  const externalBaseUrl =
    normalizedBaseUrl !== '' && !isInvalidExternalBaseUrl(normalizedBaseUrl)
      ? normalizedBaseUrl
      : null;

  if (externalBaseUrl) {
    const healthUrl = new URL('/healthz', externalBaseUrl).toString();
    const isReady = await waitForServer(healthUrl, HEALTHZ_TIMEOUT_MS);
    if (!isReady) {
      throw new Error(`[globalSetup] External server not healthy within 30s: ${healthUrl}`);
    }
    const parsed = new URL(externalBaseUrl);
    fs.writeFileSync(
      PORT_FILE,
      JSON.stringify({ port: parsed.port || '80', baseUrl: externalBaseUrl, pid: null })
    );
    console.warn('[globalSetup] Using external server:', externalBaseUrl);
    return;
  }

  // Build server environment
  const serverEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    _EXPLICIT_NODE_ENV: 'test',
    PORT: '0',
    _EXPLICIT_PORT: '0',
    REDIS_URL: process.env.REDIS_URL || 'memory://',
    _EXPLICIT_REDIS_URL: process.env.REDIS_URL || 'memory://',
    CORS_ORIGIN: VALID_TEST_CORS_ORIGIN,
    DATABASE_URL:
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_test',
    ENABLE_QUEUES: '0',
  };
  sanitizeSecrets(serverEnv);
  delete serverEnv.VITEST;

  let actualPort: string | null = null;
  const stdoutTail: string[] = [];
  const stderrTail: string[] = [];

  console.warn('[globalSetup] Starting integration test server (ephemeral port)...');

  serverProcess = spawn('npm', ['run', 'dev:api'], {
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    detached: os.platform() !== 'win32', // process groups are POSIX-only
  });

  serverProcess.stdout?.on('data', (data: Buffer) => {
    const output = data.toString();
    appendTail(stdoutTail, output);
    const portMatch = output.match(/api on http:\/\/[^:]+:(\d+)/);
    if (portMatch && !actualPort) {
      actualPort = portMatch[1] ?? null;
    }
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    appendTail(stderrTail, data.toString());
  });

  // Wait for port detection
  let waited = 0;
  while (!actualPort && waited < PORT_DETECTION_TIMEOUT_MS) {
    if (serverProcess.exitCode !== null) {
      const summary = stderrTail.join('\n') || '(no stderr)';
      throw new Error(
        `[globalSetup] Server exited before reporting port (exit=${serverProcess.exitCode}).\n${summary}`
      );
    }
    await delay(100);
    waited += 100;
  }

  if (!actualPort) {
    throw new Error(
      `[globalSetup] No port detected within ${PORT_DETECTION_TIMEOUT_MS / 1000}s.\nstdout:\n${stdoutTail.join('\n') || '(empty)'}\nstderr:\n${stderrTail.join('\n') || '(empty)'}`
    );
  }

  const baseUrl = `http://localhost:${actualPort}`;
  const isReady = await waitForServer(`${baseUrl}/healthz`, HEALTHZ_TIMEOUT_MS);
  if (!isReady) {
    throw new Error(`[globalSetup] Server not healthy within 30s: ${baseUrl}/healthz`);
  }

  // Persist for the worker's setupFiles to read
  fs.writeFileSync(
    PORT_FILE,
    JSON.stringify({ port: actualPort, baseUrl, pid: serverProcess.pid })
  );

  console.warn(`[globalSetup] Server ready on port ${actualPort}`);
}

export async function teardown(): Promise<void> {
  try {
    fs.unlinkSync(PORT_FILE);
  } catch {
    // Already cleaned or never written
  }

  if (!serverProcess?.pid) return;

  console.warn('[globalSetup] Shutting down test server...');
  killProcessTree(serverProcess.pid);

  // Wait for graceful exit, then force-kill
  await new Promise<void>((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }
    serverProcess.on('exit', () => resolve());
    globalThis.setTimeout(() => {
      if (serverProcess?.pid) {
        forceKillProcessTree(serverProcess.pid);
      }
      resolve();
    }, 5000);
  });

  console.warn('[globalSetup] Server stopped');
}
