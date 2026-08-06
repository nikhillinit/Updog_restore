import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

import { describe, expect, it } from 'vitest';

import * as matrixSchema from '../../../audit/surface-contract-matrix/matrix-schema.mjs';
import { classifyDocument } from '../../../audit/surface-contract-matrix/scripts/classify-pass.mjs';
import { routePolicyKey } from '../../../server/route-policy/api-route-policy-registry.ts';

const repoRoot = process.cwd();
const seedPath = path.join(repoRoot, 'audit/surface-contract-matrix/scripts/seed-matrix.mjs');

type SeedInternals = {
  createRuntimeIndex: (documents: unknown[]) => {
    observations: Map<string, unknown[]>;
    conditions: Map<string, unknown[]>;
  };
  makeApiRows: (input: Record<string, unknown>) => Map<string, Record<string, unknown>>;
  makeClientRows: (input: Record<string, unknown>) => Map<string, Record<string, unknown>>;
  makeBackgroundRows: (snapshotId: string) => Map<string, Record<string, unknown>>;
  makeWorkerRows: (input: Record<string, unknown>) => Map<string, Record<string, unknown>>;
  sourceMappings: (input: Record<string, unknown>) => {
    rowToSources: Record<string, string[]>;
    sourceToRows: Record<string, string[]>;
  };
  definingSourceHashesForRow: (row: Record<string, unknown>, sourceHashes: Record<string, string>, rowToSources: Record<string, string[]>) => string[];
};

type ExposureFixture = {
  deployment: string;
  runtime: string;
  conditions: unknown[];
  ingresses: Array<{ external_path: string }>;
  auth_evidence: Array<{ boundary?: string }>;
};

type SeedRowFixture = Record<string, unknown> & {
  exposures: ExposureFixture[];
  auth_roles: string[];
  queue_roles: { producers: Array<{ site: string }>; consumers: Array<{ site: string }> };
};

const seedRow = (row: Record<string, unknown>): SeedRowFixture => row as SeedRowFixture;

/**
 * Seed's pure row builders are intentionally not exported by its CLI module.
 * Evaluate those builders against in-memory fixtures without invoking seed()
 * or touching tracked matrix artifacts.
 */
async function loadSeedInternals(): Promise<SeedInternals> {
  const source = fs.readFileSync(seedPath, 'utf8');
  const bodyStart = source.indexOf('const currentFile =');
  const bodyEnd = source.indexOf('if (import.meta.url');
  const body = source
    .slice(bodyStart, bodyEnd)
    .replace('const currentFile = fileURLToPath(import.meta.url);', `const currentFile = ${JSON.stringify(seedPath)};`)
    .replaceAll(/^export const /gm, 'const ')
    .replaceAll(/^export function /gm, 'function ')
    .concat('\n globalThis.__seedInternals = { createRuntimeIndex, makeApiRows, makeClientRows, makeBackgroundRows, makeWorkerRows, sourceMappings, definingSourceHashesForRow };');

  const context = vm.createContext({
    fs,
    path,
    process,
    createHash,
    createInterface,
    execFileSync,
    spawnSync,
    fileURLToPath: (value: string) => value,
    API_ROUTE_POLICY_REGISTRY: [
      {
        id: 'diagnostic',
        method: 'GET',
        path: '/api/diagnostics',
        apiAuthBoundary: 'require_auth',
        fundScopeMode: 'none',
      },
      {
        id: 'public-share',
        method: 'GET',
        path: '/api/public/shares/:shareId',
        apiAuthBoundary: 'public',
        fundScopeMode: 'none',
      },
      {
        id: 'health-detailed',
        method: 'GET',
        path: '/api/health/detailed',
        apiAuthBoundary: 'require_auth',
        fundScopeMode: 'none',
      },
    ],
    routePolicyKey,
    QUEUE_CATALOG: [
      { key: 'synthetic-producer', queueName: 'synthetic-producer', healthMode: 'producer' },
    ],
    COMMON_API_ROUTE_MANIFEST: [
      { id: 'diagnostic', sourceModule: './routes/current-forecast.js', authBoundary: 'require_auth' },
      { id: 'public-share', sourceModule: './routes/shares.js', authBoundary: 'public' },
      { id: 'health-detailed', sourceModule: './routes/health.js', authBoundary: 'require_auth' },
    ],
    API_RUNTIME_SPECIFIC_MANIFEST: [],
    ROUTE_GOVERNANCE_REGISTRY: [
      ...Array.from({ length: 7 }, (_, index) => ({
        path: ['/lp', '/lp/dashboard', '/lp/reports', '/lp/metrics', '/lp/ledger', '/lp/settings', '/lp/performance'][index],
        surface: 'lp-route',
      })),
      { path: '/archived-route', surface: 'archived-placeholder', redirectTarget: '/dashboard' },
      { path: '/moic-analysis', surface: 'legacy-redirect', redirectTarget: '/model-results' },
      { path: '/fund-model-results/:fundId/moic-analysis', surface: 'app-route' },
    ],
    ...matrixSchema,
  });

  new vm.Script(body, { filename: seedPath }).runInContext(context);
  return (context as unknown as { __seedInternals: SeedInternals }).__seedInternals;
}

