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
import { QUEUE_CATALOG } from '../../../server/queues/registry.ts';
import { TEAM_WRITE_ROLES } from '../../../shared/auth/effective-roles.ts';

const repoRoot = process.cwd();
const seedPath = path.join(repoRoot, 'audit/surface-contract-matrix/scripts/seed-matrix.mjs');

type SeedInternals = {
  createRuntimeIndex: (documents: unknown[]) => {
    observations: Map<string, unknown[]>;
    conditions: Map<string, unknown[]>;
  };
  makeApiRows: (input: Record<string, unknown>) => Map<string, Record<string, unknown>>;
  applyBootProofs: (
    rows: Map<string, Record<string, unknown>>,
    bootProofDocument: Record<string, unknown>
  ) => void;
  assertBootProofSourceSha: (
    bootProofDocument: Record<string, unknown>,
    kgManifest: Record<string, unknown>,
    gitHead: string
  ) => void;
  makeClientRows: (input: Record<string, unknown>) => Map<string, Record<string, unknown>>;
  makeBackgroundRows: (snapshotId: string) => Map<string, Record<string, unknown>>;
  makeWorkerRows: (input: Record<string, unknown>) => Map<string, Record<string, unknown>>;
  makeListenerRows: (input: Record<string, unknown>) => Map<string, Record<string, unknown>>;
  makeVercelFunctionRows: (input: Record<string, unknown>) => Map<string, Record<string, unknown>>;
  queueRuntimeFor: (
    catalog: Record<string, unknown>,
    roleKind: string,
    site?: string
  ) => Record<string, unknown>;
  makeListenerDispositions: (candidates: unknown[]) => Record<string, unknown>[];
  makeRuntimeExclusions: () => Record<string, unknown>[];
  mergeRuntimeExclusions: (
    previous: Record<string, unknown>[],
    discovered: Record<string, unknown>[]
  ) => Record<string, unknown>[];
  sourceMappings: (input: Record<string, unknown>) => {
    rowToSources: Record<string, string[]>;
    sourceToRows: Record<string, string[]>;
  };
  mergeSeededMatrix: (
    previousDocument: Record<string, unknown>,
    seededDocument: Record<string, unknown>
  ) => { rows: Record<string, unknown>[] };
  definingSourceHashesForRow: (
    row: Record<string, unknown>,
    sourceHashes: Record<string, string>,
    rowToSources: Record<string, string[]>
  ) => string[];
  clearUnapprovedSourceHashes: (rows: Record<string, unknown>[]) => void;
};

type ExposureFixture = {
  deployment: string;
  runtime: string;
  boot_status?: string;
  conditions: unknown[];
  ingresses: Array<{ external_path: string }>;
  auth_evidence: Array<{
    boundary?: string;
    kind?: string;
    file?: string;
    line?: number;
    evidence?: string;
  }>;
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
async function loadSeedInternals(
  queueCatalog: Record<string, unknown>[] = [
    {
      key: 'synthetic-producer',
      queueName: 'synthetic-producer',
      healthMode: 'producer',
      owner: 'route',
      productionDisposition: { mode: 'local-only' },
    },
  ]
): Promise<SeedInternals> {
  const source = fs.readFileSync(seedPath, 'utf8');
  const bodyStart = source.indexOf('const currentFile =');
  const bodyEnd = source.indexOf('if (import.meta.url');
  const body = source
    .slice(bodyStart, bodyEnd)
    .replace(
      'const currentFile = fileURLToPath(import.meta.url);',
      `const currentFile = ${JSON.stringify(seedPath)};`
    )
    .replaceAll(/^export const /gm, 'const ')
    .replaceAll(/^export function /gm, 'function ')
    .concat(
      '\n globalThis.__seedInternals = { createRuntimeIndex, makeApiRows, applyBootProofs, assertBootProofSourceSha, makeClientRows, makeBackgroundRows, makeWorkerRows, makeListenerRows, makeVercelFunctionRows, queueRuntimeFor, makeListenerDispositions, makeRuntimeExclusions, mergeRuntimeExclusions, sourceMappings, mergeSeededMatrix, definingSourceHashesForRow, clearUnapprovedSourceHashes, authSuggestionFor };'
    );

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
    QUEUE_CATALOG: queueCatalog,
    COMMON_API_ROUTE_MANIFEST: [
      {
        id: 'diagnostic',
        sourceModule: './routes/current-forecast.js',
        authBoundary: 'require_auth',
      },
      { id: 'public-share', sourceModule: './routes/shares.js', authBoundary: 'public' },
      { id: 'health-detailed', sourceModule: './routes/health.js', authBoundary: 'require_auth' },
    ],
    API_RUNTIME_SPECIFIC_MANIFEST: [],
    ROUTE_GOVERNANCE_REGISTRY: [
      ...Array.from({ length: 7 }, (_, index) => ({
        path: [
          '/lp',
          '/lp/dashboard',
          '/lp/reports',
          '/lp/metrics',
          '/lp/ledger',
          '/lp/settings',
          '/lp/performance',
        ][index],
        surface: 'lp-route',
      })),
      { path: '/archived-route', surface: 'archived-placeholder', redirectTarget: '/dashboard' },
      { path: '/moic-analysis', surface: 'legacy-redirect', redirectTarget: '/model-results' },
      { path: '/fund-model-results/:fundId/moic-analysis', surface: 'app-route' },
    ],
    TEAM_WRITE_ROLES,
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
  ...(outerMountSite
    ? {
        outer_mount_site: outerMountSite,
        outer_mount_order: outerMountOrder,
      }
    : {}),
});

