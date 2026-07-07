/**
 * Route mount-parity guard (#1036; kills the #1032 class of silent prod 404s).
 *
 * Pure source-scan unit test (NO server boot). Fails when a router mounted by the
 * Docker/registerRoutes surface (server/routes.ts) is absent from the makeApp/Vercel
 * production surface (server/app.ts) without a documented exemption -- the exact
 * failure of #1032, where a router lived only in routes.ts and 404'd in prod.
 *
 * BOUNDARY (R2): this guard proves source-PRESENCE only, NOT mount-path correctness.
 * A router imported into app.ts but mounted at the wrong path (or used non-mount) still
 * satisfies this guard yet can 404. Path-correctness is owned by the per-route makeApp
 * contract tests (400-on-bad-fundId, per #1035) added in the later burn-down PRs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// -- Pure core (exported for synthetic testing) -------------------------------
// routes.ts mounts route modules via BOTH dynamic import('./routes/X') and static
// `from './routes/X'` idioms (e.g. registerFundConfigRoutes). Union both (R1) so a
// future function-style Docker-only router cannot slip past the guard.
const DYNAMIC_IMPORT = /import\(\s*['"](\.\/routes\/[^'"]+)['"]\s*\)/g;
const STATIC_IMPORT = /import\s+[^;]*?\s+from\s+['"](\.\/routes\/[^'"]+)['"]/g;

// Strip comments before scanning so a commented-out import does NOT read as a live mount.
// Otherwise removing a router from app.ts but leaving its old import in a comment would
// false-GREEN the #1032 guard -- the exact regression this test exists to catch. Block
// comments first, then line comments.
//
// BOUNDARY: string literals are NOT stripped. The module specifiers we extract live INSIDE
// string literals (import('./routes/x.js')), so stripping strings would delete the very
// target we scan for. A complete `import('./routes/x')` embedded in an unrelated string
// literal would still be miscounted; closing that edge needs an AST, disproportionate for a
// source-scan guard. The realistic accidental vector is a comment, and that is closed here.
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

export function extractRouteModulePaths(source: string): Set<string> {
  const src = stripComments(source);
  const found = new Set<string>();
  for (const re of [DYNAMIC_IMPORT, STATIC_IMPORT]) {
    for (const m of src.matchAll(re)) found.add(m[1]!);
  }
  return found;
}

export function findUnexemptedDockerOnly(
  routesSrc: string,
  appSrc: string,
  exemptions: readonly string[]
): string[] {
  const docker = extractRouteModulePaths(routesSrc);
  const makeApp = extractRouteModulePaths(appSrc);
  const exempt = new Set(exemptions);
  return [...docker].filter((m) => !makeApp.has(m) && !exempt.has(m)).sort();
}

export function findStaleExemptions(
  routesSrc: string,
  appSrc: string,
  exemptions: readonly string[]
): string[] {
  const docker = extractRouteModulePaths(routesSrc);
  const makeApp = extractRouteModulePaths(appSrc);
  // Stale = an exemption for a module that is no longer Docker-only: it either left
  // routes.ts entirely, or it is now mounted on makeApp (mount forces the delete).
  return exemptions.filter((m) => !docker.has(m) || makeApp.has(m)).sort();
}

// -- Synthetic self-tests (R3): the guard's own logic is continuously verified --
describe('route-mount-parity: pure diff logic (synthetic)', () => {
  const routesFixture = `
    await mountDefaultRoute(app, { load: () => import('./routes/alpha.js') });
    import { registerBetaRoutes } from './routes/beta.js';   // static/function-style
    await mountDefaultRoute(app, { load: () => import('./routes/shared.js') });
  `;
  const appFixture = `
    import sharedRouter from './routes/shared.js';
    app.use('/api', sharedRouter);
  `;

  it('extracts BOTH dynamic import() and static from idioms (R1)', () => {
    const docker = extractRouteModulePaths(routesFixture);
    expect(docker.has('./routes/alpha.js')).toBe(true);
    expect(docker.has('./routes/beta.js')).toBe(true); // would escape a dynamic-only regex
    expect(docker.has('./routes/shared.js')).toBe(true);
  });

  it('flags a Docker-only module with no mount and no exemption', () => {
    expect(findUnexemptedDockerOnly(routesFixture, appFixture, [])).toEqual([
      './routes/alpha.js',
      './routes/beta.js',
    ]);
  });

  it('respects exemptions', () => {
    expect(
      findUnexemptedDockerOnly(routesFixture, appFixture, ['./routes/alpha.js', './routes/beta.js'])
    ).toEqual([]);
  });

  it('flags a stale exemption once a module is mounted on makeApp', () => {
    // shared is in both surfaces -> exempting it is stale.
    expect(findStaleExemptions(routesFixture, appFixture, ['./routes/shared.js'])).toEqual([
      './routes/shared.js',
    ]);
  });

  it('does NOT count a commented-out import as route presence (finding 1)', () => {
    const appWithCommentedImports = `
      import sharedRouter from './routes/shared.js';
      // import alphaRouter from './routes/alpha.js';   // unmounted, left in a line comment
      /* app.use(await import('./routes/beta.js')); */
      app.use('/api', sharedRouter);
    `;
    const makeApp = extractRouteModulePaths(appWithCommentedImports);
    expect(makeApp.has('./routes/shared.js')).toBe(true);
    expect(makeApp.has('./routes/alpha.js')).toBe(false); // line comment stripped
    expect(makeApp.has('./routes/beta.js')).toBe(false); // block comment stripped
  });

  it('still flags a Docker-only module whose only makeApp import is commented out (#1032)', () => {
    // The false-green: alpha was unmounted from makeApp but its import survives as a
    // comment. The guard must STILL report alpha as an unexempted Docker-only gap.
    const appOnlyComment = `// import('./routes/alpha.js');`;
    expect(findUnexemptedDockerOnly(routesFixture, appOnlyComment, [])).toContain(
      './routes/alpha.js'
    );
  });
});

