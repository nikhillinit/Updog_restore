import type { RuntimeSurface } from './api-route-manifest';

export type RuntimeSpecificClassification =
  'runtime_specific' | 'development_only' | 'feature_flagged';

export interface ApiRuntimeSpecificManifestEntry {
  id: string;
  sourceModule: string;
  surface: RuntimeSurface;
  classification: RuntimeSpecificClassification;
  mountPaths: readonly (string | null)[];
  reason: string;
}

export const API_RUNTIME_SPECIFIC_MANIFEST = [
  {
    id: 'make-app-health',
    sourceModule: './routes/health.js',
    surface: 'make_app',
    classification: 'runtime_specific',
    mountPaths: [null],
    reason:
      'makeApp installs health before the global API auth boundary so public liveness checks remain reachable.',
  },
  {
    id: 'make-app-reserves-v1',
    sourceModule: './routes/v1/reserves.js',
    surface: 'make_app',
    classification: 'runtime_specific',
    mountPaths: ['/api/v1/reserves'],
    reason:
      'The versioned reserve API is currently exposed only by the serverless production entrypoint.',
  },
  {
    id: 'make-app-cashflow',
    sourceModule: './routes/cashflow.js',
    surface: 'make_app',
    classification: 'runtime_specific',
    mountPaths: ['/api/cashflow'],
    reason: 'The cashflow management API is currently exposed only by makeApp.',
  },
  {
    id: 'make-app-calculations',
    sourceModule: './routes/calculations.js',
    surface: 'make_app',
    classification: 'runtime_specific',
    mountPaths: ['/api/calculations'],
    reason: 'The deterministic calculation and CSV API is currently exposed only by makeApp.',
  },
  {
    id: 'make-app-ai',
    sourceModule: './routes/ai.js',
    surface: 'make_app',
    classification: 'runtime_specific',
    mountPaths: ['/api/ai'],
    reason: 'The AI orchestration API is currently exposed only by makeApp.',
  },
  {
    id: 'make-app-scenario-analysis',
    sourceModule: './routes/scenario-analysis.js',
    surface: 'make_app',
    classification: 'runtime_specific',
    mountPaths: ['/api'],
    reason: 'The scenario analysis router is currently exposed only by makeApp.',
  },
  {
    id: 'make-app-rum-ingress',
    sourceModule: './routes/metrics-rum-ingress.js',
    surface: 'make_app',
    classification: 'runtime_specific',
    mountPaths: ['/metrics/rum', '/api/metrics/rum'],
    reason:
      'Serverless RUM ingress guards must run before the global API auth middleware on both aliases.',
  },
  {
    id: 'make-app-rum',
    sourceModule: './routes/metrics-rum.js',
    surface: 'make_app',
    classification: 'runtime_specific',
    mountPaths: [null, '/api'],
    reason: 'makeApp owns the public RUM ingestion and scrape aliases used by browser telemetry.',
  },
  {
    id: 'make-app-metrics',
    sourceModule: './routes/metrics-endpoint.js',
    surface: 'make_app',
    classification: 'runtime_specific',
    mountPaths: [null, '/api'],
    reason:
      'makeApp mounts authenticated metrics unconditionally with a serverless /api compatibility alias.',
  },
  {
    id: 'register-routes-health',
    sourceModule: './routes/health.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: ['/'],
    reason:
      'registerRoutes owns its health placement independently from the makeApp pre-auth boundary.',
  },
  {
    id: 'register-routes-activities',
    sourceModule: './routes/activities.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: ['/api'],
    reason: 'The activities router is currently mounted only by registerRoutes.',
  },
  {
    id: 'register-routes-fund-metrics-legacy',
    sourceModule: './routes/fund-metrics-legacy.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: ['/api'],
    reason: 'The legacy fund metrics compatibility router remains on the Docker bootstrap only.',
  },
  {
    id: 'register-routes-engine-summaries',
    sourceModule: './routes/engine-summaries.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: ['/api'],
    reason: 'Engine summary compatibility endpoints are currently Docker-bootstrap specific.',
  },
  {
    id: 'register-routes-operations',
    sourceModule: './routes/operations.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: ['/'],
    reason: 'Operations polling is coupled to the long-running Docker process.',
  },
  {
    id: 'register-routes-monte-carlo',
    sourceModule: './routes/monte-carlo.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: ['/api/monte-carlo'],
    reason: 'The long-running Monte Carlo router is currently Docker-bootstrap specific.',
  },
  {
    id: 'register-routes-cache',
    sourceModule: './routes/cache.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: ['/api/cache'],
    reason: 'Cache administration is coupled to the long-running Redis-backed runtime.',
  },
  {
    id: 'register-routes-performance-metrics',
    sourceModule: './routes/performance-metrics.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: ['/api/performance'],
    reason: 'The performance-monitor adapter is installed only by the Docker bootstrap.',
  },
  {
    id: 'register-routes-sse-events',
    sourceModule: './routes/sse-events.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: ['/'],
    reason: 'Server-sent events require the long-running Docker process.',
  },
  {
    id: 'register-routes-lp-health',
    sourceModule: './routes/lp-health.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: [null],
    reason: 'The LP subsystem health adapter is currently mounted only by registerRoutes.',
  },
  {
    id: 'register-routes-admin-engine',
    sourceModule: './routes/admin/engine.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: ['/api/admin/engine'],
    reason:
      'Engine administration mounts unconditionally only on registerRoutes and self-enforces admin policy.',
  },
  {
    id: 'register-routes-portfolio-intelligence',
    sourceModule: './routes/portfolio-intelligence.js',
    surface: 'register_routes',
    classification: 'feature_flagged',
    mountPaths: [null],
    reason: 'Portfolio intelligence is intentionally controlled by FEATURES.portfolioIntelligence.',
  },
  {
    id: 'register-routes-metrics',
    sourceModule: './routes/metrics-endpoint.js',
    surface: 'register_routes',
    classification: 'feature_flagged',
    mountPaths: [null],
    reason: 'registerRoutes exposes only the root metrics path and gates it with FEATURES.metrics.',
  },
  {
    id: 'register-routes-error-budget',
    sourceModule: './routes/error-budget.js',
    surface: 'register_routes',
    classification: 'feature_flagged',
    mountPaths: ['/api/error-budget'],
    reason: 'Error-budget reporting is intentionally controlled by FEATURES.metrics.',
  },
  {
    id: 'register-routes-dev-dashboard',
    sourceModule: './routes/dev-dashboard.js',
    surface: 'register_routes',
    classification: 'development_only',
    mountPaths: ['/api/dev-dashboard'],
    reason: 'The development dashboard mounts only when NODE_ENV is development.',
  },
  {
    id: 'register-routes-websocket-setup',
    sourceModule: './websocket/index.js',
    surface: 'register_routes',
    classification: 'runtime_specific',
    mountPaths: [],
    reason: 'WebSocket servers attach to the HTTP server created by registerRoutes.',
  },
] as const satisfies readonly ApiRuntimeSpecificManifestEntry[];

function assertUniqueRuntimeSpecificIds(entries: readonly ApiRuntimeSpecificManifestEntry[]): void {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`Duplicate runtime-specific API route ID detected: ${entry.id}`);
    }
    seen.add(entry.id);
  }
}

assertUniqueRuntimeSpecificIds(API_RUNTIME_SPECIFIC_MANIFEST);

export type ApiRuntimeSpecificId = (typeof API_RUNTIME_SPECIFIC_MANIFEST)[number]['id'];