const makeRuntimeDocuments = () => {
  const diagnosticId = 'api:GET:/api/diagnostics';
  const publicId = 'api:GET:/api/public/shares/:shareId';
  const healthId = 'api:GET:/api/health/detailed';
  const metricsId = 'api:GET:/api/metrics';
  const docsId = 'api:GET:/api-docs';
  const defaultRoutes = [
    routeObservation({
      surface: 'make_app',
      id: diagnosticId,
      method: 'GET',
      routePath: '/api/diagnostics',
      site: 'server/routes/current-forecast.ts:188',
      role: 'guard',
      order: 1,
    }),
    routeObservation({
      surface: 'make_app',
      id: diagnosticId,
      method: 'GET',
      routePath: '/api/diagnostics',
      site: 'server/routes/current-forecast.ts:191',
      role: 'handler',
      order: 2,
    }),
    routeObservation({
      surface: 'make_app',
      id: publicId,
      method: 'GET',
      routePath: '/api/public/shares/:shareId',
      site: 'server/routes/shares.ts:1',
      role: 'handler',
      order: 3,
    }),
    routeObservation({
      surface: 'make_app',
      id: healthId,
      method: 'GET',
      routePath: '/api/health/detailed',
      site: 'server/routes/health.ts:309',
      role: 'handler',
      order: 4,
    }),
    routeObservation({
      surface: 'create_server',
      id: diagnosticId,
      method: 'GET',
      routePath: '/api/diagnostics',
      site: 'server/routes/current-forecast.ts:188',
      role: 'guard',
      order: 1,
    }),
    routeObservation({
      surface: 'create_server',
      id: diagnosticId,
      method: 'GET',
      routePath: '/api/diagnostics',
      site: 'server/server.ts:215',
      role: 'handler',
      order: 2,
    }),
    routeObservation({
      surface: 'create_server',
      id: publicId,
      method: 'GET',
      routePath: '/api/public/shares/:shareId',
      site: 'server/server.ts:215',
      role: 'handler',
      order: 3,
    }),
    routeObservation({
      surface: 'create_server',
      id: healthId,
      method: 'GET',
      routePath: '/api/health/detailed',
      site: 'server/routes/health.ts:309',
      role: 'handler',
      order: 4,
    }),
    routeObservation({
      surface: 'create_server',
      id: healthId,
      method: 'GET',
      routePath: '/api/health/detailed',
      site: 'server/server.ts:215',
      role: 'handler',
      order: 5,
    }),
    routeObservation({
      surface: 'create_server',
      id: metricsId,
      method: 'GET',
      routePath: '/api/metrics',
      site: 'server/routes/metrics.ts:121',
      role: 'handler',
      order: 6,
      outerMountSite: 'server/server.ts:201',
      outerMountOrder: 6,
    }),
    routeObservation({
      surface: 'make_app',
      id: docsId,
      method: 'GET',
      routePath: '/api-docs',
      site: 'server/app.ts:137',
      role: 'handler',
      order: 7,
    }),
  ];
  return [
    { profile: 'default', fs_variant: 'static', routes: defaultRoutes },
    {
      profile: 'gate:ENABLE_METRICS:enabled',
      fs_variant: 'static',
      routes: [
        routeObservation({
          surface: 'make_app',
          id: diagnosticId,
          method: 'GET',
          routePath: '/api/diagnostics',
          site: 'server/routes/current-forecast.ts:191',
          role: 'handler',
          order: 2,
          profile: 'gate:ENABLE_METRICS:enabled',
        }),
      ],
    },
  ];
};