// -- Exemption ledger = the machine-visible burn-down worklist (R4) ------------
const SERVER_DIR = path.resolve(process.cwd(), 'server');
const read = (f: string) => fs.readFileSync(path.join(SERVER_DIR, f), 'utf8');

type ExemptionKind =
  | 'permanent-infra'
  | 'permanent-dev-only'
  | 'permanent-serverless-incompatible'
  | 'permanent-superseded'
  | 'gap-pending';

// gap-pending = confirmed/suspected prod gap awaiting its mount PR; permanent-* =
// intentional divergence. Burn-down drives gap-pending to zero (see #1036 checklist).
const DOCKER_ONLY_EXEMPTIONS: Record<string, { kind: ExemptionKind; reason: string }> = {
  './routes/dev-dashboard.js': {
    kind: 'permanent-dev-only',
    reason: 'NODE_ENV=development gate (routes.ts)',
  },
  './routes/admin/engine.js': {
    kind: 'permanent-dev-only',
    reason: 'engine admin, non-prod only (routes.ts)',
  },
  './routes/cache.js': { kind: 'permanent-infra', reason: 'cache monitoring/mgmt, internal ops' },
  './routes/sse-events.js': {
    kind: 'permanent-serverless-incompatible',
    reason: 'long-lived SSE unsupported on Vercel serverless',
  },
  './routes/operations.js': { kind: 'permanent-infra', reason: 'ops polling, internal' },
  './routes/error-budget.js': {
    kind: 'permanent-infra',
    reason: 'observability, feature-flagged (FEATURES.metrics)',
  },
  './routes/portfolio-intelligence.js': {
    kind: 'permanent-infra',
    reason: 'feature-flagged (FEATURES.portfolioIntelligence)',
  },
  './routes/fund-metrics-legacy.js': {
    kind: 'permanent-superseded',
    reason: 'superseded by fund-metrics (on makeApp)',
  },
  './routes/engine-summaries.js': {
    kind: 'permanent-superseded',
    reason: 'extracted into dedicated modules (routes.ts)',
  },
  './routes/monte-carlo.js': {
    kind: 'gap-pending',
    reason: 'no client caller found; MC may run via BullMQ -- verify then reclassify',
  },
  './routes/performance-metrics.js': {
    kind: 'gap-pending',
    reason: 'no client caller found; verify internal-only then reclassify',
  },
  './routes/portfolio-overview.js': {
    kind: 'gap-pending',
    reason: 'overview adoption (bad6655a); confirm superseded vs live',
  },
  './routes/activities.js': {
    kind: 'gap-pending',
    reason: 'POST /activities; confirm no live client writer',
  },
  './routes/moic.js': {
    kind: 'gap-pending',
    reason: 'client use-moic.ts hits /api/moic; /moic-analysis page may be retired',
  },
  './routes/timeline.js': {
    kind: 'gap-pending',
    reason: 'client useTimelineData hits /api/timeline heavily -- likely real 404',
  },
  './routes/shares.js': {
    kind: 'gap-pending',
    reason: 'client dashboard-modern.tsx hits /api/shares',
  },
  './routes/capital-allocation.js': {
    kind: 'gap-pending',
    reason: 'client use-capital-allocation + CapitalAllocationStep',
  },
  './routes/liquidity.js': {
    kind: 'gap-pending',
    reason: 'client use-liquidity + CashflowDashboard',
  },
  './routes/graduation.js': { kind: 'gap-pending', reason: 'client use-graduation.ts' },
  './routes/portfolio-companies.js': {
    kind: 'gap-pending',
    reason: 'client likely use-fund-data; confirm caller path',
  },
  './routes/lp-health.js': { kind: 'gap-pending', reason: 'GET /api/lp/health; verify caller' },
};