const apiNode = (method: string, routePath: string, sourcePath: string) => ({
  id: `api:${method}:${routePath}`,
  type: 'APIEndpoint',
  method,
  path: routePath,
  source_path: sourcePath,
  line_start: 1,
});

const routeObservation = ({
  surface,
  id,
  method,
  routePath,
  site,
  role,
  order,
  profile = 'default',
  fsVariant = 'static',
  outerMountSite,
  outerMountOrder,
}: Record<string, string | number>) => ({
  surface,
  id,
  method,
  path: routePath,
  site,
  role,
  order,
  profile,
  fs_variant: fsVariant,
  ...(outerMountSite ? {
    outer_mount_site: outerMountSite,
    outer_mount_order: outerMountOrder,
  } : {}),
});

const makeRuntimeDocuments = () => {
  const diagnosticId = 'api:GET:/api/diagnostics';
  const publicId = 'api:GET:/api/public/shares/:shareId';
  const healthId = 'api:GET:/api/health/detailed';
  const metricsId = 'api:GET:/api/metrics';
  const defaultRoutes = [
    routeObservation({ surface: 'make_app', id: diagnosticId, method: 'GET', routePath: '/api/diagnostics', site: 'server/routes/current-forecast.ts:188', role: 'guard', order: 1 }),
    routeObservation({ surface: 'make_app', id: diagnosticId, method: 'GET', routePath: '/api/diagnostics', site: 'server/routes/current-forecast.ts:191', role: 'handler', order: 2 }),
    routeObservation({ surface: 'make_app', id: publicId, method: 'GET', routePath: '/api/public/shares/:shareId', site: 'server/routes/shares.ts:1', role: 'handler', order: 3 }),
    routeObservation({ surface: 'make_app', id: healthId, method: 'GET', routePath: '/api/health/detailed', site: 'server/routes/health.ts:309', role: 'handler', order: 4 }),
    routeObservation({ surface: 'create_server', id: diagnosticId, method: 'GET', routePath: '/api/diagnostics', site: 'server/routes/current-forecast.ts:188', role: 'guard', order: 1 }),
    routeObservation({ surface: 'create_server', id: diagnosticId, method: 'GET', routePath: '/api/diagnostics', site: 'server/server.ts:215', role: 'handler', order: 2 }),
    routeObservation({ surface: 'create_server', id: publicId, method: 'GET', routePath: '/api/public/shares/:shareId', site: 'server/server.ts:215', role: 'handler', order: 3 }),
    routeObservation({ surface: 'create_server', id: healthId, method: 'GET', routePath: '/api/health/detailed', site: 'server/routes/health.ts:309', role: 'handler', order: 4 }),
    routeObservation({ surface: 'create_server', id: healthId, method: 'GET', routePath: '/api/health/detailed', site: 'server/server.ts:215', role: 'handler', order: 5 }),
    routeObservation({ surface: 'create_server', id: metricsId, method: 'GET', routePath: '/api/metrics', site: 'server/routes/metrics.ts:121', role: 'handler', order: 6, outerMountSite: 'server/server.ts:201', outerMountOrder: 6 }),
  ];
  return [
    { profile: 'default', fs_variant: 'static', routes: defaultRoutes },
    {
      profile: 'gate:ENABLE_METRICS:enabled',
      fs_variant: 'static',
      routes: [
        routeObservation({ surface: 'make_app', id: diagnosticId, method: 'GET', routePath: '/api/diagnostics', site: 'server/routes/current-forecast.ts:191', role: 'handler', order: 2, profile: 'gate:ENABLE_METRICS:enabled' }),
      ],
    },
  ];
};

