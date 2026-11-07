/* global process */

import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('build-vercel-api', () => {
  it.skipIf(process.platform === 'win32')(
    'keeps the Linux Node-builder hook to API prebundling after Vercel owns frontend preparation',
    () => {
      const scenario = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          String.raw`
          import { spawnSync } from 'node:child_process';
          import {
            copyFileSync,
            existsSync,
            mkdirSync,
            mkdtempSync,
            readFileSync,
            rmSync,
            symlinkSync,
            writeFileSync,
          } from 'node:fs';
          import { tmpdir } from 'node:os';
          import { join } from 'node:path';

          const sourceRoot = process.argv[1];
          const fixtureRoot = mkdtempSync(join(tmpdir(), 'vercel-build-contract-'));
          const fixtureBin = join(fixtureRoot, 'bin');
          try {
            const packageJson = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
            const vercel = JSON.parse(readFileSync(join(sourceRoot, 'vercel.json'), 'utf8'));
            mkdirSync(join(fixtureRoot, 'scripts'), { recursive: true });
            mkdirSync(join(fixtureRoot, 'server'), { recursive: true });
            mkdirSync(join(fixtureRoot, 'api'), { recursive: true });
            mkdirSync(join(fixtureRoot, 'dist', 'public'), { recursive: true });
            mkdirSync(join(fixtureRoot, 'node_modules'), { recursive: true });
            mkdirSync(fixtureBin, { recursive: true });
            copyFileSync(
              join(sourceRoot, 'scripts', 'clean-spa-dist.mjs'),
              join(fixtureRoot, 'scripts', 'clean-spa-dist.mjs')
            );
            copyFileSync(
              join(sourceRoot, 'scripts', 'build-vercel-api.mjs'),
              join(fixtureRoot, 'scripts', 'build-vercel-api.mjs')
            );
            symlinkSync(
              join(sourceRoot, 'node_modules', 'esbuild'),
              join(fixtureRoot, 'node_modules', 'esbuild'),
              'dir'
            );
            writeFileSync(
              join(fixtureRoot, 'package.json'),
              JSON.stringify({
                type: 'module',
                scripts: {
                  'clean:spa-dist': packageJson.scripts['clean:spa-dist'],
                  'build:web': packageJson.scripts['build:web'],
                  'vercel-build': packageJson.scripts['vercel-build'],
                },
              })
            );
            writeFileSync(join(fixtureRoot, 'vercel.json'), JSON.stringify(vercel));
            writeFileSync(join(fixtureRoot, 'tsconfig.server.json'), '{}');
            writeFileSync(join(fixtureRoot, 'server', 'app.ts'), 'export const makeApp = () => ({});');
            writeFileSync(join(fixtureRoot, 'dist', 'index.html'), 'stale SPA output');
            writeFileSync(
              join(fixtureBin, 'npx'),
              '#!/bin/sh\nset -eu\ntest "$1" = vite\ntest "$2" = build\nmode=react\nif test "\${3:-}" = --mode; then\n  test "$4" = preact\n  mode=preact\nfi\necho "$mode" >> "$VERCEL_BUILD_CONTRACT_LOG"\nmkdir -p dist/public\nprintf "%s" "$mode" > dist/public/frontend-mode\n'
            );
            const chmod = spawnSync('chmod', ['755', join(fixtureBin, 'npx')]);
            if (chmod.status !== 0) throw new Error(chmod.stderr);
            const log = join(fixtureRoot, 'frontend.log');
            const env = {
              PATH: fixtureBin + ':' + process.env.PATH,
              HOME: fixtureRoot,
              TZ: 'UTC',
              npm_config_offline: 'true',
              npm_config_userconfig: '/dev/null',
              npm_config_globalconfig: join(fixtureRoot, 'global.npmrc'),
              npm_config_update_notifier: 'false',
              VERCEL_BUILD_CONTRACT_LOG: log,
            };
            const run = (command, args = []) => {
              const result = spawnSync(command, args, { cwd: fixtureRoot, env, encoding: 'utf8', timeout: 15000 });
              if (result.status !== 0) throw new Error(result.stderr || result.stdout || command + ' failed');
            };
            run('/bin/sh', ['-c', vercel.buildCommand]);
            // Pinned @vercel/node runs the hook separately for each API entrypoint.
            run('npm', ['run', 'vercel-build']);
            run('npm', ['run', 'vercel-build']);
            console.log('RESULT:' + JSON.stringify({
              frontendRuns: readFileSync(log, 'utf8').trim().split(String.fromCharCode(10)).length,
              frontendMode: readFileSync(join(fixtureRoot, 'dist', 'public', 'frontend-mode'), 'utf8'),
              apiBundleExists: existsSync(join(fixtureRoot, 'api', '_app.generated.mjs')),
            }));
          } finally {
            rmSync(fixtureRoot, { recursive: true, force: true });
          }
        `,
          root,
        ],
        { cwd: root, encoding: 'utf8', timeout: 45000 }
      );

      expect(scenario.status, scenario.stderr || scenario.stdout).toBe(0);
      const line = scenario.stdout
        .trim()
        .split('\n')
        .find((output) => output.startsWith('RESULT:'));
      expect(line).toBeDefined();
      const result = JSON.parse(line.slice('RESULT:'.length));

      expect(result).toEqual({ frontendRuns: 1, frontendMode: 'preact', apiBundleExists: true });
    }
  );

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
