/* global process */

import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('build-vercel-api', () => {
  it('excludes test helpers from the deployed API function', () => {
    const inspect = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          import { readFileSync } from 'node:fs';
          const config = JSON.parse(readFileSync(process.argv[1], 'utf8'));
          console.log(config.functions?.['api/[...slug].ts']?.excludeFiles ?? '');
        `,
        resolve(root, 'vercel.json'),
      ],
      { cwd: root, encoding: 'utf8', timeout: 5000 }
    );

    expect(inspect.status, inspect.stderr || inspect.stdout).toBe(0);
    expect(inspect.stdout.trim()).toBe('tests/**');
  });

  it('bundles the Vercel Neon HTTP driver instead of leaving a traced runtime require', () => {
    const result = spawnSync(process.execPath, [resolve(root, 'scripts/build-vercel-api.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
      timeout: 45000,
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const generatedPath = resolve(root, 'api/_app.generated.mjs');
    const inspect = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          import { readFileSync } from 'node:fs';
          const generated = readFileSync(process.argv[1], 'utf8');
          console.log(JSON.stringify({
            hasRequire2: generated.includes('require2("drizzle-orm/neon-http")'),
            hasRequire: generated.includes('require("drizzle-orm/neon-http")'),
            mentionsNeonHttp: generated.includes('neon-http')
          }));
        `,
        generatedPath,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 5000,
      }
    );

    expect(inspect.status, inspect.stderr || inspect.stdout).toBe(0);
    const bundleState = JSON.parse(inspect.stdout);

    expect(bundleState.hasRequire2).toBe(false);
    expect(bundleState.hasRequire).toBe(false);
    expect(bundleState.mentionsNeonHttp).toBe(true);

    const typecheck = spawnSync(
      process.execPath,
      [
        resolve(root, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--types',
        'node',
        resolve(root, 'api/[...slug].ts'),
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 15000,
      }
    );

    expect(typecheck.status, typecheck.stderr || typecheck.stdout).toBe(0);
  }, 60000);

  it('imports the built Vercel app without blocking on async module initialization', () => {
    const buildResult = spawnSync(
      process.execPath,
      [resolve(root, 'scripts/build-vercel-api.mjs')],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'test',
        },
        timeout: 45000,
      }
    );

    expect(buildResult.status, buildResult.stderr || buildResult.stdout).toBe(0);

    const generatedUrl = pathToFileURL(resolve(root, 'api/_app.generated.mjs')).href;
    const importResult = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          try {
            const appModule = await import(process.argv[1]);
            if (typeof appModule.makeApp !== 'function') {
              throw new Error('Built Vercel app does not export makeApp');
            }
            console.log('IMPORT_OK');
            process.exit(0);
          } catch (error) {
            console.error(error?.stack ?? error);
            process.exit(1);
          }
        `,
        generatedUrl,
      ],
      {
        cwd: tmpdir(),
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          _EXPLICIT_NODE_ENV: '1',
          VITEST: 'false',
          VERCEL: '1',
          VERCEL_ENV: 'preview',
          DATABASE_URL: 'postgresql://user:pass@127.0.0.1:1/updog',
          _EXPLICIT_DATABASE_URL: '1',
          SESSION_SECRET: 'test-session-secret-at-least-thirty-two-characters',
          JWT_SECRET: 'test-jwt-secret-at-least-thirty-two-characters',
          _EXPLICIT_JWT_SECRET: '1',
          CSRF_SECRET: 'test-csrf-secret-at-least-thirty-two-characters',
          REDIS_URL: 'memory://',
          _EXPLICIT_REDIS_URL: '1',
          QUEUE_REDIS_URL: 'memory://',
          _EXPLICIT_QUEUE_REDIS_URL: '1',
          ENABLE_QUEUES: '0',
          _EXPLICIT_ENABLE_QUEUES: '1',
          ENABLE_STREAMING_MONTE_CARLO: '0',
        },
        timeout: 15000,
      }
    );

    const diagnostic =
      importResult.error?.stack || importResult.stderr || importResult.stdout || 'No child output';
    expect(importResult.status, diagnostic).toBe(0);
    expect(importResult.stdout).toContain('IMPORT_OK');
  }, 60000);
});
