import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = process.env.PORT || '4173';
const host = process.env.HOST || (process.env.CI ? '127.0.0.1' : 'localhost');
const localBaseUrl = `http://${host}:${port}`;
const baseUrl = process.env.BASE_URL || localBaseUrl;
const shouldStartPreview = process.env.BASE_URL === undefined;
const playwrightArgs =
  process.argv.length > 2
    ? process.argv.slice(2)
    : ['test', 'tests/e2e/basic-smoke.spec.ts', '--project=smoke'];

function spawnNode(args, options = {}) {
  return spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
    ...options,
  });
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Preview server did not become ready at ${url}: ${detail}`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill();
  const close = once(child, 'close');
  const timeout = new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000, 'timeout'));
  if ((await Promise.race([close, timeout])) !== 'timeout') {
    return;
  }

  child.kill('SIGKILL');
  await once(child, 'close').catch(() => undefined);
}

async function runChild(child) {
  const [code, signal] = await once(child, 'close');
  if (typeof code === 'number') {
    return code;
  }
  console.error(`Process exited from signal ${signal}`);
  return 1;
}

let previewServer;

try {
  if (shouldStartPreview) {
    const viteCli = resolve(root, 'node_modules/vite/bin/vite.js');
    previewServer = spawnNode(
      [viteCli, 'preview', `--port=${port}`, `--host=${host}`, '--strictPort'],
      {
        env: {
          ...process.env,
          PORT: port,
        },
      }
    );
    await waitForUrl(baseUrl);
  }

  const playwrightCli = resolve(root, 'node_modules/playwright/cli.js');
  const playwright = spawnNode([playwrightCli, ...playwrightArgs], {
    env: {
      ...process.env,
      BASE_URL: baseUrl,
      CI: process.env.CI || '1',
    },
  });
  process.exitCode = await runChild(playwright);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (previewServer !== undefined) {
    await stopChild(previewServer);
  }
}
