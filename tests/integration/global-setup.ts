/**
 * Vitest globalSetup for integration tests.
 *
 * Spawns a SINGLE Express server for the entire test run (instead of per-file
 * via setupFiles). The worker process inherits BASE_URL/PORT directly from
 * this setup, so setupFiles no longer participates in server lifecycle.
 *
 * This eliminates the ~31-cycle spawn/kill ceiling that exhausted CI runners.
 */

import { spawn, type ChildProcess, execSync } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';

const READY_FILE = path.join(os.tmpdir(), `vitest-int-server-${process.pid}.json`);

const PORT_DETECTION_TIMEOUT_MS = 30_000;
const HEALTHZ_TIMEOUT_MS = 30_000;
const LOG_TAIL_SIZE = 12;

const VALID_TEST_JWT_SECRET = 'integration-test-jwt-secret-must-be-at-least-32-characters-long';
const VALID_TEST_JWT_ISSUER = 'updog-api';
const VALID_TEST_JWT_AUDIENCE = 'updog-client';
const VALID_TEST_CORS_ORIGIN = 'http://localhost:5173,http://localhost:5174,http://localhost:5175';

let serverProcess: ChildProcess | null = null;

function getNpmCommand() {
  return os.platform() === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
}

function getNpmCommandArgs() {
  return os.platform() === 'win32' ? ['/d', '/s', '/c', 'npm run dev:api'] : ['run', 'dev:api'];
}

function applyIntegrationEnv(env: NodeJS.ProcessEnv): void {
  env.TZ = 'UTC';
  env.NODE_ENV = 'test';
  env._EXPLICIT_NODE_ENV = 'test';
  env.REDIS_URL = env.REDIS_URL || 'memory://';
  env._EXPLICIT_REDIS_URL = env.REDIS_URL;
  env.ENABLE_QUEUES = '0';
  env._EXPLICIT_ENABLE_QUEUES = env.ENABLE_QUEUES;
  env.CORS_ORIGIN = VALID_TEST_CORS_ORIGIN;
  env.DATABASE_URL = env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_test';
  env._EXPLICIT_DATABASE_URL = env.DATABASE_URL;
  env.ALLOW_MEMORY_STORAGE = '0';
  env._EXPLICIT_ALLOW_MEMORY_STORAGE = env.ALLOW_MEMORY_STORAGE;
  env.USE_REAL_DB_IN_VITEST = '1';

  sanitizeSecrets(env);
  env._EXPLICIT_JWT_SECRET = env.JWT_SECRET;
  env._EXPLICIT_JWT_ISSUER = env.JWT_ISSUER;
  env._EXPLICIT_JWT_AUDIENCE = env.JWT_AUDIENCE;
  env.JWT_ALG = env.JWT_ALG || 'HS256';
  env._EXPLICIT_JWT_ALG = env.JWT_ALG;
}

function setWorkerServerEnv(baseUrl: string, port: string): void {
  process.env.PORT = port;
  process.env._EXPLICIT_PORT = port;
  process.env.BASE_URL = baseUrl;
}

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

function readServerInfoFile(
  filePath: string
): { port: string; baseUrl: string; pid: number | null } | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as {
      port?: number | string;
      baseUrl?: string;
      pid?: number | null;
    };

    if (!parsed.baseUrl || parsed.port === undefined || parsed.port === null) {
      return null;
    }

    return {
      port: String(parsed.port),
      baseUrl: parsed.baseUrl,
      pid: parsed.pid ?? null,
    };
  } catch {
    return null;
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

function cleanupChildProcessStreams(processToStop: ChildProcess): void {
  processToStop.stdout?.removeAllListeners('data');
  processToStop.stderr?.removeAllListeners('data');
  processToStop.stdout?.destroy();
  processToStop.stderr?.destroy();
  processToStop.stdin?.destroy();
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
    applyIntegrationEnv(process.env);
    const parsed = new URL(externalBaseUrl);
    setWorkerServerEnv(externalBaseUrl, parsed.port || '80');
    console.warn('[globalSetup] Using external server:', externalBaseUrl);
    return;
  }

  // Build server environment
  const serverEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: '0',
    _EXPLICIT_PORT: '0',
  };
  applyIntegrationEnv(serverEnv);
  applyIntegrationEnv(process.env);
  delete serverEnv.VITEST;

  let actualPort: string | null = null;
  const stdoutTail: string[] = [];
  const stderrTail: string[] = [];

  console.warn('[globalSetup] Starting integration test server (ephemeral port)...');

  try {
    fs.unlinkSync(READY_FILE);
  } catch {
    // No stale file to remove
  }

  serverProcess = spawn(getNpmCommand(), getNpmCommandArgs(), {
    env: { ...serverEnv, TEST_READY_FILE: READY_FILE },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    detached: os.platform() !== 'win32', // process groups are POSIX-only
    windowsHide: true,
  });

  serverProcess.stdout?.on('data', (data: Buffer) => {
    const output = data.toString();
    appendTail(stdoutTail, output);
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
    const serverInfo = readServerInfoFile(READY_FILE);
    if (serverInfo) {
      actualPort = serverInfo.port;
      break;
    }
    await delay(100);
    waited += 100;
  }

  if (!actualPort) {
    throw new Error(
      `[globalSetup] No server info file detected within ${PORT_DETECTION_TIMEOUT_MS / 1000}s.\nstdout:\n${stdoutTail.join('\n') || '(empty)'}\nstderr:\n${stderrTail.join('\n') || '(empty)'}`
    );
  }

  const serverInfo = readServerInfoFile(READY_FILE);
  const baseUrl = serverInfo?.baseUrl ?? `http://localhost:${actualPort}`;
  const isReady = await waitForServer(`${baseUrl}/healthz`, HEALTHZ_TIMEOUT_MS);
  if (!isReady) {
    throw new Error(`[globalSetup] Server not healthy within 30s: ${baseUrl}/healthz`);
  }

  setWorkerServerEnv(baseUrl, actualPort);

  console.warn(`[globalSetup] Server ready on port ${actualPort}`);
}

export async function teardown(): Promise<void> {
  try {
    fs.unlinkSync(READY_FILE);
  } catch {
    // Already cleaned or never written
  }

  if (!serverProcess?.pid) return;

  const processToStop = serverProcess;
  serverProcess = null;

  console.warn('[globalSetup] Shutting down test server...');
  killProcessTree(processToStop.pid);

  // Wait for graceful exit, then force-kill
  await new Promise<void>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId) {
        globalThis.clearTimeout(timeoutId);
      }
      processToStop.off('close', onClose);
      cleanupChildProcessStreams(processToStop);
      resolve();
    };

    const onClose = () => {
      finish();
    };

    if (processToStop.exitCode !== null) {
      finish();
      return;
    }

    processToStop.once('close', onClose);

    timeoutId = globalThis.setTimeout(() => {
      if (processToStop.pid) {
        forceKillProcessTree(processToStop.pid);
      }
      finish();
    }, 5000);
  });

  console.warn('[globalSetup] Server stopped');
}
