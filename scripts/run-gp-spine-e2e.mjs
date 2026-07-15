import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const playwrightCli = path.join(repoRoot, 'node_modules', 'playwright', 'cli.js');
const apiPort = process.env.GP_SPINE_E2E_API_PORT ?? '5091';
const clientPort = process.env.GP_SPINE_E2E_CLIENT_PORT ?? '5191';
const host = 'localhost';
const baseUrl = `http://${host}:${clientPort}`;
const apiUrl = `http://${host}:${apiPort}`;
const commitRef = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
  windowsHide: true,
}).trim();

const inheritedEnv = { ...process.env };
delete inheritedEnv.BASE_URL;

const apiEnv = {
  ...inheritedEnv,
  NODE_ENV: 'test',
  _EXPLICIT_NODE_ENV: 'test',
  HOST: host,
  PORT: apiPort,
  _EXPLICIT_PORT: apiPort,
  ENABLE_SCENARIO_SEED_PICKER: '1',
  COMMIT_REF: commitRef,
  CLIENT_URL: baseUrl,
  CORS_ORIGIN: `${baseUrl},http://127.0.0.1:${clientPort}`,
};

const clientEnv = { ...inheritedEnv };
delete clientEnv.NODE_ENV;
delete clientEnv._EXPLICIT_NODE_ENV;
Object.assign(clientEnv, {
  VITE_API_PORT: apiPort,
  VITE_CLIENT_PORT: clientPort,
  VITE_ENABLE_SCENARIO_SEED_PICKER: '1',
});

const managedProcesses = [];

function spawnManaged(label, command, args, env) {
  const spawnCommand = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : command;
  const spawnArgs =
    process.platform === 'win32' ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args;
  const child = spawn(spawnCommand, spawnArgs, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    windowsHide: true,
    detached: process.platform !== 'win32',
  });

  const exit = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const managedProcess = { label, child, expectedExit: false, fatalExit: null };
  managedProcess.fatalExit = exit.then((result) => {
    if (managedProcess.expectedExit) return;

    const detail =
      'error' in result
        ? result.error.message
        : result.signal
          ? `signal ${result.signal}`
          : `code ${String(result.code)}`;
    throw new Error(`[gp-spine-e2e] ${label} exited unexpectedly (${detail})`);
  });

  managedProcesses.push(managedProcess);
  return managedProcess;
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

async function assertRuntimeWiring() {
  const unauthenticatedFund = await fetch(`${apiUrl}/api/funds/1`, { redirect: 'manual' });
  if (unauthenticatedFund.status !== 401) {
    throw new Error(
      `[gp-spine-e2e] auth sanity failed: GET /api/funds/1 returned ${unauthenticatedFund.status}, expected 401`
    );
  }

  const healthResponse = await fetch(`${apiUrl}/healthz`);
  if (!healthResponse.ok) {
    throw new Error(`[gp-spine-e2e] SHA sanity failed: /healthz returned ${healthResponse.status}`);
  }
  const health = await healthResponse.json();
  if (health.commit_sha !== commitRef) {
    throw new Error(
      `[gp-spine-e2e] SHA sanity failed: /healthz exposed ${String(health.commit_sha)}, expected ${commitRef}`
    );
  }
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
    managedProcesses.map((managedProcess) => {
      managedProcess.expectedExit = true;
      return killProcessTree(managedProcess.child.pid);
    })
  );
}

async function main() {
  const apiProcess = spawnManaged('api', npxCommand, ['tsx', 'server/index.ts'], apiEnv);
  const clientProcess = spawnManaged(
    'client',
    npmCommand,
    ['run', 'dev:client', '--', '--host', host, '--strictPort'],
    clientEnv
  );
  const fatalServiceExits = [apiProcess.fatalExit, clientProcess.fatalExit];
  await Promise.race([
    (async () => {
      await Promise.all([
        waitForHttp(`${apiUrl}/healthz`, 120_000),
        waitForHttp(baseUrl, 120_000),
      ]);
      await assertRuntimeWiring();
    })(),
    ...fatalServiceExits,
  ]);

  const result = spawn(process.execPath, [playwrightCli, 'test', '--project=gp-spine'], {
    cwd: repoRoot,
    env: {
      ...inheritedEnv,
      BASE_URL: baseUrl,
      COMMIT_REF: commitRef,
    },
    stdio: 'inherit',
    windowsHide: true,
  });

  const playwrightExit = new Promise((resolve, reject) => {
    result.once('error', reject);
    result.once('exit', (code) => resolve(code ?? 1));
  });

  return Promise.race([playwrightExit, ...fatalServiceExits]);
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
