import { spawn } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const inspectorPath = path.resolve(
  repoRoot,
  'audit/surface-contract-matrix/scripts/inspect-runtime.mjs'
);
const tsxCliPath = path.resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const tsconfigPath = path.resolve(repoRoot, 'tsconfig.server.json');

function runInspector(
  fsVariant: 'static' | 'api-only'
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        tsxCliPath,
        '--tsconfig',
        tsconfigPath,
        inspectorPath,
        '--profile',
        'default',
        '--fs-variant',
        fsVariant,
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, CI: '1', FORCE_COLOR: '0', TZ: 'UTC' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== 0) {
        reject(new Error(`Inspector failed (${code ?? signal}): ${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

describe('surface contract matrix runtime inspector', () => {
  it.each(['static', 'api-only'] as const)(
    'emits one JSON document with effective route order for %s',
    async (fsVariant) => {
      const { stdout } = await runInspector(fsVariant);
      const lines = stdout.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(stdout).toBe(`${lines[0]}\n`);
      const document = JSON.parse(lines[0]);
      expect(document.fs_variant).toBe(fsVariant);
      expect(document.surfaces.map((surface) => surface.name)).toEqual([
        'make_app',
        'create_server',
      ]);

      const makeAppRoutes = document.surfaces.find((surface) => surface.name === 'make_app').routes;
      const versionRoutes = makeAppRoutes.filter(
        (route) => route.method === 'GET' && route.path === '/api/version'
      );
      expect(versionRoutes.map((route) => `${route.role}:${route.site}`)).toEqual([
        'handler:server/routes/health.ts:528',
        'shadowed:server/app.ts:214',
      ]);
      expect(versionRoutes[0].order).toBeLessThan(versionRoutes[1].order);

      for (const routePath of ['/metrics/rum', '/api/metrics/rum']) {
        const rumRoutes = makeAppRoutes.filter(
          (route) => route.method === 'POST' && route.path === routePath
        );
        expect(rumRoutes.some((route) => route.role === 'guard')).toBe(true);
        expect(rumRoutes.some((route) => route.role === 'handler')).toBe(true);
        expect(
          rumRoutes.some((route) => route.site === 'server/routes/metrics-rum-ingress.ts:28')
        ).toBe(true);
      expect(rumRoutes.some((route) => route.site === 'server/routes/metrics-rum.ts:112')).toBe(
          true
        );
      }

      const createServerRoutes = document.surfaces.find((surface) => surface.name === 'create_server').routes;
      const preBoundaryMetrics = createServerRoutes.filter(
        (route) => route.method === 'GET'
          && route.path === '/api/metrics'
          && route.site === 'server/routes/metrics-endpoint.ts:19'
          && route.role === 'handler',
      );
      expect(preBoundaryMetrics.length).toBeGreaterThan(0);
      expect(preBoundaryMetrics.every((route) => route.outer_mount_site === 'server/server.ts:202')).toBe(true);
      expect(preBoundaryMetrics.every((route) => Number.isInteger(route.outer_mount_order))).toBe(true);

      const rootRoute = document.routes.find(
        (route) => route.method === 'GET' && route.path === '/'
      );
      expect(Boolean(rootRoute)).toBe(fsVariant === 'api-only');
    },
    60_000
  );
});
