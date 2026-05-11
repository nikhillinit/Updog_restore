import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const playwrightCli = path.join(repoRoot, 'node_modules', 'playwright', 'cli.js');
const apiPort = process.env.LP_REPORTING_E2E_API_PORT ?? '5000';
const clientPort = process.env.LP_REPORTING_E2E_CLIENT_PORT ?? '5173';
const host = 'localhost';
const baseUrl = process.env.BASE_URL ?? `http://${host}:${clientPort}`;
const apiUrl = `http://${host}:${apiPort}`;

const sharedEnv = {
  ...process.env,
  NODE_ENV: 'development',
  _EXPLICIT_NODE_ENV: 'development',
  ALLOW_MEMORY_STORAGE: '1',
  REQUIRE_AUTH: '0',
  REDIS_URL: 'memory://',
  ENABLE_QUEUES: '0',
  PORT: apiPort,
  VITE_API_PORT: apiPort,
  VITE_CLIENT_PORT: clientPort,
  CLIENT_URL: baseUrl,
  CORS_ORIGIN: `${baseUrl},http://127.0.0.1:${clientPort}`,
  JWT_SECRET: 'lp-reporting-e2e-jwt-secret-minimum-32-chars',
  SESSION_SECRET: 'lp-reporting-e2e-session-secret-minimum-32-chars',
};

const managedProcesses = [];

function spawnManaged(label, command, args) {
  const spawnCommand = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : command;
  const spawnArgs =
    process.platform === 'win32' ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args;
  const child = spawn(spawnCommand, spawnArgs, {
    cwd: repoRoot,
    env: sharedEnv,
    stdio: 'inherit',
    windowsHide: true,
    detached: process.platform !== 'win32',
  });

  child.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`[lp-reporting-e2e] ${label} exited with code ${code}\n`);
    }
    if (signal) {
      process.stderr.write(`[lp-reporting-e2e] ${label} exited via ${signal}\n`);
    }
  });

  managedProcesses.push({ label, child });
  return child;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await wait(500);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function killProcessTree(pid) {
  return new Promise((resolve) => {
    if (pid === undefined) {
      resolve();
      return;
    }

    if (process.platform === 'win32') {
      execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () =>
        resolve()
      );
      return;
    }

    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Process already exited.
      }
    }
    resolve();
  });
}

async function cleanup() {
  await Promise.all(
    managedProcesses.map(({ child }) => {
      return killProcessTree(child.pid);
    })
  );
}

async function main() {
  if (!process.env.BASE_URL) {
    spawnManaged('api', npmCommand, ['run', 'dev:api']);
    spawnManaged('client', npmCommand, ['run', 'dev:client', '--', '--host', host]);
    await Promise.all([waitForHttp(`${apiUrl}/healthz`, 120_000), waitForHttp(baseUrl, 120_000)]);
  }

  const result = spawn(
    process.execPath,
    [playwrightCli, 'test', '--config=playwright.lp-reporting.config.ts'],
    {
      cwd: repoRoot,
      env: {
        ...sharedEnv,
        BASE_URL: baseUrl,
      },
      stdio: 'inherit',
      windowsHide: true,
    }
  );

  const exitCode = await new Promise((resolve) => {
    result.on('exit', (code) => resolve(code ?? 1));
  });

  return exitCode;
}

process.on('SIGINT', () => {
  cleanup().finally(() => process.exit(130));
});
process.on('SIGTERM', () => {
  cleanup().finally(() => process.exit(143));
});

let exitCode = 1;
try {
  exitCode = await main();
} finally {
  await cleanup();
}
process.exit(exitCode);