describe('surface contract matrix seed semantic regressions', () => {
  it('unions make_app/create_server observations and derives protected/public auth boundaries', async () => {
    const seed = await loadSeedInternals();
    const nodes = new Map([
      ['api:GET:/api/diagnostics', apiNode('GET', '/api/diagnostics', 'server/routes/current-forecast.ts')],
      ['api:GET:/api/public/shares/:shareId', apiNode('GET', '/api/public/shares/:shareId', 'server/routes/shares.ts')],
      ['api:GET:/api/health/detailed', apiNode('GET', '/api/health/detailed', 'server/routes/health.ts')],
      ['api:GET:/api/metrics', apiNode('GET', '/api/metrics', 'server/routes/metrics.ts')],
    ]);
    const runtimeIndex = seed.createRuntimeIndex(makeRuntimeDocuments());
    const rows = seed.makeApiRows({
      nodes,
      edges: [],
      runtimeIndex,
      snapshotId: 'synthetic-seed-snapshot',
    });

    const diagnostic = seedRow(rows.get('api:GET:/api/diagnostics') ?? {});
    expect(diagnostic.exposures.map((exposure) => `${exposure.deployment}|${exposure.runtime}`)).toEqual([
      'vercel-api|make_app',
      'railway-api|create_server',
    ]);
    expect(diagnostic.reachability).toBe('both');
    expect(diagnostic.exposures.flatMap((exposure) => exposure.conditions)).toContainEqual({
      gate: 'ENABLE_METRICS',
      enabled: true,
    });
    expect(diagnostic.exposures.every((exposure) => exposure.auth_evidence.some((entry) => entry.boundary === 'global_authenticated'))).toBe(true);
    expect(diagnostic.exposures.every((exposure) => exposure.auth_evidence.some((entry) => entry.boundary === 'authenticated'))).toBe(true);
    expect(diagnostic.exposures.some((exposure) => exposure.auth_evidence.some((entry) => entry.boundary === 'public'))).toBe(false);

    const publicShare = seedRow(rows.get('api:GET:/api/public/shares/:shareId') ?? {});
    expect(publicShare.auth_roles).toContain('public');
    expect((publicShare.auth_evidence as Array<{ boundary?: string }>).some((entry) => entry.boundary === 'public')).toBe(true);

    const health = seedRow(rows.get('api:GET:/api/health/detailed') ?? {});
    const healthByRuntime = new Map(health.exposures.map((exposure) => [exposure.runtime, exposure]));
    expect(healthByRuntime.get('make_app')?.auth_evidence.some((entry) => entry.boundary === 'global_authenticated')).toBe(false);
    expect(healthByRuntime.get('create_server')?.auth_evidence.some((entry) => entry.boundary === 'global_authenticated')).toBe(true);

    const metrics = seedRow(rows.get('api:GET:/api/metrics') ?? {});
    expect(metrics.exposures[0]).toMatchObject({
      runtime: 'create_server',
      outer_mount_site: 'server/server.ts:201',
      outer_mount_order: 6,
    });
    expect(metrics.exposures[0].auth_evidence.some((entry) => entry.boundary === 'global_authenticated')).toBe(false);
  });

  it('maps auth-truth source dependencies to protected, public, and websocket rows', async () => {
    const seed = await loadSeedInternals();
    const protectedRow = {
      id: 'api:GET:/api/protected',
      interface: 'http-api',
      auth_roles: ['admin'],
      auth_evidence: [{ boundary: 'global_authenticated', file: 'server/server.ts' }],
      exposures: [{ auth_evidence: [{ boundary: 'global_authenticated', file: 'server/server.ts' }] }],
      source_mapping: {},
    };
    const publicRow = {
      id: 'api:GET:/api/public/shares/:shareId',
      interface: 'http-api',
      auth_roles: ['public'],
      auth_evidence: [{ boundary: 'public', file: 'server/lib/public-api-boundary.ts' }],
      exposures: [],
      source_mapping: {},
    };
    const websocketRow = {
      id: 'ws:portfolio-metrics',
      interface: 'websocket',
      auth_roles: ['admin'],
      auth_evidence: [{ boundary: 'authenticated', file: 'server/websocket/index.ts' }],
      exposures: [],
      source_mapping: {},
    };
    const mapping = seed.sourceMappings({
      rows: new Map([
        [protectedRow.id, protectedRow],
        [publicRow.id, publicRow],
        [websocketRow.id, websocketRow],
      ]),
      commonManifest: [],
      runtimeManifest: [],
      policyRegistry: [],
      governanceRegistry: [],
      queueCatalog: [],
    });
    expect(mapping.rowToSources[protectedRow.id]).toEqual(expect.arrayContaining([
      'server/lib/auth/jwt.ts',
      'server/lib/auth/revocation.ts',
      'server/lib/public-api-boundary.ts',
    ]));
    expect(mapping.rowToSources[publicRow.id]).toContain('server/lib/public-api-boundary.ts');
    expect(mapping.rowToSources[websocketRow.id].filter((source) => source.startsWith('server/websocket/')).length).toBeGreaterThan(0);
    const authHashes = seed.definingSourceHashesForRow(
      protectedRow,
      {
        'server/lib/auth/jwt.ts': 'a'.repeat(64),
        'server/lib/auth/revocation.ts': 'b'.repeat(64),
        'server/lib/public-api-boundary.ts': 'c'.repeat(64),
      },
      mapping.rowToSources,
    );
    expect(authHashes).toEqual(expect.arrayContaining([
      `server/lib/auth/jwt.ts=${'a'.repeat(64)}`,
      `server/lib/auth/revocation.ts=${'b'.repeat(64)}`,
      `server/lib/public-api-boundary.ts=${'c'.repeat(64)}`,
    ]));
  });

  it('marks LP lifecycle, compatibility redirects, canonical/legacy MOIC, WebSocket split, and producer-only queues', async () => {
    const seed = await loadSeedInternals();
    const clientPaths = [
      '/lp', '/lp/dashboard', '/lp/reports', '/lp/metrics', '/lp/ledger', '/lp/settings', '/lp/performance',
      '/archived-route', '/moic-analysis', '/fund-model-results/:fundId/moic-analysis',
    ];
    const clientRows = seed.makeClientRows({
      nodes: new Map(clientPaths.map((routePath) => [routePath, {
        id: `client:${routePath}`,
        type: 'ClientRoute',
        path: routePath,
        component: 'SyntheticPage',
        line_start: 1,
      }])),
      snapshotId: 'synthetic-seed-snapshot',
    });

    for (const routePath of clientPaths.slice(0, 7)) {
      const row = clientRows.get(`client:${routePath}`);
      const clientRow = seedRow(row ?? {});
      expect(clientRow.exposures.every((exposure) => Array.isArray(exposure.conditions))).toBe(true);
      expect(clientRow.exposures.flatMap((exposure) => exposure.conditions)).toEqual([
        expect.objectContaining({ gate: 'enable_lp_reporting', enabled: false }),
        expect.objectContaining({ gate: 'enable_lp_reporting', enabled: false }),
      ]);
    }

    expect(clientRows.get('client:/archived-route')).toMatchObject({
      route_category: 'compatibility-surface',
      archived_placeholder: true,
      redirect_target: '/dashboard',
    });
    expect(clientRows.get('client:/moic-analysis')).toMatchObject({
      route_kind: 'legacy-redirect',
      legacy: true,
      redirect_target: '/model-results',
    });
    expect(clientRows.get('client:/fund-model-results/:fundId/moic-analysis')).toMatchObject({
      route_kind: 'canonical',
      legacy: false,
    });

    const background = seed.makeBackgroundRows('synthetic-seed-snapshot');
    expect(background.get('ws:portfolio-metrics')?.exposures[0].ingresses[0].external_path).toBe('/ws/portfolio-metrics');
    expect(background.get('ws:portfolio-metrics')?.exposures[0].conditions).toEqual([]);
    expect(background.get('ws:dev-dashboard')?.exposures[0].ingresses[0].external_path).toBe('/socket.io/dev-dashboard');
    expect(background.get('ws:dev-dashboard')?.exposures[0].conditions).toEqual([{ NODE_ENV: 'development' }]);

    const workers = seed.makeWorkerRows({
      nodes: new Map(),
      findings: [],
      snapshotId: 'synthetic-seed-snapshot',
      httpRows: [],
      backgroundRows: [],
    });
    const producerOnly = seedRow(workers.get('worker:synthetic-producer') ?? {});
    expect(producerOnly.queue_roles.producers).toEqual([]);
    expect(producerOnly.queue_roles.consumers).toEqual([]);
    expect(producerOnly.queue_roles.producers.some((entry) => entry.site.includes('server/queues/registry.ts'))).toBe(false);
  });
});

