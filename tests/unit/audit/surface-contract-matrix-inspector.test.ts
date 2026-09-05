import { spawn } from 'node:child_process';
import fs from 'node:fs';
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
  fsVariant: 'static' | 'api-only',
  profile = 'default',
  inheritedActualsPilotFundId?: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, CI: '1', FORCE_COLOR: '0', TZ: 'UTC' };
    delete childEnv['VITEST'];
    if (inheritedActualsPilotFundId === undefined) {
      delete childEnv['ACTUALS_PILOT_FUND_ID'];
    } else {
      childEnv['ACTUALS_PILOT_FUND_ID'] = inheritedActualsPilotFundId;
    }
    const child = spawn(
      process.execPath,
      [
        tsxCliPath,
        '--tsconfig',
        tsconfigPath,
        inspectorPath,
        '--profile',
        profile,
        '--fs-variant',
        fsVariant,
      ],
      {
        cwd: repoRoot,
        env: childEnv,
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
      // The shadowed server/app.ts duplicate was deleted in F_1.2.5 Phase 3;
      // the health-router handler is the only /api/version registration.
      expect(versionRoutes.map((route) => `${route.role}:${route.site}`)).toEqual([
        'handler:server/routes/health.ts:573',
      ]);

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

      const createServerRoutes = document.surfaces.find(
        (surface) => surface.name === 'create_server'
      ).routes;
      const preBoundaryMetrics = createServerRoutes.filter(
        (route) =>
          route.method === 'GET' &&
          route.path === '/api/metrics' &&
          route.site === 'server/routes/metrics-endpoint.ts:19' &&
          route.role === 'handler'
      );
      expect(preBoundaryMetrics.length).toBeGreaterThan(0);
      expect(
        preBoundaryMetrics.every((route) => {
          const source = fs.readFileSync(path.join(repoRoot, 'server/server.ts'), 'utf8');
          const mountLine =
            source
              .split('\n')
              .findIndex((line) => line.includes("app.use('/api', metricsRouter)")) + 1;
          expect(mountLine).toBeGreaterThan(0);
          return route.outer_mount_site === `server/server.ts:${mountLine}`;
        })
      ).toBe(true);
      expect(preBoundaryMetrics.every((route) => Number.isInteger(route.outer_mount_order))).toBe(
        true
      );

      const rootRoute = document.routes.find(
        (route) => route.method === 'GET' && route.path === '/'
      );
      expect(Boolean(rootRoute)).toBe(fsVariant === 'api-only');
    },
    60_000
  );

  it.each(['static', 'api-only'] as const)(
    'scrubs ambient actuals selector and discovers configured routes in both app assemblies for %s',
    async (fsVariant) => {
      const [unsetRun, configuredRun] = await Promise.all([
        runInspector(
          fsVariant,
          'selector:ACTUALS_PILOT_FUND_ID:unset',
          '2147483647'
        ),
        runInspector(fsVariant, 'selector:ACTUALS_PILOT_FUND_ID:configured'),
      ]);
      const unsetDocument = JSON.parse(unsetRun.stdout);
      const configuredDocument = JSON.parse(configuredRun.stdout);
      const actualsRoutes = new Set([
        'POST /api/funds/:fundId/imports/actuals/dry-run',
        'POST /api/funds/:fundId/imports/actuals/publish',
        'GET /api/funds/:fundId/financial-facts/latest-reference',
        'GET /api/funds/:fundId/actuals/metrics',
      ]);

      for (const surfaceName of ['make_app', 'create_server']) {
        const unsetRoutes = unsetDocument.surfaces.find(
          (surface) => surface.name === surfaceName
        ).routes;
        const configuredRoutes = configuredDocument.surfaces.find(
          (surface) => surface.name === surfaceName
        ).routes;
        const terminalRouteKeys = configuredRoutes
          .filter((route) => route.role === 'handler' && route.kind === 'terminal')
          .map((route) => `${route.method} ${route.path}`)
          .filter((routeKey) => actualsRoutes.has(routeKey));

        expect(terminalRouteKeys.sort()).toEqual([...actualsRoutes].sort());
        expect(
          unsetRoutes.some((route) => actualsRoutes.has(`${route.method} ${route.path}`))
        ).toBe(false);
      }
    },
    60_000
  );
});