describe('surface contract matrix seed semantic regressions', () => {
  it('rejects a boot proof whose source SHA is stale relative to the KG snapshot and Git HEAD', async () => {
    const seed = await loadSeedInternals();

    expect(() =>
      seed.assertBootProofSourceSha(
        { source_sha: 'a'.repeat(40), proofs: [] },
        { repo_head: 'b'.repeat(40) },
        'b'.repeat(40)
      )
    ).toThrow(/source_sha.*repo_head.*Git HEAD/i);
  });

  it('derives every queue runtime from its tagged catalog disposition', async () => {
    const seed = await loadSeedInternals();
    expect(
      seed.queueRuntimeFor(
        {
          owner: 'route',
          productionDisposition: {
            mode: 'railway-worker',
            deployment: 'railway-worker-fund-scenario-calc',
          },
        },
        'producer'
      )
    ).toMatchObject({ deployment: 'vercel-api', runtime: 'make_app' });
    expect(
      seed.queueRuntimeFor(
        {
          owner: 'providers',
          productionDisposition: {
            mode: 'railway-worker',
            deployment: 'railway-worker-capital-call-status',
          },
        },
        'consumer',
        'workers/capital-call-status-worker.ts'
      )
    ).toMatchObject({
      deployment: 'railway-worker-capital-call-status',
      runtime: 'worker_process',
    });
    expect(
      seed.queueRuntimeFor(
        {
          owner: 'providers',
          productionDisposition: {
            mode: 'railway-worker',
            deployment: 'railway-worker-fund-scenario-calc',
          },
        },
        'consumer',
        'server/queues/fund-scenario-calc-worker-init.ts'
      )
    ).toMatchObject({ deployment: 'local-process', runtime: 'worker_process' });
    expect(
      seed.queueRuntimeFor({ productionDisposition: { mode: 'local-only' } }, 'consumer')
    ).toMatchObject({ deployment: 'local-process' });
    expect(
      seed.queueRuntimeFor({ productionDisposition: { mode: 'quarantined' } }, 'consumer')
    ).toEqual({
      deployment: 'excluded',
      runtime: 'unreachable',
      topology_reason:
        'QUEUE_CATALOG productionDisposition quarantined; registry runtime registration is excluded',
    });
    expect(() => seed.queueRuntimeFor({}, 'consumer')).toThrow(
      'QUEUE_CATALOG productionDisposition'
    );
  });

  it.each(['economics-calc', 'lp-view-refresh'] as const)(
    'keeps quarantined %s queues unreachable even when constructors are discovered',
    async (queueName) => {
      const seed = await loadSeedInternals(QUEUE_CATALOG as unknown as Record<string, unknown>[]);
      const scannedFindings = matrixSchema
        .scanBullmqConstructors({ rootDir: repoRoot })
        .filter((finding) => finding.queue_name === queueName);
      // economics-calc is quarantined before any constructor is committed to the
      // repository. Synthetic discovery keeps this test sensitive to a removed
      // quarantine branch while preserving scanner coverage for lp-view-refresh.
      const findings = [
        ...scannedFindings,
        ...(queueName === 'economics-calc'
          ? [
              {
                constructor: 'Queue',
                kind: 'queue',
                queue_name: queueName,
                queueName,
                source: 'synthetic-fixture',
                path: 'server/services/economics-calculation-service.ts',
                line: 1,
              },
            ]
          : []),
      ];
      expect(findings.length).toBeGreaterThan(0);
      const row = seed
        .makeWorkerRows({ nodes: new Map(), findings, snapshotId: `quarantined-${queueName}` })
        .get(`worker:${queueName}`);

      expect(row).toMatchObject({
        reachability: 'dormant',
        exposures: [],
        queue_roles: {
          consumer_status: 'no-reachable-consumer',
          consumer_status_reason:
            'QUEUE_CATALOG quarantines this queue, so runtime registration is excluded',
        },
      });
      const queueRoles = row?.queue_roles as {
        producers: Array<Record<string, unknown>>;
        consumers: Array<Record<string, unknown>>;
      };
      const discoveredRoles = [...queueRoles.producers, ...queueRoles.consumers];
      expect(discoveredRoles).toHaveLength(findings.length);
      expect(
        discoveredRoles.every(
          (role) => role.deployment === 'excluded' && role.runtime === 'unreachable'
        )
      ).toBe(true);
      expect(discoveredRoles).toEqual(
        expect.arrayContaining(
          findings.map((finding) =>
            expect.objectContaining({
              site: `${finding.path}:${finding.line}`,
              deployment: 'excluded',
              runtime: 'unreachable',
            })
          )
        )
      );
    }
  );

  it('cites filesystem and build-input evidence for standalone Vercel functions', async () => {
    const seed = await loadSeedInternals();
    const row = seed
      .makeVercelFunctionRows({ snapshotId: 'vercel-functions' })
      .get('api-fn:ANY:/api/telemetry/wizard');

    expect(row?.evidence).toEqual([
      'api/telemetry/wizard.ts:default export',
      'api/telemetry/wizard.ts:filesystem function route /api/telemetry/wizard',
    ]);
    expect(row?.evidence).not.toContain('vercel.json functions.api/**/*.ts');
  });

  it('retains source hashes only for approved rows after stale-approval comparison', async () => {
    const seed = await loadSeedInternals();
    const rows = [
      { id: 'proposed', decision_status: 'proposed', approved_source_hashes: ['source=hash'] },
      { id: 'approved', decision_status: 'approved', approved_source_hashes: ['source=hash'] },
    ];

    seed.clearUnapprovedSourceHashes(rows);

    expect(rows).toEqual([
      { id: 'proposed', decision_status: 'proposed', approved_source_hashes: [] },
      { id: 'approved', decision_status: 'approved', approved_source_hashes: ['source=hash'] },
    ]);
  });

  it('binds real dedicated-worker module graphs to Railway without promoting local consumers', async () => {
    const seed = await loadSeedInternals(QUEUE_CATALOG as unknown as Record<string, unknown>[]);
    const findings = matrixSchema
      .scanBullmqConstructors({ rootDir: repoRoot })
      .filter((finding) =>
        ['fund-scenario-calc', 'capital-call-status'].includes(finding.queue_name)
      );
    const rows = seed.makeWorkerRows({
      nodes: new Map(),
      findings,
      snapshotId: 'real-worker-scanner',
    });
    const consumer = (queue: string, sourcePath: string) =>
      (
        rows.get(`worker:${queue}`)?.queue_roles as {
          consumers: Array<{ site: string; deployment: string }>;
        }
      ).consumers.find((role) => role.site.startsWith(`${sourcePath}:`));
    const producer = (queue: string, sourcePath: string) =>
      (
        rows.get(`worker:${queue}`)?.queue_roles as {
          producers: Array<{ site: string; deployment: string }>;
        }
      ).producers.find((role) => role.site.startsWith(`${sourcePath}:`));

    expect(
      consumer('capital-call-status', 'server/workers/capital-call-status-worker.ts')
    ).toMatchObject({ deployment: 'railway-worker-capital-call-status' });
    expect(
      producer('capital-call-status', 'server/workers/capital-call-status-worker.ts')
    ).toMatchObject({ deployment: 'railway-worker-capital-call-status' });
    expect(consumer('fund-scenario-calc', 'workers/fund-scenario-calc-worker.ts')).toMatchObject({
      deployment: 'railway-worker-fund-scenario-calc',
    });
    expect(
      consumer('fund-scenario-calc', 'server/queues/fund-scenario-calc-worker-init.ts')
    ).toMatchObject({ deployment: 'local-process' });
    expect(
      producer('fund-scenario-calc', 'server/services/fund-scenario-calc-queue-service.ts')
    ).toMatchObject({ deployment: 'vercel-api' });
  });

  it('maps every worker health listener route to both named Railway workers and local legacy workers', async () => {
    const seed = await loadSeedInternals(QUEUE_CATALOG as unknown as Record<string, unknown>[]);
    const dispositions = seed.makeListenerDispositions([
      {
        path: 'workers/health-server.ts',
        patterns: [{ kind: 'node-listen', line: 204, text: 'server.listen(port)' }],
      },
    ]);
    const rows = seed.makeListenerRows({
      dispositions,
      snapshotId: 'worker-health-topology',
    });

    expect(rows.size).toBe(5);
    for (const row of rows.values()) {
      expect(row).toMatchObject({ seam: 'worker-health', reachability: 'railway' });
      expect(
        (row.exposures as ExposureFixture[]).map(({ deployment, runtime }) => ({
          deployment,
          runtime,
        }))
      ).toEqual([
        { deployment: 'local-process', runtime: 'service_listener' },
        {
          deployment: 'railway-worker-capital-call-status',
          runtime: 'service_listener',
        },
        {
          deployment: 'railway-worker-fund-scenario-calc',
          runtime: 'service_listener',
        },
      ]);
    }

    const bootEvidence = {
      command_or_artifact: 'Dockerfile.worker',
      probe: 'GET /health /live /ready /metrics /stats',
      result: 'fixture',
      observed_at: 'fixture',
    };
    seed.applyBootProofs(rows, {
      proofs: [
        {
          deployment: 'local-process',
          boot_status: 'unproven',
          boot_evidence: bootEvidence,
        },
        {
          deployment: 'railway-worker-capital-call-status',
          runtime: 'service_listener',
          boot_status: 'proven',
          boot_evidence: bootEvidence,
        },
        {
          deployment: 'railway-worker-fund-scenario-calc',
          runtime: 'service_listener',
          boot_status: 'proven',
          boot_evidence: bootEvidence,
        },
      ],
    });
    for (const row of rows.values()) {
      expect(row.proven_reachability).toBe('railway');
      expect((row.exposures as ExposureFixture[]).map((exposure) => exposure.boot_status)).toEqual([
        'unproven',
        'proven',
        'proven',
      ]);
    }
  });

  it('keeps registerRoutes-only observations local and seeds production topology exclusions', async () => {
    const seed = await loadSeedInternals();
    const listener = seed.makeListenerDispositions([
      {
        path: 'Dockerfile.railway',
        patterns: [{ kind: 'docker-cmd', line: 12, text: 'CMD node dist/index.js' }],
      },
    ]);
    expect(listener).toEqual([
      expect.objectContaining({
        disposition: 'non-product-tooling',
        listener_id: 'legacy-dockerfile-railway',
      }),
    ]);
    expect(seed.makeRuntimeExclusions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'legacy-railway-api-topology',
          evidence: [
            'Dockerfile.railway',
            'DECISIONS.md#ADR-080',
            'railway.toml absent: retired by ADR-080',
          ],
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
        expect.objectContaining({
          id: 'ml-service-local-production-topology',
          matched_layer: 'ml-service-local',
          evidence: expect.arrayContaining([
            'ml-service/Dockerfile',
            '.vercelignore:ml-service/ is excluded from Vercel build input',
            '.dockerignore:ml-service/ is excluded from production Docker build input',
            'vercel.json',
          ]),
          decision_status: 'proposed',
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      ])
    );
    expect(fs.readFileSync(path.join(repoRoot, '.vercelignore'), 'utf8').split(/\r?\n/)).toContain(
      'ml-service/'
    );
    expect(fs.readFileSync(path.join(repoRoot, '.dockerignore'), 'utf8').split(/\r?\n/)).toContain(
      'ml-service'
    );
    const legacy = seed
      .makeRuntimeExclusions()
      .find((entry) => entry.id === 'legacy-railway-api-topology')!;
    expect(
      seed.mergeRuntimeExclusions(
        [
          { id: 'unrelated', fingerprint: '1'.repeat(64), decision_status: 'approved' },
          { ...legacy, decision_status: 'approved' },
        ],
        [legacy]
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'unrelated', decision_status: 'approved' }),
        expect.objectContaining({ id: 'legacy-railway-api-topology', decision_status: 'approved' }),
      ])
    );
    expect(
      seed.mergeRuntimeExclusions(
        [{ ...legacy, fingerprint: '2'.repeat(64), decision_status: 'approved' }],
        [legacy]
      )
    ).toEqual([
      expect.objectContaining({ id: 'legacy-railway-api-topology', decision_status: 'proposed' }),
    ]);
  });

  it('keeps registerRoutes-only activity, cache, and SSE routes out of Vercel reachability', async () => {
    const seed = await loadSeedInternals();
    const ids = [
      'api:GET:/api/activities',
      'api:POST:/api/cache/warm',
      'api:GET:/api/events/stream',
    ];
    const runtimeIndex = seed.createRuntimeIndex([
      {
        profile: 'default',
        fs_variant: 'static',
        routes: ids.map((id, index) =>
          routeObservation({
            surface: 'register_routes',
            id,
            method: id.split(':')[1]!,
            routePath: id.split(':').slice(2).join(':'),
            site: `server/routes/legacy-${index}.ts:1`,
            role: 'handler',
            order: index + 1,
          })
        ),
      },
    ]);
    const rows = seed.makeApiRows({
      nodes: new Map(
        ids.map((id, index) => [
          id,
          apiNode(
            id.split(':')[1]!,
            id.split(':').slice(2).join(':'),
            `server/routes/legacy-${index}.ts`
          ),
        ])
      ),
      edges: [],
      runtimeIndex,
      snapshotId: 'register-routes-only',
    });
    for (const id of ids) {
      const row = seedRow(rows.get(id) ?? {});
      expect(row.reachability).toBe('local');
      expect(row.exposures.map((entry) => `${entry.deployment}|${entry.runtime}`)).toEqual([
        'local-process|register_routes',
      ]);
    }
  });

  it('pairs fallback MOUNTS line evidence with the edge source path', async () => {
    const seed = await loadSeedInternals();
    const id = 'api:GET:/health';
    const rows = seed.makeApiRows({
      nodes: new Map([
        [id, { ...apiNode('GET', '/health', 'server/routes/health.ts'), line_start: 209 }],
      ]),
      edges: [
        {
          record: 'edge',
          type: 'MOUNTS',
          from: 'file:server/routes.ts',
          to: 'api:GET /health',
          source_path: 'server/routes/health.ts',
          line_start: 209,
          line_end: 209,
        },
      ],
      runtimeIndex: seed.createRuntimeIndex([]),
      snapshotId: 'mount-source-path',
    });

    const row = seedRow(rows.get(id) ?? {});
    const exposure = row.exposures.find((entry) => entry.runtime === 'register_routes');
    expect(exposure).toEqual(
      expect.objectContaining({
        mount_evidence: 'server/routes/health.ts:209',
        auth_evidence: expect.arrayContaining([
          expect.objectContaining({
            file: 'server/routes/health.ts',
            line: 209,
            evidence: 'server/routes/health.ts:209 observed route registration',
          }),
        ]),
      })
    );
    expect(JSON.stringify(exposure)).not.toContain('file:server/routes.ts:209');
  });

  it('derives team personas only from global authentication plus source-cited team/fund scope', async () => {
    const seed = (await loadSeedInternals()) as unknown as {
      authSuggestionFor: (input: Record<string, unknown>) => {
        auth_roles: string[];
        auth_evidence: Array<{
          role?: string;
          boundary?: string;
          file?: string;
          line?: number;
        }>;
        personas: string[];
      };
    };
    const globalAuthentication = {
      kind: 'policy-boundary',
      boundary: 'global_authenticated',
      file: 'server/server.ts',
      line: 215,
      evidence: 'server/server.ts:215 requireSecureContext precedes protected create_server routes',
    };
    const suggest = (
      method: string,
      routePath: string,
      site: string,
      authBoundary = 'require_auth'
    ) =>
      seed.authSuggestionFor({
        manifest: { authBoundary },
        definitions: [{ method, path: routePath, role: 'handler', site }],
        additionalAuthEvidence: [globalAuthentication],
        method,
        path: routePath,
      });

    const expectedRoutes = [
      ['GET', '/api/timeline/:fundId/state', 'server/routes/timeline.ts:154', 'fund_scope'],
      ['GET', '/api/shares', 'server/routes/shares.ts:460', 'team_fund_scope'],
      ['GET', '/api/shares/:shareId/analytics', 'server/routes/shares.ts:630', 'team_fund_scope'],
      ['POST', '/api/shares', 'server/routes/shares.ts:406', 'team_fund_scope'],
      ['PATCH', '/api/shares/:shareId', 'server/routes/shares.ts:491', 'team_fund_scope'],
      ['DELETE', '/api/shares/:shareId', 'server/routes/shares.ts:580', 'team_fund_scope'],
    ] as const;

    for (const [method, routePath, site, scopeBoundary] of expectedRoutes) {
      const suggestion = suggest(method, routePath, site);
      expect(suggestion.auth_roles, routePath).toEqual(['admin', 'analyst', 'partner']);
      expect(suggestion.personas, routePath).toEqual(['admin', 'analyst', 'gp']);
      expect(suggestion.auth_evidence, routePath).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            boundary: 'global_authenticated',
            file: 'server/server.ts',
            line: 215,
          }),
          expect.objectContaining({ boundary: scopeBoundary, file: site.split(':')[0] }),
          expect.objectContaining({
            role: 'admin',
            file: 'shared/auth/effective-roles.ts',
            line: 58,
          }),
          expect.objectContaining({
            role: 'partner',
            file: 'shared/auth/effective-roles.ts',
            line: 58,
          }),
          expect.objectContaining({
            role: 'analyst',
            file: 'shared/auth/effective-roles.ts',
            line: 58,
          }),
        ])
      );
      for (const evidence of suggestion.auth_evidence) {
        expect(() => matrixSchema.AuthEvidenceSchema.parse(evidence), routePath).not.toThrow();
      }
    }

    const publicShare = suggest(
      'GET',
      '/api/public/shares/:shareId',
      'server/routes/shares.ts:674',
      'public'
    );
    expect(publicShare.auth_roles).toEqual(['public']);
    expect(publicShare.personas).toEqual(['public']);

    const partnerWrite = suggest('POST', '/api/funds', 'server/routes/funds.ts:221');
    expect(partnerWrite.auth_roles).toEqual(['admin', 'partner']);
    expect(partnerWrite.personas).toEqual(['admin', 'gp']);

    const adminOnly = suggest(
      'GET',
      '/api/timeline/events/latest',
      'server/routes/timeline.ts:303'
    );
    expect(adminOnly.auth_roles).toEqual(['admin']);
    expect(adminOnly.personas).toEqual(['admin']);

    const fmvOverride = suggest(
      'POST',
      '/api/funds/:fundId/planning/fmv-overrides',
      'server/routes/planning-fmv-overrides.ts:91'
    );
    expect(fmvOverride.auth_roles).toEqual(['admin']);
    expect(fmvOverride.personas).toEqual(['admin']);
    expect(fmvOverride.auth_evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'server/routes/planning-fmv-overrides.ts',
          role: 'admin',
        }),
      ])
    );

    const fmvOverrideLatest = suggest(
      'GET',
      '/api/funds/:fundId/planning/fmv-overrides/latest',
      'server/routes/planning-fmv-overrides.ts:130'
    );
    expect(fmvOverrideLatest.auth_roles).toEqual([]);

    const unresolvedGuard = seed.authSuggestionFor({
      manifest: { authBoundary: 'and_role' },
      additionalAuthEvidence: [
        globalAuthentication,
        {
          kind: 'policy-boundary',
          boundary: 'team_fund_scope',
          file: 'server/routes/shares.ts',
          line: 412,
          evidence: 'server/routes/shares.ts:412 canManageFund denies unauthorized fund access',
        },
      ],
      method: 'POST',
      path: '/api/synthetic-unresolved',
    });
    expect(unresolvedGuard.auth_roles).toEqual(['unresolved']);
    expect(unresolvedGuard.personas).toEqual(['unknown']);
  });

  it('matchingDelimiter skips apostrophes inside line and block comments', () => {
    const schema = matrixSchema as Record<string, (...args: unknown[]) => unknown>;
    const matchingDelimiter = schema.matchingDelimiter as (
      source: string,
      openIndex: number,
      open?: string,
      close?: string
    ) => number;

    const lineComment = `(a, // it's fine\nb)`;
    expect(matchingDelimiter(lineComment, 0)).toBe(lineComment.length - 1);

    const blockComment = `(a, /* it's fine */ b)`;
    expect(matchingDelimiter(blockComment, 0)).toBe(blockComment.length - 1);

    const nested = `(a, /* it's */ // don't break\nb)`;
    expect(matchingDelimiter(nested, 0)).toBe(nested.length - 1);
  });

  it('routeRegistrationRanges returns narrow range when comments contain apostrophes', () => {
    const schema = matrixSchema as Record<string, (...args: unknown[]) => unknown>;
    const routeRegistrationRanges = schema.routeRegistrationRanges as (
      source: string,
      options: Record<string, unknown>
    ) => [number, number][];

    const source = fs.readFileSync(path.join(repoRoot, 'server/routes/timeline.ts'), 'utf8');
    const ranges = routeRegistrationRanges(source, { method: 'GET', registrationLines: [154] });
    expect(ranges).toHaveLength(1);
    const [_start, end] = ranges[0];
    const endLine = source.slice(0, end).split('\n').length;
    expect(endLine).toBeLessThanOrEqual(193);
  });

  it('unions make_app/create_server observations and derives protected/public auth boundaries', async () => {
    const seed = await loadSeedInternals();
    const nodes = new Map([
      [
        'api:GET:/api/diagnostics',
        apiNode('GET', '/api/diagnostics', 'server/routes/current-forecast.ts'),
      ],
      [
        'api:GET:/api/public/shares/:shareId',
        apiNode('GET', '/api/public/shares/:shareId', 'server/routes/shares.ts'),
      ],
      [
        'api:GET:/api/health/detailed',
        apiNode('GET', '/api/health/detailed', 'server/routes/health.ts'),
      ],
      ['api:GET:/api/metrics', apiNode('GET', '/api/metrics', 'server/routes/metrics.ts')],
      ['api:GET:/api-docs', apiNode('GET', '/api-docs', 'server/app.ts')],
    ]);
    const runtimeIndex = seed.createRuntimeIndex(makeRuntimeDocuments());
    const rows = seed.makeApiRows({
      nodes,
      edges: [],
      runtimeIndex,
      snapshotId: 'synthetic-seed-snapshot',
    });

    const diagnostic = seedRow(rows.get('api:GET:/api/diagnostics') ?? {});
    expect(
      diagnostic.exposures.map((exposure) => `${exposure.deployment}|${exposure.runtime}`)
    ).toEqual(['vercel-api|make_app', 'local-process|create_server']);
    expect(diagnostic.reachability).toBe('vercel');
    expect(diagnostic.exposures.flatMap((exposure) => exposure.conditions)).toContainEqual({
      gate: 'ENABLE_METRICS',
      enabled: true,
    });
    expect(
      diagnostic.exposures.every((exposure) =>
        exposure.auth_evidence.some((entry) => entry.boundary === 'global_authenticated')
      )
    ).toBe(true);
    expect(
      diagnostic.exposures.every((exposure) =>
        exposure.auth_evidence.some((entry) => entry.boundary === 'authenticated')
      )
    ).toBe(true);
    expect(
      diagnostic.exposures.some((exposure) =>
        exposure.auth_evidence.some((entry) => entry.boundary === 'public')
      )
    ).toBe(false);

    const publicShare = seedRow(rows.get('api:GET:/api/public/shares/:shareId') ?? {});
    expect(publicShare.auth_roles).toContain('public');
    expect(
      (publicShare.auth_evidence as Array<{ boundary?: string }>).some(
        (entry) => entry.boundary === 'public'
      )
    ).toBe(true);
    expect(publicShare.auth_evidence).toContainEqual(
      expect.objectContaining({
        kind: 'policy-boundary',
        file: 'server/lib/public-api-boundary.ts',
      })
    );

    const health = seedRow(rows.get('api:GET:/api/health/detailed') ?? {});
    const healthByRuntime = new Map(
      health.exposures.map((exposure) => [exposure.runtime, exposure])
    );
    expect(
      healthByRuntime
        .get('make_app')
        ?.auth_evidence.some((entry) => entry.boundary === 'global_authenticated')
    ).toBe(false);
    expect(healthByRuntime.get('create_server')?.deployment).toBe('local-process');

    const metrics = seedRow(rows.get('api:GET:/api/metrics') ?? {});
    expect(metrics.exposures[0]).toMatchObject({
      deployment: 'local-process',
      runtime: 'create_server',
    });
    expect(
      metrics.exposures[0].auth_evidence.some((entry) => entry.boundary === 'global_authenticated')
    ).toBe(false);

    const docs = seedRow(rows.get('api:GET:/api-docs') ?? {});
    expect(docs.reachability).toBe('local');
    expect(docs.exposures).toHaveLength(1);
    expect(docs.exposures[0].ingresses).toEqual([]);
    expect(docs.exposures[0].auth_evidence).toContainEqual(
      expect.objectContaining({ boundary: 'public' })
    );
    expect(docs.exposures[0].auth_evidence).not.toContainEqual(
      expect.objectContaining({ boundary: 'global_authenticated' })
    );

    seed.applyBootProofs(rows, {
      proofs: [
        {
          deployment: 'vercel-api',
          runtime: 'make_app',
          boot_status: 'proven',
          boot_evidence: {
            command_or_artifact: 'synthetic Vercel build',
            probe: 'construct makeApp',
            result: 'constructed',
            observed_at: 'proof:vercel',
          },
        },
        {
          deployment: 'local-process',
          boot_status: 'unproven',
          boot_evidence: {
            command_or_artifact: 'synthetic local runtime',
            probe: 'local runtime observation',
            result: 'unproven',
            observed_at: 'proof:local',
          },
        },
      ],
    });
    expect(rows.get('api:GET:/api-docs')?.proven_reachability).toBe('none');
    expect(rows.get('api:GET:/api/diagnostics')?.exposures).toContainEqual(
      expect.objectContaining({
        deployment: 'local-process',
        runtime: 'create_server',
        boot_status: 'unproven',
        boot_evidence: expect.objectContaining({ observed_at: 'proof:local' }),
      })
    );
  });

  it.each([
    {
      name: 'API docs landing page uses its first handler registration',
      method: 'GET',
      routePath: '/api-docs',
      sourcePath: 'server/app.ts',
      surface: 'make_app',
      observations: [{ site: 'server/app.ts:137', role: 'handler', order: 1 }],
      expectedSite: 'server/app.ts:137',
    },
    {
      name: 'API docs JSON uses its first handler registration',
      method: 'GET',
      routePath: '/api-docs.json',
      sourcePath: 'server/app.ts',
      surface: 'make_app',
      observations: [{ site: 'server/app.ts:160', role: 'handler', order: 1 }],
      expectedSite: 'server/app.ts:160',
    },
    {
      name: 'POST RUM uses the parsed outer mount registration first',
      method: 'POST',
      routePath: '/metrics/rum',
      sourcePath: 'server/routes/metrics-rum.ts',
      surface: 'create_server',
      observations: [
        {
          site: 'server/routes/metrics-rum.ts:115',
          role: 'handler',
          order: 2,
          outerMountSite: 'server/server.ts:208',
          outerMountOrder: 3,
        },
      ],
      expectedSite: 'server/server.ts:208',
    },
    {
      name: 'POST RUM falls back to its first handler when no outer mount exists',
      method: 'POST',
      routePath: '/metrics/rum',
      sourcePath: 'server/routes/metrics-rum.ts',
      surface: 'make_app',
      observations: [
        { site: 'server/routes/metrics-rum.ts:108', role: 'guard', order: 1 },
        { site: 'server/routes/metrics-rum.ts:115', role: 'handler', order: 2 },
      ],
      expectedSite: 'server/routes/metrics-rum.ts:115',
    },
    {
      name: 'POST RUM falls back to mount evidence without definitions',
      method: 'POST',
      routePath: '/metrics/rum',
      sourcePath: 'server/routes/metrics-rum.ts',
      surface: 'make_app',
      observations: [{ site: 'server/routes/metrics-rum.ts:106', role: 'guard', order: 1 }],
      expectedSite: 'server/routes/metrics-rum.ts:106',
    },
  ])('$name', async ({ method, routePath, sourcePath, surface, observations, expectedSite }) => {
    const seed = await loadSeedInternals();
    const id = `api:${method}:${routePath}`;
    const routes = observations.map((observation) =>
      routeObservation({
        surface,
        id,
        method,
        routePath,
        site: observation.site,
        role: observation.role,
        order: observation.order,
        ...(observation.outerMountSite
          ? {
              outerMountSite: observation.outerMountSite,
              outerMountOrder: observation.outerMountOrder,
            }
          : {}),
      })
    );
    const runtimeIndex = seed.createRuntimeIndex([
      { profile: 'default', fs_variant: 'static', routes },
    ]);
    const rows = seed.makeApiRows({
      nodes: new Map([[id, apiNode(method, routePath, sourcePath)]]),
      edges: [],
      runtimeIndex,
      snapshotId: 'synthetic-registration-provenance',
    });
    const row = seedRow(rows.get(id) ?? {});
    const exposure = row.exposures[0];
    expect(exposure).toBeDefined();
    const registrationEvidence = exposure.auth_evidence.find(
      (entry) => entry.boundary === 'public'
    );
    expect(registrationEvidence).toMatchObject({ kind: 'handler' });
    expect(() => matrixSchema.AuthEvidenceSchema.parse(registrationEvidence)).not.toThrow();
    expect(registrationEvidence?.evidence).toContain(expectedSite);
    expect(registrationEvidence?.file).toBe(expectedSite.split(':')[0]);
    expect(registrationEvidence?.line).toBe(Number(expectedSite.split(':')[1]));
    expect(exposure.auth_evidence).not.toContainEqual(
      expect.objectContaining({
        kind: 'policy-boundary',
        file: 'server/lib/public-api-boundary.ts',
      })
    );
  });

  it('maps auth-truth source dependencies to protected, public, and websocket rows', async () => {
    const seed = await loadSeedInternals();
    const protectedRow = {
      id: 'api:GET:/api/protected',
      interface: 'http-api',
      auth_roles: ['admin'],
      auth_evidence: [{ boundary: 'global_authenticated', file: 'server/server.ts' }],
      exposures: [
        { auth_evidence: [{ boundary: 'global_authenticated', file: 'server/server.ts' }] },
      ],
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
    expect(mapping.rowToSources[protectedRow.id]).toEqual(
      expect.arrayContaining([
        'server/lib/auth/jwt.ts',
        'server/lib/auth/revocation.ts',
        'server/lib/public-api-boundary.ts',
      ])
    );
    expect(mapping.rowToSources[publicRow.id]).toContain('server/lib/public-api-boundary.ts');
    expect(
      mapping.rowToSources[websocketRow.id].filter((source) =>
        source.startsWith('server/websocket/')
      ).length
    ).toBeGreaterThan(0);
    const authHashes = seed.definingSourceHashesForRow(
      protectedRow,
      {
        'server/lib/auth/jwt.ts': 'a'.repeat(64),
        'server/lib/auth/revocation.ts': 'b'.repeat(64),
        'server/lib/public-api-boundary.ts': 'c'.repeat(64),
      },
      mapping.rowToSources
    );
    expect(authHashes).toEqual(
      expect.arrayContaining([
        `server/lib/auth/jwt.ts=${'a'.repeat(64)}`,
        `server/lib/auth/revocation.ts=${'b'.repeat(64)}`,
        `server/lib/public-api-boundary.ts=${'c'.repeat(64)}`,
      ])
    );
  });

  it('marks LP lifecycle, compatibility redirects, canonical/legacy MOIC, WebSocket split, and producer-only queues', async () => {
    const seed = await loadSeedInternals();
    const clientPaths = [
      '/lp',
      '/lp/dashboard',
      '/lp/reports',
      '/lp/metrics',
      '/lp/ledger',
      '/lp/settings',
      '/lp/performance',
      '/archived-route',
      '/moic-analysis',
      '/fund-model-results/:fundId/moic-analysis',
    ];
    const clientRows = seed.makeClientRows({
      nodes: new Map(
        clientPaths.map((routePath) => [
          routePath,
          {
            id: `client:${routePath}`,
            type: 'ClientRoute',
            path: routePath,
            component: 'SyntheticPage',
            line_start: 1,
          },
        ])
      ),
      snapshotId: 'synthetic-seed-snapshot',
    });

    for (const routePath of clientPaths.slice(0, 7)) {
      const row = clientRows.get(`client:${routePath}`);
      const clientRow = seedRow(row ?? {});
      expect(clientRow.exposures.every((exposure) => Array.isArray(exposure.conditions))).toBe(
        true
      );
      expect(clientRow.exposures.flatMap((exposure) => exposure.conditions)).toEqual([
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
    expect(background.get('ws:portfolio-metrics')?.exposures[0].ingresses[0].external_path).toBe(
      '/ws/portfolio-metrics'
    );
    expect(background.get('ws:portfolio-metrics')?.exposures[0].conditions).toEqual([]);
    expect(background.get('ws:dev-dashboard')?.exposures[0].ingresses[0].external_path).toBe(
      '/socket.io/dev-dashboard'
    );
    expect(background.get('ws:dev-dashboard')?.exposures[0].conditions).toEqual([
      { NODE_ENV: 'development' },
    ]);

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
    expect(
      producerOnly.queue_roles.producers.some((entry) =>
        entry.site.includes('server/queues/registry.ts')
      )
    ).toBe(false);
  });
});

const classifyRow = ({
  id,
  source,
  persistence = 'unknown',
  destructive = 'unknown',
  handlerSite,
}: {
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
    exposures: [
      {
        deployment: 'railway-api',
        runtime: 'create_server',
        mount_evidence: `${source}:1`,
        ingresses: [
          {
            external_path: id.replace(/^api:[A-Z]+:/, ''),
            express_path: id.replace(/^api:[A-Z]+:/, ''),
            rewrite_evidence: 'fixture',
          },
        ],
        conditions: [],
        definitions: [
          { site: handlerSite ?? `${source}:1`, role: 'handler', effective_mount_order: 1 },
        ],
        boot_status: 'failed',
        boot_evidence: {
          command_or_artifact: 'fixture',
          probe: 'fixture',
          result: 'failed',
          observed_at: 'fixture',
        },
      },
    ],
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

const classifyDocumentFixture = (rows: Record<string, unknown>[]) =>
  matrixSchema.SurfaceMatrixDocumentSchema.parse({
    schema_version: '1.1.0',
    phase: 'authoring',
    provenance: { git_head: 'synthetic', snapshot_id: 'synthetic' },
    rows,
    coverage_review: {},
  });

describe('surface contract matrix seed merge ordering', () => {
  it('demotes stale approvals before clearing hashes while preserving unchanged approvals', async () => {
    const seed = await loadSeedInternals();
    const changedId = 'api:POST:/api/stale-source-hash';
    const unchangedId = 'api:POST:/api/unchanged-source-hash';
    const changedSource = 'server/routes/current-forecast.ts';
    const unchangedSource = 'server/routes/shares.ts';
    const previousChanged = classifyRow({ id: changedId, source: changedSource });
    previousChanged.decision_status = 'approved';
    previousChanged.approved_source_hashes = ['server/routes/current-forecast.ts=hash-old'];
    const previousUnchanged = classifyRow({ id: unchangedId, source: unchangedSource });
    previousUnchanged.decision_status = 'approved';
    previousUnchanged.approved_source_hashes = ['server/routes/shares.ts=hash-stable'];

    const seededChanged = classifyRow({ id: changedId, source: changedSource });
    seededChanged.approved_source_hashes = ['server/routes/current-forecast.ts=hash-new'];
    const seededUnchanged = classifyRow({ id: unchangedId, source: unchangedSource });
    seededUnchanged.approved_source_hashes = ['server/routes/shares.ts=hash-stable'];

    const merged = seed.mergeSeededMatrix(
      classifyDocumentFixture([previousChanged, previousUnchanged]),
      classifyDocumentFixture([seededChanged, seededUnchanged])
    );
    const rows = new Map(merged.rows.map((row) => [String(row.id), row]));

    expect(rows.get(changedId)).toMatchObject({
      decision_status: 'proposed',
      approved_source_hashes: [],
    });
    expect(rows.get(unchangedId)).toMatchObject({
      decision_status: 'approved',
      approved_source_hashes: ['server/routes/shares.ts=hash-stable'],
    });
  });
});

describe('surface contract matrix classification effect regressions', () => {
  it('uses handler effects for persistence and hard-delete evidence for destructive state', () => {
    const rows = [
      classifyRow({ id: 'api:POST:/api/write', source: 'server/routes/current-forecast.ts' }),
      classifyRow({ id: 'api:POST:/api/unknown', source: 'server/routes/shares.ts' }),
      classifyRow({
        id: 'api:POST:/api/calculate',
        source: 'tests/unit/audit/fixtures/pure-calculation.ts',
      }),
      classifyRow({
        id: 'api:POST:/api/calculate-without-graph',
        source: 'tests/unit/audit/fixtures/pure-calculation.ts',
      }),
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
      classifyRow({
        id: 'api:POST:/api/file-fallback',
        source: 'tests/unit/audit/fixtures/symbol-effects.ts',
      }),
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
      classifyRow({
        id: 'api:DELETE:/api/unrelated-sibling-delete',
        source: 'tests/unit/audit/fixtures/unrelated-delete-handler.ts',
      }),
    ];
    const classified = classifyDocumentFixture(rows);
    const output = classifyDocument(classified, {
      effectEdges: [
        {
          type: 'DEFINES',
          from: 'server/routes/current-forecast.ts',
          to: 'api:POST:/api/write',
          line_start: 1,
          line_end: 1,
        },
        {
          type: 'DEFINES',
          from: 'server/routes/shares.ts',
          to: 'api:POST:/api/unknown',
          line_start: 1,
          line_end: 1,
        },
        {
          type: 'DEFINES',
          from: 'tests/unit/audit/fixtures/pure-calculation.ts',
          to: 'api:POST:/api/calculate',
          line_start: 1,
          line_end: 1,
        },
        {
          type: 'DEFINES',
          from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#readCalculate',
          to: 'api:POST:/api/symbol-read',
          line_start: 1,
          line_end: 3,
        },
        {
          type: 'DEFINES',
          from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#readFileTarget',
          to: 'api:POST:/api/symbol-file-target',
          line_start: 9,
          line_end: 11,
        },
        {
          type: 'DEFINES',
          from: 'tests/unit/audit/fixtures/symbol-effects.ts',
          to: 'api:POST:/api/file-fallback',
          line_start: 1,
          line_end: 3,
        },
        {
          type: 'DEFINES',
          from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#getFund',
          to: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#getFund',
          line_start: 5,
          line_end: 7,
        },
        {
          type: 'CALLS',
          from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#readCalculate',
          to: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#getFund',
          line_start: 2,
        },
        {
          type: 'CALLS',
          from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#readFileTarget',
          to: 'tests/unit/audit/fixtures/symbol-effects.ts',
          line_start: 10,
        },
        {
          type: 'PERSISTS_TO',
          from: 'sym:tests/unit/audit/fixtures/symbol-effects.ts#createFund',
          to: 'dbtable:synthetic',
          line_start: 10,
        },
        {
          type: 'DEFINES',
          from: 'sym:tests/unit/audit/fixtures/cross-file-handler.ts#readCrossFileTarget',
          to: 'api:POST:/api/cross-file-target',
          line_start: 1,
          line_end: 3,
        },
        {
          type: 'CALLS',
          from: 'sym:tests/unit/audit/fixtures/cross-file-handler.ts#readCrossFileTarget',
          to: 'tests/unit/audit/fixtures/file-target-effects.ts',
          line_start: 2,
        },
        {
          type: 'DEFINES',
          from: 'tests/unit/audit/fixtures/cross-file-handler.ts',
          to: 'api:POST:/api/bounded-file-target',
          line_start: 1,
          line_end: 3,
        },
        {
          type: 'CALLS',
          from: 'tests/unit/audit/fixtures/cross-file-handler.ts',
          to: 'tests/unit/audit/fixtures/file-target-effects.ts',
          line_start: 2,
        },
        {
          type: 'PERSISTS_TO',
          from: 'tests/unit/audit/fixtures/file-target-effects.ts',
          to: 'dbtable:unrelated',
          line_start: 6,
        },
        {
          type: 'DEFINES',
          from: 'sym:tests/unit/audit/fixtures/file-root-effects.ts#readSibling',
          to: 'api:POST:/api/file-root-sibling',
          line_start: 1,
          line_end: 3,
        },
        {
          type: 'PERSISTS_TO',
          from: 'tests/unit/audit/fixtures/file-root-effects.ts',
          to: 'dbtable:sibling',
          line_start: 6,
        },
        {
          type: 'DEFINES',
          from: 'sym:tests/unit/audit/fixtures/revocation-handler.ts#calculateWithRevocation',
          to: 'api:POST:/api/revoke',
          line_start: 1,
          line_end: 3,
        },
        {
          type: 'CALLS',
          from: 'sym:tests/unit/audit/fixtures/revocation-handler.ts#calculateWithRevocation',
          to: 'sym:server/lib/auth/revocation.ts#revokeAccessToken',
          line_start: 2,
        },
        {
          type: 'DEFINES',
          from: 'server/routes/shares.ts',
          to: 'api:DELETE:/api/delete',
          line_start: 1,
          line_end: 1,
        },
        {
          type: 'PERSISTS_TO',
          from: 'server/routes/current-forecast.ts',
          to: 'dbtable:synthetic',
          line_start: 1,
        },
        {
          type: 'REFERENCES',
          from: 'server/routes/shares.ts',
          to: 'dbtable:synthetic',
          line_start: 1,
        },
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
    expect(byId.get('api:POST:/api/cross-file-target')?.machine_suggestions).toEqual(
      expect.objectContaining({
        persistence_evidence: expect.objectContaining({
          writes: [],
          pure_calculation: [],
          ambiguous_calls: expect.arrayContaining([
            expect.objectContaining({ effect: 'ambiguous-call-target' }),
          ]),
        }),
      })
    );
    expect(byId.get('api:POST:/api/bounded-file-target')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/bounded-file-target')?.machine_suggestions).toEqual(
      expect.objectContaining({
        persistence_evidence: expect.objectContaining({
          writes: [],
          pure_calculation: [],
          ambiguous_calls: expect.arrayContaining([
            expect.objectContaining({ effect: 'ambiguous-call-target' }),
          ]),
        }),
      })
    );
    expect(byId.get('api:POST:/api/file-root-sibling')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/file-root-sibling')?.machine_suggestions).toEqual(
      expect.objectContaining({
        persistence_evidence: expect.objectContaining({ writes: [], pure_calculation: [] }),
      })
    );
    expect(byId.get('api:POST:/api/revoke')?.persistence).toBe('unknown');
    expect(byId.get('api:POST:/api/revoke')?.machine_suggestions).toEqual(
      expect.objectContaining({
        persistence_evidence: expect.objectContaining({
          side_effecting_calls: expect.arrayContaining([
            expect.objectContaining({
              target: 'sym:server/lib/auth/revocation.ts#revokeAccessToken',
            }),
          ]),
        }),
      })
    );
    expect(byId.get('api:DELETE:/api/delete')?.persistence).toBe('unknown');
    expect(byId.get('api:DELETE:/api/delete')?.destructive).toBe('unknown');
    expect(byId.get('api:DELETE:/api/unrelated-sibling-delete')?.persistence).toBe('unknown');
    expect(byId.get('api:DELETE:/api/unrelated-sibling-delete')?.destructive).toBe('unknown');
  });
});