// gap-pending pin (R4): exact count of gap-pending exemptions, pinned to the committed
// ledger. Any ledger change -- a burn-down mount (count down) or a newly-discovered gap
// (count up) -- forces a deliberate edit to this constant in the SAME PR, visible in the
// diff and reviewable. Burn-down edits it strictly downward.
//
// LIMIT: a self-contained unit test cannot see git history, so it cannot mathematically
// forbid raising this number. The exact pin is the strongest available substitute: it
// removes the 12->11->12 slack a `<=` ceiling allowed (a silent re-add after a burn-down
// passes a ceiling but fails this pin until the constant is edited back up, in view).
const GAP_PENDING_COUNT = 12;

// -- Real-source parity assertions (the actual guard) -------------------------
describe('route-mount-parity: routes.ts <-> makeApp (real sources)', () => {
  const routesSrc = read('routes.ts');
  const appSrc = read('app.ts');
  const exemptions = Object.keys(DOCKER_ONLY_EXEMPTIONS);

  it('extractor sanity: a known shared router (funds) is on BOTH surfaces', () => {
    const docker = extractRouteModulePaths(routesSrc);
    const makeApp = extractRouteModulePaths(appSrc);
    expect(docker.has('./routes/funds.js')).toBe(true);
    expect(makeApp.has('./routes/funds.js')).toBe(true);
  });

  it('a known gap-pending router (timeline) is Docker-only today', () => {
    const docker = extractRouteModulePaths(routesSrc);
    const makeApp = extractRouteModulePaths(appSrc);
    expect(docker.has('./routes/timeline.js')).toBe(true);
    expect(makeApp.has('./routes/timeline.js')).toBe(false);
  });

  it('every Docker-only router is mounted on makeApp OR exempted (the #1032 guard)', () => {
    expect(findUnexemptedDockerOnly(routesSrc, appSrc, exemptions)).toEqual([]);
  });

  it('has no stale exemptions (a router landing on makeApp forces its exemption delete)', () => {
    expect(findStaleExemptions(routesSrc, appSrc, exemptions)).toEqual([]);
  });

  it('gap-pending count is pinned to the committed ledger (edit downward on burn-down)', () => {
    const gapPending = Object.values(DOCKER_ONLY_EXEMPTIONS).filter(
      (e) => e.kind === 'gap-pending'
    );
    expect(gapPending.length).toBe(GAP_PENDING_COUNT);
  });

  it('pins the createServer -> registerRoutes delegation (keeps the guard 2-way)', () => {
    expect(read('server.ts')).toContain('registerRoutes(app)');
  });
});
