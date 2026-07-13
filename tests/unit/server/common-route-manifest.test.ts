import { readFile } from 'node:fs/promises';
import path from 'node:path';

import express from 'express';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  COMMON_API_ROUTE_MANIFEST,
  type RuntimeSurface,
} from '../../../shared/routes/api-route-manifest';
import { API_RUNTIME_SPECIFIC_MANIFEST } from '../../../shared/routes/api-runtime-specific-manifest';
import {
  COMMON_ROUTE_IMPLEMENTATIONS,
  MIGRATED_COMMON_ROUTE_IDS,
  mountCommonRoutes,
} from '../../../server/routes/mount-common-routes';

type SurfaceModule = `${RuntimeSurface}:${string}`;

const SURFACE_SOURCE_FILES = {
  make_app: 'server/app.ts',
  register_routes: 'server/routes.ts',
} as const satisfies Record<RuntimeSurface, string>;

function isClassifiedLoader(modulePath: string): boolean {
  return modulePath.startsWith('./routes/') || modulePath === './websocket/index.js';
}

async function discoverSurfaceModules(
  surface: RuntimeSurface,
  relativePath: string
): Promise<SurfaceModule[]> {
  const sourceText = await readFile(path.resolve(process.cwd(), relativePath), 'utf8');
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true);
  const discovered = new Set<SurfaceModule>();
  let mountsCommonRoutes = false;

  function addModule(modulePath: string): void {
    if (modulePath === './routes/mount-common-routes.js') {
      mountsCommonRoutes = true;
      return;
    }
    if (isClassifiedLoader(modulePath)) {
      discovered.add(`${surface}:${modulePath}`);
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      addModule(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [moduleSpecifier] = node.arguments;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        addModule(moduleSpecifier.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (mountsCommonRoutes) {
    const migratedRouteIds = new Set<string>(MIGRATED_COMMON_ROUTE_IDS);
    for (const entry of COMMON_API_ROUTE_MANIFEST) {
      if (migratedRouteIds.has(entry.id)) {
        discovered.add(`${surface}:${entry.sourceModule}`);
      }
    }
  }
  return [...discovered].sort();
}

function classifiedSurfaceModules(): SurfaceModule[] {
  const classified = new Set<SurfaceModule>();

  for (const entry of COMMON_API_ROUTE_MANIFEST) {
    classified.add(`make_app:${entry.sourceModule}`);
    classified.add(`register_routes:${entry.sourceModule}`);
  }

  for (const entry of API_RUNTIME_SPECIFIC_MANIFEST) {
    classified.add(`${entry.surface}:${entry.sourceModule}`);
  }

  return [...classified].sort();
}

describe('canonical common API route manifest', () => {
  it('classifies every route import and runtime loader on both entrypoints', async () => {
    const discovered = (
      await Promise.all(
        Object.entries(SURFACE_SOURCE_FILES).map(([surface, sourceFile]) =>
          discoverSurfaceModules(surface as RuntimeSurface, sourceFile)
        )
      )
    )
      .flat()
      .sort();

    expect(classifiedSurfaceModules()).toEqual(discovered);
  });

  it('snapshots the current common mount order and paths', () => {
    expect(
      COMMON_API_ROUTE_MANIFEST.map(
        ({ id, mountPath }) => `${id}:${mountPath === null ? '<bare>' : mountPath}`
      )
    ).toMatchInlineSnapshot(`
      [
        "auth:<bare>",
        "flags:/api/flags",
        "dual-forecast:/api",
        "dashboard-summary:/api",
        "fund-actuals:/api",
        "funds:/api",
        "fund-metrics:<bare>",
        "investments:/api",
        "portfolio-companies:/api",
        "portfolio-overview:/api",
        "portfolio-lots:/api",
        "performance-api:<bare>",
        "variance:/",
        "fund-config:<bare>",
        "allocations:/api",
        "allocation-scenarios:/api",
        "planning-fmv-overrides:/api",
        "fund-scenario-sets:/api",
        "fund-moic:/api",
        "timeline:/api/timeline",
        "shares:/api/shares",
        "public-shares:/api/public/shares",
        "capital-allocation:/api/capital-allocation",
        "liquidity:/api/liquidity",
        "graduation:/api/graduation",
        "reallocation:<bare>",
        "cash-flow-events:<bare>",
        "operating-object-tasks:<bare>",
        "deal-pipeline:/api/deals",
        "cohort-analysis:/api/cohorts",
        "sensitivity:/api",
        "lp-api:<bare>",
        "lp-capital-calls:<bare>",
        "lp-distributions:<bare>",
        "lp-documents:/api/lp",
        "lp-notifications:/api/lp",
        "lp-reporting-imports:<bare>",
        "lp-reporting-metric-runs:<bare>",
        "backtesting:/api/backtesting",
      ]
    `);
  });

  it('snapshots intentional runtime-specific mounts and gates', () => {
    expect(
      API_RUNTIME_SPECIFIC_MANIFEST.map(({ id, surface, classification, mountPaths }) => ({
        id,
        surface,
        classification,
        mountPaths,
      }))
    ).toMatchInlineSnapshot(`
      [
        {
          "classification": "runtime_specific",
          "id": "make-app-health",
          "mountPaths": [
            null,
          ],
          "surface": "make_app",
        },
        {
          "classification": "runtime_specific",
          "id": "make-app-reserves-v1",
          "mountPaths": [
            "/api/v1/reserves",
          ],
          "surface": "make_app",
        },
        {
          "classification": "runtime_specific",
          "id": "make-app-cashflow",
          "mountPaths": [
            "/api/cashflow",
          ],
          "surface": "make_app",
        },
        {
          "classification": "runtime_specific",
          "id": "make-app-calculations",
          "mountPaths": [
            "/api/calculations",
          ],
          "surface": "make_app",
        },
        {
          "classification": "runtime_specific",
          "id": "make-app-ai",
          "mountPaths": [
            "/api/ai",
          ],
          "surface": "make_app",
        },
        {
          "classification": "runtime_specific",
          "id": "make-app-scenario-analysis",
          "mountPaths": [
            "/api",
          ],
          "surface": "make_app",
        },
        {
          "classification": "runtime_specific",
          "id": "make-app-rum-ingress",
          "mountPaths": [
            "/metrics/rum",
            "/api/metrics/rum",
          ],
          "surface": "make_app",
        },
        {
          "classification": "runtime_specific",
          "id": "make-app-rum",
          "mountPaths": [
            null,
            "/api",
          ],
          "surface": "make_app",
        },
        {
          "classification": "runtime_specific",
          "id": "make-app-metrics",
          "mountPaths": [
            null,
            "/api",
          ],
          "surface": "make_app",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-health",
          "mountPaths": [
            "/",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-activities",
          "mountPaths": [
            "/api",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-fund-metrics-legacy",
          "mountPaths": [
            "/api",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-engine-summaries",
          "mountPaths": [
            "/api",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-operations",
          "mountPaths": [
            "/",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-monte-carlo",
          "mountPaths": [
            "/api/monte-carlo",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-cache",
          "mountPaths": [
            "/api/cache",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-performance-metrics",
          "mountPaths": [
            "/api/performance",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-sse-events",
          "mountPaths": [
            "/",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-lp-health",
          "mountPaths": [
            null,
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-admin-engine",
          "mountPaths": [
            "/api/admin/engine",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "feature_flagged",
          "id": "register-routes-portfolio-intelligence",
          "mountPaths": [
            null,
          ],
          "surface": "register_routes",
        },
        {
          "classification": "feature_flagged",
          "id": "register-routes-metrics",
          "mountPaths": [
            null,
          ],
          "surface": "register_routes",
        },
        {
          "classification": "feature_flagged",
          "id": "register-routes-error-budget",
          "mountPaths": [
            "/api/error-budget",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "development_only",
          "id": "register-routes-dev-dashboard",
          "mountPaths": [
            "/api/dev-dashboard",
          ],
          "surface": "register_routes",
        },
        {
          "classification": "runtime_specific",
          "id": "register-routes-websocket-setup",
          "mountPaths": [],
          "surface": "register_routes",
        },
      ]
    `);
  });

  it('keeps manifest IDs and implementation IDs exact in both directions', () => {
    expect(Object.keys(COMMON_ROUTE_IMPLEMENTATIONS)).toEqual(
      COMMON_API_ROUTE_MANIFEST.map(({ id }) => id)
    );
    expect([...MIGRATED_COMMON_ROUTE_IDS].sort()).toEqual(
      COMMON_API_ROUTE_MANIFEST.map(({ id }) => id).sort()
    );
  });

  it('keeps probes concrete and mutation probes JSON-compatible', () => {
    const unauthenticatedProbeIds: string[] = [];

    for (const entry of COMMON_API_ROUTE_MANIFEST) {
      expect(entry.probe.path).not.toMatch(/:[A-Za-z]/);
      expect(entry.probe.expectedStatus).toBeGreaterThanOrEqual(200);
      expect(entry.probe.expectedStatus).toBeLessThan(600);
      expect(entry.probe.expectedStatus).not.toBe(401);
      expect(typeof entry.probe.authenticated).toBe('boolean');

      if (!entry.probe.authenticated) {
        unauthenticatedProbeIds.push(entry.id);
      }

      if (['POST', 'PUT', 'PATCH'].includes(entry.probe.method)) {
        expect(entry.probe).toHaveProperty('body');
      }
    }

    expect(unauthenticatedProbeIds).toEqual(['auth', 'flags', 'public-shares']);
  });

  it('mounts the manifest synchronously', () => {
    expect(mountCommonRoutes(express(), { surface: 'make_app' })).toBeUndefined();
  });
});