const classifyRow = ({ id, source, persistence = 'unknown', destructive = 'unknown', handlerSite }: {
  id: string;
  source: string;
  persistence?: string;
  destructive?: string;
  handlerSite?: string;
}) => {
  const row = {
    id,
    seam: 'synthetic-classification',
    interface: 'http-api',
    personas: ['unknown'],
    reachability: 'railway',
    proven_reachability: 'none',
    exposures: [{
      deployment: 'railway-api',
      runtime: 'create_server',
      mount_evidence: `${source}:1`,
      ingresses: [{ external_path: id.replace(/^api:[A-Z]+:/, ''), express_path: id.replace(/^api:[A-Z]+:/, ''), rewrite_evidence: 'fixture' }],
      conditions: [],
      definitions: [{ site: handlerSite ?? `${source}:1`, role: 'handler', effective_mount_order: 1 }],
      boot_status: 'failed',
      boot_evidence: { command_or_artifact: 'fixture', probe: 'fixture', result: 'failed', observed_at: 'fixture' },
    }],
    persistence,
    destructive,
    environment: 'unknown',
    owner: 'analytics',
    evidence: [`${source}:1`],
    source_mapping: { source_file: source },
    queue_roles: { producers: [], consumers: [] },
    auth_roles: [],
    behavior_flags: [],
    test_evidence: { derived: [], manual: [] },
    classification: 'unclassified',
    decision: 'keep-and-prove',
    decision_suggestion: 'keep-and-prove',
    decision_status: 'proposed',
    approved_source_hashes: [],
    machine_suggestions: { personas: ['unknown'], persistence, destructive, owner: 'analytics' },
  };
  return { ...row, contract_fingerprint: matrixSchema.contractFingerprint(row) };
};

const classifyDocumentFixture = (rows: Record<string, unknown>[]) => matrixSchema.SurfaceMatrixDocumentSchema.parse({
  schema_version: '1.1.0',
  phase: 'authoring',
  provenance: { git_head: 'synthetic', snapshot_id: 'synthetic' },
  rows,
  coverage_review: {},
});

describe('surface contract matrix classification effect regressions', () => {
  it('uses handler effects for persistence and hard-delete evidence for destructive state', () => {
    const rows = [
      classifyRow({ id: 'api:POST:/api/write', source: 'server/routes/current-forecast.ts' }),
      classifyRow({ id: 'api:POST:/api/unknown', source: 'server/routes/shares.ts' }),
      classifyRow({ id: 'api:POST:/api/calculate', source: 'tests/unit/audit/fixtures/pure-calculation.ts' }),
      classifyRow({ id: 'api:POST:/api/calculate-without-graph', source: 'tests/unit/audit/fixtures/pure-calculation.ts' }),
      classifyRow({
        id: 'api:POST:/api/symbol-read',
        source: 'tests/unit/audit/fixtures/symbol-effects.ts',
        handlerSite: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#readCalculate',
      }),
      classifyRow({
        id: 'api:POST:/api/symbol-file-target',
        source: 'tests/unit/audit/fixtures/symbol-effects.ts',
        handlerSite: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#readFileTarget',
      }),
      classifyRow({ id: 'api:POST:/api/file-fallback', source: 'tests/unit/audit/fixtures/symbol-effects.ts' }),
      classifyRow({
        id: 'api:POST:/api/cross-file-target',
        source: 'tests/unit/audit/fixtures/cross-file-handler.ts',
        handlerSite: 'sym:tests/unit/audit/fixtures/cross-file-handler.ts#readCrossFileTarget',
      }),
      classifyRow({
        id: 'api:POST:/api/bounded-file-target',
        source: 'tests/unit/audit/fixtures/cross-file-handler.ts',
        handlerSite: 'tests/unit/audit/fixtures/cross-file-handler.ts:1',
      }),
      classifyRow({
        id: 'api:POST:/api/file-root-sibling',
        source: 'tests/unit/audit/fixtures/file-root-effects.ts',
        handlerSite: 'tests/unit/audit/fixtures/file-root-effects.ts:1',
      }),
      classifyRow({
        id: 'api:POST:/api/revoke',
        source: 'tests/unit/audit/fixtures/revocation-handler.ts',
        handlerSite: 'sym:tests/unit/audit/fixtures/revocation-handler.ts#calculateWithRevocation',
      }),
      classifyRow({ id: 'api:DELETE:/api/delete', source: 'server/routes/shares.ts' }),
      classifyRow({ id: 'api:DELETE:/api/unrelated-sibling-delete', source: 'tests/unit/audit/fixtures/unrelated-delete-handler.ts' }),
    ];
    const classified = classifyDocumentFixture(rows);
    const output = classifyDocument(classified, {
      effectEdges: [
        { type: 'DEFINES', from: 'server/routes/current-forecast.ts', to: 'api:POST:/api/write', line_start: 1, line_end: 1 },
        { type: 'DEFINES', from: 'server/routes/shares.ts', to: 'api:POST:/api/unknown', line_start: 1, line_end: 1 },
        { type: 'DEFINES', from: 'tests/unit/audit/fixtures/pure-calculation.ts', to: 'api:POST:/api/calculate', line_start: 1, line_end: 1 },
        { type: 'DEFINES', from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#readCalculate', to: 'api:POST:/api/symbol-read', line_start: 1, line_end: 3 },
        { type: 'DEFINES', from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#readFileTarget', to: 'api:POST:/api/symbol-file-target', line_start: 9, line_end: 11 },
        { type: 'DEFINES', from: 'tests/unit/audit/fixtures/symbol-effects.ts', to: 'api:POST:/api/file-fallback', line_start: 1, line_end: 3 },
        { type: 'DEFINES', from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#getFund', to: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#getFund', line_start: 5, line_end: 7 },
        { type: 'CALLS', from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#readCalculate', to: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#getFund', line_start: 2 },
        { type: 'CALLS', from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#readFileTarget', to: 'tests/unit/audit/fixtures/symbol-effects.ts', line_start: 10 },
        { type: 'PERSISTS_TO', from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#createFund', to: 'dbtable:synthetic', line_start: 10 },
        { type: 'DEFINES', from: 'sym:tests/unit/audit/fixtures/cross-file-handler.ts#readCrossFileTarget', to: 'api:POST:/api/cross-file-target', line_start: 1, line_end: 3 },
        { type: 'CALLS', from: 'sym:tests/unit/audit/fixtures/cross-file-handler.ts#readCrossFileTarget', to: 'tests/unit/audit/fixtures/file-target-effects.ts', line_start: 2 },
        { type: 'DEFINES', from: 'tests/unit/audit/fixtures/cross-file-handler.ts', to: 'api:POST:/api/bounded-file-target', line_start: 1, line_end: 3 },
        { type: 'CALLS', from: 'tests/unit/audit/fixtures/cross-file-handler.ts', to: 'tests/unit/audit/fixtures/file-target-effects.ts', line_start: 2 },
        { type: 'PERSISTS_TO', from: 'tests/unit/audit/fixtures/file-target-effects.ts', to: 'dbtable:unrelated', line_start: 6 },
        { type: 'DEFINES', from: 'sym:tests/unit/audit/fixtures/file-root-effects.ts#readSibling', to: 'api:POST:/api/file-root-sibling', line_start: 1, line_end: 3 },
        { type: 'PERSISTS_TO', from: 'tests/unit/audit/fixtures/file-root-effects.ts', to: 'dbtable:sibling', line_start: 6 },
        { type: 'DEFINES', from: 'sym:tests/unit/audit/fixtures/revocation-handler.ts#calculateWithRevocation', to: 'api:POST:/api/revoke', line_start: 1, line_end: 3 },
        { type: 'CALLS', from: 'sym:tests/unit/audit/fixtures/revocation-handler.ts#calculateWithRevocation', to: 'sym:server/lib/auth/revocation.ts#revokeAccessToken', line_start: 2 },
        { type: 'DEFINES', from: 'server/routes/shares.ts', to: 'api:DELETE:/api/delete', line_start: 1, line_end: 1 },
        { type: 'PERSISTS_TO', from: 'server/routes/current-forecast.ts', to: 'dbtable:synthetic', line_start: 1 },
        { type: 'REFERENCES', from: 'server/routes/shares.ts', to: 'dbtable:synthetic', line_start: 1 },
      ],
    });
    const byId = new Map(output.rows.map((row) => [row.id, row]));
    expect(byId.get('api:POST:/api/write')?.persistence).toBe('writes');
    expect(byId.get('api:POST:/api/unknown')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/calculate')?.persistence).toBe('reads-only');
    expect(byId.get('api:POST:/api/calculate-without-graph')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/symbol-read')?.persistence).toBe('reads-only');
    expect(byId.get('api:POST:/api/symbol-file-target')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/file-fallback')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/cross-file-target')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/cross-file-target')?.machine_suggestions).toEqual(expect.objectContaining({
      persistence_evidence: expect.objectContaining({
        writes: [],
        pure_calculation: [],
        ambiguous_calls: expect.arrayContaining([
          expect.objectContaining({ effect: 'ambiguous-call-target' }),
        ]),
      }),
    }));
    expect(byId.get('api:POST:/api/bounded-file-target')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/bounded-file-target')?.machine_suggestions).toEqual(expect.objectContaining({
      persistence_evidence: expect.objectContaining({
        writes: [],
        pure_calculation: [],
        ambiguous_calls: expect.arrayContaining([
          expect.objectContaining({ effect: 'ambiguous-call-target' }),
        ]),
      }),
    }));
    expect(byId.get('api:POST:/api/file-root-sibling')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/file-root-sibling')?.machine_suggestions).toEqual(expect.objectContaining({
      persistence_evidence: expect.objectContaining({ writes: [], pure_calculation: [] }),
    }));
    expect(byId.get('api:POST:/api/revoke')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/revoke')?.machine_suggestions).toEqual(expect.objectContaining({
      persistence_evidence: expect.objectContaining({
        side_effecting_calls: expect.arrayContaining([
          expect.objectContaining({ target: 'sym:server/lib/auth/revocation.ts#revokeAccessToken' }),
        ]),
      }),
    }));
    expect(byId.get('api:DELETE:/api/delete')?.persistence).toBe('unknown');
    expect(byId.get('api:DELETE:/api/delete')?.destructive).toBe('unknown');
    expect(byId.get('api:DELETE:/api/unrelated-sibling-delete')?.persistence).toBe('unknown');
    expect(byId.get('api:DELETE:/api/unrelated-sibling-delete')?.destructive).toBe('unknown');

  });
});
